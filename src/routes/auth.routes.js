const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.post('/send-registration-otp', authController.sendRegistrationOtp);
router.post('/register-teacher', authController.registerTeacher);
router.post('/register-school', authController.registerSchool);
router.post('/login', authController.login);
router.get('/me', authenticate, authController.getMe);

module.exports = router;
