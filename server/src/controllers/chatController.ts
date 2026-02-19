import type { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { AiService } from '../services/ai';
import { db } from '../db';
import { generateWorkflowContext, type AgentMode } from '../services/workflowContext';
import { extractCommands, validateCommand, executeCommand, type CommandResult } from '../services/commandExecutor';
import { listAllIntegrations } from '../services/integrationRepository';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'controllers/chat' });

export function createChatController(aiService: AiService) {
  return {
    listChats(req: Request, res: Response) {
      try {
        const { project_id, agent_preset_id } = req.query;
        let chats;
        if (project_id) {
          chats = db.prepare('SELECT id, title, created_at, updated_at, project_id, agent_preset_id FROM chats WHERE project_id = ? ORDER BY created_at DESC LIMIT 50').all(project_id);
        } else if (agent_preset_id) {
          chats = db.prepare('SELECT id, title, created_at, updated_at, project_id, agent_preset_id FROM chats WHERE agent_preset_id = ? ORDER BY updated_at DESC LIMIT 50').all(agent_preset_id);
        } else {
          chats = db.prepare('SELECT id, title, created_at, updated_at, project_id, agent_preset_id FROM chats ORDER BY created_at DESC LIMIT 50').all();
        }
        res.json(chats);
      } catch (error) {
        log.error({ err: error }, 'Failed to get chats');
        res.status(500).json({ error: 'Failed to get chats' });
      }
    },

    createChat(req: Request, res: Response) {
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
          id, title: title || 'New Chat', created_at: now, updated_at: now,
          project_id: project_id || null, agent_preset_id: agent_preset_id || null,
          settings: settings || null,
        });
      } catch (error) {
        log.error({ err: error }, '[CHAT] Failed to create chat');
        res.status(500).json({ error: 'Failed to create chat' });
      }
    },

    getMessages(req: Request, res: Response) {
      try {
        const { chatId } = req.params;
        const chat = db.prepare('SELECT settings_json, agent_preset_id FROM chats WHERE id = ?').get(chatId) as any;
        if (!chat) return res.status(404).json({ error: 'Chat not found' });
        const messages = db.prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC').all(chatId);
        const settings = chat.settings_json ? JSON.parse(chat.settings_json) : null;
        res.json({ messages, settings, agent_preset_id: chat.agent_preset_id || null });
      } catch (error) {
        log.error({ err: error }, 'Failed to get messages');
        res.status(500).json({ error: 'Failed to get messages' });
      }
    },

    updateSettings(req: Request, res: Response) {
      try {
        const { chatId } = req.params;
        const { selected_model, system_prompt_type, custom_system_prompt, context_level } = req.body;
        const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId) as any;
        if (!chat) return res.status(404).json({ error: 'Chat not found' });
        const currentSettings = chat.settings_json ? JSON.parse(chat.settings_json) : {};
        const updatedSettings = {
          ...currentSettings,
          ...(selected_model && { selected_model }),
          ...(system_prompt_type && { system_prompt_type }),
          ...(custom_system_prompt && { custom_system_prompt }),
          ...(context_level !== undefined && { context_level }),
        };
        db.prepare('UPDATE chats SET settings_json = ? WHERE id = ?').run(JSON.stringify(updatedSettings), chatId);
        log.info('`[CHAT] Settings updated for chat ${chatId}:` %s', updatedSettings);
        res.json({ success: true, settings: updatedSettings });
      } catch (error) {
        log.error({ err: error }, '[CHAT] Failed to update settings');
        res.status(500).json({ error: 'Failed to update settings' });
      }
    },

    async sendMessage(req: Request, res: Response) {
      try {
        const { chatId } = req.params;
        const { content, mode, project_id, attachments, settings: requestSettings, input_fields } = req.body;
        log.info('[chat] Received message with input_fields %s', input_fields);
        if (!content || !content.trim()) return res.status(400).json({ error: 'Message content is required' });

        const now = Date.now();
        const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId) as any;
        if (!chat) return res.status(404).json({ error: 'Chat not found' });

        const dbSettings = chat.settings_json ? JSON.parse(chat.settings_json) : {};
        const settings = requestSettings ? { ...dbSettings, ...requestSettings } : dbSettings;
        const activeProjectId: string | null = project_id || settings.project_id || null;
        const selectedModel = settings.selected_model || 'gpt-4';
        const systemPromptType = settings.system_prompt_type || 'default';
        const contextLevel = settings.context_level ?? 2;

        log.info({ chatId, mode, project_id, activeProjectId, contentLength: content?.length, attachmentCount: attachments?.length || 0, selectedModel, contextLevel }, 'POST /messages');

        const agentMode: AgentMode = (mode || settings.agent_mode || 'ask') as AgentMode;
        const contextDepth = settings.context_depth || 2;
        const contextMaxTokens = settings.context_max_tokens || 8000;

        let workflowContext = '';
        if (activeProjectId) {
          try {
            workflowContext = generateWorkflowContext(activeProjectId, { mode: agentMode, maxTokens: contextMaxTokens, depth: contextDepth });
            log.info(`[CHAT] Generated workflow context for project ${activeProjectId} (mode: ${agentMode}, ${workflowContext.length} chars)`);
          } catch (error) {
            log.error({ err: error }, '[CHAT] Failed to generate workflow context');
            workflowContext = 'Failed to load workflow context';
          }
        }

        const previousMessages = db.prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC').all(chatId) as any[];
        const contextMessages = previousMessages.map((msg: any) => ({ role: msg.role, content: msg.content }));

        const userMessageId = nanoid();
        const attachmentsJson = attachments && attachments.length > 0 ? JSON.stringify(attachments) : null;
        const requestLog = {
          user_message: content.trim().substring(0, 200), model: selectedModel,
          system_prompt_type: systemPromptType, context_level: contextLevel,
          workflow_context_length: workflowContext?.length || 0, timestamp: new Date().toISOString(),
        };
        const requestLogsJson = JSON.stringify({ request: requestLog });
        log.info({ data: JSON.stringify(requestLog, null, 2) }, '[CHAT] REQUEST');

        db.prepare(
          'INSERT INTO chat_messages (id, chat_id, role, content, created_at, attachments_json, logs_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(userMessageId, chatId, 'user', content.trim(), now, attachmentsJson, requestLogsJson);

        let aiResponse = '';
        let aiAttachments: any[] = [];
        let aiLogs: string[] = [];

        try {
          const integrations: Record<string, any> = {};
          const integrationRecords = listAllIntegrations().filter((r) => r.enabled);
          for (const record of integrationRecords) {
            const { extra, ...normalizedConfig } = record.config;
            const mergedConfig: Record<string, unknown> = { ...(extra && typeof extra === 'object' ? extra : {}), ...normalizedConfig };
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

          let systemPrompt = (requestSettings?.system_prompt !== undefined ? requestSettings.system_prompt : settings.system_prompt) || '';
          if (workflowContext) {
            if (systemPrompt.includes('{workflow_context}')) {
              systemPrompt = systemPrompt.replace('{workflow_context}', workflowContext);
            } else if (systemPrompt.trim()) {
              systemPrompt += `\n\n${workflowContext}`;
            }
          }

          const imageAttachments = (attachments || []).filter((att: any) => att.mimetype?.startsWith('image/'));
          const aiContext = {
            node: {
              node_id: `chat-${chatId}`, type: 'ai', title: chat.title || 'Chat',
              content: content.trim(),
              config: {
                ai: {
                  provider: settings.provider || 'stub', model: settings.model || 'gpt-4o-mini',
                  temperature: settings.temperature || 0.7, max_tokens: settings.max_tokens || 4096,
                  top_p: settings.top_p, frequency_penalty: settings.frequency_penalty,
                  presence_penalty: settings.presence_penalty, system_prompt: systemPrompt,
                  output_format: settings.output_format || 'text',
                  ...(input_fields && typeof input_fields === 'object' ? input_fields : {}),
                },
              },
              x: 0, y: 0,
            },
            inputs: {}, previousNodes: [], nextNodes: [],
            schemaRef: 'TEXT_RESPONSE', projectId: activeProjectId ?? undefined,
            edges: [], project: null,
            settings: { integrations },
            imageAttachments: imageAttachments.map((att: any) => ({ url: att.url, mimetype: att.mimetype })),
          };

          const result = await aiService.run(aiContext as any);
          aiLogs = result.logs || [];
          aiAttachments = [];

          if (result.output) {
            try {
              const parsed = JSON.parse(result.output);
              if (parsed.output) {
                const output = parsed.output;
                if (typeof output === 'string' && (output.startsWith('http://') || output.startsWith('https://'))) {
                  try {
                    const { downloadRemoteAsset } = await import('../utils/storage');
                    const download = await downloadRemoteAsset(activeProjectId || 'chat-temp', output, { subdir: 'chat/images' });
                    const localUrl = `/uploads/${activeProjectId || 'chat-temp'}/${download.relativePath}`.replace(/\\/g, '/');
                    aiAttachments.push({ type: 'image', url: localUrl, mimetype: download.mimeType, size: download.size, filename: download.filename });
                    aiResponse = 'Image generated successfully';
                  } catch (downloadError) {
                    log.error({ err: downloadError }, '[CHAT] Failed to download Replicate image');
                    aiResponse = `Generated image: ${output}`;
                  }
                } else if (Array.isArray(output)) {
                  aiResponse = output.join('');
                } else {
                  aiResponse = String(output);
                }
              } else if (typeof parsed.response === 'string') { aiResponse = parsed.response; }
              else if (typeof parsed.text === 'string') { aiResponse = parsed.text; }
              else if (typeof parsed.message === 'string') { aiResponse = parsed.message; }
              else { aiResponse = result.output; }
            } catch { aiResponse = result.output; }
          } else { aiResponse = 'No response from AI'; }
        } catch (error) {
          log.error({ err: error }, 'AI service error');
          aiResponse = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }

        const commandResults: CommandResult[] = [];
        if (activeProjectId && aiResponse) {
          try {
            const commands = extractCommands(aiResponse);
            if (commands.length > 0) {
              log.info(`[CHAT] Extracted ${commands.length} commands from AI response`);
              for (const cmd of commands) {
                const validation = validateCommand(cmd, agentMode);
                if (!validation.valid) {
                  commandResults.push({ success: false, command: cmd.command, error: validation.error }); continue;
                }
                const result = await executeCommand(cmd, activeProjectId);
                commandResults.push(result);
                if (result.success) {
                  log.info('`[CHAT] Command executed: ${cmd.command}` %s', result.result);
                } else {
                  log.error({ err: result.error }, '`[CHAT] Command failed: ${cmd.command}`');
                }
              }
              if (commandResults.length > 0) {
                aiResponse += '\n\n--- Command Execution Results ---\n';
                for (const result of commandResults) {
                  const status = result.success ? 'Success' : 'Failed';
                  const details = result.success
                    ? (result.node_id ? `(${result.node_id})` : result.edge_id ? `(${result.edge_id})` : '')
                    : `(${result.error})`;
                  aiResponse += `${result.command}: ${status} ${details}\n`;
                }
              }
            }
          } catch (error) {
            log.error({ err: error }, '[CHAT] Error processing commands');
            aiResponse += `\n\nError processing commands: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        }

        const assistantMessageId = nanoid();
        const assistantAttachmentsJson = aiAttachments.length > 0 ? JSON.stringify(aiAttachments) : null;
        let fullResponse = aiResponse;
        const responseLog = {
          assistant_message: aiResponse.substring(0, 200), tokens_used: null,
          model_version: selectedModel, generated_at: new Date().toISOString(),
        };
        const fullLogsJson = JSON.stringify({ request: requestLog, response: responseLog });
        log.info({ data: JSON.stringify(responseLog, null, 2) }, '[CHAT] RESPONSE');

        db.prepare(
          'INSERT INTO chat_messages (id, chat_id, role, content, created_at, attachments_json, logs_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(assistantMessageId, chatId, 'assistant', fullResponse, now + 1, assistantAttachmentsJson, fullLogsJson);
        db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now + 1, chatId);

        res.json({
          user_message: {
            id: userMessageId, chat_id: chatId, role: 'user',
            content: content.trim(), created_at: now, attachments: attachments || undefined,
          },
          assistant_message: {
            id: assistantMessageId, chat_id: chatId, role: 'assistant',
            content: aiResponse, created_at: now + 1,
            attachments: aiAttachments.length > 0 ? aiAttachments : undefined,
            logs: aiLogs.length > 0 ? aiLogs : undefined,
          },
        });
      } catch (error) {
        log.error({ err: error }, 'Failed to send message');
        res.status(500).json({ error: 'Failed to send message' });
      }
    },

    messageToWorkflow(req: Request, res: Response) {
      try {
        const { chatId, messageId } = req.params;
        const { projectId } = req.body;
        if (!projectId) return res.status(400).json({ error: 'Project ID is required' });

        const message = db.prepare('SELECT * FROM chat_messages WHERE id = ? AND chat_id = ?').get(messageId, chatId) as any;
        if (!message) return res.status(404).json({ error: 'Message not found' });

        const maxPos = db.prepare('SELECT MAX(bbox_x2) as max_x, MAX(bbox_y2) as max_y FROM nodes WHERE project_id = ?').get(projectId) as any;
        const x1 = (maxPos?.max_x || 0) + 50;
        const y1 = (maxPos?.max_y || 0) + 50;
        const nodeId = nanoid();
        const now = new Date().toISOString();

        let nodeType = 'text';
        let nodeTitle = 'From Chat';
        let nodeContent = message.content;
        let nodeConfig: any = { response_type: 'text', view_mode: 'normal' };
        let nodeColor = '#6B7280';
        let width = 240;
        let height = 120;

        const attachmentsList = message.attachments_json ? JSON.parse(message.attachments_json) : [];
        if (attachmentsList.length > 0) {
          const firstAttachment = attachmentsList[0];
          const mimeType = firstAttachment.mime_type || '';
          if (mimeType.startsWith('image/')) {
            nodeType = 'image'; nodeTitle = firstAttachment.original_name || 'Image from Chat';
            nodeContent = firstAttachment.url; width = 320; height = 240;
            nodeConfig = { url: firstAttachment.url, alt: nodeTitle };
          } else if (mimeType.startsWith('video/')) {
            nodeType = 'video'; nodeTitle = firstAttachment.original_name || 'Video from Chat';
            nodeContent = firstAttachment.url; width = 400; height = 300;
            nodeConfig = { url: firstAttachment.url };
          } else if (mimeType === 'application/json' || nodeContent.trim().startsWith('{') || nodeContent.trim().startsWith('[')) {
            nodeType = 'text'; nodeTitle = 'Data from Chat';
            nodeConfig = { response_type: 'json', view_mode: 'normal' };
          }
        } else if (nodeContent.trim().startsWith('{') || nodeContent.trim().startsWith('[')) {
          try { JSON.parse(nodeContent); nodeType = 'text'; nodeTitle = 'Data from Chat'; nodeConfig = { response_type: 'json', view_mode: 'normal' }; } catch {}
        }

        const x2 = x1 + width;
        const y2 = y1 + height;

        db.prepare(
          `INSERT INTO nodes (node_id, project_id, type, title, content, config_json, meta_json, visibility_json, ui_color, bbox_x1, bbox_y1, bbox_x2, bbox_y2, ai_visible, connections_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(nodeId, projectId, nodeType, nodeTitle, nodeContent, JSON.stringify(nodeConfig), JSON.stringify({}), JSON.stringify({}), nodeColor, x1, y1, x2, y2, 1, JSON.stringify({ incoming: [], outgoing: [] }), now, now);

        res.json({
          success: true, node_id: nodeId,
          node: { node_id: nodeId, type: nodeType, title: nodeTitle, content: nodeContent, x: x1, y: y1 },
        });
      } catch (error) {
        log.error({ err: error }, 'Failed to create node from message');
        res.status(500).json({ error: 'Failed to create node from message' });
      }
    },

    deleteMessage(req: Request, res: Response) {
      try {
        const { chatId, messageId } = req.params;
        const message = db.prepare('SELECT * FROM chat_messages WHERE id = ? AND chat_id = ?').get(messageId, chatId);
        if (!message) return res.status(404).json({ error: 'Message not found' });
        db.prepare('DELETE FROM chat_messages WHERE id = ?').run(messageId);
        res.json({ success: true });
      } catch (error) {
        log.error({ err: error }, 'Failed to delete message');
        res.status(500).json({ error: 'Failed to delete message' });
      }
    },

    deleteChat(req: Request, res: Response) {
      try {
        const { chatId } = req.params;
        db.prepare('DELETE FROM chat_messages WHERE chat_id = ?').run(chatId);
        db.prepare('DELETE FROM chats WHERE id = ?').run(chatId);
        res.json({ success: true });
      } catch (error) {
        log.error({ err: error }, 'Failed to delete chat');
        res.status(500).json({ error: 'Failed to delete chat' });
      }
    },

    previewContext(req: Request, res: Response) {
      try {
        const { project_id, mode = 'ask', context_level = 2, depth, max_tokens = 32000 } = req.body;
        if (!project_id) return res.status(400).json({ error: 'project_id is required' });
        const contextPreview = generateWorkflowContext(project_id, {
          mode: mode as AgentMode, maxTokens: max_tokens, context_level, depth,
        });
        const estimatedTokens = Math.ceil(contextPreview.length / 4);
        res.json({ preview: contextPreview, length: contextPreview.length, estimated_tokens: estimatedTokens, mode, context_level });
      } catch (error) {
        log.error({ err: error }, '[CHAT] Failed to generate context preview');
        res.status(500).json({ error: 'Failed to generate context preview' });
      }
    },
  };
}
