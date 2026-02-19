import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import * as path from 'path';
import { getProjectsRoot } from './utils/projectPaths';
import * as fs from 'fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { Server } from 'http';
import fetch from 'node-fetch';
import { loadEnv } from './utils/loadEnv';

// Load environment variables BEFORE importing db
loadEnv();

import { createProjectsRouter } from './routes/projects';
import { createNodesRouter } from './routes/nodes';
import { createValidateRouter } from './routes/validate';
import { createIntegrationsRouter } from './routes/integrations';
import { createAuthRouter } from './routes/auth';
import { createAdminRouter } from './routes/admin';
import { createPromptsRouter } from './routes/prompts';
import { createHtmlRouter } from './routes/html';
import { createMediaProxyRouter } from './routes/mediaProxy';
import { createSettingsRouter } from './routes/settings';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { createFeedbackEntry, db } from './db';
import { createFeedbackRouter } from './routes/feedback';
import agentPresetsRouter from './routes/agentPresets';
import chatRouter from './routes/chat';
import chatUploadRouter from './routes/chatUpload';
import videosRouter from './routes/videos';
import imagesRouter from './routes/images';
import { createMidjourneyRouter } from './routes/midjourney';

import { logger } from './lib/logger';

const log = logger.child({ module: 'server' });
const app = createApp();

if (shouldStartHttpServer()) {
  startHttpServer(app);
}

export default app;
export { createApp, startHttpServer };

function createApp(): express.Express {
  const application = express();
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  loadCoreSchemas(ajv);

  application.use(cors());
  application.use(express.json({ limit: '50mb' }));
  application.use(express.urlencoded({ limit: '50mb', extended: true }));
  application.use(morgan('dev'));

  registerStaticClient(application);

  const uploadsDir = getProjectsRoot();
  log.info(`[UPLOADS] Projects root: ${uploadsDir}, exists: ${fs.existsSync(uploadsDir)}`);
  if (fs.existsSync(uploadsDir)) {
    application.use('/uploads', express.static(uploadsDir));
    log.info(`[UPLOADS] Static middleware registered for /uploads -> ${uploadsDir}`);
  } else {
    log.warn(`[UPLOADS] Directory does not exist: ${uploadsDir}`);
  }

  application.get('/', (_req, res) =>
    res.send('MindWorkFlow API Server - No UI here, use frontend at :5173'),
  );

  application.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', timestamp: new Date().toISOString() }),
  );

  const authRouter = createAuthRouter();
  const projectsRouter = createProjectsRouter(ajv);
  const integrationsRouter = createIntegrationsRouter(ajv);
  const adminRouter = createAdminRouter();
  const promptsRouter = createPromptsRouter();
  const midjourneyRouter = createMidjourneyRouter(db);

  application.use('/api/auth', authRouter);
  application.use('/api/project', authMiddleware, projectsRouter);
  application.use('/api/projects', authMiddleware, projectsRouter);
  application.use('/api/integrations', authMiddleware, integrationsRouter);
  application.use('/api/prompts', authMiddleware, promptsRouter);
  application.use('/api/admin', authMiddleware, adminRouter);
  application.use('/api/settings', authMiddleware, createSettingsRouter());
  application.use('/api/feedback', authMiddleware, createFeedbackRouter());
  application.use('/api', authMiddleware, agentPresetsRouter);
  application.use('/api', authMiddleware, chatRouter);
  application.use('/api', authMiddleware, chatUploadRouter);

  application.use('/api/node', authMiddleware, createNodesRouter(ajv));
  application.use('/api/videos', authMiddleware, videosRouter);
  application.use('/api/images', authMiddleware, imagesRouter);
  application.use('/api/validate', authMiddleware, createValidateRouter(ajv));
  application.use('/api/html', authMiddleware, createHtmlRouter());
  application.use('/api/media', authMiddleware, createMediaProxyRouter());

  application.get('/api/test-projects', async (_req, res) => {
    const { listProjects } = await import('./db');
    const projects = listProjects('9638027e-8b97-41c2-8159-653ba485e38d');
    res.json(projects);
  });

  application.get('/api/html-proxy', authMiddleware, async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL parameter is required' });
      }

      try {
        new URL(url);
      } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return res
          .status(response.status)
          .json({ error: `Failed to fetch: ${response.status} ${response.statusText}` });
      }

      const html = await response.text();

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(html);
    } catch (error) {
      log.error({ err: error }, 'HTML proxy error');
      res.status(500).json({
        error: 'Failed to fetch HTML content',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  application.post('/api/feedback', express.json(), (req, res) => {
    try {
      const { type, description, contact, timestamp, title } = req.body ?? {};

      if (typeof description !== 'string' || description.trim().length === 0) {
        return res.status(400).json({ error: 'Description is required' });
      }

      if (typeof type !== 'string' || type.trim().length === 0) {
        return res.status(400).json({ error: 'Type is required' });
      }

      const normalizedType =
        type.trim().toLowerCase() === 'problem'
          ? 'problem'
          : type.trim().toLowerCase() === 'suggestion'
          ? 'suggestion'
          : null;

      if (!normalizedType) {
        return res.status(400).json({ error: 'Unsupported feedback type' });
      }

      const createdDateCandidate =
        typeof timestamp === 'string' || typeof timestamp === 'number'
          ? new Date(timestamp)
          : new Date();
      const createdDate = Number.isNaN(createdDateCandidate.getTime())
        ? new Date()
        : createdDateCandidate;

      const displayTitle =
        typeof title === 'string' && title.trim().length > 0
          ? title.trim()
          : normalizedType === 'problem'
          ? 'Problem'
          : 'Improvement Suggestion';

      const dateStr = createdDate.toISOString().split('T')[0];
      const timeStr = createdDate.toTimeString().split(' ')[0].replace(/:/g, '');
      const filename = `${dateStr}-${timeStr}-${normalizedType}.md`;
      const feedbackDir = path.resolve(process.cwd(), 'feedback');
      const filepath = path.join(feedbackDir, filename);

      let backupSaved = false;
      try {
        if (!fs.existsSync(feedbackDir)) {
          fs.mkdirSync(feedbackDir, { recursive: true });
        }

        const content = `# ${displayTitle}

**Date:** ${createdDate.toLocaleString('en-US')}
**Type:** ${normalizedType === 'problem' ? 'Problem' : 'Suggestion'}
**Contact:** ${
          typeof contact === 'string' && contact.trim().length > 0 ? contact : 'Not specified'
        }

## Description
${description}

## Status
Awaiting review

## Resolution
*Resolution will be added after review*
`;

        fs.writeFileSync(filepath, content, 'utf8');
        backupSaved = true;
      } catch (fileError) {
        log.error({ err: fileError }, 'Feedback backup file error');
      }

      const entry = createFeedbackEntry({
        type: normalizedType,
        title: displayTitle,
        description,
        contact: typeof contact === 'string' ? contact : null,
        status: 'new',
        resolution: null,
        source: backupSaved ? filename : null,
        created_at: createdDate.toISOString(),
      });

      res.json({
        success: true,
        feedback_id: entry.feedback_id,
        filename: backupSaved ? filename : undefined,
      });
    } catch (error) {
      log.error({ err: error }, 'Feedback error');
      res.status(500).json({ error: 'Failed to save feedback' });
    }
  });

  application.use(errorHandler);

  return application;
}

function shouldStartHttpServer(): boolean {
  if (process.env.JEST_WORKER_ID !== undefined) {
    return false;
  }
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  if (process.env.DISABLE_HTTP_SERVER === '1') {
    return false;
  }
  return true;
}

function startHttpServer(application: express.Express): Server {
  const port = Number(process.env.PORT ?? 6048);
  const host = resolveHost();

  const server = application.listen(port, host, () => {
    log.info(`MindWorkFlow server listening on ${host}:${port}`);
  });

  server.on('error', (error) => {
    log.error({ err: error }, 'Server error');
  });

  return server;
}

function resolveHost(): string {
  const host = process.env.HOST ?? '0.0.0.0';
  if (process.env.FORCE_LOCALHOST_LISTEN === '1' && host === '0.0.0.0') {
    return '127.0.0.1';
  }
  return host;
}

function loadCoreSchemas(validator: Ajv): void {
  const schemaDir = path.resolve(__dirname, 'schemas');
  const files = [
    'PLAN_SCHEMA.json',
    'ACTOR_SCHEMA.json',
    'PARSE_SCHEMA.json',
    'TEXT_RESPONSE.json',
    'MINDMAP_SCHEMA.json',
    'SINGLE_NODE_SCHEMA.json',
  ];

  for (const file of files) {
    const schemaPath = path.join(schemaDir, file);
    const raw = fs.readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(raw);
    const schemaId = path.parse(file).name;
    schema.$id = schemaId;
    validator.addSchema(schema, schemaId);
  }
}

function registerStaticClient(application: express.Express): void {
  const isPkg = typeof (process as any).pkg !== 'undefined';
  const portableClientDir = path.resolve(process.cwd(), 'app-dist');
  const isPortable = fs.existsSync(portableClientDir);

  const clientDir = isPortable
    ? portableClientDir
    : isPkg
    ? path.resolve(__dirname, '..', 'app', 'dist')
    : path.resolve(process.cwd(), '..', 'app', 'dist');

  const indexPath = path.join(clientDir, 'index.html');
  if (!fs.existsSync(clientDir) || !fs.existsSync(indexPath)) {
    return;
  }

  application.use(express.static(clientDir));
  application.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(indexPath);
  });
}
