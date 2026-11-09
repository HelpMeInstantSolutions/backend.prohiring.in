const express = require('express');
const router = express.Router();
const schoolController = require('../controllers/school.controller');
const { authenticate, authenticateOptional } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const { upload } = require('../middlewares/upload.middleware');

// Public route for public school directory profile & search
router.get('/public/:id', schoolController.getPublicSchoolProfile);
router.get('/search', schoolController.searchSchools);

// AI Flyer Extraction: Accessible with optional auth so schools & visitors can preview extracted vacancies seamlessly
router.post('/jobs/extract-from-flyer', authenticateOptional, upload.single('flyer'), schoolController.extractJobsFromFlyer);

// All routes below require authenticated school role
router.use(authenticate, authorize('school'));

// Dashboard metrics
router.get('/dashboard', schoolController.getSchoolDashboard);

// Profile
router.get('/profile', schoolController.getProfile);
router.put('/profile', schoolController.updateProfile);
router.post('/upload-logo', upload.single('logo'), schoolController.uploadLogo);
router.post('/upload-banner', upload.single('banner'), schoolController.uploadBanner);
router.post('/upload-campus-photo', upload.single('photo'), schoolController.uploadCampusPhoto);
router.post('/campus-photos/link', schoolController.addCampusPhotoLink);
router.delete('/campus-photos', schoolController.deleteCampusPhoto);

// Staff directory management & dispute
router.get('/staff', schoolController.getMyStaff);
router.post('/staff/:id/dispute', schoolController.disputeStaff);

// Student Admission & Job Inquiries from landing pages
router.get('/inquiries', schoolController.getSchoolInquiries);
router.put('/inquiries/:id/status', schoolController.updateInquiryStatus);

// Vacancies management
router.post('/jobs', schoolController.postJob);
router.get('/jobs', schoolController.getMyJobs);
router.put('/jobs/:id', schoolController.updateJob);
router.post('/upload-job-poster', upload.single('poster'), schoolController.uploadJobPoster);

// Applications review & status changes
router.get('/jobs/:id/applicants', schoolController.getJobApplicants);
router.put('/applications/:applicationId/status', schoolController.updateApplicationStatus);

module.exports = router;
