const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, getTransactionConnection } = require('../config/database');
const { dispatchSms, dispatchEmail, sanitizePhone } = require('../services/otp.service');

const generateToken = (user) => {
  const secret = process.env.JWT_SECRET || 'prohiring_super_secure_jwt_secret_key_2026_change_in_production';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn }
  );
};

// POST /api/v1/auth/send-registration-otp
const sendRegistrationOtp = async (req, res) => {
  try {
    const { email, phone, fullName } = req.body;

    if (!email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Both email address and mobile number are required.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = sanitizePhone(phone);

    if (cleanPhone.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number.'
      });
    }

    // Check existing email
    const existingEmail = await query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existingEmail.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.'
      });
    }

    // Generate 6-digit OTPs
    const phoneOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const emailOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in otps table
    await query(
      `INSERT INTO otps (email, phone, email_otp, phone_otp, type, expires_at)
       VALUES (?, ?, ?, ?, 'registration', DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [cleanEmail, cleanPhone, emailOtp, phoneOtp]
    );

    // Send SMS / WhatsApp OTP
    const smsResult = await dispatchSms(cleanPhone, phoneOtp);

    // Send Email OTP
    const emailResult = await dispatchEmail(cleanEmail, emailOtp);

    return res.status(200).json({
      success: true,
      message: 'Verification codes sent to your Phone/WhatsApp and Email address.',
      data: {
        smsProvider: smsResult.provider,
        emailProvider: emailResult.provider,
        simulated: (smsResult.simulated || emailResult.simulated) ? true : false,
        debugOtp: (smsResult.simulated || emailResult.simulated) ? { phoneOtp, emailOtp } : undefined
      }
    });
  } catch (error) {
    console.error('sendRegistrationOtp Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send verification codes: ' + error.message
    });
  }
};

// POST /api/v1/auth/register-teacher
const registerTeacher = async (req, res) => {
  let connection;
  try {
    const { email, password, confirmPassword, fullName, phone, highestQualification, primarySubject, emailOtp, phoneOtp } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and full name are required.'
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Set Password and Confirm Password do not match.'
      });
    }

    // Check if OTP verification is required in system_settings
    const otpSettings = await query("SELECT setting_value FROM system_settings WHERE setting_key = 'require_otp_verification' LIMIT 1");
    const isOtpRequired = !otpSettings.length || otpSettings[0].setting_value === 'true';

    if (isOtpRequired) {
      if (!emailOtp && !phoneOtp) {
        return res.status(400).json({
          success: false,
          message: 'Verification code is required. Please verify your phone and email.'
        });
      }

      // Verify OTP from otps table
      const otpRecords = await query(
        `SELECT * FROM otps 
         WHERE email = ? AND is_verified = 0 AND expires_at > NOW() 
         ORDER BY id DESC LIMIT 1`,
        [email.toLowerCase().trim()]
      );

      if (otpRecords.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Verification code has expired or was not requested. Please request a new OTP.'
        });
      }

      const activeOtp = otpRecords[0];

      // Verify email OTP if provided
      if (emailOtp && String(emailOtp).trim() !== activeOtp.email_otp) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Email verification code.'
        });
      }

      // Verify phone OTP if provided
      if (phoneOtp && String(phoneOtp).trim() !== activeOtp.phone_otp) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Phone verification code.'
        });
      }

      // Mark OTP verified
      await query('UPDATE otps SET is_verified = 1 WHERE id = ?', [activeOtp.id]);
    }

    // Check existing email
    const existing = await query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    connection = await getTransactionConnection();

    const [userResult] = await connection.execute(
      'INSERT INTO users (email, password, role, status) VALUES (?, ?, ?, ?)',
      [email.toLowerCase().trim(), hashedPassword, 'teacher', 'active']
    );

    const userId = userResult.insertId;

    await connection.execute(
      `INSERT INTO teacher_profiles 
       (user_id, full_name, phone, highest_qualification, primary_subject)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, fullName.trim(), phone || null, highestQualification || null, primarySubject || null]
    );

    await connection.commit();

    const token = generateToken({ id: userId, email: email.toLowerCase().trim(), role: 'teacher' });

    return res.status(201).json({
      success: true,
      message: 'Teacher account registered successfully.',
      data: {
        token,
        user: {
          id: userId,
          email: email.toLowerCase().trim(),
          role: 'teacher',
          fullName
        }
      }
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('registerTeacher Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed due to a server error.'
    });
  } finally {
    if (connection) connection.release();
  }
};

// POST /api/v1/auth/register-school
const registerSchool = async (req, res) => {
  let connection;
  try {
    const { email, password, schoolName, contactPerson, phone, city, state, board } = req.body;

    if (!email || !password || !schoolName) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and school name are required.'
      });
    }

    const existing = await query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    connection = await getTransactionConnection();

    const [userResult] = await connection.execute(
      'INSERT INTO users (email, password, role, status) VALUES (?, ?, ?, ?)',
      [email.toLowerCase().trim(), hashedPassword, 'school', 'active']
    );

    const userId = userResult.insertId;

    await connection.execute(
      `INSERT INTO school_profiles 
       (user_id, school_name, contact_person, phone, city, state, board, verification_status, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        schoolName.trim(),
        contactPerson || null,
        phone || null,
        city || null,
        state || null,
        board || 'CBSE',
        'pending',
        0
      ]
    );

    await connection.commit();

    const token = generateToken({ id: userId, email: email.toLowerCase().trim(), role: 'school' });

    return res.status(201).json({
      success: true,
      message: 'School account registered successfully. Verification is pending.',
      data: {
        token,
        user: {
          id: userId,
          email: email.toLowerCase().trim(),
          role: 'school',
          schoolName,
          isVerified: false
        }
      }
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('registerSchool Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed due to a server error.'
    });
  } finally {
    if (connection) connection.release();
  }
};

// POST /api/v1/auth/login
const login = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    let sql = 'SELECT * FROM users WHERE email = ?';
    const params = [email.toLowerCase().trim()];

    if (role) {
      sql += ' AND role = ?';
      params.push(role);
    }

    const users = await query(sql, params);
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const user = users[0];

    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Your account is suspended. Please contact platform support.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const token = generateToken(user);

    // Fetch related profile details
    let profileData = null;
    if (user.role === 'teacher') {
      const teachers = await query('SELECT * FROM teacher_profiles WHERE user_id = ?', [user.id]);
      if (teachers.length > 0) profileData = teachers[0];
    } else if (user.role === 'school') {
      const schools = await query('SELECT * FROM school_profiles WHERE user_id = ?', [user.id]);
      if (schools.length > 0) profileData = schools[0];
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status
        },
        profile: profileData
      }
    });
  } catch (error) {
    console.error('login Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed due to a server error.'
    });
  }
};

// GET /api/v1/auth/me
const getMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let profile = null;
    if (userRole === 'teacher') {
      const result = await query('SELECT * FROM teacher_profiles WHERE user_id = ?', [userId]);
      if (result.length > 0) profile = result[0];
    } else if (userRole === 'school') {
      const result = await query('SELECT * FROM school_profiles WHERE user_id = ?', [userId]);
      if (result.length > 0) profile = result[0];
    }

    return res.status(200).json({
      success: true,
      data: {
        user: req.user,
        profile
      }
    });
  } catch (error) {
    console.error('getMe Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user session.'
    });
  }
};

module.exports = {
  sendRegistrationOtp,
  registerTeacher,
  registerSchool,
  login,
  getMe
};
