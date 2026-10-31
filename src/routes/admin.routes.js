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

// School approvals & verification
router.get('/schools', adminController.getSchools);
router.put('/schools/:id/verification', adminController.updateSchoolVerification);

// Teachers management
router.get('/teachers', adminController.getTeachers);

// User status toggles (active/suspended)
router.put('/users/:id/status', adminController.toggleUserStatus);

// Job oversight
router.get('/jobs', adminController.getAllJobs);
router.delete('/jobs/:id', adminController.deleteJob);

// Dynamic System Settings (Change App Name, Branding, Contact Info)
router.get('/settings', configController.getAllSettings);
router.put('/settings', configController.updateSettings);

module.exports = router;
