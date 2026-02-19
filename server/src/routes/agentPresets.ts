import { Router } from 'express';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { db } from '../db';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'routes/agentPresets' });
const router = Router();

interface AgentPreset {
  preset_id: string;
  user_id: string | null;
  title: string;
  description: string | null;
  icon: string;
  node_template: string; // JSON string
  tags: string | null; // JSON array as string
  is_favorite: number;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/agent-presets
 * Получить все пресеты агентов текущего пользователя
 */
router.get('/agent-presets', (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || null;

    // Если нет userId (dev режим без авторизации), показываем всех
    // В production всегда будет userId от auth middleware
    let presets: AgentPreset[];
    if (userId) {
      const stmt = db.prepare(`
        SELECT * FROM agent_presets 
        WHERE user_id = ?
        ORDER BY is_favorite DESC, created_at DESC
      `);
      presets = stmt.all(userId) as AgentPreset[];
    } else {
      // Dev mode - show all agents
      const stmt = db.prepare(`
        SELECT * FROM agent_presets 
        ORDER BY is_favorite DESC, created_at DESC
      `);
      presets = stmt.all() as AgentPreset[];
    }

    // Парсим JSON поля
    const parsedPresets = presets.map((preset) => ({
      ...preset,
      node_template: JSON.parse(preset.node_template),
      tags: preset.tags ? JSON.parse(preset.tags) : [],
      is_favorite: Boolean(preset.is_favorite),
    }));

    res.json(parsedPresets);
  } catch (error) {
    log.error({ err: error }, '[agent-presets] GET error');
    res.status(500).json({ error: 'Failed to fetch agent presets' });
  }
});

/**
 * POST /api/agent-presets
 * Создать новый пресет агента из ноды
 */
router.post('/agent-presets', (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || null;

    const { title, description, icon, node_template, tags } = req.body;

    if (!title || !node_template) {
      return res.status(400).json({ error: 'title and node_template are required' });
    }

    const presetId = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO agent_presets (
        preset_id, user_id, title, description, icon, 
        node_template, tags, is_favorite, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    stmt.run(
      presetId,
      userId,
      title,
      description || null,
      icon || '🤖',
      JSON.stringify(node_template),
      tags ? JSON.stringify(tags) : null,
      now,
      now
    );

    const created = db.prepare('SELECT * FROM agent_presets WHERE preset_id = ?').get(presetId) as AgentPreset;

    res.status(201).json({
      ...created,
      node_template: JSON.parse(created.node_template),
      tags: created.tags ? JSON.parse(created.tags) : [],
      is_favorite: Boolean(created.is_favorite),
    });
  } catch (error) {
    log.error({ err: error }, '[agent-presets] POST error');
    res.status(500).json({ error: 'Failed to create agent preset' });
  }
});

/**
 * GET /api/agent-presets/:id
 * Получить конкретный пресет по ID
 */
router.get('/agent-presets/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || null;
    const { id } = req.params;

    const preset = db.prepare('SELECT * FROM agent_presets WHERE preset_id = ?').get(id) as AgentPreset | undefined;

    if (!preset) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    // Проверяем доступ (свой или публичный)
    if (preset.user_id !== null && preset.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      ...preset,
      node_template: JSON.parse(preset.node_template),
      tags: preset.tags ? JSON.parse(preset.tags) : [],
      is_favorite: Boolean(preset.is_favorite),
    });
  } catch (error) {
    log.error({ err: error }, '[agent-presets] GET /:id error');
    res.status(500).json({ error: 'Failed to fetch agent preset' });
  }
});

/**
 * PUT /api/agent-presets/:id
 * Обновить существующий пресет
 */
router.put('/agent-presets/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || null;
    const { id } = req.params;

    const { title, description, icon, node_template, tags, is_favorite } = req.body;

    log.info({ data: {
      preset_id: id,
      input_fields: node_template?.ai?.input_fields,
      field_mapping: node_template?.ai?.field_mapping,
    } }, '[agent-presets] PUT request');

    // Проверяем что пресет принадлежит пользователю
    const existing = db.prepare('SELECT * FROM agent_presets WHERE preset_id = ?').get(id) as AgentPreset | undefined;

    if (!existing) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    // TEMPORARY: Allow updates without auth in development
    // TODO: Restore proper auth when frontend sends tokens
    if (userId && existing.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const now = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE agent_presets 
      SET 
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        icon = COALESCE(?, icon),
        node_template = COALESCE(?, node_template),
        tags = COALESCE(?, tags),
        is_favorite = COALESCE(?, is_favorite),
        updated_at = ?
      WHERE preset_id = ?
    `);

    stmt.run(
      title || null,
      description !== undefined ? description : null,
      icon || null,
      node_template ? JSON.stringify(node_template) : null,
      tags !== undefined ? (tags ? JSON.stringify(tags) : null) : null,
      is_favorite !== undefined ? (is_favorite ? 1 : 0) : null,
      now,
      id
    );

    const updated = db.prepare('SELECT * FROM agent_presets WHERE preset_id = ?').get(id) as AgentPreset;

    res.json({
      ...updated,
      node_template: JSON.parse(updated.node_template),
      tags: updated.tags ? JSON.parse(updated.tags) : [],
      is_favorite: Boolean(updated.is_favorite),
    });
  } catch (error) {
    log.error({ err: error }, '[agent-presets] PUT error');
    res.status(500).json({ error: 'Failed to update agent preset' });
  }
});

/**
 * PATCH /api/agent-presets/:id/favorite
 * Переключить статус избранного
 */
router.patch('/agent-presets/:id/favorite', (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || null;
    const { id } = req.params;

    // Проверяем что пресет принадлежит пользователю
    const existing = db.prepare('SELECT * FROM agent_presets WHERE preset_id = ?').get(id) as AgentPreset | undefined;

    if (!existing) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    if (existing.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const newFavoriteState = existing.is_favorite ? 0 : 1;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE agent_presets 
      SET is_favorite = ?, updated_at = ?
      WHERE preset_id = ?
    `).run(newFavoriteState, now, id);

    const updated = db.prepare('SELECT * FROM agent_presets WHERE preset_id = ?').get(id) as AgentPreset;

    res.json({
      ...updated,
      node_template: JSON.parse(updated.node_template),
      tags: updated.tags ? JSON.parse(updated.tags) : [],
      is_favorite: Boolean(updated.is_favorite),
    });
  } catch (error) {
    log.error({ err: error }, '[agent-presets] PATCH favorite error');
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

/**
 * POST /api/agent-presets/share
 * Поделиться агентом (отправить копию другому пользователю)
 */
router.post('/agent-presets/share', (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || null;
    const { preset_id, recipient_email } = req.body;

    if (!preset_id || !recipient_email) {
      return res.status(400).json({ error: 'preset_id and recipient_email are required' });
    }

    // Получаем агента
    const preset = db.prepare('SELECT * FROM agent_presets WHERE preset_id = ?').get(preset_id) as AgentPreset | undefined;

    if (!preset) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    // Находим получателя по email
    const recipient = db.prepare('SELECT user_id, email FROM users WHERE email = ?').get(recipient_email) as { user_id: string; email: string } | undefined;

    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Создаём копию агента для получателя
    const newPresetId = `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO agent_presets (
        preset_id, user_id, title, description, icon, 
        node_template, tags, is_favorite, folder, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newPresetId,
      recipient.user_id,
      preset.title,
      preset.description,
      preset.icon,
      preset.node_template,
      preset.tags,
      0, // не избранный
      (preset as any).folder || null,
      now,
      now
    );

    // TODO: Отправить уведомление получателю (email или in-app notification)
    // Можно добавить запись в таблицу notifications

    res.json({ 
      success: true, 
      message: `Agent shared with ${recipient_email}`,
      new_preset_id: newPresetId
    });
  } catch (error) {
    log.error({ err: error }, '[agent-presets] SHARE error');
    res.status(500).json({ error: 'Failed to share agent' });
  }
});

/**
 * DELETE /api/agent-presets/:id
 * Удалить пресет
 */
router.delete('/agent-presets/:id', (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || null;
    const { id } = req.params;

    // Проверяем что пресет существует
    const existing = db.prepare('SELECT * FROM agent_presets WHERE preset_id = ?').get(id) as AgentPreset | undefined;

    if (!existing) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    // Разрешаем удалять:
    // 1. Свои пресеты (user_id совпадает)
    // 2. Старые пресеты без user_id (user_id IS NULL)
    // Запрещаем удалять чужие пресеты (user_id другой и не NULL)
    if (existing.user_id !== null && existing.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.prepare('DELETE FROM agent_presets WHERE preset_id = ?').run(id);

    res.json({ success: true, message: 'Preset deleted' });
  } catch (error) {
    log.error({ err: error }, '[agent-presets] DELETE error');
    res.status(500).json({ error: 'Failed to delete agent preset' });
  }
});

export default router;
