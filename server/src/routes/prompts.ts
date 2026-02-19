import { Router } from 'express';
import {
  PromptPresetCategory,
  listQuickPromptPresets,
  searchPromptPresets,
} from '../db';

function isPromptPresetCategory(value: unknown): value is PromptPresetCategory {
  return value === 'system_prompt' || value === 'output_example';
}

function parseLimit(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return fallback;
  }
  const numeric = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, Math.trunc(numeric)));
}

export function createPromptsRouter(): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const { category: rawCategory, search: rawSearch, limit: rawLimit } = req.query;
      let category: PromptPresetCategory | undefined;
      if (rawCategory !== undefined) {
        if (!isPromptPresetCategory(rawCategory)) {
          res.status(400).json({ error: 'Unknown prompt category' });
          return;
        }
        category = rawCategory;
      }

      const limit = parseLimit(rawLimit, 25, 100);
      const search =
        rawSearch && typeof rawSearch === 'string' && rawSearch.trim().length > 0
          ? rawSearch.trim()
          : undefined;

      const results = searchPromptPresets({ category, search, limit });
      res.json(results);
    } catch (error) {
      next(error);
    }
  });

  router.get('/quick', (req, res, next) => {
    try {
      const { category: rawCategory, limit: rawLimit } = req.query;
      if (!isPromptPresetCategory(rawCategory)) {
        res.status(400).json({ error: 'Prompt category is required for quick presets' });
        return;
      }

      const limit = parseLimit(rawLimit, 8, 20);
      const results = listQuickPromptPresets(rawCategory, limit);
      res.json(results);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
