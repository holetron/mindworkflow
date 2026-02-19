import { Router, Request, Response } from 'express';
import { createProjectNode, db } from '../db';
import { saveBase64Asset } from '../utils/storage';
import { buildPublicAssetUrl } from '../utils/assetUrls';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'routes/images' });
const router = Router();

/**
 * POST /api/images/save-crop
 * Save a cropped image from base64 data and optionally create a node
 */
router.post('/save-crop', async (req: Request, res: Response) => {
  try {
    const { 
      dataUrl, 
      parentNodeId, 
      title,
      cropSettings,
      createNode: shouldCreateNode = true,
      naturalWidth,
      naturalHeight,
      displayWidth,
      displayHeight,
      displayScale,
    } = req.body;
    const projectId = req.headers['x-project-id'] as string;

    log.info(`[save-crop] Request: parentNodeId=${parentNodeId}, projectId=${projectId}, dataUrlLength=${dataUrl?.length}`);

    if (!projectId) {
      log.warn('[save-crop] Missing x-project-id header');
      return res.status(400).json({ message: 'Missing x-project-id header' });
    }

    if (!dataUrl || typeof dataUrl !== 'string') {
      log.warn('[save-crop] Missing or invalid dataUrl');
      return res.status(400).json({ message: 'Missing or invalid dataUrl' });
    }

    if (!dataUrl.startsWith('data:image/')) {
      log.warn('[save-crop] dataUrl is not a valid image data URL');
      return res.status(400).json({ message: 'dataUrl must be a valid image data URL' });
    }

    // Save base64 image to disk
    const saveResult = await saveBase64Asset(projectId, dataUrl, {
      subdir: 'images/crops',
    });

    log.info('[save-crop] Image saved %s', saveResult.relativePath);

    // Build public URL for the saved image
    const imageUrl = buildPublicAssetUrl(projectId, saveResult.relativePath);

    log.info('[save-crop] Public URL %s', imageUrl);

    let newNode = null;

    if (shouldCreateNode) {
      // Create Image node for cropped image
      const nodePayload = {
        slug: 'image-crop',
        type: 'image',
        title: title || 'Cropped Image',
        content: '',
        content_type: 'image',
        meta: {
          image_original: imageUrl,
          original_image: imageUrl,
          image_edited: imageUrl,
          edited_image: imageUrl,
          annotated_image: imageUrl,
          image_url: imageUrl,
          asset_relative_path: saveResult.relativePath,
          view_mode: 'annotated',
          image_output_mode: 'annotated',
          natural_width: naturalWidth,
          natural_height: naturalHeight,
          display_width: displayWidth,
          display_height: displayHeight,
          display_scale: displayScale,
          image_crop_parent: parentNodeId,
          image_crop_settings: cropSettings,
          image_crop_expose_port: false,
          annotation_layers: [],
        },
      };

      const { node } = createProjectNode(projectId, nodePayload as any);
      newNode = node;
      log.info('[save-crop] Node created %s', node.node_id);
    }

    res.json({
      success: true,
      imageUrl,
      imagePath: saveResult.relativePath,
      absolutePath: saveResult.absolutePath,
      node: newNode,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error({ detail: errorMsg }, '[save-crop] error');
    log.error({ err: error }, '[save-crop] full error');
    
    res.status(500).json({
      success: false,
      message: errorMsg,
      error: errorMsg,
    });
  }
});

export default router;
