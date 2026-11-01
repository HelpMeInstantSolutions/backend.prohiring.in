const express = require('express');
const router = express.Router();
const storageController = require('../controllers/storage.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { upload } = require('../middlewares/upload.middleware');

// Public file streaming endpoint with WebDAV fallback
router.get('/file/:subfolder/:filename', storageController.serveFile);

// Conditional upload middleware: use multer only for multipart/form-data
const handleUpload = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    return upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  }
  next();
};

// Authenticated upload endpoint (supports both multipart file upload and base64 JSON payload)
router.post('/upload', authenticate, handleUpload, storageController.uploadFile);

module.exports = router;
