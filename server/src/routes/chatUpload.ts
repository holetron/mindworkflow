import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'routes/chatUpload' });
const router = Router();

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { chatId } = req.params;
    const uploadDir = path.join(process.cwd(), 'uploads', 'chat', chatId);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp_nanoid_original
    const uniqueId = nanoid(8);
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);
    const safeFilename = `${timestamp}_${uniqueId}_${nameWithoutExt}${ext}`;
    cb(null, safeFilename);
  }
});

// File filter
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allow images, documents, archives
  const allowedMimes = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Documents
    'application/pdf', 'text/plain', 'text/markdown',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Archives
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    // Code
    'text/html', 'text/css', 'text/javascript', 'application/json',
    'application/xml', 'text/xml',
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
};

// Multer config
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  }
});

// POST /api/chats/:chatId/upload - Upload files for chat
router.post('/chats/:chatId/upload', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    // Generate file info for each uploaded file
    const fileInfos = files.map(file => {
      const fileHash = crypto.createHash('md5').update(fs.readFileSync(file.path)).digest('hex');
      
      return {
        id: nanoid(),
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: `/uploads/chat/${chatId}/${file.filename}`,
        url: `/api/uploads/chat/${chatId}/${file.filename}`,
        hash: fileHash,
        uploadedAt: Date.now(),
      };
    });
    
    log.info(`[CHAT_UPLOAD] Uploaded ${files.length} files for chat ${chatId}`);
    
    res.json({
      success: true,
      files: fileInfos,
    });
  } catch (error) {
    log.error({ err: error }, '[CHAT_UPLOAD] Upload error');
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    });
  }
});

// GET /api/uploads/chat/:chatId/:filename - Serve uploaded files
router.get('/uploads/chat/:chatId/:filename', (req: Request, res: Response) => {
  try {
    const { chatId, filename } = req.params;
    const filePath = path.join(process.cwd(), 'uploads', 'chat', chatId, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.sendFile(filePath);
  } catch (error) {
    log.error({ err: error }, '[CHAT_UPLOAD] File serve error');
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

export default router;
