const express = require('express');
const router = express.Router();
const storageController = require('../controllers/storage.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { upload } = require('../middlewares/upload.middleware');

// Public file streaming endpoint with WebDAV fallback
router.get('/file/:subfolder/:filename', storageController.serveFile);

// Authenticated upload endpoint
router.post('/upload', authenticate, upload.single('file'), storageController.uploadFile);

module.exports = router;
