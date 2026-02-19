import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FlowNode } from '../../../state/api';

interface UseNodeEmailOptions {
  node: FlowNode;
  contentValue: string;
  disabled: boolean;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  onContentChange: (content: string) => void;
}

export function useNodeEmail({
  node,
  contentValue,
  disabled,
  onChangeMeta,
  onContentChange,
}: UseNodeEmailOptions) {
  const [emailHeroImage, setEmailHeroImage] = useState<string>(
    (node.meta?.hero_image as string) || '',
  );
  const [emailPreviewWidth, setEmailPreviewWidth] = useState<number>(
    (node.meta?.editorPreviewWidth as number) || 640,
  );
  const [emailPreviewHeight, setEmailPreviewHeight] = useState<number>(
    (node.meta?.editorPreviewHeight as number) || 520,
  );
  const [emailTextColor, setEmailTextColor] = useState<string>(
    (node.meta?.emailTextColor as string) || '#1f2937',
  );
  const [emailBackgroundColor, setEmailBackgroundColor] = useState<string>(
    (node.meta?.emailBackgroundColor as string) || '#f1f5f9',
  );
  const [emailAccentColor, setEmailAccentColor] = useState<string>(
    (node.meta?.emailAccentColor as string) || '#2563eb',
  );
  const [showEmailCodeEditor, setShowEmailCodeEditor] = useState(false);

  // Sync effects
  useEffect(() => {
    setEmailHeroImage((node.meta?.hero_image as string) || '');
  }, [node.meta?.hero_image]);

  useEffect(() => {
    setEmailPreviewWidth((node.meta?.editorPreviewWidth as number) || 640);
  }, [node.meta?.editorPreviewWidth]);

  useEffect(() => {
    setEmailPreviewHeight((node.meta?.editorPreviewHeight as number) || 520);
  }, [node.meta?.editorPreviewHeight]);

  useEffect(() => {
    setEmailTextColor((node.meta?.emailTextColor as string) || '#1f2937');
  }, [node.meta?.emailTextColor]);

  useEffect(() => {
    setEmailBackgroundColor((node.meta?.emailBackgroundColor as string) || '#f1f5f9');
  }, [node.meta?.emailBackgroundColor]);

  useEffect(() => {
    setEmailAccentColor((node.meta?.emailAccentColor as string) || '#2563eb');
  }, [node.meta?.emailAccentColor]);

  const handleEmailHeroImageChange = useCallback(
    (url: string) => {
      setEmailHeroImage(url);
      onChangeMeta(node.node_id, { hero_image: url });
    },
    [node.node_id, onChangeMeta],
  );

  const handleEmailPreviewWidthChange = useCallback(
    (width: number) => {
      const clamped = Math.round(Math.min(900, Math.max(320, width)));
      setEmailPreviewWidth(clamped);
      onChangeMeta(node.node_id, { editorPreviewWidth: clamped });
    },
    [node.node_id, onChangeMeta],
  );

  const handleEmailPreviewHeightChange = useCallback(
    (height: number) => {
      const clamped = Math.round(Math.min(900, Math.max(360, height)));
      setEmailPreviewHeight(clamped);
      onChangeMeta(node.node_id, { editorPreviewHeight: clamped });
    },
    [node.node_id, onChangeMeta],
  );

  const handleEmailTextColorChange = useCallback(
    (color: string) => {
      setEmailTextColor(color);
      onChangeMeta(node.node_id, { emailTextColor: color });
    },
    [node.node_id, onChangeMeta],
  );

  const handleEmailBackgroundColorChange = useCallback(
    (color: string) => {
      setEmailBackgroundColor(color);
      onChangeMeta(node.node_id, { emailBackgroundColor: color });
    },
    [node.node_id, onChangeMeta],
  );

  const handleEmailAccentColorChange = useCallback(
    (color: string) => {
      setEmailAccentColor(color);
      onChangeMeta(node.node_id, { emailAccentColor: color });
    },
    [node.node_id, onChangeMeta],
  );

  const handleResetEmailPalette = useCallback(() => {
    const defaultText = '#1f2937';
    const defaultBackground = '#f1f5f9';
    const defaultAccent = '#2563eb';
    setEmailTextColor(defaultText);
    setEmailBackgroundColor(defaultBackground);
    setEmailAccentColor(defaultAccent);
    onChangeMeta(node.node_id, {
      emailTextColor: defaultText,
      emailBackgroundColor: defaultBackground,
      emailAccentColor: defaultAccent,
    });
  }, [node.node_id, onChangeMeta]);

  const handleInsertHeroImage = useCallback(() => {
    if (!emailHeroImage) return;
    const imgTag = `<div class="email-hero" style="text-align:center;margin:24px 0;">
  <img src="${emailHeroImage}" alt="Hero" style="max-width:100%;border-radius:16px;box-shadow:0 12px 24px rgba(15,23,42,0.15);" />
</div>`;
    if (contentValue.includes(emailHeroImage)) return;
    const updated = contentValue.trim() ? `${imgTag}\n${contentValue}` : imgTag;
    onContentChange(updated);
  }, [contentValue, emailHeroImage, onContentChange]);

  const handleInsertImageBlock = useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = window.prompt('Enter image URL');
    if (!url) return;
    const alt = window.prompt('Alternative text for image') || 'Image';
    const block = `<div style="text-align:center;margin:24px 0;">
  <img src="${url}" alt="${alt}" style="max-width:100%;border-radius:12px;box-shadow:0 8px 18px rgba(15,23,42,0.15);" />
</div>`;
    onContentChange(contentValue.trim() ? `${contentValue}\n${block}` : block);
  }, [contentValue, onContentChange]);

  const handleInsertCtaBlock = useCallback(() => {
    const snippet = `<div style="text-align:center;margin:32px 0;">
  <a href="https://example.com" style="display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:999px;background:${emailAccentColor};color:#ffffff;font-weight:600;text-decoration:none;">Follow link &rarr;</a>
</div>`;
    onContentChange(contentValue.trim() ? `${contentValue}\n${snippet}` : snippet);
  }, [contentValue, emailAccentColor, onContentChange]);

  const handleInsertDivider = useCallback(() => {
    const divider = `<hr style="margin:32px 0;border:none;height:1px;background:linear-gradient(90deg, transparent, rgba(148,163,184,0.4), transparent);" />`;
    onContentChange(contentValue.trim() ? `${contentValue}\n${divider}` : divider);
  }, [contentValue, onContentChange]);

  const htmlEmailPreview = useMemo(() => {
    const raw = contentValue?.trim() ?? '';
    const textColor = emailTextColor || '#1f2937';
    const backgroundColor = emailBackgroundColor || '#f1f5f9';
    const accentColor = emailAccentColor || '#2563eb';

    const heroBlock = emailHeroImage
      ? `<div class="email-hero" style="text-align:center;margin:24px 0;">
  <img src="${emailHeroImage}" alt="Hero" style="max-width:100%;border-radius:16px;box-shadow:0 12px 24px rgba(15,23,42,0.15);" />
</div>`
      : '';

    if (/<!doctype|<html/i.test(raw)) {
      if (!emailHeroImage) return raw || '<!DOCTYPE html><html><body></body></html>';
      const lower = raw.toLowerCase();
      const bodyIndex = lower.indexOf('<body');
      if (bodyIndex === -1) return `${heroBlock}${raw}`;
      const insertIndex = raw.indexOf('>', bodyIndex);
      if (insertIndex === -1) return `${raw}${heroBlock}`;
      return `${raw.slice(0, insertIndex + 1)}${heroBlock}${raw.slice(insertIndex + 1)}`;
    }

    const fallbackSection =
      raw ||
      `<p style="margin:0 0 16px 0;">
  Start editing the email using the toolbar. Add images, buttons, and dividers to build your template.
</p>
<p style="margin:0 0 16px 0;">
  Click "Show HTML" to make precise code edits.
</p>`;

    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { margin:0; padding:24px; background:${backgroundColor}; color:${textColor}; font-family:Arial,sans-serif; }
  .email-shell { max-width:640px; margin:0 auto; background:#ffffff; border-radius:24px; overflow:hidden; box-shadow:0 24px 48px rgba(15,23,42,0.18); }
  .email-header { padding:32px 32px 24px; background:linear-gradient(135deg, ${accentColor}, ${accentColor}cc); color:#ffffff; }
  .email-header h1 { margin:0 0 12px 0; font-size:28px; font-weight:700; }
  .email-header p { margin:0; font-size:16px; opacity:0.85; }
  .email-main { padding:32px; line-height:1.6; font-size:16px; color:${textColor}; background:${backgroundColor}; }
  .email-main p { margin:0 0 16px 0; }
  .email-cta { padding:0 32px 32px; text-align:center; background:${backgroundColor}; }
  .email-button { display:inline-flex; align-items:center; gap:8px; padding:14px 28px; border-radius:999px; background:${accentColor}; color:#ffffff; text-decoration:none; font-weight:600; }
  .email-footer { padding:24px; text-align:center; font-size:12px; color:#64748b; background:#f8fafc; }
  .email-hero img { max-width:100%; border-radius:16px; box-shadow:0 12px 24px rgba(15,23,42,0.15); }
  @media (max-width:640px) {
    .email-shell { border-radius:16px; }
    .email-main, .email-header { padding:24px; }
  }
</style>
</head><body>
  <div class="email-shell">
    <header class="email-header">
      <h1>Email Header</h1>
      <p>Add your key offer or promotion here.</p>
    </header>
    <main class="email-main">
      ${heroBlock}
      <div class="email-content">
        ${fallbackSection}
      </div>
    </main>
    <div class="email-cta">
      <a class="email-button" href="https://example.com">Go to project &rarr;</a>
    </div>
    <footer class="email-footer">
      You received this email because you subscribed to updates.
    </footer>
  </div>
</body></html>`;
  }, [contentValue, emailHeroImage, emailAccentColor, emailBackgroundColor, emailTextColor]);

  const openEmailPreviewInTab = useCallback(() => {
    if (typeof window === 'undefined') return;
    const blob = new Blob([htmlEmailPreview], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }, [htmlEmailPreview]);

  return {
    emailHeroImage,
    emailPreviewWidth,
    emailPreviewHeight,
    emailTextColor,
    emailBackgroundColor,
    emailAccentColor,
    showEmailCodeEditor,
    htmlEmailPreview,
    setShowEmailCodeEditor,
    handleEmailHeroImageChange,
    handleEmailPreviewWidthChange,
    handleEmailPreviewHeightChange,
    handleEmailTextColorChange,
    handleEmailBackgroundColorChange,
    handleEmailAccentColorChange,
    handleResetEmailPalette,
    handleInsertHeroImage,
    handleInsertImageBlock,
    handleInsertCtaBlock,
    handleInsertDivider,
    openEmailPreviewInTab,
  };
}
