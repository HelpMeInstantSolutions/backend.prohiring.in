const multer = require('multer');
const path = require('path');

// Use memoryStorage to avoid EACCES permission denied errors on Linux/production disks
// Files are held in memory as buffers and uploaded directly to Nextcloud WebDAV
const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'resume') {
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, and DOCX files are allowed for resumes.'));
    }
  } else {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WEBP, and SVG image files are allowed.'));
    }
  }
};

const rawUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10) * 1024 * 1024
  },
  fileFilter
});

const populateFilename = (file) => {
  if (!file) return;
  const ext = path.extname(file.originalname || '').toLowerCase();
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  file.filename = `${file.fieldname || 'file'}-${uniqueSuffix}${ext}`;
};

// Wrapper providing single, array, and fields methods with generated filenames
const upload = {
  single: (fieldName) => (req, res, next) => {
    rawUpload.single(fieldName)(req, res, (err) => {
      if (err) return next(err);
      if (req.file) populateFilename(req.file);
      next();
    });
  },
  array: (fieldName, maxCount) => (req, res, next) => {
    rawUpload.array(fieldName, maxCount)(req, res, (err) => {
      if (err) return next(err);
      if (Array.isArray(req.files)) req.files.forEach(populateFilename);
      next();
    });
  },
  fields: (fieldsArray) => (req, res, next) => {
    rawUpload.fields(fieldsArray)(req, res, (err) => {
      if (err) return next(err);
      if (req.files) {
        Object.values(req.files).forEach((fileArr) => {
          if (Array.isArray(fileArr)) fileArr.forEach(populateFilename);
        });
      }
      next();
    });
  }
};

module.exports = { upload };

