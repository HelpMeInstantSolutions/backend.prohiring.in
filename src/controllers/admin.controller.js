const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const webdavService = require('../services/webdav.service');
const { sendAccountCredentialsEmail } = require('../services/otp.service');
const { expireOldJobs } = require('../services/jobExpiry.service');

const generateToken = (user) => {
  const secret = process.env.JWT_SECRET || 'prohiring_super_secure_jwt_secret_key_2026_change_in_production';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn }
  );
};

function formatIndianPhone(phone) {
  if (!phone) return null;
  const cleaned = String(phone).replace(/[^\d]/g, '');
  if (cleaned.length === 10) return `+91 ${cleaned}`;
  if (cleaned.length === 12 && cleaned.startsWith('91')) return `+91 ${cleaned.slice(2)}`;
  if (String(phone).startsWith('+')) return String(phone).trim();
  return cleaned ? `+${cleaned}` : null;
}

// GET /api/v1/admin/dashboard-stats
const getDashboardStats = async (req, res) => {
  try {
    const [userCounts] = await query(`
      SELECT 
        COUNT(CASE WHEN role = 'teacher' THEN 1 END) as total_teachers,
        COUNT(CASE WHEN role = 'school' THEN 1 END) as total_schools,
        COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_users
      FROM users
    `);

    const [schoolCounts] = await query(`
      SELECT 
        COUNT(CASE WHEN verification_status = 'pending' THEN 1 END) as pending_verifications,
        COUNT(CASE WHEN is_verified = 1 THEN 1 END) as verified_schools
      FROM school_profiles
    `);

    const [jobCounts] = await query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_jobs
      FROM jobs
    `);

    const [appCounts] = await query(`
      SELECT 
        COUNT(*) as total_applications,
        COUNT(CASE WHEN status = 'hired' THEN 1 END) as successful_hires
      FROM job_applications
    `);

    // Recent schools awaiting verification
    const pendingSchools = await query(`
      SELECT s.id, s.school_name, s.city, s.state, s.board, s.created_at, u.email
      FROM school_profiles s
      JOIN users u ON s.user_id = u.id
      WHERE s.verification_status = 'pending'
      ORDER BY s.created_at DESC
      LIMIT 5
    `);

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalTeachers: userCounts.total_teachers || 0,
          totalSchools: userCounts.total_schools || 0,
          pendingVerifications: schoolCounts.pending_verifications || 0,
          verifiedSchools: schoolCounts.verified_schools || 0,
          totalJobs: jobCounts.total_jobs || 0,
          activeJobs: jobCounts.active_jobs || 0,
          totalApplications: appCounts.total_applications || 0,
          successfulHires: appCounts.successful_hires || 0,
          suspendedUsers: userCounts.suspended_users || 0
        },
        pendingSchools
      }
    });
  } catch (error) {
    console.error('getDashboardStats Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin dashboard metrics.'
    });
  }
};

// GET /api/v1/admin/schools
const getSchools = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 15 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const conditions = ['1=1'];
    const params = [];

    if (status) {
      conditions.push('s.verification_status = ?');
      params.push(status);
    }

    if (search) {
      conditions.push('(s.school_name LIKE ? OR s.city LIKE ? OR u.email LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await query(
      `SELECT COUNT(*) as total FROM school_profiles s JOIN users u ON s.user_id = u.id WHERE ${whereClause}`,
      params
    );
    const total = countRes[0].total;

    const dataSql = `
      SELECT 
        s.*, u.email, u.status as account_status,
        COUNT(j.id) as total_jobs_posted
      FROM school_profiles s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN jobs j ON s.id = j.school_id
      WHERE ${whereClause}
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const schools = await query(dataSql, [...params, parseInt(limit, 10), parseInt(offset, 10)]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)),
        schools
      }
    });
  } catch (error) {
    console.error('getSchools Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve schools list.'
    });
  }
};

// PUT /api/v1/admin/schools/:id/verification
const updateSchoolVerification = async (req, res) => {
  try {
    const schoolId = req.params.id;
    const { verificationStatus } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected', 'pending'].includes(verificationStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification status.'
      });
    }

    const isVerified = verificationStatus === 'approved' ? 1 : 0;

    await query(
      'UPDATE school_profiles SET verification_status = ?, is_verified = ? WHERE id = ?',
      [verificationStatus, isVerified, schoolId]
    );

    return res.status(200).json({
      success: true,
      message: `School has been marked as ${verificationStatus}.`
    });
  } catch (error) {
    console.error('updateSchoolVerification Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update school verification status.'
    });
  }
};

// GET /api/v1/admin/teachers
const getTeachers = async (req, res) => {
  try {
    const { search, subject, page = 1, limit = 15 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const conditions = ['1=1'];
    const params = [];

    if (search) {
      conditions.push('(t.full_name LIKE ? OR t.current_city LIKE ? OR u.email LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (subject) {
      conditions.push('t.primary_subject = ?');
      params.push(subject);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await query(
      `SELECT COUNT(*) as total FROM teacher_profiles t JOIN users u ON t.user_id = u.id WHERE ${whereClause}`,
      params
    );
    const total = countRes[0].total;

    const dataSql = `
      SELECT 
        t.*, u.email, u.status as account_status,
        COUNT(a.id) as total_applications
      FROM teacher_profiles t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN job_applications a ON t.id = a.teacher_id
      WHERE ${whereClause}
      GROUP BY t.id
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const teachers = await query(dataSql, [...params, parseInt(limit, 10), parseInt(offset, 10)]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)),
        teachers
      }
    });
  } catch (error) {
    console.error('getTeachers Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve teachers list.'
    });
  }
};

// PUT /api/v1/admin/users/:id/status
const toggleUserStatus = async (req, res) => {
  try {
    const userId = req.params.id;
    const { status } = req.body; // 'active', 'suspended', 'inactive'

    if (!['active', 'suspended', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user status.'
      });
    }

    await query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);

    return res.status(200).json({
      success: true,
      message: `User status updated to ${status}.`
    });
  } catch (error) {
    console.error('toggleUserStatus Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user status.'
    });
  }
};

// GET /api/v1/admin/jobs
const getAllJobs = async (req, res) => {
  try {
    // Run auto-expiration check to keep vacancy states accurate
    await expireOldJobs();

    const { search, status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const conditions = ['1=1'];
    const params = [];

    if (status) {
      conditions.push('j.status = ?');
      params.push(status);
    }

    if (search) {
      conditions.push('(j.title LIKE ? OR s.school_name LIKE ? OR j.city LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await query(
      `SELECT COUNT(*) as total FROM jobs j JOIN school_profiles s ON j.school_id = s.id WHERE ${whereClause}`,
      params
    );
    const total = countRes[0].total;

    const sql = `
      SELECT 
        j.*, s.school_name, s.city as school_city,
        COUNT(a.id) as applications_count
      FROM jobs j
      JOIN school_profiles s ON j.school_id = s.id
      LEFT JOIN job_applications a ON j.id = a.job_id
      WHERE ${whereClause}
      GROUP BY j.id
      ORDER BY j.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const jobs = await query(sql, [...params, parseInt(limit, 10), parseInt(offset, 10)]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)),
        jobs
      }
    });
  } catch (error) {
    console.error('getAllJobs Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve jobs.'
    });
  }
};

// DELETE /api/v1/admin/jobs/:id
const deleteJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    await query('DELETE FROM jobs WHERE id = ?', [jobId]);

    return res.status(200).json({
      success: true,
      message: 'Job vacancy removed successfully by admin.'
    });
  } catch (error) {
    console.error('deleteJob Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete job.'
    });
  }
};

// GET /api/v1/admin/jobs/settings - Retrieve vacancy auto-expiration settings
const getJobSettings = async (req, res) => {
  try {
    const rows = await query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'job_auto_expire_days' LIMIT 1"
    );
    const autoExpireDays = rows.length > 0 ? (parseInt(rows[0].setting_value, 10) || 15) : 15;
    return res.status(200).json({
      success: true,
      data: {
        autoExpireDays
      }
    });
  } catch (error) {
    console.error('getJobSettings Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve job settings.'
    });
  }
};

// PUT /api/v1/admin/jobs/settings - Update vacancy auto-expiration duration
const updateJobSettings = async (req, res) => {
  try {
    const { autoExpireDays } = req.body;
    const days = parseInt(autoExpireDays, 10);
    if (isNaN(days) || days < 1) {
      return res.status(400).json({
        success: false,
        message: 'Auto-expiration period must be a valid number of days (at least 1).'
      });
    }

    await query(
      `INSERT INTO system_settings (setting_key, setting_value, category, description, is_public)
       VALUES ('job_auto_expire_days', ?, 'recruitment', 'Number of days after which an active job posting automatically closes', 0)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [String(days)]
    );

    // Apply policy immediately
    const affected = await expireOldJobs();

    return res.status(200).json({
      success: true,
      message: `Job auto-closure period successfully set to ${days} days.${affected > 0 ? ` ${affected} overdue vacancies were closed.` : ''}`,
      data: {
        autoExpireDays: days
      }
    });
  } catch (error) {
    console.error('updateJobSettings Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update job settings.'
    });
  }
};

// PUT /api/v1/admin/jobs/:id/status - Admin toggles vacancy status (active, closed, draft)
const updateJobStatus = async (req, res) => {
  try {
    const jobId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['active', 'closed', 'draft'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Status must be "active", "closed", or "draft".'
      });
    }

    // If reopening / reactivating an expired job, reset created_at so it receives a fresh lifecycle
    if (status === 'active') {
      await query(
        'UPDATE jobs SET status = ?, created_at = NOW() WHERE id = ?',
        [status, jobId]
      );
    } else {
      await query(
        'UPDATE jobs SET status = ? WHERE id = ?',
        [status, jobId]
      );
    }

    return res.status(200).json({
      success: true,
      message: `Job vacancy status successfully changed to ${status}.`
    });
  } catch (error) {
    console.error('updateJobStatus Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update job status.'
    });
  }
};

// POST /api/v1/admin/schools - Admin manually creates a school
const createSchool = async (req, res) => {
  try {
    const {
      schoolName,
      email,
      password,
      phone,
      contactPerson,
      city,
      state,
      board,
      address,
      website,
      registrationNumber,
      verificationStatus = 'approved'
    } = req.body;

    if (!schoolName || !email) {
      return res.status(400).json({
        success: false,
        message: 'School Name and Email Address are required.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check duplicate email
    const existing = await query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.'
      });
    }

    const pwd = password && password.trim() ? password.trim() : 'School@123456';
    const hashedPassword = await bcrypt.hash(pwd, 10);

    const userRes = await query(
      'INSERT INTO users (email, password, role, status) VALUES (?, ?, ?, ?)',
      [cleanEmail, hashedPassword, 'school', 'active']
    );
    const userId = userRes.insertId;

    const isVerified = verificationStatus === 'approved' ? 1 : 0;
    const formattedPhone = formatIndianPhone(phone);

    // Auto-generate unique school slug
    const baseSlug = (schoolName.trim() || 'school')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'school';
    let finalSlug = baseSlug;
    const existingSlugs = await query('SELECT id FROM school_profiles WHERE slug = ?', [finalSlug]);
    if (existingSlugs.length > 0) {
      finalSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
    }

    const schoolRes = await query(
      `INSERT INTO school_profiles 
       (user_id, school_name, contact_person, phone, city, state, board, address, website, registration_number, verification_status, is_verified, slug)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        schoolName.trim(),
        contactPerson ? contactPerson.trim() : null,
        formattedPhone,
        city ? city.trim() : null,
        state ? state.trim() : null,
        board ? board.trim() : 'CBSE',
        address ? address.trim() : null,
        website ? website.trim() : null,
        registrationNumber ? registrationNumber.trim() : null,
        verificationStatus,
        isVerified,
        finalSlug
      ]
    );

    // Send credentials email in background
    sendAccountCredentialsEmail({
      toEmail: cleanEmail,
      name: schoolName.trim(),
      role: 'school',
      phone: formattedPhone,
      password: pwd
    }).catch((err) => console.warn('Credentials email error for school:', err.message));

    return res.status(201).json({
      success: true,
      message: 'School created successfully and credentials dispatched via email.',
      data: {
        id: schoolRes.insertId,
        userId,
        schoolName,
        email: cleanEmail,
        slug: finalSlug,
        verificationStatus
      }
    });
  } catch (error) {
    console.error('createSchool Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create school: ' + error.message
    });
  }
};

// PUT /api/v1/admin/schools/:id - Admin updates school details
const updateSchool = async (req, res) => {
  try {
    const schoolId = req.params.id;
    const {
      schoolName,
      contactPerson,
      phone,
      city,
      state,
      board,
      address,
      website,
      registrationNumber,
      about,
      verificationStatus,
      accountStatus,
      newPassword
    } = req.body;

    const schools = await query('SELECT * FROM school_profiles WHERE id = ?', [schoolId]);
    if (!schools.length) {
      return res.status(404).json({
        success: false,
        message: 'School not found.'
      });
    }
    const school = schools[0];

    const isVerified = verificationStatus === 'approved'
      ? 1
      : verificationStatus === 'rejected'
      ? 0
      : school.is_verified;

    const formattedPhone = phone !== undefined ? formatIndianPhone(phone) : school.phone;

    await query(
      `UPDATE school_profiles SET
        school_name = COALESCE(?, school_name),
        contact_person = COALESCE(?, contact_person),
        phone = COALESCE(?, phone),
        city = COALESCE(?, city),
        state = COALESCE(?, state),
        board = COALESCE(?, board),
        address = COALESCE(?, address),
        website = COALESCE(?, website),
        registration_number = COALESCE(?, registration_number),
        about = COALESCE(?, about),
        verification_status = COALESCE(?, verification_status),
        is_verified = ?
      WHERE id = ?`,
      [
        schoolName !== undefined ? schoolName.trim() : null,
        contactPerson !== undefined ? contactPerson : null,
        formattedPhone,
        city !== undefined ? city : null,
        state !== undefined ? state : null,
        board !== undefined ? board : null,
        address !== undefined ? address : null,
        website !== undefined ? website : null,
        registrationNumber !== undefined ? registrationNumber : null,
        about !== undefined ? about : null,
        verificationStatus || null,
        isVerified,
        schoolId
      ]
    );

    // Update account status if specified
    if (accountStatus && ['active', 'suspended', 'inactive'].includes(accountStatus)) {
      await query('UPDATE users SET status = ? WHERE id = ?', [accountStatus, school.user_id]);
    }

    // Reset password if specified
    if (newPassword && newPassword.trim()) {
      const hashed = await bcrypt.hash(newPassword.trim(), 10);
      await query('UPDATE users SET password = ? WHERE id = ?', [hashed, school.user_id]);
    }

    return res.status(200).json({
      success: true,
      message: 'School details updated successfully.'
    });
  } catch (error) {
    console.error('updateSchool Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update school: ' + error.message
    });
  }
};

// DELETE /api/v1/admin/schools/:id - Admin deletes school
const deleteSchool = async (req, res) => {
  try {
    const schoolId = req.params.id;
    const schools = await query('SELECT user_id, school_name FROM school_profiles WHERE id = ?', [schoolId]);
    if (!schools.length) {
      return res.status(404).json({
        success: false,
        message: 'School not found.'
      });
    }

    const { user_id, school_name } = schools[0];

    // Explicit cleanup
    await query('DELETE FROM jobs WHERE school_id = ?', [schoolId]);
    await query('DELETE FROM school_profiles WHERE id = ?', [schoolId]);
    await query('DELETE FROM users WHERE id = ?', [user_id]);

    return res.status(200).json({
      success: true,
      message: `School "${school_name}" and its associated records have been deleted.`
    });
  } catch (error) {
    console.error('deleteSchool Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete school: ' + error.message
    });
  }
};

// POST /api/v1/admin/impersonate - Admin login as school or teacher
const impersonateUser = async (req, res) => {
  try {
    const { schoolId, teacherId, userId } = req.body;
    let targetUserId = userId;

    if (schoolId) {
      const s = await query('SELECT user_id FROM school_profiles WHERE id = ?', [schoolId]);
      if (s.length) targetUserId = s[0].user_id;
    } else if (teacherId) {
      const t = await query('SELECT user_id FROM teacher_profiles WHERE id = ?', [teacherId]);
      if (t.length) targetUserId = t[0].user_id;
    }

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Valid School, Teacher, or User identifier is required.'
      });
    }

    const users = await query('SELECT id, email, role, status FROM users WHERE id = ?', [targetUserId]);
    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.'
      });
    }

    const targetUser = users[0];
    const token = generateToken(targetUser);
    const redirectUrl = targetUser.role === 'school' ? '/school/dashboard' : '/teacher/dashboard';

    let displayName = targetUser.email;
    if (targetUser.role === 'school') {
      const s = await query('SELECT school_name FROM school_profiles WHERE user_id = ?', [targetUser.id]);
      if (s.length) displayName = s[0].school_name;
    } else if (targetUser.role === 'teacher') {
      const t = await query('SELECT full_name FROM teacher_profiles WHERE user_id = ?', [targetUser.id]);
      if (t.length) displayName = t[0].full_name;
    }

    return res.status(200).json({
      success: true,
      message: `Impersonation session ready for ${displayName}.`,
      data: {
        token,
        redirectUrl,
        user: {
          id: targetUser.id,
          email: targetUser.email,
          role: targetUser.role,
          name: displayName
        }
      }
    });
  } catch (error) {
    console.error('impersonateUser Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate impersonation token: ' + error.message
    });
  }
};

// POST /api/v1/admin/teachers - Admin manually creates a teacher
const createTeacher = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      phone,
      designation,
      primarySubject,
      experienceYears = 0,
      highestQualification,
      currentCity,
      currentState,
      accountStatus = 'active'
    } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({
        success: false,
        message: 'Teacher Full Name and Email Address are required.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check duplicate email
    const existing = await query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.'
      });
    }

    const pwd = password && password.trim() ? password.trim() : 'Teacher@123456';
    const hashedPassword = await bcrypt.hash(pwd, 10);

    const userRes = await query(
      'INSERT INTO users (email, password, role, status) VALUES (?, ?, ?, ?)',
      [cleanEmail, hashedPassword, 'teacher', accountStatus]
    );
    const userId = userRes.insertId;

    const formattedPhone = formatIndianPhone(phone);

    const teacherRes = await query(
      `INSERT INTO teacher_profiles 
       (user_id, full_name, phone, designation, primary_subject, highest_qualification, experience_years, current_city, current_state, profile_step)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        userId,
        fullName.trim(),
        formattedPhone,
        designation ? designation.trim() : 'TGT (Trained Graduate Teacher - Classes VI-X)',
        primarySubject ? primarySubject.trim() : null,
        highestQualification ? highestQualification.trim() : 'B.Ed',
        parseInt(experienceYears, 10) || 0,
        currentCity ? currentCity.trim() : null,
        currentState ? currentState.trim() : null
      ]
    );

    // Send credentials email in background
    sendAccountCredentialsEmail({
      toEmail: cleanEmail,
      name: fullName.trim(),
      role: 'teacher',
      phone: formattedPhone,
      password: pwd
    }).catch((err) => console.warn('Credentials email error for teacher:', err.message));

    return res.status(201).json({
      success: true,
      message: 'Teacher account created successfully and credentials dispatched via email.',
      data: {
        id: teacherRes.insertId,
        userId,
        fullName: fullName.trim(),
        email: cleanEmail
      }
    });
  } catch (error) {
    console.error('createTeacher Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create teacher account: ' + error.message
    });
  }
};

// PUT /api/v1/admin/teachers/:id - Admin updates teacher details
const updateTeacher = async (req, res) => {
  try {
    const teacherId = req.params.id;
    const {
      fullName,
      phone,
      primarySubject,
      highestQualification,
      experienceYears,
      currentCity,
      currentState,
      accountStatus,
      newPassword
    } = req.body;

    const teachers = await query('SELECT * FROM teacher_profiles WHERE id = ?', [teacherId]);
    if (!teachers.length) {
      return res.status(404).json({
        success: false,
        message: 'Teacher profile not found.'
      });
    }
    const teacher = teachers[0];

    const formattedPhone = phone !== undefined ? formatIndianPhone(phone) : teacher.phone;

    await query(
      `UPDATE teacher_profiles SET
        full_name = COALESCE(?, full_name),
        phone = COALESCE(?, phone),
        primary_subject = COALESCE(?, primary_subject),
        highest_qualification = COALESCE(?, highest_qualification),
        experience_years = COALESCE(?, experience_years),
        current_city = COALESCE(?, current_city),
        current_state = COALESCE(?, current_state)
      WHERE id = ?`,
      [
        fullName !== undefined ? fullName.trim() : null,
        formattedPhone,
        primarySubject !== undefined ? primarySubject : null,
        highestQualification !== undefined ? highestQualification : null,
        experienceYears !== undefined ? experienceYears : null,
        currentCity !== undefined ? currentCity : null,
        currentState !== undefined ? currentState : null,
        teacherId
      ]
    );

    if (accountStatus && ['active', 'suspended', 'inactive'].includes(accountStatus)) {
      await query('UPDATE users SET status = ? WHERE id = ?', [accountStatus, teacher.user_id]);
    }

    if (newPassword && newPassword.trim()) {
      const hashed = await bcrypt.hash(newPassword.trim(), 10);
      await query('UPDATE users SET password = ? WHERE id = ?', [hashed, teacher.user_id]);
    }

    return res.status(200).json({
      success: true,
      message: 'Teacher details updated successfully.'
    });
  } catch (error) {
    console.error('updateTeacher Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update teacher: ' + error.message
    });
  }
};

// DELETE /api/v1/admin/teachers/:id - Admin deletes teacher
const deleteTeacher = async (req, res) => {
  try {
    const teacherId = req.params.id;
    const teachers = await query('SELECT user_id, full_name FROM teacher_profiles WHERE id = ?', [teacherId]);
    if (!teachers.length) {
      return res.status(404).json({
        success: false,
        message: 'Teacher profile not found.'
      });
    }

    const { user_id, full_name } = teachers[0];

    await query('DELETE FROM job_applications WHERE teacher_id = ?', [teacherId]);
    await query('DELETE FROM saved_jobs WHERE teacher_id = ?', [teacherId]);
    await query('DELETE FROM teacher_profiles WHERE id = ?', [teacherId]);
    await query('DELETE FROM users WHERE id = ?', [user_id]);

    return res.status(200).json({
      success: true,
      message: `Teacher "${full_name}" has been deleted successfully.`
    });
  } catch (error) {
    console.error('deleteTeacher Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete teacher: ' + error.message
    });
  }
};

// GET /api/v1/admin/taxonomy - Complete taxonomy tree including inactive items
const getAdminTaxonomy = async (req, res) => {
  try {
    const categories = await query('SELECT * FROM job_categories ORDER BY sort_order ASC, name ASC');
    const designations = await query('SELECT * FROM job_designations ORDER BY sort_order ASC, name ASC');
    const subjects = await query('SELECT * FROM job_subjects ORDER BY sort_order ASC, name ASC');

    const subjectsByDesig = {};
    subjects.forEach((s) => {
      if (!subjectsByDesig[s.designation_id]) subjectsByDesig[s.designation_id] = [];
      subjectsByDesig[s.designation_id].push(s);
    });

    const desigsByCat = {};
    designations.forEach((d) => {
      d.subjects = subjectsByDesig[d.id] || [];
      if (!desigsByCat[d.category_id]) desigsByCat[d.category_id] = [];
      desigsByCat[d.category_id].push(d);
    });

    const tree = categories.map((c) => ({
      ...c,
      designations: desigsByCat[c.id] || []
    }));

    return res.status(200).json({ success: true, data: tree });
  } catch (error) {
    console.error('getAdminTaxonomy Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve taxonomy.' });
  }
};

// POST /api/v1/admin/categories - Create Post / Staff Type
const createCategory = async (req, res) => {
  try {
    const { name, slug, description, sortOrder = 0 } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category/Post name is required.' });
    }
    const cleanSlug = slug && slug.trim() ? slug.trim().toLowerCase() : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const result = await query(
      'INSERT INTO job_categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)',
      [name.trim(), cleanSlug, description || null, sortOrder]
    );
    return res.status(201).json({
      success: true,
      message: `Category "${name.trim()}" created successfully.`,
      data: { id: result.insertId, name: name.trim(), slug: cleanSlug }
    });
  } catch (error) {
    console.error('createCategory Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create category: ' + error.message });
  }
};

// PUT /api/v1/admin/categories/:id - Update Post / Staff Type
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, sortOrder, isActive } = req.body;
    await query(
      `UPDATE job_categories SET
        name = COALESCE(?, name),
        slug = COALESCE(?, slug),
        description = COALESCE(?, description),
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active)
      WHERE id = ?`,
      [
        name ? name.trim() : null,
        slug ? slug.trim() : null,
        description !== undefined ? description : null,
        sortOrder !== undefined ? sortOrder : null,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        id
      ]
    );
    return res.status(200).json({ success: true, message: 'Category updated successfully.' });
  } catch (error) {
    console.error('updateCategory Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update category: ' + error.message });
  }
};

// DELETE /api/v1/admin/categories/:id
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM job_categories WHERE id = ?', [id]);
    return res.status(200).json({ success: true, message: 'Category and all associated designations deleted.' });
  } catch (error) {
    console.error('deleteCategory Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete category: ' + error.message });
  }
};

// POST /api/v1/admin/designations - Add Designation under Post
const createDesignation = async (req, res) => {
  try {
    const { categoryId, name, code, description, sortOrder = 0 } = req.body;
    if (!categoryId || !name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category ID and Designation Name are required.' });
    }
    const result = await query(
      'INSERT INTO job_designations (category_id, name, code, description, sort_order) VALUES (?, ?, ?, ?, ?)',
      [categoryId, name.trim(), code ? code.trim() : null, description || null, sortOrder]
    );
    return res.status(201).json({
      success: true,
      message: `Designation "${name.trim()}" created successfully.`,
      data: { id: result.insertId, categoryId, name: name.trim(), code }
    });
  } catch (error) {
    console.error('createDesignation Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create designation: ' + error.message });
  }
};

// PUT /api/v1/admin/designations/:id - Update Designation
const updateDesignation = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, sortOrder, isActive } = req.body;
    await query(
      `UPDATE job_designations SET
        name = COALESCE(?, name),
        code = COALESCE(?, code),
        description = COALESCE(?, description),
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active)
      WHERE id = ?`,
      [
        name ? name.trim() : null,
        code !== undefined ? code : null,
        description !== undefined ? description : null,
        sortOrder !== undefined ? sortOrder : null,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        id
      ]
    );
    return res.status(200).json({ success: true, message: 'Designation updated successfully.' });
  } catch (error) {
    console.error('updateDesignation Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update designation: ' + error.message });
  }
};

// DELETE /api/v1/admin/designations/:id
const deleteDesignation = async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM job_designations WHERE id = ?', [id]);
    return res.status(200).json({ success: true, message: 'Designation and associated subjects deleted.' });
  } catch (error) {
    console.error('deleteDesignation Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete designation: ' + error.message });
  }
};

// POST /api/v1/admin/subjects - Add Subject(s) under Designation
const createSubject = async (req, res) => {
  try {
    const { designationId, name, code, sortOrder = 0 } = req.body;
    if (!designationId || !name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Designation ID and Subject Name are required.' });
    }

    // Support comma-separated batch adding (e.g. "Science, Maths, English")
    const names = name.split(',').map((n) => n.trim()).filter(Boolean);
    const created = [];

    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      const result = await query(
        'INSERT INTO job_subjects (designation_id, name, code, sort_order) VALUES (?, ?, ?, ?)',
        [designationId, n, code && names.length === 1 ? code.trim() : null, sortOrder + i]
      );
      created.push({ id: result.insertId, name: n });
    }

    return res.status(201).json({
      success: true,
      message: `${created.length} Subject(s) added successfully.`,
      data: created
    });
  } catch (error) {
    console.error('createSubject Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to add subject: ' + error.message });
  }
};

// PUT /api/v1/admin/subjects/:id - Update Subject
const updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, sortOrder, isActive } = req.body;
    await query(
      `UPDATE job_subjects SET
        name = COALESCE(?, name),
        code = COALESCE(?, code),
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active)
      WHERE id = ?`,
      [
        name ? name.trim() : null,
        code !== undefined ? code : null,
        sortOrder !== undefined ? sortOrder : null,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        id
      ]
    );
    return res.status(200).json({ success: true, message: 'Subject updated successfully.' });
  } catch (error) {
    console.error('updateSubject Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update subject: ' + error.message });
  }
};

// DELETE /api/v1/admin/subjects/:id
const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM job_subjects WHERE id = ?', [id]);
    return res.status(200).json({ success: true, message: 'Subject deleted successfully.' });
  } catch (error) {
    console.error('deleteSubject Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete subject: ' + error.message });
  }
};

// GET /api/v1/admin/posts - List community posts with author metadata
const getCommunityPosts = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const conditions = ['1=1'];
    const params = [];

    if (role && role !== 'all') {
      conditions.push('cp.author_role = ?');
      params.push(role);
    }

    if (search) {
      conditions.push('(cp.content LIKE ? OR sp.school_name LIKE ? OR tp.full_name LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await query(
      `SELECT COUNT(*) as total 
       FROM community_posts cp
       LEFT JOIN school_profiles sp ON (cp.author_role = 'school' AND cp.author_user_id = sp.user_id)
       LEFT JOIN teacher_profiles tp ON (cp.author_role = 'teacher' AND cp.author_user_id = tp.user_id)
       WHERE ${whereClause}`,
      params
    );
    const total = countRes[0]?.total || 0;

    const postsSql = `
      SELECT 
        cp.*,
        u.email as author_email,
        u.status as author_account_status,
        CASE 
          WHEN cp.author_role = 'school' THEN COALESCE(sp.school_name, 'School Institution')
          ELSE COALESCE(tp.full_name, 'Teacher Educator')
        END as author_name,
        CASE 
          WHEN cp.author_role = 'school' THEN sp.logo_url
          ELSE tp.avatar_url
        END as author_avatar,
        CASE 
          WHEN cp.author_role = 'school' THEN sp.city
          ELSE tp.current_city
        END as author_city
      FROM community_posts cp
      JOIN users u ON cp.author_user_id = u.id
      LEFT JOIN school_profiles sp ON (cp.author_role = 'school' AND cp.author_user_id = sp.user_id)
      LEFT JOIN teacher_profiles tp ON (cp.author_role = 'teacher' AND cp.author_user_id = tp.user_id)
      WHERE ${whereClause}
      ORDER BY cp.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const posts = await query(postsSql, [...params, parseInt(limit, 10), parseInt(offset, 10)]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)),
        posts
      }
    });
  } catch (error) {
    console.error('getCommunityPosts Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve community posts: ' + error.message });
  }
};

// DELETE /api/v1/admin/posts/:id
const deleteCommunityPost = async (req, res) => {
  try {
    const { id } = req.params;
    const postRows = await query('SELECT media_url FROM community_posts WHERE id = ?', [id]);
    if (postRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const mediaUrl = postRows[0]?.media_url;
    if (mediaUrl) {
      webdavService.deleteByUrl(mediaUrl).catch(() => {});
    }

    // Delete post comments and likes
    await query('DELETE FROM community_post_comments WHERE post_id = ?', [id]).catch(() => {});
    await query('DELETE FROM community_post_likes WHERE post_id = ?', [id]).catch(() => {});
    await query('DELETE FROM community_posts WHERE id = ?', [id]);

    return res.status(200).json({ success: true, message: 'Community post removed successfully.' });
  } catch (error) {
    console.error('deleteCommunityPost Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete community post.' });
  }
};

// GET /api/v1/admin/storage/stats
const getStorageStats = async (req, res) => {
  try {
    const stats = await webdavService.getStorageStats();
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    console.error('getStorageStats Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load storage statistics.' });
  }
};

// GET /api/v1/admin/storage/files
const getStorageFiles = async (req, res) => {
  try {
    const { subfolder } = req.query;
    const files = await webdavService.listFiles(subfolder || null);
    return res.status(200).json({ success: true, data: { files, total: files.length } });
  } catch (error) {
    console.error('getStorageFiles Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to list storage files.' });
  }
};

// DELETE /api/v1/admin/storage/files
const deleteStorageFile = async (req, res) => {
  try {
    const { subfolder, filename, url } = req.body;
    let deleted = false;
    if (url) {
      deleted = await webdavService.deleteByUrl(url);
    } else if (subfolder && filename) {
      deleted = await webdavService.deleteFile(subfolder, filename);
    } else {
      return res.status(400).json({ success: false, message: 'Specify either file url or subfolder and filename.' });
    }
    return res.status(200).json({ success: true, message: deleted ? 'File deleted successfully.' : 'File could not be removed.' });
  } catch (error) {
    console.error('deleteStorageFile Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete storage file.' });
  }
};

// PUT /api/v1/admin/change-password - Admin changes their own password and/or email
const changeAdminPassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword, confirmPassword, email } = req.body;

    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirm password do not match.'
      });
    }

    const users = await query('SELECT id, email, password FROM users WHERE id = ?', [userId]);
    if (!users.length) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    const user = users[0];

    // If current password provided, verify it
    if (currentPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password does not match. Please verify and try again.'
        });
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);
    let cleanEmail = user.email;

    if (email && email.trim() && email.trim().toLowerCase() !== user.email.toLowerCase()) {
      cleanEmail = email.trim().toLowerCase();
      const existing = await query('SELECT id FROM users WHERE email = ? AND id != ?', [cleanEmail, userId]);
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address already exists.'
        });
      }
      await query('UPDATE users SET email = ?, password = ? WHERE id = ?', [cleanEmail, hashedPassword, userId]);
    } else {
      await query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
    }

    return res.status(200).json({
      success: true,
      message: 'Admin account credentials updated successfully.',
      data: {
        userId,
        email: cleanEmail
      }
    });
  } catch (error) {
    console.error('changeAdminPassword Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update admin password: ' + error.message
    });
  }
};

// GET /api/v1/admin/pages - List all custom CMS pages
const getCustomPages = async (req, res) => {
  try {
    const pages = await query(
      'SELECT id, slug, title, subtitle, is_published, meta_description, created_at, updated_at FROM custom_pages ORDER BY id ASC'
    );
    return res.status(200).json({
      success: true,
      data: pages
    });
  } catch (error) {
    console.error('getCustomPages Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve custom pages: ' + error.message
    });
  }
};

// GET /api/v1/admin/pages/:id - Get single CMS page with full content
const getCustomPageById = async (req, res) => {
  try {
    const { id } = req.params;
    const pages = await query(
      'SELECT * FROM custom_pages WHERE id = ? OR slug = ?',
      [id, id]
    );
    if (!pages.length) {
      return res.status(404).json({ success: false, message: 'Page not found.' });
    }
    return res.status(200).json({
      success: true,
      data: pages[0]
    });
  } catch (error) {
    console.error('getCustomPageById Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve page details: ' + error.message
    });
  }
};

// POST /api/v1/admin/pages - Create new CMS page
const createCustomPage = async (req, res) => {
  try {
    const { slug, title, subtitle, content, is_published = 1, meta_description } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Page Title and Page Content are required.'
      });
    }

    const cleanSlug = (slug || title)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'page';

    const existing = await query('SELECT id FROM custom_pages WHERE slug = ?', [cleanSlug]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `A page with URL slug '${cleanSlug}' already exists.`
      });
    }

    const result = await query(
      `INSERT INTO custom_pages (slug, title, subtitle, content, is_published, meta_description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cleanSlug, title.trim(), subtitle ? subtitle.trim() : null, content, is_published ? 1 : 0, meta_description ? meta_description.trim() : null]
    );

    return res.status(201).json({
      success: true,
      message: 'Page created successfully.',
      data: {
        id: result.insertId,
        slug: cleanSlug,
        title: title.trim()
      }
    });
  } catch (error) {
    console.error('createCustomPage Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create page: ' + error.message
    });
  }
};

// PUT /api/v1/admin/pages/:id - Update existing CMS page
const updateCustomPage = async (req, res) => {
  try {
    const { id } = req.params;
    const { slug, title, subtitle, content, is_published, meta_description } = req.body;

    const existing = await query('SELECT id, slug FROM custom_pages WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Page not found.' });
    }

    let finalSlug = existing[0].slug;
    if (slug && slug.trim()) {
      finalSlug = slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const duplicate = await query('SELECT id FROM custom_pages WHERE slug = ? AND id != ?', [finalSlug, id]);
      if (duplicate.length > 0) {
        return res.status(409).json({
          success: false,
          message: `A page with URL slug '${finalSlug}' already exists.`
        });
      }
    }

    await query(
      `UPDATE custom_pages 
       SET slug = ?, title = ?, subtitle = ?, content = ?, is_published = ?, meta_description = ?
       WHERE id = ?`,
      [
        finalSlug,
        title ? title.trim() : existing[0].title,
        subtitle !== undefined ? (subtitle ? subtitle.trim() : null) : existing[0].subtitle,
        content !== undefined ? content : existing[0].content,
        is_published !== undefined ? (is_published ? 1 : 0) : existing[0].is_published,
        meta_description !== undefined ? (meta_description ? meta_description.trim() : null) : existing[0].meta_description,
        id
      ]
    );

    return res.status(200).json({
      success: true,
      message: 'Page updated successfully.',
      data: { id, slug: finalSlug }
    });
  } catch (error) {
    console.error('updateCustomPage Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update page: ' + error.message
    });
  }
};

// DELETE /api/v1/admin/pages/:id - Delete CMS page
const deleteCustomPage = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT id, slug FROM custom_pages WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Page not found.' });
    }

    // Protect core system pages from accidental total deletion
    if (['privacy', 'terms'].includes(existing[0].slug)) {
      return res.status(400).json({
        success: false,
        message: `System page '/${existing[0].slug}' is essential for legal compliance and cannot be deleted. You can edit its content instead.`
      });
    }

    await query('DELETE FROM custom_pages WHERE id = ?', [id]);
    return res.status(200).json({
      success: true,
      message: 'Page removed successfully.'
    });
  } catch (error) {
    console.error('deleteCustomPage Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete page: ' + error.message
    });
  }
};

// GET /api/v1/admin/staff-disputes - View all staff records reported/disputed by schools
const getStaffDisputes = async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        ss.id as staff_id,
        ss.school_id,
        ss.teacher_id,
        ss.status as employment_status,
        ss.designation,
        ss.subject,
        ss.from_year,
        ss.to_year,
        ss.is_disputed,
        ss.dispute_reason,
        ss.disputed_at,
        sp.school_name,
        sp.city as school_city,
        sp.state as school_state,
        tp.full_name as teacher_name,
        tp.avatar_url as teacher_avatar,
        u.email as teacher_email,
        tp.phone as teacher_phone
      FROM school_staff ss
      JOIN school_profiles sp ON ss.school_id = sp.id
      JOIN teacher_profiles tp ON ss.teacher_id = tp.id
      JOIN users u ON tp.user_id = u.id
      WHERE ss.is_disputed = 1
      ORDER BY ss.disputed_at DESC
    `);

    return res.status(200).json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('getStaffDisputes Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve staff disputes.' });
  }
};

// DELETE /api/v1/admin/staff/:id - Delete a disputed or misleading staff record
const deleteStaffRecord = async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM school_staff WHERE id = ?', [id]);
    return res.status(200).json({
      success: true,
      message: 'Staff link successfully removed from school directory.'
    });
  } catch (error) {
    console.error('deleteStaffRecord Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete staff record.' });
  }
};

// PUT /api/v1/admin/staff/:id/resolve - Dismiss dispute and keep staff record
const resolveStaffDispute = async (req, res) => {
  try {
    const { id } = req.params;
    await query(
      'UPDATE school_staff SET is_disputed = 0, dispute_reason = NULL, disputed_at = NULL WHERE id = ?',
      [id]
    );
    return res.status(200).json({
      success: true,
      message: 'Staff dispute resolved and dismissed.'
    });
  } catch (error) {
    console.error('resolveStaffDispute Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to resolve staff dispute.' });
  }
};

module.exports = {
  getDashboardStats,
  getSchools,
  createSchool,
  updateSchool,
  deleteSchool,
  updateSchoolVerification,
  getTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  impersonateUser,
  toggleUserStatus,
  getAllJobs,
  deleteJob,
  getJobSettings,
  updateJobSettings,
  updateJobStatus,
  getAdminTaxonomy,
  createCategory,
  updateCategory,
  deleteCategory,
  createDesignation,
  updateDesignation,
  deleteDesignation,
  createSubject,
  updateSubject,
  deleteSubject,
  getCommunityPosts,
  deleteCommunityPost,
  getStorageStats,
  getStorageFiles,
  deleteStorageFile,
  changeAdminPassword,
  getCustomPages,
  getCustomPageById,
  createCustomPage,
  updateCustomPage,
  deleteCustomPage,
  getStaffDisputes,
  deleteStaffRecord,
  resolveStaffDispute
};

