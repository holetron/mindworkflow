import { Router } from 'express';
import { videosController } from '../controllers/videosController';

const router = Router();

// POST /api/videos/:videoNodeId/extract-frame
router.post('/:videoNodeId/extract-frame', videosController.extractFrame);

// POST /api/videos/:videoNodeId/crop
router.post('/:videoNodeId/crop', videosController.crop);

// POST /api/videos/:videoNodeId/trim
router.post('/:videoNodeId/trim', videosController.trim);

// POST /api/videos/:videoNodeId/upload
router.post('/:videoNodeId/upload', videosController.upload);

export default router;
