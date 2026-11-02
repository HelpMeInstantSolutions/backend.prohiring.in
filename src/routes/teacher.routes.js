const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacher.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const { upload } = require('../middlewares/upload.middleware');

// Helper for optional auth
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }
  next();
};

// Public teacher profile
router.get('/public/:id', optionalAuth, teacherController.getPublicTeacherProfile);

// All routes below require teacher role
router.use(authenticate, authorize('teacher'));

router.get('/profile', teacherController.getProfile);
router.put('/profile', teacherController.updateProfile);
router.patch('/open-to-work', teacherController.toggleOpenToWork);
router.post('/upload-avatar', upload.single('avatar'), teacherController.uploadAvatar);
router.post('/upload-resume', upload.single('resume'), teacherController.uploadResume);
router.post('/apply', teacherController.applyToJob);
router.get('/applications', teacherController.getMyApplications);
router.post('/save-job/:jobId', teacherController.toggleSaveJob);
router.get('/saved-jobs', teacherController.getSavedJobs);
router.get('/dashboard', teacherController.getTeacherDashboard);
router.get('/network-jobs', teacherController.getNetworkJobs);
router.get('/qualification-suggestions', teacherController.getQualificationSuggestions);

module.exports = router;

