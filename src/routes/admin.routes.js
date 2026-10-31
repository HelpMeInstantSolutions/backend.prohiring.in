const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const configController = require('../controllers/config.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');

// All routes require admin role
router.use(authenticate, authorize('admin'));

// Platform metrics
router.get('/dashboard-stats', adminController.getDashboardStats);

// School management (List, Add, Edit, Delete, Verify)
router.get('/schools', adminController.getSchools);
router.post('/schools', adminController.createSchool);
router.put('/schools/:id', adminController.updateSchool);
router.delete('/schools/:id', adminController.deleteSchool);
router.put('/schools/:id/verification', adminController.updateSchoolVerification);

// Teachers management (List, Edit, Delete)
router.get('/teachers', adminController.getTeachers);
router.put('/teachers/:id', adminController.updateTeacher);
router.delete('/teachers/:id', adminController.deleteTeacher);

// Impersonation (Login as School / Login as Teacher without password)
router.post('/impersonate', adminController.impersonateUser);

// User status toggles (active/suspended)
router.put('/users/:id/status', adminController.toggleUserStatus);

// Job oversight
router.get('/jobs', adminController.getAllJobs);
router.delete('/jobs/:id', adminController.deleteJob);

// Dynamic System Settings (Change App Name, Branding, Contact Info)
router.get('/settings', configController.getAllSettings);
router.put('/settings', configController.updateSettings);
router.post('/settings/test-mail', configController.testMail);
router.post('/settings/test-sms', configController.testSms);

module.exports = router;
