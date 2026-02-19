import { useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { DEFAULT_UI_SETTINGS } from '../constants/uiSettings';
import type { UiMarkdownPreviewSettings } from '../state/api';

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight(code, language) {
    if (language && hljs.getLanguage(language)) {
      return `<pre class="hljs"><code>${hljs.highlight(code, { language, ignoreIllegals: true }).value}</code></pre>`;
    }
    return `<pre class="hljs"><code>${markdown.utils.escapeHtml(code)}</code></pre>`;
  },
});

interface MarkdownRendererProps {
  content: string;
  className?: string;
  settings?: UiMarkdownPreviewSettings;
}

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

export function MarkdownRenderer({ content, className = '', settings }: MarkdownRendererProps) {
  const htmlContent = useMemo(() => {
    try {
      return markdown.render(content || '');
    } catch (error) {
      console.error('[MarkdownRenderer] Failed to render markdown', error);
      return markdown.utils.escapeHtml(content || '');
    }
  }, [content]);

  const resolvedSettings = useMemo(() => {
    const defaults = DEFAULT_UI_SETTINGS.markdownPreview;
    const lineHeight = clamp(settings?.lineHeight ?? defaults.lineHeight, 0.6, 2);
    const paragraphSpacing = clamp(settings?.paragraphSpacing ?? defaults.paragraphSpacing, 0, 4);
    const breakSpacing = clamp(settings?.breakSpacing ?? defaults.breakSpacing, 0, 4);
    const codePaddingY = clamp(settings?.codeBlockPaddingY ?? defaults.codeBlockPaddingY, 0, 4);
    const codePaddingX = clamp(settings?.codeBlockPaddingX ?? defaults.codeBlockPaddingX, 0, 4);
    const backgroundColor = settings?.backgroundColor ?? defaults.backgroundColor;
    const borderColor = settings?.borderColor ?? defaults.borderColor;

    const listSpacing = Math.max(paragraphSpacing, 0.05);
    const listItemSpacing = Math.max(paragraphSpacing / 2, 0.05);
    const headingTop = Math.max(paragraphSpacing * 0.6, 0.2);
    const headingBottom = Math.max(paragraphSpacing * 0.3, 0.1);
    const blockquotePaddingY = Math.max(paragraphSpacing * 0.9, 0.25);
    const blockquotePaddingX = Math.max(paragraphSpacing * 1.5, 0.5);
    const blockquoteMargin = Math.max(paragraphSpacing * 0.9, 0.35);
    const codeMargin = Math.max(paragraphSpacing * 1.6, 0.45);
    const tableMargin = Math.max(paragraphSpacing, 0.35);

    return {
      lineHeight,
      paragraphSpacing,
      breakSpacing,
      codePaddingY,
      codePaddingX,
      backgroundColor,
      borderColor,
      listSpacing,
      listItemSpacing,
      headingTop,
      headingBottom,
      blockquotePaddingY,
      blockquotePaddingX,
      blockquoteMargin,
      codeMargin,
      tableMargin,
    };
  }, [settings]);

  const {
    lineHeight,
    paragraphSpacing,
    breakSpacing,
    codePaddingY,
    codePaddingX,
    borderColor,
    listSpacing,
    listItemSpacing,
    headingTop,
    headingBottom,
    blockquotePaddingY,
    blockquotePaddingX,
    blockquoteMargin,
    codeMargin,
    tableMargin,
  } = resolvedSettings;

  return (
    <>
      <style>{`
        .markdown-content {
          font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
          line-height: ${lineHeight};
          letter-spacing: 0.001em;
        }

        .markdown-content h1,
        .markdown-content h2,
        .markdown-content h3,
        .markdown-content h4,
        .markdown-content h5,
        .markdown-content h6 {
          color: rgba(255, 255, 255, 0.95) !important;
          font-weight: 600 !important;
          margin-top: ${headingTop}em !important;
          margin-bottom: ${headingBottom}em !important;
        }

        .markdown-content p {
          margin: 0 0 ${paragraphSpacing}em 0;
          color: rgba(226, 232, 240, 0.92);
        }

        .markdown-content strong {
          color: #f8fafc;
        }

        .markdown-content em {
          color: rgba(248, 250, 252, 0.9);
        }

        .markdown-content a {
          color: #60a5fa;
          text-decoration: none;
        }

        .markdown-content a:hover {
          text-decoration: underline;
        }

        .markdown-content ul,
        .markdown-content ol {
          padding-left: 1rem;
          margin: 0 0 ${listSpacing}em 0;
          color: rgba(226, 232, 240, 0.9);
        }

        .markdown-content li {
          margin: ${listItemSpacing}em 0;
        }

        .markdown-content blockquote {
          border-left: 3px solid rgba(96, 165, 250, 0.6);
          background: rgba(30, 41, 59, 0.6);
          padding: ${blockquotePaddingY}em ${blockquotePaddingX}em;
          margin: ${blockquoteMargin}em 0;
          border-radius: 0.35rem;
          color: rgba(226, 232, 240, 0.92);
        }

        .markdown-content code {
          background: rgba(15, 23, 42, 0.8);
          color: rgba(148, 163, 184, 0.95);
          padding: 0.1rem 0.3rem;
          border-radius: 0.3rem;
          font-size: 0.85em;
        }

        .markdown-content pre {
          background: #0b1120;
          border: 1px solid ${borderColor};
          border-radius: 0.9rem;
          padding: ${codePaddingY}rem ${codePaddingX}rem;
          overflow-x: auto;
          margin: ${codeMargin}em 0;
          box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.5);
        }

        .markdown-content br {
          content: '';
          display: block;
          margin-top: ${breakSpacing}em;
          margin-bottom: ${breakSpacing}em;
        }

        .markdown-content table {
          width: 100%;
          border-collapse: collapse;
          margin: ${tableMargin}em 0;
          border: 1px solid ${borderColor};
        }

        .markdown-content table th,
        .markdown-content table td {
          border: 1px solid ${borderColor};
          padding: 0.5rem 0.75rem;
        }
      `}</style>
      <div
        className={`markdown-content ${className}`}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
        style={{
          color: 'rgba(226, 232, 240, 0.92)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
        } as React.CSSProperties}
      />
    </>
  );
}
