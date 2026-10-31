const { query } = require('../config/database');

// GET /api/v1/school/profile
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await query('SELECT * FROM school_profiles WHERE user_id = ?', [userId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'School profile not found.'
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('getProfile Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve school profile.'
    });
  }
};

// PUT /api/v1/school/profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      schoolName,
      board,
      registrationNumber,
      contactPerson,
      phone,
      address,
      city,
      state,
      pincode,
      website,
      about
    } = req.body;

    await query(
      `UPDATE school_profiles 
       SET school_name = COALESCE(?, school_name),
           board = COALESCE(?, board),
           registration_number = COALESCE(?, registration_number),
           contact_person = COALESCE(?, contact_person),
           phone = COALESCE(?, phone),
           address = COALESCE(?, address),
           city = COALESCE(?, city),
           state = COALESCE(?, state),
           pincode = COALESCE(?, pincode),
           website = COALESCE(?, website),
           about = COALESCE(?, about)
       WHERE user_id = ?`,
      [schoolName, board, registrationNumber, contactPerson, phone, address, city, state, pincode, website, about, userId]
    );

    const updated = await query('SELECT * FROM school_profiles WHERE user_id = ?', [userId]);

    return res.status(200).json({
      success: true,
      message: 'School profile updated successfully.',
      data: updated[0]
    });
  } catch (error) {
    console.error('updateProfile Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update school profile.'
    });
  }
};

// POST /api/v1/school/upload-logo
const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No logo file provided.'
      });
    }

    const logoUrl = `/uploads/logos/${req.file.filename}`;
    await query('UPDATE school_profiles SET logo_url = ? WHERE user_id = ?', [logoUrl, req.user.id]);

    return res.status(200).json({
      success: true,
      message: 'School logo uploaded successfully.',
      data: { logoUrl }
    });
  } catch (error) {
    console.error('uploadLogo Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload logo.'
    });
  }
};

// POST /api/v1/school/jobs
const postJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const schoolRows = await query('SELECT id, is_verified FROM school_profiles WHERE user_id = ?', [userId]);
    if (schoolRows.length === 0) return res.status(404).json({ success: false, message: 'School profile not found.' });

    const school = schoolRows[0];
    const {
      title,
      designation,
      subject,
      qualificationRequired,
      experienceRequired,
      salaryMin,
      salaryMax,
      salaryNegotiable,
      jobType,
      openings,
      description,
      responsibilities,
      benefits,
      city,
      state,
      deadline
    } = req.body;

    if (!title || !designation || !subject || !description || !city || !state) {
      return res.status(400).json({
        success: false,
        message: 'Title, designation, subject, description, city, and state are mandatory fields.'
      });
    }

    const result = await query(
      `INSERT INTO jobs 
       (school_id, title, designation, subject, qualification_required, experience_required, salary_min, salary_max, salary_negotiable, job_type, openings, description, responsibilities, benefits, city, state, deadline, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        school.id,
        title.trim(),
        designation.trim(),
        subject.trim(),
        qualificationRequired || 'Relevant Degree / B.Ed',
        experienceRequired || '1-3 Years',
        salaryMin || 0,
        salaryMax || 0,
        salaryNegotiable ? 1 : 0,
        jobType || 'full_time',
        openings || 1,
        description,
        responsibilities || null,
        benefits || null,
        city.trim(),
        state.trim(),
        deadline || null,
        'active'
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Vacancy posted successfully!',
      data: { jobId: result.insertId }
    });
  } catch (error) {
    console.error('postJob Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to publish vacancy.'
    });
  }
};

// GET /api/v1/school/jobs
const getMyJobs = async (req, res) => {
  try {
    const userId = req.user.id;
    const schoolRows = await query('SELECT id FROM school_profiles WHERE user_id = ?', [userId]);
    if (schoolRows.length === 0) return res.status(404).json({ success: false, message: 'School profile not found.' });

    const schoolId = schoolRows[0].id;

    const sql = `
      SELECT 
        j.*,
        COUNT(a.id) as total_applicants,
        SUM(CASE WHEN a.status = 'shortlisted' THEN 1 ELSE 0 END) as shortlisted_count
      FROM jobs j
      LEFT JOIN job_applications a ON j.id = a.job_id
      WHERE j.school_id = ?
      GROUP BY j.id
      ORDER BY j.created_at DESC
    `;

    const jobs = await query(sql, [schoolId]);

    return res.status(200).json({
      success: true,
      data: jobs
    });
  } catch (error) {
    console.error('getMyJobs Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve jobs.'
    });
  }
};

// PUT /api/v1/school/jobs/:id
const updateJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const jobId = req.params.id;

    const schoolRows = await query('SELECT id FROM school_profiles WHERE user_id = ?', [userId]);
    if (schoolRows.length === 0) return res.status(404).json({ success: false, message: 'Profile not found.' });

    const schoolId = schoolRows[0].id;

    const existing = await query('SELECT id FROM jobs WHERE id = ? AND school_id = ?', [jobId, schoolId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found or access unauthorized.' });
    }

    const {
      title, designation, subject, qualificationRequired, experienceRequired,
      salaryMin, salaryMax, salaryNegotiable, jobType, openings, description,
      responsibilities, benefits, city, state, deadline, status
    } = req.body;

    await query(
      `UPDATE jobs 
       SET title = COALESCE(?, title),
           designation = COALESCE(?, designation),
           subject = COALESCE(?, subject),
           qualification_required = COALESCE(?, qualification_required),
           experience_required = COALESCE(?, experience_required),
           salary_min = COALESCE(?, salary_min),
           salary_max = COALESCE(?, salary_max),
           salary_negotiable = COALESCE(?, salary_negotiable),
           job_type = COALESCE(?, job_type),
           openings = COALESCE(?, openings),
           description = COALESCE(?, description),
           responsibilities = COALESCE(?, responsibilities),
           benefits = COALESCE(?, benefits),
           city = COALESCE(?, city),
           state = COALESCE(?, state),
           deadline = COALESCE(?, deadline),
           status = COALESCE(?, status)
       WHERE id = ?`,
      [
        title, designation, subject, qualificationRequired, experienceRequired,
        salaryMin, salaryMax, salaryNegotiable, jobType, openings, description,
        responsibilities, benefits, city, state, deadline, status, jobId
      ]
    );

    return res.status(200).json({
      success: true,
      message: 'Job vacancy updated successfully.'
    });
  } catch (error) {
    console.error('updateJob Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update job vacancy.'
    });
  }
};

// GET /api/v1/school/jobs/:id/applicants
const getJobApplicants = async (req, res) => {
  try {
    const userId = req.user.id;
    const jobId = req.params.id;

    const schoolRows = await query('SELECT id FROM school_profiles WHERE user_id = ?', [userId]);
    if (schoolRows.length === 0) return res.status(404).json({ success: false, message: 'Profile not found.' });

    const schoolId = schoolRows[0].id;

    const jobCheck = await query('SELECT id, title FROM jobs WHERE id = ? AND school_id = ?', [jobId, schoolId]);
    if (jobCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found or access unauthorized.' });
    }

    const sql = `
      SELECT 
        a.id as application_id, a.status as application_status, a.cover_note, a.applied_at, 
        a.interview_date, a.interview_notes,
        t.id as teacher_id, t.full_name, t.phone, t.highest_qualification, t.specialization,
        t.experience_years, t.primary_subject, t.current_city, t.current_state,
        t.expected_salary_min, t.expected_salary_max, t.resume_url, t.avatar_url,
        u.email as teacher_email
      FROM job_applications a
      JOIN teacher_profiles t ON a.teacher_id = t.id
      JOIN users u ON t.user_id = u.id
      WHERE a.job_id = ?
      ORDER BY a.applied_at DESC
    `;

    const applicants = await query(sql, [jobId]);

    return res.status(200).json({
      success: true,
      data: {
        job: jobCheck[0],
        applicants
      }
    });
  } catch (error) {
    console.error('getJobApplicants Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve applicants.'
    });
  }
};

// PUT /api/v1/school/applications/:applicationId/status
const updateApplicationStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const applicationId = req.params.applicationId;
    const { status, interviewDate, interviewNotes } = req.body;

    const schoolRows = await query('SELECT id FROM school_profiles WHERE user_id = ?', [userId]);
    if (schoolRows.length === 0) return res.status(404).json({ success: false, message: 'Profile not found.' });

    const schoolId = schoolRows[0].id;

    // Verify application belongs to a job owned by this school
    const appCheck = await query(
      `SELECT a.id, a.teacher_id, j.title as job_title, s.school_name, t.user_id as teacher_user_id
       FROM job_applications a
       JOIN jobs j ON a.job_id = j.id
       JOIN school_profiles s ON j.school_id = s.id
       JOIN teacher_profiles t ON a.teacher_id = t.id
       WHERE a.id = ? AND j.school_id = ?`,
      [applicationId, schoolId]
    );

    if (appCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'Application not found or unauthorized.' });
    }

    const appInfo = appCheck[0];

    await query(
      `UPDATE job_applications 
       SET status = ?, 
           interview_date = COALESCE(?, interview_date),
           interview_notes = COALESCE(?, interview_notes)
       WHERE id = ?`,
      [status, interviewDate || null, interviewNotes || null, applicationId]
    );

    // Create notification for teacher
    await query(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [
        appInfo.teacher_user_id,
        `Application Status Update: ${appInfo.job_title}`,
        `${appInfo.school_name} updated your application status to: ${status.replace('_', ' ').toUpperCase()}`,
        'application_update'
      ]
    );

    return res.status(200).json({
      success: true,
      message: 'Applicant status updated successfully.'
    });
  } catch (error) {
    console.error('updateApplicationStatus Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update application status.'
    });
  }
};

// GET /api/v1/school/dashboard
const getSchoolDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const schoolRows = await query('SELECT * FROM school_profiles WHERE user_id = ?', [userId]);
    if (schoolRows.length === 0) return res.status(404).json({ success: false, message: 'Profile not found.' });

    const school = schoolRows[0];
    const schoolId = school.id;

    const [stats] = await query(
      `SELECT 
        COUNT(DISTINCT j.id) as total_jobs,
        SUM(CASE WHEN j.status = 'active' THEN 1 ELSE 0 END) as active_jobs,
        COUNT(a.id) as total_applications,
        SUM(CASE WHEN a.status = 'applied' THEN 1 ELSE 0 END) as pending_review,
        SUM(CASE WHEN a.status = 'shortlisted' THEN 1 ELSE 0 END) as shortlisted_candidates,
        SUM(CASE WHEN a.status = 'hired' THEN 1 ELSE 0 END) as hired_candidates
       FROM jobs j
       LEFT JOIN job_applications a ON j.id = a.job_id
       WHERE j.school_id = ?`,
      [schoolId]
    );

    const recentApplications = await query(
      `SELECT 
        a.id, a.status, a.applied_at,
        j.title as job_title,
        t.full_name as teacher_name, t.highest_qualification, t.experience_years, t.primary_subject
       FROM job_applications a
       JOIN jobs j ON a.job_id = j.id
       JOIN teacher_profiles t ON a.teacher_id = t.id
       WHERE j.school_id = ?
       ORDER BY a.applied_at DESC
       LIMIT 5`,
      [schoolId]
    );

    return res.status(200).json({
      success: true,
      data: {
        school,
        stats: {
          totalJobs: stats.total_jobs || 0,
          activeJobs: stats.active_jobs || 0,
          totalApplications: stats.total_applications || 0,
          pendingReview: stats.pending_review || 0,
          shortlistedCandidates: stats.shortlisted_candidates || 0,
          hiredCandidates: stats.hired_candidates || 0
        },
        recentApplications
      }
    });
  } catch (error) {
    console.error('getSchoolDashboard Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve school dashboard metrics.'
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  uploadLogo,
  postJob,
  getMyJobs,
  updateJob,
  getJobApplicants,
  updateApplicationStatus,
  getSchoolDashboard
};
