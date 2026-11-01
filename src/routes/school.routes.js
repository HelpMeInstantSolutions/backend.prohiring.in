const express = require('express');
const router = express.Router();
const schoolController = require('../controllers/school.controller');
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

// Public school discovery endpoints
router.get('/search', schoolController.searchSchools);
router.get('/public/:id', optionalAuth, schoolController.getPublicSchoolProfile);
router.get('/:id/staff', schoolController.getSchoolStaff);

// All routes below require school role
router.use(authenticate, authorize('school'));

router.get('/profile', schoolController.getProfile);

router.put('/profile', schoolController.updateProfile);
router.post('/upload-logo', upload.single('logo'), schoolController.uploadLogo);
router.get('/dashboard', schoolController.getSchoolDashboard);

// Vacancies management
router.post('/jobs', schoolController.postJob);
router.get('/jobs', schoolController.getMyJobs);
router.put('/jobs/:id', schoolController.updateJob);

// Applications review & status changes
router.get('/jobs/:id/applicants', schoolController.getJobApplicants);
router.put('/applications/:applicationId/status', schoolController.updateApplicationStatus);

module.exports = router;
