import { Router } from 'express';
import type { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { AiService } from '../services/ai';
import { db } from '../db';
import * as fs from 'fs';
import * as path from 'path';
import { generateWorkflowContext, type AgentMode } from '../services/workflowContext';
import { extractCommands, validateCommand, executeCommand, type CommandResult } from '../services/commandExecutor';
import { listAllIntegrations } from '../services/integrationRepository';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'routes/chat' });
const router = Router();
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Load schemas
const schemaDir = path.resolve(__dirname, '../schemas');
const schemaFiles = ['PLAN_SCHEMA.json', 'ACTOR_SCHEMA.json', 'PARSE_SCHEMA.json', 'TEXT_RESPONSE.json', 'MINDMAP_SCHEMA.json', 'SINGLE_NODE_SCHEMA.json'];
for (const file of schemaFiles) {
  try {
    const schemaPath = path.join(schemaDir, file);
    const raw = fs.readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(raw);
    const schemaId = path.parse(file).name;
    schema.$id = schemaId;
    ajv.addSchema(schema, schemaId);
  } catch (error) {
    log.error({ err: error }, '`[CHAT] Failed to load schema ${file}:`');
  }
}

const aiService = new AiService(ajv);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    user_id TEXT,
    settings_json TEXT
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    attachments_json TEXT,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id);
  CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at DESC);
`);

// Migration: Add project_id column if it doesn't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(chats)").all() as Array<{ name: string }>;
  const hasProjectId = tableInfo.some(col => col.name === 'project_id');
  
  if (!hasProjectId) {
    log.info('[CHAT] Adding project_id column to chats table...');
    db.exec(`
      ALTER TABLE chats ADD COLUMN project_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_chats_project_id ON chats(project_id);
    `);
    log.info('[CHAT] project_id column added successfully');
  }
} catch (error) {
  log.error({ err: error }, '[CHAT] Migration error');
}

// ✅ Migration: Add logs_json column to chat_messages if it doesn't exist
try {
  const messageTableInfo = db.prepare("PRAGMA table_info(chat_messages)").all() as Array<{ name: string }>;
  const hasLogsJson = messageTableInfo.some(col => col.name === 'logs_json');
  
  if (!hasLogsJson) {
    log.info('[CHAT] Adding logs_json column to chat_messages table...');
    db.exec(`
      ALTER TABLE chat_messages ADD COLUMN logs_json TEXT;
    `);
    log.info('[CHAT] logs_json column added successfully');
  }
} catch (error) {
  log.error({ err: error }, '[CHAT] Migration error for logs_json');
}

// ✅ Migration: Add agent_preset_id column to chats if it doesn't exist
try {
  const chatTableInfo = db.prepare("PRAGMA table_info(chats)").all() as Array<{ name: string }>;
  const hasAgentPresetId = chatTableInfo.some(col => col.name === 'agent_preset_id');
  
  if (!hasAgentPresetId) {
    log.info('[CHAT] Adding agent_preset_id column to chats table...');
    db.exec(`
      ALTER TABLE chats ADD COLUMN agent_preset_id TEXT;
    `);
    log.info('[CHAT] agent_preset_id column added successfully');
  }
} catch (error) {
  log.error({ err: error }, '[CHAT] Migration error for agent_preset_id');
}

// GET /api/chats - Get list of chats
router.get('/chats', (req: Request, res: Response) => {
  try {
    const { project_id, agent_preset_id } = req.query;
    
    let chats;
    if (project_id) {
      // Get chats for specific project
      chats = db
        .prepare('SELECT id, title, created_at, updated_at, project_id, agent_preset_id FROM chats WHERE project_id = ? ORDER BY created_at DESC LIMIT 50')
        .all(project_id);
    } else if (agent_preset_id) {
      // Get chats for specific agent
      chats = db
        .prepare('SELECT id, title, created_at, updated_at, project_id, agent_preset_id FROM chats WHERE agent_preset_id = ? ORDER BY updated_at DESC LIMIT 50')
        .all(agent_preset_id);
    } else {
      // Get all chats (for backward compatibility)
      chats = db
        .prepare('SELECT id, title, created_at, updated_at, project_id, agent_preset_id FROM chats ORDER BY created_at DESC LIMIT 50')
        .all();
    }
    
    res.json(chats);
  } catch (error) {
    log.error({ err: error }, 'Failed to get chats');
    res.status(500).json({ error: 'Failed to get chats' });
  }
});

// POST /api/chats - Create new chat
router.post('/chats', (req: Request, res: Response) => {
  log.info({ data: JSON.stringify(req.body, null, 2) }, '[CHAT] POST /chats - body');
  try {
    const { title, settings, project_id, agent_preset_id } = req.body;
    const id = nanoid();
    const now = Date.now();
    
    const settingsJson = settings ? JSON.stringify(settings) : null;
    log.info({ id, project_id, agent_preset_id, settingsJson }, 'creating chat');
    
    db.prepare(
      'INSERT INTO chats (id, title, created_at, updated_at, project_id, agent_preset_id, settings_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, title || 'New Chat', now, now, project_id || null, agent_preset_id || null, settingsJson);
    
    log.info('[CHAT] Chat created successfully');
    res.json({
      id,
      title: title || 'New Chat',
      created_at: now,
      updated_at: now,
      project_id: project_id || null,
      agent_preset_id: agent_preset_id || null,
      settings: settings || null,
    });
  } catch (error) {
    log.error({ err: error }, '[CHAT] Failed to create chat');
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// GET /api/chats/:chatId/messages - Get messages for a chat
router.get('/chats/:chatId/messages', (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    
    // Get chat info with settings and agent_preset_id
    const chat = db.prepare('SELECT settings_json, agent_preset_id FROM chats WHERE id = ?').get(chatId) as any;
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    const messages = db
      .prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC')
      .all(chatId);
    
    // Return messages, settings, and agent_preset_id
    const settings = chat.settings_json ? JSON.parse(chat.settings_json) : null;
    res.json({
      messages,
      settings,
      agent_preset_id: chat.agent_preset_id || null,
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to get messages');
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// ✅ POST /api/chats/:chatId/settings - Update chat settings
router.post('/chats/:chatId/settings', (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { selected_model, system_prompt_type, custom_system_prompt, context_level } = req.body;

    // Get current chat record
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId) as any;
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Parse current settings
    const currentSettings = chat.settings_json ? JSON.parse(chat.settings_json) : {};

    // Update settings
    const updatedSettings = {
      ...currentSettings,
      ...(selected_model && { selected_model }),
      ...(system_prompt_type && { system_prompt_type }),
      ...(custom_system_prompt && { custom_system_prompt }),
      ...(context_level !== undefined && { context_level }),
    };

    // Save to DB
    db.prepare('UPDATE chats SET settings_json = ? WHERE id = ?')
      .run(JSON.stringify(updatedSettings), chatId);

    log.info('`[CHAT] Settings updated for chat ${chatId}:` %s', updatedSettings);

    res.json({ 
      success: true, 
      settings: updatedSettings 
    });
  } catch (error) {
    log.error({ err: error }, '[CHAT] Failed to update settings');
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// POST /api/chats/:chatId/messages - Send message to AI
router.post('/chats/:chatId/messages', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { content, mode, project_id, attachments, settings: requestSettings, input_fields } = req.body;
    
    log.info('[chat] Received message with input_fields %s', input_fields);
    
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const now = Date.now();

    // Get chat settings
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId) as any;
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Merge settings: DB settings < request settings (request has priority)
    const dbSettings = chat.settings_json ? JSON.parse(chat.settings_json) : {};
    const settings = requestSettings ? { ...dbSettings, ...requestSettings } : dbSettings;
    const activeProjectId: string | null = project_id || settings.project_id || null;
    
    // ✅ Extract configuration panel settings
    const selectedModel = settings.selected_model || 'gpt-4';
    const systemPromptType = settings.system_prompt_type || 'default';
    const contextLevel = settings.context_level ?? 2;
    
    log.info({ chatId, mode, project_id, activeProjectId, contentLength: content?.length, attachmentCount: attachments?.length || 0, selectedModel, contextLevel }, 'POST /messages');
    
    // Get agent mode from settings or request (default: 'ask')
    const agentMode: AgentMode = (mode || settings.agent_mode || 'ask') as AgentMode;
    const contextDepth = settings.context_depth || 2;
    const contextMaxTokens = settings.context_max_tokens || 8000;
    
    // Generate workflow context if project_id provided
    let workflowContext = '';
    if (activeProjectId) {
      try {
        workflowContext = generateWorkflowContext(activeProjectId, {
          mode: agentMode,
          maxTokens: contextMaxTokens,
          depth: contextDepth,
        });
        log.info(`[CHAT] Generated workflow context for project ${activeProjectId} (mode: ${agentMode}, ${workflowContext.length} chars)`);
      } catch (error) {
        log.error({ err: error }, '[CHAT] Failed to generate workflow context');
        workflowContext = 'Failed to load workflow context';
      }
    }
    
    // Get all previous messages for context
    const previousMessages = db.prepare(
      'SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC'
    ).all(chatId) as any[];

    // Build context from previous messages
    const contextMessages = previousMessages.map((msg: any) => ({
      role: msg.role,
      content: msg.content
    }));

    // Save user message
    const userMessageId = nanoid();
    const attachmentsJson = attachments && attachments.length > 0 ? JSON.stringify(attachments) : null;
    
    // ✅ NEW: Prepare REQUEST log
    const requestLog = {
      user_message: content.trim().substring(0, 200),
      model: selectedModel,
      system_prompt_type: systemPromptType,
      context_level: contextLevel,
      workflow_context_length: workflowContext?.length || 0,
      timestamp: new Date().toISOString(),
    };
    const requestLogsJson = JSON.stringify({ request: requestLog });
    
    log.info({ data: JSON.stringify(requestLog, null, 2) }, '[CHAT] REQUEST');
    
    db.prepare(
      'INSERT INTO chat_messages (id, chat_id, role, content, created_at, attachments_json, logs_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userMessageId, chatId, 'user', content.trim(), now, attachmentsJson, requestLogsJson);

    // Call AI service with chat settings
    let aiResponse = '';
    let aiAttachments: any[] = [];
    let aiLogs: string[] = [];
    
    try {
      // Get integrations - convert decrypted records to object format
      const integrations: Record<string, any> = {};
      const integrationRecords = listAllIntegrations().filter((record) => record.enabled);

      for (const record of integrationRecords) {
        const { extra, ...normalizedConfig } = record.config;
        const mergedConfig: Record<string, unknown> = {
          ...(extra && typeof extra === 'object' ? extra : {}),
          ...normalizedConfig,
        };
        integrations[record.providerId] = mergedConfig;
      }

      log.info('[CHAT] Loaded integrations %s', Object.keys(integrations));
      log.info('[CHAT] OpenAI config %s', integrations.openai_gpt ? 'exists' : 'missing');
      if (integrations.openai_gpt) {
        log.info('[CHAT] OpenAI config keys %s', Object.keys(integrations.openai_gpt));
        log.info('[CHAT] OpenAI apiKey %s', integrations.openai_gpt.api_key ? 'exists' : 'missing');
        log.info('[CHAT] OpenAI apikey %s', integrations.openai_gpt.apikey ? 'exists' : 'missing');
        log.info('[CHAT] OpenAI apiKey field %s', integrations.openai_gpt.apiKey ? 'exists' : 'missing');
      }
      log.info('[CHAT] Replicate config %s', integrations.replicate ? 'exists' : 'missing');
      if (integrations.replicate) {
        log.info('[CHAT] Replicate apiKey %s', integrations.replicate.apiKey ? 'exists' : 'missing');
      }

      // Prepare system prompt with workflow context
      // Use system_prompt from request (modal) if provided, otherwise from saved settings
      let systemPrompt = (requestSettings?.system_prompt !== undefined ? requestSettings.system_prompt : settings.system_prompt) || '';
      
      // If workflow context exists, append it to system prompt
      if (workflowContext) {
        // Replace {workflow_context} placeholder if exists
        if (systemPrompt.includes('{workflow_context}')) {
          systemPrompt = systemPrompt.replace('{workflow_context}', workflowContext);
        } else if (systemPrompt.trim()) {
          // Only append if systemPrompt is not empty
          systemPrompt += `\n\n${workflowContext}`;
        }
      }

      // Extract image attachments for multimodal AI
      const imageAttachments = (attachments || []).filter(
        (att: any) =>
        att.mimetype?.startsWith('image/')
      );

      // Create a minimal context for AI service
      const aiContext = {
        node: {
          node_id: `chat-${chatId}`,
          type: 'ai',
          title: chat.title || 'Chat',
          content: content.trim(),
          config: {
            ai: {
              provider: settings.provider || 'stub',
              model: settings.model || 'gpt-4o-mini',
              temperature: settings.temperature || 0.7,
              max_tokens: settings.max_tokens || 4096,
              top_p: settings.top_p,
              frequency_penalty: settings.frequency_penalty,
              presence_penalty: settings.presence_penalty,
              system_prompt: systemPrompt,
              output_format: settings.output_format || 'text',
              // ✅ NEW: Apply input_fields if provided
              ...(input_fields && typeof input_fields === 'object' ? input_fields : {}),
            }
          },
          x: 0,
          y: 0,
        },
        inputs: {},
        previousNodes: [], // Add empty array for previous nodes
        nextNodes: [], // Add empty array for next nodes
        schemaRef: 'TEXT_RESPONSE',
        projectId: activeProjectId ?? undefined,
        edges: [],
        project: null,
        settings: {
          integrations
        },
        // Add image attachments for multimodal support
        imageAttachments: imageAttachments.map((att: any) => ({
          url: att.url,
          mimetype: att.mimetype,
        })),
      };

      const result = await aiService.run(aiContext as any);
      
      // Store logs for later
      aiLogs = result.logs || [];
      
      // Extract text/media from AI response
      aiAttachments = [];
      
      if (result.output) {
        try {
          // Try to parse as JSON (for Replicate and other providers that return JSON)
          const parsed = JSON.parse(result.output);
          
          // If it's a Replicate response with output (string URL or array)
          if (parsed.output) {
            const output = parsed.output;
            
            // Check if output is an image URL
            if (typeof output === 'string' && (output.startsWith('http://') || output.startsWith('https://'))) {
              // Download and save the image
              try {
                const { downloadRemoteAsset } = await import('../utils/storage');
                const download = await downloadRemoteAsset(activeProjectId || 'chat-temp', output, {
                  subdir: 'chat/images',
                });
                
                const localUrl = `/uploads/${activeProjectId || 'chat-temp'}/${download.relativePath}`.replace(/\\/g, '/');
                aiAttachments.push({
                  type: 'image',
                  url: localUrl,
                  mimetype: download.mimeType,
                  size: download.size,
                  filename: download.filename,
                });
                
                // Don't put logs in response - they are stored separately
                aiResponse = 'Image generated successfully';
              } catch (downloadError) {
                log.error({ err: downloadError }, '[CHAT] Failed to download Replicate image');
                aiResponse = `Generated image: ${output}`;
              }
            }
            // Array of URLs (text or images)
            else if (Array.isArray(output)) {
              aiResponse = output.join('');
            }
            // Just a string
            else {
              aiResponse = String(output);
            }
          }
          // If there's a response field (stub provider)
          else if (typeof parsed.response === 'string') {
            aiResponse = parsed.response;
          }
          // If there's a direct text field
          else if (typeof parsed.text === 'string') {
            aiResponse = parsed.text;
          }
          // If there's a message field (some providers)
          else if (typeof parsed.message === 'string') {
            aiResponse = parsed.message;
          }
          // Otherwise use the raw output
          else {
            aiResponse = result.output;
          }
        } catch {
          // Not JSON, use as is
          aiResponse = result.output;
        }
      } else {
        aiResponse = 'No response from AI';
      }
    } catch (error) {
      log.error({ err: error }, 'AI service error');
      aiResponse = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    // Extract and execute commands if project_id provided and mode allows
    const commandResults: CommandResult[] = [];
    if (activeProjectId && aiResponse) {
      try {
        const commands = extractCommands(aiResponse);
        
        if (commands.length > 0) {
          log.info(`[CHAT] Extracted ${commands.length} commands from AI response`);
          
          for (const cmd of commands) {
            // Validate command
            const validation = validateCommand(cmd, agentMode);
            
            if (!validation.valid) {
              commandResults.push({
                success: false,
                command: cmd.command,
                error: validation.error,
              });
              continue;
            }
            
            // Execute command
            const result = await executeCommand(cmd, activeProjectId);
            commandResults.push(result);
            
            if (result.success) {
              log.info('`[CHAT] ✅ Command executed: ${cmd.command}` %s', result.result);
            } else {
              log.error({ err: result.error }, '`[CHAT] ❌ Command failed: ${cmd.command}`');
            }
          }
          
          // Append command execution results to AI response
          if (commandResults.length > 0) {
            aiResponse += '\n\n--- Command Execution Results ---\n';
            for (const result of commandResults) {
              const status = result.success ? '✅ Success' : '❌ Failed';
              const details = result.success 
                ? (result.node_id ? `(${result.node_id})` : result.edge_id ? `(${result.edge_id})` : '')
                : `(${result.error})`;
              aiResponse += `${result.command}: ${status} ${details}\n`;
            }
          }
        }
      } catch (error) {
        log.error({ err: error }, '[CHAT] Error processing commands');
        aiResponse += `\n\n⚠️ Error processing commands: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    // Save assistant message with attachments
    const assistantMessageId = nanoid();
    const assistantAttachmentsJson = aiAttachments.length > 0 ? JSON.stringify(aiAttachments) : null;
    
    // Don't add logs to content - they should be stored separately in logs_json
    let fullResponse = aiResponse;
    
    // ✅ NEW: Prepare RESPONSE log
    const responseLog = {
      assistant_message: aiResponse.substring(0, 200),
      tokens_used: null, // Can be populated if using API with token counting
      model_version: selectedModel,
      generated_at: new Date().toISOString(),
    };
    const fullLogsJson = JSON.stringify({ 
      request: requestLog,
      response: responseLog 
    });
    
    log.info({ data: JSON.stringify(responseLog, null, 2) }, '[CHAT] RESPONSE');
    
    db.prepare(
      'INSERT INTO chat_messages (id, chat_id, role, content, created_at, attachments_json, logs_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(assistantMessageId, chatId, 'assistant', fullResponse, now + 1, assistantAttachmentsJson, fullLogsJson);

    // Update chat updated_at
    db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now + 1, chatId);

    res.json({
      user_message: {
        id: userMessageId,
        chat_id: chatId,
        role: 'user',
        content: content.trim(),
        created_at: now,
        attachments: attachments || undefined,
      },
      assistant_message: {
        id: assistantMessageId,
        chat_id: chatId,
        role: 'assistant',
        content: aiResponse,
        created_at: now + 1,
        attachments: aiAttachments.length > 0 ? aiAttachments : undefined,
        logs: aiLogs.length > 0 ? aiLogs : undefined,
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to send message');
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /api/chats/:chatId/messages/:messageId/to-workflow - Create node from message (text, image, video, etc.)
router.post('/chats/:chatId/messages/:messageId/to-workflow', (req: Request, res: Response) => {
  try {
    const { chatId, messageId } = req.params;
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    // Get the message with attachments
    const message = db.prepare(
      'SELECT * FROM chat_messages WHERE id = ? AND chat_id = ?'
    ).get(messageId, chatId) as any;

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Get max position for new node
    const maxPos = db.prepare(
      'SELECT MAX(bbox_x2) as max_x, MAX(bbox_y2) as max_y FROM nodes WHERE project_id = ?'
    ).get(projectId) as any;

    const x1 = (maxPos?.max_x || 0) + 50;
    const y1 = (maxPos?.max_y || 0) + 50;

    const nodeId = nanoid();
    const now = new Date().toISOString();

    // Determine node type based on content and attachments
    let nodeType = 'text';
    let nodeTitle = 'From Chat';
    let nodeContent = message.content;
    let nodeConfig: any = { response_type: 'text', view_mode: 'normal' };
    let nodeColor = '#6B7280'; // All nodes grey
    let width = 240;
    let height = 120;

    // Parse attachments if present
    const attachments = message.attachments_json ? JSON.parse(message.attachments_json) : [];
    
    if (attachments.length > 0) {
      const firstAttachment = attachments[0];
      const mimeType = firstAttachment.mime_type || '';
      
      if (mimeType.startsWith('image/')) {
        // Image node
        nodeType = 'image';
        nodeTitle = firstAttachment.original_name || 'Image from Chat';
        nodeContent = firstAttachment.url;
        width = 320;
        height = 240;
        nodeConfig = {
          url: firstAttachment.url,
          alt: nodeTitle,
        };
      } else if (mimeType.startsWith('video/')) {
        // Video node
        nodeType = 'video';
        nodeTitle = firstAttachment.original_name || 'Video from Chat';
        nodeContent = firstAttachment.url;
        width = 400;
        height = 300;
        nodeConfig = {
          url: firstAttachment.url,
        };
      } else if (mimeType === 'application/json' || nodeContent.trim().startsWith('{') || nodeContent.trim().startsWith('[')) {
        // JSON/data node
        nodeType = 'text';
        nodeTitle = 'Data from Chat';
        nodeConfig = {
          response_type: 'json',
          view_mode: 'normal',
        };
      }
    } else if (nodeContent.trim().startsWith('{') || nodeContent.trim().startsWith('[')) {
      // Check if content is JSON
      try {
        JSON.parse(nodeContent);
        nodeType = 'text';
        nodeTitle = 'Data from Chat';
        nodeConfig = {
          response_type: 'json',
          view_mode: 'normal',
        };
      } catch {
        // Not valid JSON, treat as text
      }
    }

    const x2 = x1 + width;
    const y2 = y1 + height;

    db.prepare(
      `INSERT INTO nodes (
        node_id, project_id, type, 
        title, content, 
        config_json, meta_json, visibility_json,
        ui_color, bbox_x1, bbox_y1, bbox_x2, bbox_y2,
        ai_visible, connections_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      nodeId,
      projectId,
      nodeType,
      nodeTitle,
      nodeContent,
      JSON.stringify(nodeConfig),
      JSON.stringify({}),
      JSON.stringify({}),
      nodeColor,
      x1,
      y1,
      x2,
      y2,
      1, // ai_visible
      JSON.stringify({ incoming: [], outgoing: [] }),
      now,
      now
    );

    res.json({
      success: true,
      node_id: nodeId,
      node: {
        node_id: nodeId,
        type: nodeType,
        title: nodeTitle,
        content: nodeContent,
        x: x1,
        y: y1,
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to create node from message');
    res.status(500).json({ error: 'Failed to create node from message' });
  }
});

// DELETE /api/chats/:chatId/messages/:messageId - Delete message
router.delete('/chats/:chatId/messages/:messageId', (req: Request, res: Response) => {
  try {
    const { chatId, messageId } = req.params;
    
    // Verify message belongs to chat
    const message = db.prepare(
      'SELECT * FROM chat_messages WHERE id = ? AND chat_id = ?'
    ).get(messageId, chatId);
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Delete message
    db.prepare('DELETE FROM chat_messages WHERE id = ?').run(messageId);
    
    res.json({ success: true });
  } catch (error) {
    log.error({ err: error }, 'Failed to delete message');
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// DELETE /api/chats/:chatId - Delete chat
router.delete('/chats/:chatId', (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    
    // Delete messages first (CASCADE should handle this, but being explicit)
    db.prepare('DELETE FROM chat_messages WHERE chat_id = ?').run(chatId);
    
    // Delete chat
    db.prepare('DELETE FROM chats WHERE id = ?').run(chatId);
    
    res.json({ success: true });
  } catch (error) {
    log.error({ err: error }, 'Failed to delete chat');
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

// POST /api/chats/preview-context - Preview workflow context for chat
router.post('/chats/preview-context', (req: Request, res: Response) => {
  try {
    const { 
      project_id, 
      mode = 'ask', 
      context_level = 2,
      depth, // deprecated, for backwards compatibility
      max_tokens = 32000 
    } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Generate workflow context preview
    const contextPreview = generateWorkflowContext(project_id, {
      mode: mode as AgentMode,
      maxTokens: max_tokens,
      context_level: context_level,
      depth, // fallback for old API calls
    });

    // Calculate approximate token count (4 chars ≈ 1 token)
    const estimatedTokens = Math.ceil(contextPreview.length / 4);

    res.json({
      preview: contextPreview,
      length: contextPreview.length,
      estimated_tokens: estimatedTokens,
      mode,
      context_level,
    });
  } catch (error) {
    log.error({ err: error }, '[CHAT] Failed to generate context preview');
    res.status(500).json({ error: 'Failed to generate context preview' });
  }
});

export default router;
