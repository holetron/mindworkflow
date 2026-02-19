import { Router } from 'express';
import type { Request, Response } from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { AiService } from '../services/ai';
import { db } from '../db';
import * as fs from 'fs';
import * as path from 'path';
import { createChatController } from '../controllers/chatController';

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

// Migration: Add logs_json column to chat_messages if it doesn't exist
try {
  const messageTableInfo = db.prepare("PRAGMA table_info(chat_messages)").all() as Array<{ name: string }>;
  const hasLogsJson = messageTableInfo.some(col => col.name === 'logs_json');
  if (!hasLogsJson) {
    log.info('[CHAT] Adding logs_json column to chat_messages table...');
    db.exec(`ALTER TABLE chat_messages ADD COLUMN logs_json TEXT;`);
    log.info('[CHAT] logs_json column added successfully');
  }
} catch (error) {
  log.error({ err: error }, '[CHAT] Migration error for logs_json');
}

// Migration: Add agent_preset_id column to chats if it doesn't exist
try {
  const chatTableInfo = db.prepare("PRAGMA table_info(chats)").all() as Array<{ name: string }>;
  const hasAgentPresetId = chatTableInfo.some(col => col.name === 'agent_preset_id');
  if (!hasAgentPresetId) {
    log.info('[CHAT] Adding agent_preset_id column to chats table...');
    db.exec(`ALTER TABLE chats ADD COLUMN agent_preset_id TEXT;`);
    log.info('[CHAT] agent_preset_id column added successfully');
  }
} catch (error) {
  log.error({ err: error }, '[CHAT] Migration error for agent_preset_id');
}

// Create controller and wire up routes
const controller = createChatController(aiService);

router.get('/chats', controller.listChats);
router.post('/chats', controller.createChat);
router.get('/chats/:chatId/messages', controller.getMessages);
router.post('/chats/:chatId/settings', controller.updateSettings);
router.post('/chats/:chatId/messages', controller.sendMessage);
router.post('/chats/:chatId/messages/:messageId/to-workflow', controller.messageToWorkflow);
router.delete('/chats/:chatId/messages/:messageId', controller.deleteMessage);
router.delete('/chats/:chatId', controller.deleteChat);
router.post('/chats/preview-context', controller.previewContext);

export default router;
