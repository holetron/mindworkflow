/**
 * Command Executor Service
 * 
 * Parses commands from AI responses, validates them, and executes changes in the workflow.
 */

import { db } from '../db';
import * as crypto from 'crypto';
import type { AgentMode } from './workflowContext';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'commandExecutor' });
export interface Command {
  command: 'create_node' | 'delete_node' | 'update_node' | 'update_node_content' | 'create_edge' | 'delete_edge';
  [key: string]: unknown;
}

export interface CommandResult {
  success: boolean;
  command: string;
  error?: string;
  result?: unknown;
  node_id?: string;
  edge_id?: string;
}

/**
 * Extracts JSON commands from AI response text
 */
export function extractCommands(aiResponse: string): Command[] {
  const commands: Command[] = [];
  
  // Find all JSON blocks in ~~~json ... ~~~ format
  const jsonBlockRegex = /~~~json\s*\n([\s\S]*?)\n~~~/g;
  let match;
  
  while ((match = jsonBlockRegex.exec(aiResponse)) !== null) {
    try {
      const jsonStr = match[1].trim();
      const parsed = JSON.parse(jsonStr);
      
      // Check that this is a command (has a command field)
      if (parsed && typeof parsed === 'object' && 'command' in parsed) {
        commands.push(parsed as Command);
      }
    } catch (error) {
      // Skip invalid JSON
      log.warn({ err: error }, 'Failed to parse JSON command');
    }
  }
  
  return commands;
}

/**
 * Validates a command based on the agent mode
 */
export function validateCommand(
  cmd: Command,
  mode: AgentMode
): { valid: boolean; error?: string } {
  // Ask mode - no commands allowed
  if (mode === 'ask') {
    return { 
      valid: false, 
      error: 'Cannot execute commands in Ask mode (read-only). Switch to Agent or Edit mode.' 
    };
  }
  
  // Edit mode - only update_node_content
  if (mode === 'edit') {
    if (cmd.command !== 'update_node_content') {
      return { 
        valid: false, 
        error: `Command '${cmd.command}' is not allowed in Edit mode. Only 'update_node_content' is permitted.` 
      };
    }
  }
  
  // Command structure validation
  switch (cmd.command) {
    case 'create_node':
      if (!cmd.type || !cmd.title) {
        return { valid: false, error: 'create_node requires "type" and "title" fields' };
      }
      break;
      
    case 'delete_node':
      if (!cmd.node_id) {
        return { valid: false, error: 'delete_node requires "node_id" field' };
      }
      break;
      
    case 'update_node':
    case 'update_node_content':
      if (!cmd.node_id) {
        return { valid: false, error: `${cmd.command} requires "node_id" field` };
      }
      break;
      
    case 'create_edge':
      if (!cmd.source || !cmd.target) {
        return { valid: false, error: 'create_edge requires "source" and "target" fields' };
      }
      break;
      
    case 'delete_edge':
      if (!cmd.edge_id && (!cmd.source || !cmd.target)) {
        return { valid: false, error: 'delete_edge requires either "edge_id" or both "source" and "target"' };
      }
      break;
      
    default:
      return { valid: false, error: `Unknown command: ${cmd.command}` };
  }
  
  return { valid: true };
}

/**
 * Executes a command in the DB
 */
export async function executeCommand(
  cmd: Command,
  projectId: string,
  userId?: string
): Promise<CommandResult> {
  if (!projectId) {
    return {
      success: false,
      command: cmd.command,
      error: 'Command execution requires a workflow project. Open a project and try again.',
    };
  }

  try {
    switch (cmd.command) {
      case 'create_node':
        return await executeCreateNode(cmd, projectId, userId);
        
      case 'delete_node':
        return await executeDeleteNode(cmd, projectId);
        
      case 'update_node':
        return await executeUpdateNode(cmd, projectId);
        
      case 'update_node_content':
        return await executeUpdateNodeContent(cmd, projectId);
        
      case 'create_edge':
        return await executeCreateEdge(cmd, projectId);
        
      case 'delete_edge':
        return await executeDeleteEdge(cmd, projectId);
        
      default:
        return {
          success: false,
          command: cmd.command,
          error: `Unknown command: ${cmd.command}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      command: cmd.command,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * CREATE_NODE
 */
async function executeCreateNode(
  cmd: Command,
  projectId: string,
  userId?: string
): Promise<CommandResult> {
  const nodeId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  // Default position (center canvas)
  const position = cmd.position as { x?: number; y?: number } | undefined;
  const x = position?.x ?? 400;
  const y = position?.y ?? 300;
  
  // Prepare node data
  const data = {
    label: cmd.title,
    title: cmd.title,
    content: cmd.content || '',
    ...(cmd.config || {}),
  };
  
  // AI configuration (if present)
  const ai = cmd.ai ? (typeof cmd.ai === 'string' ? JSON.parse(cmd.ai) : cmd.ai) : null;
  
  // Insert node
  const insert = db.prepare(`
    INSERT INTO nodes (
      node_id,
      project_id,
      type,
      title,
      content,
      data,
      ai,
      x,
      y,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  insert.run(
    nodeId,
    projectId,
    cmd.type as string,
    cmd.title as string,
    cmd.content as string || '',
    JSON.stringify(data),
    ai ? JSON.stringify(ai) : null,
    x,
    y,
    now,
    now
  );
  
  return {
    success: true,
    command: 'create_node',
    result: { node_id: nodeId, type: cmd.type, title: cmd.title },
    node_id: nodeId,
  };
}

/**
 * DELETE_NODE
 */
async function executeDeleteNode(
  cmd: Command,
  projectId: string
): Promise<CommandResult> {
  const nodeId = cmd.node_id as string;
  
  // Verify node exists and belongs to the project
  const existing = db.prepare('SELECT node_id FROM nodes WHERE node_id = ? AND project_id = ?')
    .get(nodeId, projectId);
    
  if (!existing) {
    return {
      success: false,
      command: 'delete_node',
      error: `Node ${nodeId} not found in project`,
    };
  }
  
  // Delete edges
  db.prepare('DELETE FROM edges WHERE source = ? OR target = ?').run(nodeId, nodeId);
  
  // Delete node
  db.prepare('DELETE FROM nodes WHERE node_id = ?').run(nodeId);
  
  return {
    success: true,
    command: 'delete_node',
    result: { node_id: nodeId },
    node_id: nodeId,
  };
}

/**
 * UPDATE_NODE
 */
async function executeUpdateNode(
  cmd: Command,
  projectId: string
): Promise<CommandResult> {
  const nodeId = cmd.node_id as string;
  const updates = cmd.updates as Record<string, unknown> | undefined;
  
  if (!updates || Object.keys(updates).length === 0) {
    return {
      success: false,
      command: 'update_node',
      error: 'No updates provided',
    };
  }
  
  // Verify node exists
  const existing = db.prepare('SELECT * FROM nodes WHERE node_id = ? AND project_id = ?')
    .get(nodeId, projectId) as any;
    
  if (!existing) {
    return {
      success: false,
      command: 'update_node',
      error: `Node ${nodeId} not found in project`,
    };
  }
  
  // Update fields (in the new schema there is no data column)
  const updateStmt = db.prepare(`
    UPDATE nodes
    SET 
      title = COALESCE(?, title),
      content = COALESCE(?, content),
      updated_at = ?
    WHERE node_id = ? AND project_id = ?
  `);
  
  updateStmt.run(
    updates.title as string | null || null,
    updates.content as string | null || null,
    new Date().toISOString(),
    nodeId,
    projectId
  );
  
  return {
    success: true,
    command: 'update_node',
    result: { node_id: nodeId, updates },
    node_id: nodeId,
  };
}

/**
 * UPDATE_NODE_CONTENT (simplified version for Edit mode)
 */
async function executeUpdateNodeContent(
  cmd: Command,
  projectId: string
): Promise<CommandResult> {
  const nodeId = cmd.node_id as string;
  const content = cmd.content as string;
  
  if (!content) {
    return {
      success: false,
      command: 'update_node_content',
      error: 'No content provided',
    };
  }
  
  // Verify node exists
  const existing = db.prepare('SELECT node_id FROM nodes WHERE node_id = ? AND project_id = ?')
    .get(nodeId, projectId);
    
  if (!existing) {
    return {
      success: false,
      command: 'update_node_content',
      error: `Node ${nodeId} not found in project`,
    };
  }
  
  // Update content only
  db.prepare(`
    UPDATE nodes
    SET content = ?, updated_at = ?
    WHERE node_id = ? AND project_id = ?
  `).run(content, new Date().toISOString(), nodeId, projectId);
  
  return {
    success: true,
    command: 'update_node_content',
    result: { node_id: nodeId },
    node_id: nodeId,
  };
}

/**
 * CREATE_EDGE
 */
async function executeCreateEdge(
  cmd: Command,
  projectId: string
): Promise<CommandResult> {
  const edgeId = crypto.randomUUID();
  const source = cmd.source as string;
  const target = cmd.target as string;
  const sourceHandle = cmd.sourceHandle as string | null || null;
  const targetHandle = cmd.targetHandle as string | null || null;
  
  // Verify both nodes exist
  const sourceExists = db.prepare('SELECT node_id FROM nodes WHERE node_id = ? AND project_id = ?')
    .get(source, projectId);
  const targetExists = db.prepare('SELECT node_id FROM nodes WHERE node_id = ? AND project_id = ?')
    .get(target, projectId);
    
  if (!sourceExists) {
    return {
      success: false,
      command: 'create_edge',
      error: `Source node ${source} not found`,
    };
  }
  
  if (!targetExists) {
    return {
      success: false,
      command: 'create_edge',
      error: `Target node ${target} not found`,
    };
  }
  
  // Verify edge does not already exist
  const existingEdge = db.prepare(`
    SELECT edge_id FROM edges 
    WHERE project_id = ? AND source = ? AND target = ?
    AND COALESCE(sourceHandle, '') = COALESCE(?, '')
    AND COALESCE(targetHandle, '') = COALESCE(?, '')
  `).get(projectId, source, target, sourceHandle || '', targetHandle || '');
  
  if (existingEdge) {
    return {
      success: false,
      command: 'create_edge',
      error: 'Edge already exists',
    };
  }
  
  // Create edge
  db.prepare(`
    INSERT INTO edges (edge_id, project_id, source, target, sourceHandle, targetHandle)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(edgeId, projectId, source, target, sourceHandle, targetHandle);
  
  return {
    success: true,
    command: 'create_edge',
    result: { edge_id: edgeId, source, target },
    edge_id: edgeId,
  };
}

/**
 * DELETE_EDGE
 */
async function executeDeleteEdge(
  cmd: Command,
  projectId: string
): Promise<CommandResult> {
  if (cmd.edge_id) {
    // Delete by ID
    const edgeId = cmd.edge_id as string;
    const existing = db.prepare('SELECT edge_id FROM edges WHERE edge_id = ? AND project_id = ?')
      .get(edgeId, projectId);
      
    if (!existing) {
      return {
        success: false,
        command: 'delete_edge',
        error: `Edge ${edgeId} not found`,
      };
    }
    
    db.prepare('DELETE FROM edges WHERE edge_id = ?').run(edgeId);
    
    return {
      success: true,
      command: 'delete_edge',
      result: { edge_id: edgeId },
      edge_id: edgeId,
    };
  } else {
    // Delete by source + target
    const source = cmd.source as string;
    const target = cmd.target as string;
    
    db.prepare('DELETE FROM edges WHERE project_id = ? AND source = ? AND target = ?')
      .run(projectId, source, target);
    
    return {
      success: true,
      command: 'delete_edge',
      result: { source, target },
    };
  }
}
