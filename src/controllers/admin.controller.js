const { query } = require('../config/database');

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

module.exports = {
  getDashboardStats,
  getSchools,
  updateSchoolVerification,
  getTeachers,
  toggleUserStatus,
  getAllJobs,
  deleteJob
};
