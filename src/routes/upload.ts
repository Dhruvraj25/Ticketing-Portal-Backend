import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export const uploadRouter = Router()

// ─── Multer Configuration ───────────────────────────────────────────────
const storage = multer.memoryStorage()

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
])

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`File type "${file.mimetype}" is not allowed`))
    }
  },
})

// ─── Upload Route ───────────────────────────────────────────────────────
uploadRouter.post(
  '/',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    console.log('[upload] Incoming request:', {
      method: req.method,
      path: req.path,
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length'],
      host: req.headers['host'],
      origin: req.headers['origin'],
      cookie: req.headers['cookie'] ? 'present' : 'absent',
      hasAuth: !!(req as AuthenticatedRequest).user,
    })

    upload.single('file')(req, res, (err) => {
      if (err) {
        // Multer errors (size limits, file type, etc.)
        if (err instanceof multer.MulterError) {
          console.error('[upload] Multer error:', {
            code: err.code,
            field: err.field,
            message: err.message,
          })
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 10 MB.' })
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ error: `Unexpected field: "${err.field}"` })
          }
          return res.status(400).json({ error: err.message })
        }
        // Custom file filter errors
        console.error('[upload] File filter error:', err.message)
        return res.status(400).json({ error: err.message })
      }

      next()
    })
  },
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log('[upload] Processing upload:', {
        hasFile: !!req.file,
        fileField: req.file?.fieldname,
        fileName: req.file?.originalname,
        fileSize: req.file?.size,
        mimeType: req.file?.mimetype,
      })

      if (!req.file) {
        console.error('[upload] No file received. Body keys:', Object.keys(req.body || {}))
        return res.status(400).json({ error: 'No file provided. Expected multipart/form-data with field "file".' })
      }

      const file = req.file

      // Upload to Cloudinary using buffer stream
      const result = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'supporthub/attachments',
            resource_type: 'auto',
            use_filename: true,
            unique_filename: true,
          },
          (error, result) => {
            if (error) {
              console.error('[upload] Cloudinary upload error:', {
                message: error.message,
                httpCode: (error as any).http_code,
                name: error.name,
              })
              reject(error)
            } else if (!result) {
              reject(new Error('Cloudinary returned no result'))
            } else {
              resolve(result)
            }
          }
        )
        uploadStream.end(file.buffer)
      })

      console.log('[upload] Cloudinary upload successful:', {
        publicId: result.public_id,
        format: result.format,
        bytes: result.bytes,
        url: result.secure_url?.slice(0, 80) + '...',
      })

      return res.json({
        url: result.secure_url,
        publicId: result.public_id,
        filename: file.originalname,
        mimeType: file.mimetype || result.format,
        sizeBytes: result.bytes,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      console.error('[upload] Upload failed:', {
        error: errorMessage,
        stack,
        user: req.user?.id,
        userRole: req.user?.role,
      })
      return res.status(500).json({ error: errorMessage || 'Upload failed' })
    }
  }
)

// ─── Error handler for multer errors propagated from middleware ─────────
uploadRouter.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[upload] Unhandled upload error:', {
    message: err.message,
    stack: err.stack,
  })
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10 MB.' })
    }
    return res.status(400).json({ error: err.message })
  }
  if (err.message?.includes('not allowed')) {
    return res.status(400).json({ error: err.message })
  }
  return res.status(500).json({ error: err.message || 'Upload failed' })
})
