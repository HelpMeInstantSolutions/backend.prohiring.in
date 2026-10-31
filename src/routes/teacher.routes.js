const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacher.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const { upload } = require('../middlewares/upload.middleware');

// All routes require teacher role
router.use(authenticate, authorize('teacher'));

router.get('/profile', teacherController.getProfile);
router.put('/profile', teacherController.updateProfile);
router.post('/upload-avatar', upload.single('avatar'), teacherController.uploadAvatar);
router.post('/upload-resume', upload.single('resume'), teacherController.uploadResume);
router.post('/apply', teacherController.applyToJob);
router.get('/applications', teacherController.getMyApplications);
router.post('/save-job/:jobId', teacherController.toggleSaveJob);
router.get('/saved-jobs', teacherController.getSavedJobs);
router.get('/dashboard', teacherController.getTeacherDashboard);

module.exports = router;
