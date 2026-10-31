const path = require('path');
const fs = require('fs');
const { query } = require('../config/database');

// GET /api/v1/teacher/profile
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await query('SELECT * FROM teacher_profiles WHERE user_id = ?', [userId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Teacher profile not found.'
      });
    }

    const row = rows[0];

    // Safely parse JSON fields if stored as string
    const safeParse = (val) => {
      if (!val) return null;
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch (e) { return null; }
    };

    return res.status(200).json({
      success: true,
      data: {
        ...row,
        family_details: safeParse(row.family_details),
        qualifications_data: safeParse(row.qualifications_data),
        previous_jobs_data: safeParse(row.previous_jobs_data),
        current_job_data: safeParse(row.current_job_data),
        tet_details: safeParse(row.tet_details)
      }
    });
  } catch (error) {
    console.error('getProfile Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile.'
    });
  }
};

// PUT /api/v1/teacher/profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      fullName,
      phone,
      gender,
      dob,
      address,
      pincode,
      languages,
      headline,
      highestQualification,
      specialization,
      experienceYears,
      primarySubject,
      secondarySubjects,
      currentCity,
      currentState,
      expectedSalaryMin,
      expectedSalaryMax,
      bio,
      familyDetails,
      qualificationsData,
      previousJobsData,
      currentJobData,
      tetDetails,
      profileStep
    } = req.body;

    const serialize = (val) => {
      if (val === undefined) return null;
      if (val === null) return null;
      if (typeof val === 'string') return val;
      return JSON.stringify(val);
    };

    // Check completion criteria
    const isCompleted = !!(fullName && phone && primarySubject && currentCity && qualificationsData);

    await query(
      `UPDATE teacher_profiles 
       SET full_name = COALESCE(?, full_name),
           phone = COALESCE(?, phone),
           gender = COALESCE(?, gender),
           dob = COALESCE(?, dob),
           address = COALESCE(?, address),
           pincode = COALESCE(?, pincode),
           languages = COALESCE(?, languages),
           headline = COALESCE(?, headline),
           highest_qualification = COALESCE(?, highest_qualification),
           specialization = COALESCE(?, specialization),
           experience_years = COALESCE(?, experience_years),
           primary_subject = COALESCE(?, primary_subject),
           secondary_subjects = COALESCE(?, secondary_subjects),
           current_city = COALESCE(?, current_city),
           current_state = COALESCE(?, current_state),
           expected_salary_min = COALESCE(?, expected_salary_min),
           expected_salary_max = COALESCE(?, expected_salary_max),
           bio = COALESCE(?, bio),
           family_details = COALESCE(?, family_details),
           qualifications_data = COALESCE(?, qualifications_data),
           previous_jobs_data = COALESCE(?, previous_jobs_data),
           current_job_data = COALESCE(?, current_job_data),
           tet_details = COALESCE(?, tet_details),
           profile_step = COALESCE(?, profile_step),
           is_profile_completed = ?
       WHERE user_id = ?`,
      [
        fullName, phone, gender, dob, address, pincode, languages, headline,
        highestQualification, specialization, experienceYears, primarySubject, secondarySubjects,
        currentCity, currentState, expectedSalaryMin, expectedSalaryMax, bio,
        serialize(familyDetails), serialize(qualificationsData), serialize(previousJobsData),
        serialize(currentJobData), serialize(tetDetails), profileStep || 1,
        isCompleted ? 1 : 0, userId
      ]
    );

    const updated = await query('SELECT * FROM teacher_profiles WHERE user_id = ?', [userId]);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: updated[0]
    });
  } catch (error) {
    console.error('updateProfile Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile: ' + error.message
    });
  }
};

// POST /api/v1/teacher/upload-avatar
const uploadAvatar = async (req, res) => {
  try {
    const userId = req.user.id;
    let avatarUrl = '';

    if (req.file) {
      avatarUrl = `/uploads/avatars/${req.file.filename}`;
    } else if (req.body.avatarBase64) {
      const base64Data = req.body.avatarBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `avatar-${userId}-${Date.now()}.jpg`;
      const avatarsDir = path.join(__dirname, '../../uploads/avatars');
      if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
      fs.writeFileSync(path.join(avatarsDir, filename), buffer);
      avatarUrl = `/uploads/avatars/${filename}`;
    } else {
      return res.status(400).json({
        success: false,
        message: 'No avatar image file or base64 data provided.'
      });
    }

    await query('UPDATE teacher_profiles SET avatar_url = ? WHERE user_id = ?', [avatarUrl, userId]);

    return res.status(200).json({
      success: true,
      message: 'Profile picture cropped and updated successfully!',
      data: { avatarUrl }
    });
  } catch (error) {
    console.error('uploadAvatar Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload profile picture.'
    });
  }
};

// POST /api/v1/teacher/upload-resume
const uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No resume file uploaded.'
      });
    }

    const resumeUrl = `/uploads/resumes/${req.file.filename}`;
    await query('UPDATE teacher_profiles SET resume_url = ? WHERE user_id = ?', [resumeUrl, req.user.id]);

    return res.status(200).json({
      success: true,
      message: 'Resume uploaded successfully.',
      data: { resumeUrl }
    });
  } catch (error) {
    console.error('uploadResume Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload resume.'
    });
  }
};

// POST /api/v1/teacher/apply
const applyToJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId, coverNote } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: 'Job ID is required.'
      });
    }

    // Get teacher profile id
    const teacherRows = await query('SELECT id, is_profile_completed FROM teacher_profiles WHERE user_id = ?', [userId]);
    if (teacherRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Teacher profile not found.' });
    }
    const teacherId = teacherRows[0].id;

    // Check if job exists and is active
    const jobRows = await query('SELECT id, status FROM jobs WHERE id = ?', [jobId]);
    if (jobRows.length === 0 || jobRows[0].status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'This job vacancy is no longer accepting applications.'
      });
    }

    // Check if already applied
    const existing = await query(
      'SELECT id FROM job_applications WHERE job_id = ? AND teacher_id = ?',
      [jobId, teacherId]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You have already submitted an application for this vacancy.'
      });
    }

    await query(
      'INSERT INTO job_applications (job_id, teacher_id, cover_note, status) VALUES (?, ?, ?, ?)',
      [jobId, teacherId, coverNote || null, 'applied']
    );

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully! The school has been notified.'
    });
  } catch (error) {
    console.error('applyToJob Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit application.'
    });
  }
};

// GET /api/v1/teacher/applications
const getMyApplications = async (req, res) => {
  try {
    const userId = req.user.id;
    const teacherRows = await query('SELECT id FROM teacher_profiles WHERE user_id = ?', [userId]);
    if (teacherRows.length === 0) return res.status(404).json({ success: false, message: 'Profile not found.' });

    const teacherId = teacherRows[0].id;

    const sql = `
      SELECT 
        a.id as application_id, a.status as application_status, a.applied_at, a.interview_date, a.interview_notes,
        j.id as job_id, j.title as job_title, j.designation, j.subject, j.salary_min, j.salary_max, j.city, j.status as job_status,
        s.school_name, s.logo_url as school_logo
      FROM job_applications a
      JOIN jobs j ON a.job_id = j.id
      JOIN school_profiles s ON j.school_id = s.id
      WHERE a.teacher_id = ?
      ORDER BY a.applied_at DESC
    `;

    const applications = await query(sql, [teacherId]);

    return res.status(200).json({
      success: true,
      data: applications
    });
  } catch (error) {
    console.error('getMyApplications Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve applications.'
    });
  }
};

// POST /api/v1/teacher/save-job/:jobId
const toggleSaveJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const jobId = req.params.jobId;

    const teacherRows = await query('SELECT id FROM teacher_profiles WHERE user_id = ?', [userId]);
    if (teacherRows.length === 0) return res.status(404).json({ success: false, message: 'Profile not found.' });

    const teacherId = teacherRows[0].id;

    const existing = await query('SELECT id FROM saved_jobs WHERE teacher_id = ? AND job_id = ?', [teacherId, jobId]);

    if (existing.length > 0) {
      await query('DELETE FROM saved_jobs WHERE teacher_id = ? AND job_id = ?', [teacherId, jobId]);
      return res.status(200).json({
        success: true,
        isSaved: false,
        message: 'Job removed from saved list.'
      });
    } else {
      await query('INSERT INTO saved_jobs (teacher_id, job_id) VALUES (?, ?)', [teacherId, jobId]);
      return res.status(200).json({
        success: true,
        isSaved: true,
        message: 'Job saved successfully.'
      });
    }
  } catch (error) {
    console.error('toggleSaveJob Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to toggle saved status.'
    });
  }
};

// GET /api/v1/teacher/saved-jobs
const getSavedJobs = async (req, res) => {
  try {
    const userId = req.user.id;
    const teacherRows = await query('SELECT id FROM teacher_profiles WHERE user_id = ?', [userId]);
    if (teacherRows.length === 0) return res.status(404).json({ success: false, message: 'Profile not found.' });

    const teacherId = teacherRows[0].id;

    const sql = `
      SELECT 
        sj.id as saved_id, sj.created_at as saved_at,
        j.id, j.title, j.designation, j.subject, j.qualification_required, j.experience_required,
        j.salary_min, j.salary_max, j.job_type, j.city, j.state, j.status,
        s.school_name, s.logo_url as school_logo
      FROM saved_jobs sj
      JOIN jobs j ON sj.job_id = j.id
      JOIN school_profiles s ON j.school_id = s.id
      WHERE sj.teacher_id = ?
      ORDER BY sj.created_at DESC
    `;

    const saved = await query(sql, [teacherId]);

    return res.status(200).json({
      success: true,
      data: saved
    });
  } catch (error) {
    console.error('getSavedJobs Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch saved jobs.'
    });
  }
};

// GET /api/v1/teacher/dashboard
const getTeacherDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const teacherRows = await query('SELECT * FROM teacher_profiles WHERE user_id = ?', [userId]);
    if (teacherRows.length === 0) return res.status(404).json({ success: false, message: 'Profile not found.' });

    const teacher = teacherRows[0];
    const teacherId = teacher.id;

    // Statistics
    const [appStats] = await query(
      `SELECT 
        COUNT(*) as total_applied,
        SUM(CASE WHEN status = 'shortlisted' THEN 1 ELSE 0 END) as total_shortlisted,
        SUM(CASE WHEN status = 'interview_scheduled' THEN 1 ELSE 0 END) as total_interviews,
        SUM(CASE WHEN status = 'hired' THEN 1 ELSE 0 END) as total_hired
       FROM job_applications 
       WHERE teacher_id = ?`,
      [teacherId]
    );

    const [savedStats] = await query(
      'SELECT COUNT(*) as total_saved FROM saved_jobs WHERE teacher_id = ?',
      [teacherId]
    );

    // Recommended jobs based on primary subject
    const recommendedSql = `
      SELECT j.id, j.title, j.designation, j.subject, j.salary_min, j.salary_max, j.city, s.school_name, s.logo_url as school_logo
      FROM jobs j
      JOIN school_profiles s ON j.school_id = s.id
      WHERE j.status = 'active' AND (j.subject = ? OR j.city = ?)
      ORDER BY j.created_at DESC
      LIMIT 5
    `;
    const recommendedJobs = await query(recommendedSql, [teacher.primary_subject || '', teacher.current_city || '']);

    return res.status(200).json({
      success: true,
      data: {
        profile: teacher,
        stats: {
          totalApplied: appStats.total_applied || 0,
          totalShortlisted: appStats.total_shortlisted || 0,
          totalInterviews: appStats.total_interviews || 0,
          totalHired: appStats.total_hired || 0,
          totalSaved: savedStats.total_saved || 0
        },
        recommendedJobs
      }
    });
  } catch (error) {
    console.error('getTeacherDashboard Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve teacher dashboard metrics.'
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  uploadAvatar,
  uploadResume,
  applyToJob,
  getMyApplications,
  toggleSaveJob,
  getSavedJobs,
  getTeacherDashboard
};
