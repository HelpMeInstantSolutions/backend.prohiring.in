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
      postType,
      designation,
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
      profileStep,
      latitude,
      longitude,
      preferredLocation,
      preferred_location
    } = req.body;

    const serialize = (val) => {
      if (val === undefined || val === null) return null;
      if (typeof val === 'string') return val;
      return JSON.stringify(val);
    };

    // Check completion criteria
    const isCompleted = !!(fullName && phone && primarySubject && currentCity && qualificationsData);

    const updateParams = [
      fullName, phone, gender, dob, address, pincode, languages, headline,
      postType, designation,
      highestQualification, specialization, experienceYears, primarySubject, secondarySubjects,
      currentCity, currentState, expectedSalaryMin, expectedSalaryMax, bio,
      serialize(familyDetails), serialize(qualificationsData), serialize(previousJobsData),
      serialize(currentJobData), serialize(tetDetails), profileStep || 1,
      latitude !== undefined ? latitude : null,
      longitude !== undefined ? longitude : null,
      preferredLocation || preferred_location || null,
      isCompleted ? 1 : 0, userId
    ].map((v) => (v === undefined ? null : v));

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
           post_type = COALESCE(?, post_type),
           designation = COALESCE(?, designation),
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
           latitude = COALESCE(?, latitude),
           longitude = COALESCE(?, longitude),
           preferred_location = COALESCE(?, preferred_location),
           is_profile_completed = ?
       WHERE user_id = ?`,
      updateParams
    );

    const updated = await query('SELECT * FROM teacher_profiles WHERE user_id = ?', [userId]);

    // Save user-entered qualifications into qualification_suggestions for community autocomplete
    if (Array.isArray(qualificationsData)) {
      for (const item of qualificationsData) {
        if (item.degree && item.degree.trim()) {
          await query(
            `INSERT INTO qualification_suggestions (type, name, use_count) 
             VALUES ('degree', ?, 1) 
             ON DUPLICATE KEY UPDATE use_count = use_count + 1`,
            [item.degree.trim()]
          ).catch(() => {});
        }
        if (item.institute && item.institute.trim()) {
          await query(
            `INSERT INTO qualification_suggestions (type, name, use_count) 
             VALUES ('institute', ?, 1) 
             ON DUPLICATE KEY UPDATE use_count = use_count + 1`,
            [item.institute.trim()]
          ).catch(() => {});
        }
        if (item.board && item.board.trim()) {
          await query(
            `INSERT INTO qualification_suggestions (type, name, use_count) 
             VALUES ('university', ?, 1) 
             ON DUPLICATE KEY UPDATE use_count = use_count + 1`,
            [item.board.trim()]
          ).catch(() => {});
        }
      }
    }

    // Auto-link teacher to school_staff for registered schools
    const row = updated[0];
    const teacherId = row.id;
    const teacherCategory = row.post_type || 'Teaching Staff';
    const teacherDesignation = row.designation || 'Educator';
    const teacherSubject = row.primary_subject || 'General';

    const parseHelper = (val) => {
      if (!val) return null;
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch { return null; }
    };

    // 1. Current Job sync
    const parsedCurrentJob = parseHelper(currentJobData);
    if (parsedCurrentJob && parsedCurrentJob.isWorkingNow) {
      let matchedSchoolId = parsedCurrentJob.schoolId || null;
      if (!matchedSchoolId && parsedCurrentJob.schoolName) {
        const matches = await query(
          'SELECT id FROM school_profiles WHERE LOWER(TRIM(school_name)) = LOWER(TRIM(?)) LIMIT 1',
          [parsedCurrentJob.schoolName]
        );
        if (matches.length > 0) matchedSchoolId = matches[0].id;
      }
      if (matchedSchoolId) {
        await query(
          `INSERT INTO school_staff (school_id, teacher_id, status, category, designation, subject, from_year)
           VALUES (?, ?, 'current', ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE status = 'current', designation = VALUES(designation), subject = VALUES(subject), from_year = VALUES(from_year)`,
          [
            matchedSchoolId,
            teacherId,
            teacherCategory,
            parsedCurrentJob.designation || teacherDesignation,
            parsedCurrentJob.subject || teacherSubject,
            parsedCurrentJob.joiningDate || parsedCurrentJob.joinedYear || 'Current'
          ]
        ).catch((e) => console.warn('School staff current sync notice:', e.message));
      }
    }

    // 2. Previous Jobs sync
    const parsedPrevJobs = Array.isArray(previousJobsData) ? previousJobsData : parseHelper(previousJobsData);
    if (Array.isArray(parsedPrevJobs)) {
      for (const pj of parsedPrevJobs) {
        if (!pj || !pj.schoolName) continue;
        let matchedSchoolId = pj.schoolId || null;
        if (!matchedSchoolId) {
          const matches = await query(
            'SELECT id FROM school_profiles WHERE LOWER(TRIM(school_name)) = LOWER(TRIM(?)) LIMIT 1',
            [pj.schoolName]
          );
          if (matches.length > 0) matchedSchoolId = matches[0].id;
        }
        if (matchedSchoolId) {
          const tenureFrom = pj.fromYear || pj.startDate || '';
          const tenureTo = pj.toYear || pj.endDate || '';
          await query(
            `INSERT INTO school_staff (school_id, teacher_id, status, category, designation, subject, from_year, to_year)
             VALUES (?, ?, 'previous', ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE status = 'previous', designation = VALUES(designation), subject = VALUES(subject), to_year = VALUES(to_year)`,
            [
              matchedSchoolId,
              teacherId,
              teacherCategory,
              pj.designation || teacherDesignation,
              pj.subject || teacherSubject,
              tenureFrom,
              tenureTo
            ]
          ).catch((e) => console.warn('School staff prev sync notice:', e.message));
        }
      }
    }

    const safeParse = (val) => {
      if (!val) return null;
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch (e) { return null; }
    };

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
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
    console.error('updateProfile Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile: ' + error.message
    });
  }
};

const webdavService = require('../services/webdav.service');

// POST /api/v1/teacher/upload-avatar
const uploadAvatar = async (req, res) => {
  try {
    const userId = req.user.id;
    let avatarUrl = '';

    if (req.file) {
      const buffer = fs.readFileSync(req.file.path);
      avatarUrl = await webdavService.uploadFile('avatars', req.file.filename, buffer, req.file.mimetype);
    } else if (req.body.avatarBase64) {
      const base64Data = req.body.avatarBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `avatar-${userId}-${Date.now()}.jpg`;
      avatarUrl = await webdavService.uploadFile('avatars', filename, buffer, 'image/jpeg');
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

    const buffer = fs.readFileSync(req.file.path);
    const resumeUrl = await webdavService.uploadFile('resumes', req.file.filename, buffer, req.file.mimetype);
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

// GET /api/v1/teacher/qualification-suggestions?type=university&q=Maha
const getQualificationSuggestions = async (req, res) => {
  try {
    const { type = 'university', q = '' } = req.query;
    const cleanQ = (q || '').trim();

    if (!cleanQ) {
      const rows = await query(
        `SELECT name FROM qualification_suggestions 
         WHERE type = ? 
         ORDER BY use_count DESC, name ASC 
         LIMIT 15`,
        [type]
      );
      return res.status(200).json({
        success: true,
        data: rows.map((r) => r.name)
      });
    }

    const rows = await query(
      `SELECT name FROM qualification_suggestions 
       WHERE type = ? AND name LIKE ? 
       ORDER BY 
         CASE WHEN name LIKE ? THEN 1 ELSE 2 END,
         use_count DESC, 
         name ASC 
       LIMIT 15`,
      [type, `%${cleanQ}%`, `${cleanQ}%`]
    );

    return res.status(200).json({
      success: true,
      data: rows.map((r) => r.name)
    });
  } catch (error) {
    console.error('getQualificationSuggestions Error:', error);
    return res.status(200).json({
      success: true,
      data: []
    });
  }
};

// GET /api/v1/teacher/network-jobs
const getNetworkJobs = async (req, res) => {
  try {
    const userId = req.user.id;
    const teacherRows = await query('SELECT * FROM teacher_profiles WHERE user_id = ?', [userId]);
    if (teacherRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Teacher profile not found.' });
    }
    const teacher = teacherRows[0];

    const teacherCity = teacher.current_city || '';
    const teacherState = teacher.current_state || '';
    const teacherSubject = teacher.primary_subject || '';

    // 1. Followed schools' jobs
    const followedJobs = await query(
      `SELECT 
         j.id, j.title, j.designation, j.subject, j.salary_min, j.salary_max, j.job_type, j.openings,
         j.city, j.state, j.created_at,
         s.id AS school_id, s.school_name, s.logo_url AS school_logo, s.board, s.is_verified,
         1 AS is_followed
       FROM jobs j
       JOIN school_profiles s ON j.school_id = s.id
       JOIN follows f ON (f.target_type = 'school' AND f.target_id = s.id AND f.follower_user_id = ?)
       WHERE j.status = 'active'
       ORDER BY j.created_at DESC
       LIMIT 30`,
      [userId]
    );

    // 2. Nearby jobs (matching city or state)
    const nearbyJobs = await query(
      `SELECT 
         j.id, j.title, j.designation, j.subject, j.salary_min, j.salary_max, j.job_type, j.openings,
         j.city, j.state, j.created_at,
         s.id AS school_id, s.school_name, s.logo_url AS school_logo, s.board, s.is_verified,
         CASE WHEN EXISTS (
           SELECT 1 FROM follows f WHERE f.target_type = 'school' AND f.target_id = s.id AND f.follower_user_id = ?
         ) THEN 1 ELSE 0 END AS is_followed
       FROM jobs j
       JOIN school_profiles s ON j.school_id = s.id
       WHERE j.status = 'active' AND (j.city = ? OR j.state = ?)
       ORDER BY CASE WHEN j.city = ? THEN 1 ELSE 2 END, j.created_at DESC
       LIMIT 30`,
      [userId, teacherCity, teacherState, teacherCity]
    );

    // 3. Recommended jobs (matching subject or designation)
    const recommendedJobs = await query(
      `SELECT 
         j.id, j.title, j.designation, j.subject, j.salary_min, j.salary_max, j.job_type, j.openings,
         j.city, j.state, j.created_at,
         s.id AS school_id, s.school_name, s.logo_url AS school_logo, s.board, s.is_verified,
         CASE WHEN EXISTS (
           SELECT 1 FROM follows f WHERE f.target_type = 'school' AND f.target_id = s.id AND f.follower_user_id = ?
         ) THEN 1 ELSE 0 END AS is_followed
       FROM jobs j
       JOIN school_profiles s ON j.school_id = s.id
       WHERE j.status = 'active' AND (j.subject LIKE ? OR j.designation LIKE ?)
       ORDER BY j.created_at DESC
       LIMIT 30`,
      [userId, `%${teacherSubject}%`, `%${teacher.designation || ''}%`]
    );

    return res.status(200).json({
      success: true,
      data: {
        followedJobs,
        nearbyJobs,
        recommendedJobs,
        teacherLocation: { city: teacherCity, state: teacherState }
      }
    });
  } catch (error) {
    console.error('getNetworkJobs Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve jobs.'
    });
  }
};

// GET /api/v1/teacher/public/:id
const getPublicTeacherProfile = async (req, res) => {
  try {
    const teacherId = parseInt(req.params.id, 10);
    const rows = await query('SELECT * FROM teacher_profiles WHERE id = ?', [teacherId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Teacher profile not found.' });
    }
    const t = rows[0];

    const safeParse = (val) => {
      if (!val) return null;
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch (e) { return null; }
    };

    let isFollowing = false;
    if (req.user?.id) {
      const followCheck = await query(
        'SELECT id FROM follows WHERE follower_user_id = ? AND target_type = "teacher" AND target_id = ?',
        [req.user.id, teacherId]
      );
      isFollowing = followCheck.length > 0;
    }

    const followerRows = await query(
      'SELECT COUNT(*) as count FROM follows WHERE target_type = "teacher" AND target_id = ?',
      [teacherId]
    );

    return res.status(200).json({
      success: true,
      data: {
        id: t.id,
        fullName: t.full_name,
        avatarUrl: t.avatar_url,
        postType: t.post_type,
        designation: t.designation,
        primarySubject: t.primary_subject,
        secondarySubjects: t.secondary_subjects,
        highestQualification: t.highest_qualification,
        specialization: t.specialization,
        experienceYears: t.experience_years,
        currentCity: t.current_city,
        currentState: t.current_state,
        bio: t.bio,
        qualificationsData: safeParse(t.qualifications_data),
        previousJobsData: safeParse(t.previous_jobs_data),
        currentJobData: safeParse(t.current_job_data),
        isProfileCompleted: !!t.is_profile_completed,
        isFollowing,
        followerCount: followerRows[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('getPublicTeacherProfile Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve teacher profile.' });
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
  getTeacherDashboard,
  getQualificationSuggestions,
  getNetworkJobs,
  getPublicTeacherProfile
};

