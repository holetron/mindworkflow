import { Router } from 'express';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import fetch, { Response } from 'node-fetch';
import { URL } from 'url';
import { isExternalUrl } from '../utils/security';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'routes/mediaProxy' });
const REQUEST_TIMEOUT_MS = 15000;
const MAX_CONTENT_LENGTH_BYTES = 25 * 1024 * 1024; // 25MB safety cap

type ProxyTarget = {
  url: string;
  response: Response;
};

async function fetchWithTimeout(targetUrl: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.3',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.8',
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateProxyUrl(rawUrl: string): URL | null {
  if (!rawUrl || !isExternalUrl(rawUrl)) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function resolveProxyTarget(rawUrl: string): Promise<ProxyTarget | null> {
  const parsed = validateProxyUrl(rawUrl);
  if (!parsed) {
    return null;
  }

  const response = await fetchWithTimeout(parsed.toString());
  return { url: parsed.toString(), response };
}

export function createMediaProxyRouter(): Router {
  const router = Router();

  router.get('/image', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl) {
      res.status(400).json({ error: 'url parameter is required' });
      return;
    }

    let target: ProxyTarget | null = null;
    try {
      target = await resolveProxyTarget(rawUrl);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        res.status(504).json({ error: 'Timed out while fetching remote image' });
        return;
      }
      log.error({ err: error }, '[mediaProxy] Failed to fetch remote image');
      res.status(502).json({ error: 'Failed to fetch remote image' });
      return;
    }

    if (!target) {
      res.status(400).json({ error: 'Unsupported or unsafe URL' });
      return;
    }

    const { response } = target;

    if (!response.ok || !response.body) {
      res
        .status(response.status || 502)
        .json({ error: `Remote request failed (${response.status} ${response.statusText})` });
      return;
    }

    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      res.status(415).json({ error: 'Remote resource is not an image' });
      return;
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH_BYTES) {
        res.status(413).json({ error: 'Image is too large to proxy' });
        return;
      }
      res.setHeader('Content-Length', contentLength);
    }

    const cacheControl = response.headers.get('cache-control');
    if (cacheControl) {
      res.setHeader('Cache-Control', cacheControl);
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');

    const readable = Readable.fromWeb(response.body as unknown as ReadableStream);

    try {
      await pipeline(readable, res);
    } catch (error) {
      log.error({ err: error }, '[mediaProxy] Streaming pipeline failed');
      if (!res.headersSent) {
        res.status(500).end('Failed to stream image');
      } else {
        res.end();
      }
    }
  });

  return router;
}
