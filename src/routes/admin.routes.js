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

// Teachers management (List, Add, Edit, Delete)
router.get('/teachers', adminController.getTeachers);
router.post('/teachers', adminController.createTeacher);
router.put('/teachers/:id', adminController.updateTeacher);
router.delete('/teachers/:id', adminController.deleteTeacher);

// Impersonation (Login as School / Login as Teacher without password)
router.post('/impersonate', adminController.impersonateUser);

// User status toggles (active/suspended)
router.put('/users/:id/status', adminController.toggleUserStatus);

// Job oversight & settings
router.get('/jobs/settings', adminController.getJobSettings);
router.put('/jobs/settings', adminController.updateJobSettings);
router.put('/jobs/:id/status', adminController.updateJobStatus);
router.get('/jobs', adminController.getAllJobs);
router.delete('/jobs/:id', adminController.deleteJob);

// Posts, Designations & Subjects Taxonomy Management
router.get('/taxonomy', adminController.getAdminTaxonomy);
router.post('/categories', adminController.createCategory);
router.put('/categories/:id', adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);

router.post('/designations', adminController.createDesignation);
router.put('/designations/:id', adminController.updateDesignation);
router.delete('/designations/:id', adminController.deleteDesignation);

router.post('/subjects', adminController.createSubject);
router.put('/subjects/:id', adminController.updateSubject);
router.delete('/subjects/:id', adminController.deleteSubject);

// Dynamic System Settings (Change App Name, Branding, Contact Info)
router.get('/settings', configController.getAllSettings);
router.put('/settings', configController.updateSettings);
router.post('/settings/test-mail', configController.testMail);
router.post('/settings/test-sms', configController.testSms);

// Community Posts Moderation
router.get('/posts', adminController.getCommunityPosts);
router.delete('/posts/:id', adminController.deleteCommunityPost);

// Storage & WebDAV File Manager
router.get('/storage/stats', adminController.getStorageStats);
router.get('/storage/files', adminController.getStorageFiles);
router.delete('/storage/files', adminController.deleteStorageFile);

// Admin Self-Account Password & Credential Update
router.put('/change-password', adminController.changeAdminPassword);

// Custom Pages / CMS (Page Creator)
router.get('/pages', adminController.getCustomPages);
router.get('/pages/:id', adminController.getCustomPageById);
router.post('/pages', adminController.createCustomPage);
router.put('/pages/:id', adminController.updateCustomPage);
router.delete('/pages/:id', adminController.deleteCustomPage);

// Staff Directory Disputes & Reports from Schools
router.get('/staff-disputes', adminController.getStaffDisputes);
router.delete('/staff/:id', adminController.deleteStaffRecord);
router.put('/staff/:id/resolve', adminController.resolveStaffDispute);

module.exports = router;

