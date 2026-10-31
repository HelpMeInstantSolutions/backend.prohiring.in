const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, getTransactionConnection } = require('../config/database');

const generateToken = (user) => {
  const secret = process.env.JWT_SECRET || 'prohiring_super_secure_jwt_secret_key_2026_change_in_production';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn }
  );
};

// POST /api/v1/auth/register-teacher
const registerTeacher = async (req, res) => {
  let connection;
  try {
    const { email, password, fullName, phone, highestQualification, primarySubject } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and full name are required.'
      });
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
  registerTeacher,
  registerSchool,
  login,
  getMe
};
