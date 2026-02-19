import { logger } from '../../lib/logger';
import type { MidjourneyReferenceImage } from './types';

const log = logger.child({ module: 'midjourney' });

/**
 * Builds the Discord-style prompt string from a base prompt, reference images,
 * modifier inputs, and an optional model ID.
 */
export function buildDiscordPrompt(
  basePrompt: string,
  referenceImages: MidjourneyReferenceImage[],
  inputs: Record<string, unknown>,
  modelId?: string,
): string {
  const parts: string[] = [];

  const imagePromptUrls: string[] = [];
  const styleRefUrls: string[] = [];
  const charRefUrls: string[] = [];

  log.info({ referenceImageCount: referenceImages.length }, 'buildDiscordPrompt starting');

  for (const ref of referenceImages) {
    const purpose = (ref.purpose || '').toLowerCase();
    log.info(`[buildDiscordPrompt]   Classifying: url=${ref.url.substring(0, 60)}..., purpose="${purpose}"`);

    if (purpose === 'character_reference' || purpose.includes('character') || purpose.includes('char') || purpose === 'omni') {
      charRefUrls.push(ref.url);
      log.info('[buildDiscordPrompt]     → Character reference (--cref flag)');
    } else if (purpose === 'style_reference' || purpose.includes('style')) {
      styleRefUrls.push(ref.url);
      log.info('[buildDiscordPrompt]     → Style reference (prepended before text)');
    } else if (purpose === 'image_prompt' || purpose === 'reference_image' || purpose.includes('reference') || purpose.includes('image')) {
      imagePromptUrls.push(ref.url);
      log.info('[buildDiscordPrompt]     → Image prompt (at the beginning)');
    } else {
      imagePromptUrls.push(ref.url);
      log.info('[buildDiscordPrompt]     → Default to Image prompt');
    }
  }

  log.info(`[buildDiscordPrompt] Classified: ${imagePromptUrls.length} image prompts, ${styleRefUrls.length} style refs, ${charRefUrls.length} char refs`);

  for (const url of imagePromptUrls) {
    parts.push(url);
  }

  for (const url of styleRefUrls) {
    parts.push(url);
  }

  parts.push(basePrompt);

  const flags: string[] = [];

  let detectedVersion = '';
  if (modelId) {
    const versionMatch = modelId.match(/midjourney-(v[\d.]+|niji-\d+)/);
    if (versionMatch) {
      const version = versionMatch[1];
      detectedVersion = version;
      if (version.startsWith('niji-')) {
        flags.push(`--${version.replace('-', ' ')}`);
      } else {
        flags.push(`--v ${version.substring(1)}`);
      }
    }
  }

  if (inputs.mode === 'raw') {
    flags.push('--style raw');
  }

  const aspectRatioMap: Record<string, string> = {
    'portrait': '2:3',
    'square': '1:1',
    'landscape': '3:2',
  };
  if (typeof inputs.aspect_ratio === 'string' && aspectRatioMap[inputs.aspect_ratio]) {
    flags.push(`--ar ${aspectRatioMap[inputs.aspect_ratio]}`);
  }

  if (typeof inputs.stylization === 'number' && inputs.stylization !== 100) {
    flags.push(`--s ${inputs.stylization}`);
  }

  if (typeof inputs.weirdness === 'number' && inputs.weirdness > 0) {
    flags.push(`--w ${inputs.weirdness}`);
  }

  if (typeof inputs.variety === 'number' && inputs.variety > 0) {
    flags.push(`--vary ${inputs.variety}`);
  }

  if (inputs.speed === 'turbo') {
    flags.push('--turbo');
  } else if (inputs.speed === 'fast') {
    flags.push('--fast');
  } else if (inputs.speed === 'relax') {
    flags.push('--relax');
  }

  const isCrefUnsupported =
    detectedVersion.startsWith('v7') || detectedVersion.startsWith('niji-');

  if (charRefUrls.length > 0 && !isCrefUnsupported) {
    flags.push(`--cref ${charRefUrls.join(' ')}`);
    if (typeof inputs.character_weight === 'number') {
      flags.push(`--cw ${inputs.character_weight}`);
    } else {
      flags.push('--cw 80');
    }
  } else if (charRefUrls.length > 0) {
    log.info(
      `[buildDiscordPrompt] ⚠️ Skipping --cref flag (${charRefUrls.length} character refs) ` +
      `because --cref is not compatible with version "${detectedVersion}". ` +
      `Character references require v6.1 or earlier.`
    );
  }

  if (flags.length > 0) {
    parts.push(flags.join(' '));
  }

  const finalPrompt = parts.filter((p) => p && p.trim().length > 0).join(' ');
  log.info('[buildDiscordPrompt] ✅ Final Discord prompt:');
  log.info('[buildDiscordPrompt] %s', finalPrompt);
  return finalPrompt;
}
