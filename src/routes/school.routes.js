const express = require('express');
const router = express.Router();
const schoolController = require('../controllers/school.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const { upload } = require('../middlewares/upload.middleware');

// All routes require school role
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
