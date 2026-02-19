import { Router } from 'express';
import { URL } from 'url';
import { performance } from 'node:perf_hooks';

type MetadataResponse = {
  finalUrl: string;
  title?: string | null;
};

type ScreenshotRequest = {
  url: string;
  viewportWidth?: number;
  viewportHeight?: number;
  clipHeight?: number;
};

type ScreenshotResponse = MetadataResponse & {
  screenshot?: string;
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function resolveUrl(input: string): Promise<MetadataResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(input, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.8',
      },
    });

    clearTimeout(timeout);

    const finalUrl = response.url || input;
    const contentType = response.headers.get('content-type') ?? '';
    const shouldParseHtml = response.ok && contentType.includes('text/html');

    if (!shouldParseHtml) {
      return {
        finalUrl,
        title: undefined,
      };
    }

    const html = await response.text();
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const rawTitle = match?.[1]?.trim();

    return {
      finalUrl,
      title: rawTitle ? decodeHTMLEntities(rawTitle) : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function decodeHTMLEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(Number.parseInt(dec, 10)))
    .replace(/&#x([\da-fA-F]+);/g, (_match, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function captureScreenshot(request: ScreenshotRequest): Promise<ScreenshotResponse> {
  const { default: puppeteer } = await import('puppeteer');

  const viewportWidth = Number.isFinite(request.viewportWidth)
    ? Math.max(320, Math.min(Math.round(request.viewportWidth ?? 1024), 3840))
    : 1280;
  const viewportHeight = Number.isFinite(request.viewportHeight)
    ? Math.max(240, Math.min(Math.round(request.viewportHeight ?? 720), 2160))
    : 720;
  const clipHeight = Number.isFinite(request.clipHeight)
    ? Math.max(120, Math.min(Math.round(request.clipHeight ?? viewportHeight), viewportHeight))
    : viewportHeight;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: viewportWidth, height: viewportHeight });

    const gotoStarted = performance.now();
    await page.goto(request.url, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });
    const gotoDuration = performance.now() - gotoStarted;
    if (gotoDuration > 15000) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const title = await page.title();
    const finalUrl = page.url();

    const screenshot = await page.screenshot({
      type: 'png',
      encoding: 'base64',
      clip: {
        x: 0,
        y: 0,
        width: viewportWidth,
        height: clipHeight,
      },
    });

    return {
      finalUrl,
      title,
      screenshot: `data:image/png;base64,${screenshot}`,
    };
  } finally {
    await browser.close();
  }
}

export function createHtmlRouter(): Router {
  const router = Router();

  router.get('/metadata', async (req, res, next) => {
    try {
      const url = typeof req.query.url === 'string' ? req.query.url.trim() : '';
      if (!url) {
        res.status(400).json({ error: 'URL parameter is required' });
        return;
      }

      try {
        // eslint-disable-next-line no-new
        new URL(url);
      } catch {
        res.status(400).json({ error: 'Invalid URL format' });
        return;
      }

      const metadata = await resolveUrl(url);
      res.json(metadata);
    } catch (error) {
      next(error);
    }
  });

  router.post('/screenshot', async (req, res, next) => {
    try {
      const body = req.body as ScreenshotRequest | undefined;
      const url = typeof body?.url === 'string' ? body.url.trim() : '';
      if (!url) {
        res.status(400).json({ error: 'URL is required' });
        return;
      }

      try {
        // eslint-disable-next-line no-new
        new URL(url);
      } catch {
        res.status(400).json({ error: 'Invalid URL format' });
        return;
      }

      const screenshot = await captureScreenshot({
        url,
        viewportHeight: body?.viewportHeight,
        viewportWidth: body?.viewportWidth,
        clipHeight: body?.clipHeight,
      });

      res.json(screenshot);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to launch')) {
        res.status(500).json({
          error: 'Unable to capture screenshot: headless browser not available',
          details: error.message,
        });
        return;
      }
      next(error);
    }
  });

  return router;
}
