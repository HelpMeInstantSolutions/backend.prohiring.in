const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

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

    const schoolRes = await query(
      `INSERT INTO school_profiles 
       (user_id, school_name, contact_person, phone, city, state, board, address, website, registration_number, verification_status, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        isVerified
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'School created successfully.',
      data: {
        id: schoolRes.insertId,
        userId,
        schoolName,
        email: cleanEmail,
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

module.exports = {
  getDashboardStats,
  getSchools,
  createSchool,
  updateSchool,
  deleteSchool,
  updateSchoolVerification,
  getTeachers,
  updateTeacher,
  deleteTeacher,
  impersonateUser,
  toggleUserStatus,
  getAllJobs,
  deleteJob
};
