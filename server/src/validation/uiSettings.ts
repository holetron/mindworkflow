import { z } from 'zod';

const fontScaleStepSchema = z.object({
  maxLength: z.number().int().min(1).max(100000),
  multiplier: z.number().positive().max(50),
});

const markdownPreviewSchema = z
  .object({
    lineHeight: z.number().min(0.6).max(2),
    paragraphSpacing: z.number().min(0).max(4),
    breakSpacing: z.number().min(0).max(4),
    codeBlockPaddingY: z.number().min(0).max(4),
    codeBlockPaddingX: z.number().min(0).max(4),
    backgroundColor: z.string().min(1).max(64),
    borderColor: z.string().min(1).max(64),
  })
  .strict();

export const uiSettingsSchema = z
  .object({
    textNodeFontScaling: z
      .object({
        baseFontSize: z.number().min(6).max(96),
        steps: z.array(fontScaleStepSchema).min(1),
        targetNodeTypes: z.array(z.string().min(1)).min(1).max(16),
        scaleMultiplier: z.number().min(0.75).max(1.5),
      })
      .strict(),
    markdownPreview: markdownPreviewSchema,
  })
  .strict();

export type UiSettingsPayload = z.infer<typeof uiSettingsSchema>;
