const webdavService = require('../services/webdav.service');
const path = require('path');
const fs = require('fs');

/**
 * Serve file with WebDAV fallback and caching headers
 * GET /api/v1/storage/file/:subfolder/:filename
 * Also used as express middleware for /uploads/:subfolder/:filename
 */
const serveFile = async (req, res) => {
  try {
    const { subfolder, filename } = req.params;
    if (!subfolder || !filename) {
      return res.status(400).send('Invalid file parameters');
    }

    // Prevent directory traversal
    const safeFilename = path.basename(filename);
    const safeSubfolder = path.basename(subfolder);

    const fileData = await webdavService.getFile(safeSubfolder, safeFilename);
    if (!fileData || !fileData.buffer) {
      return res.status(404).send('File not found');
    }

    res.setHeader('Content-Type', fileData.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Storage-Source', fileData.fromCache ? 'local-cache' : 'nextcloud-webdav');
    return res.send(fileData.buffer);
  } catch (error) {
    console.error('serveFile Error:', error);
    return res.status(500).send('Error serving file');
  }
};

/**
 * Generic upload endpoint
 * POST /api/v1/storage/upload
 */
const uploadFile = async (req, res) => {
  try {
    const subfolder = req.body.subfolder || 'posts';
    let fileBuffer;
    let filename;
    let mimeType;

    const rawBase64 = req.body?.base64 || req.body?.bufferBase64 || req.body?.image;

    if (req.file) {
      fileBuffer = req.file.buffer || fs.readFileSync(req.file.path);
      filename = req.file.filename || `${subfolder}-${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(req.file.originalname)}`;
      mimeType = req.file.mimetype;
    } else if (rawBase64 && typeof rawBase64 === 'string') {
      const commaIdx = rawBase64.indexOf(',');
      let base64Content = rawBase64;
      if (commaIdx !== -1) {
        const header = rawBase64.substring(0, commaIdx);
        const mimeMatch = header.match(/data:([^;]+)/);
        if (mimeMatch) mimeType = mimeMatch[1];
        base64Content = rawBase64.substring(commaIdx + 1);
      }
      base64Content = base64Content.replace(/\s/g, '');
      fileBuffer = Buffer.from(base64Content, 'base64');
      if (!mimeType) mimeType = req.body.mimeType || 'image/png';
      const ext = mimeType.includes('png') ? '.png' : (mimeType.includes('webp') ? '.webp' : (mimeType.includes('svg') ? '.svg' : (mimeType.includes('ico') ? '.ico' : '.jpg')));
      filename = req.body.filename || `${subfolder}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    } else {
      return res.status(400).json({
        success: false,
        message: 'No file or base64 data provided.'
      });
    }

    const relativeUrl = await webdavService.uploadFile(subfolder, filename, fileBuffer, mimeType);

    return res.status(200).json({
      success: true,
      message: 'File stored successfully on Nextcloud WebDAV.',
      data: {
        url: relativeUrl,
        filename,
        fullUrl: `https://backend.prohiring.in${relativeUrl}`
      }
    });
  } catch (error) {
    console.error('uploadFile Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload file to cloud storage.'
    });
  }
};

module.exports = {
  serveFile,
  uploadFile
};
