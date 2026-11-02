const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');
const webdavService = require('../services/webdav.service');
const { dispatchEmail } = require('../services/otp.service');
const notificationService = require('../services/notification.service');

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
      about,
      establishedYear,
      institutionType,
      facilities,
      studentCount,
      facultyCount,
      socialLinks,
      campusPhotos,
      latitude,
      longitude,
      mapsUrl,
      maps_url,
      bannerUrl,
      banner_url
    } = req.body;

    const serialize = (val) => {
      if (val === undefined || val === null) return null;
      if (typeof val === 'string') return val;
      return JSON.stringify(val);
    };

    const finalMapsUrl = mapsUrl || maps_url || null;
    const finalBannerUrl = bannerUrl || banner_url || null;

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
           about = COALESCE(?, about),
           established_year = COALESCE(?, established_year),
           institution_type = COALESCE(?, institution_type),
           facilities = COALESCE(?, facilities),
           student_count = COALESCE(?, student_count),
           faculty_count = COALESCE(?, faculty_count),
           social_links = COALESCE(?, social_links),
           campus_photos = COALESCE(?, campus_photos),
           latitude = COALESCE(?, latitude),
           longitude = COALESCE(?, longitude),
           maps_url = COALESCE(?, maps_url),
           banner_url = COALESCE(?, banner_url)
       WHERE user_id = ?`,
      [
        schoolName, board, registrationNumber, contactPerson, phone, address, city, state, pincode, website, about,
        establishedYear ? parseInt(establishedYear, 10) : null,
        institutionType,
        serialize(facilities),
        studentCount,
        facultyCount,
        serialize(socialLinks),
        serialize(campusPhotos),
        latitude !== undefined ? latitude : null,
        longitude !== undefined ? longitude : null,
        finalMapsUrl,
        finalBannerUrl,
        userId
      ]
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
    const userId = req.user.id;
    let logoUrl = '';

    const existingRows = await query('SELECT logo_url FROM school_profiles WHERE user_id = ?', [userId]);
    const oldLogoUrl = existingRows[0]?.logo_url;

    if (req.file) {
      const buffer = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);
      if (!buffer) {
        return res.status(400).json({ success: false, message: 'Invalid or empty logo file provided.' });
      }
      const ext = path.extname(req.file.originalname || '') || '.png';
      const filename = req.file.filename || `logo-${userId}-${Date.now()}${ext}`;
      logoUrl = await webdavService.uploadFile('logos', filename, buffer, req.file.mimetype || 'image/png');
    } else if (req.body?.logoBase64) {
      const base64Data = req.body.logoBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `logo-${userId}-${Date.now()}.png`;
      logoUrl = await webdavService.uploadFile('logos', filename, buffer, 'image/png');
    } else {
      return res.status(400).json({
        success: false,
        message: 'No logo file or base64 image data provided.'
      });
    }

    await query('UPDATE school_profiles SET logo_url = ? WHERE user_id = ?', [logoUrl, userId]);

    // Clean up old logo from disk & WebDAV
    if (oldLogoUrl && oldLogoUrl !== logoUrl) {
      webdavService.deleteByUrl(oldLogoUrl).catch((e) => console.warn('Old logo cleanup notice:', e.message));
    }

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

// POST /api/v1/school/upload-banner
const uploadBanner = async (req, res) => {
  try {
    const userId = req.user.id;
    let bannerUrl = '';

    const existingRows = await query('SELECT banner_url FROM school_profiles WHERE user_id = ?', [userId]);
    const oldBannerUrl = existingRows[0]?.banner_url;

    if (req.file) {
      const buffer = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);
      if (!buffer) {
        return res.status(400).json({ success: false, message: 'Invalid or empty banner file provided.' });
      }
      const ext = path.extname(req.file.originalname || '') || '.jpg';
      const filename = req.file.filename || `banner-${userId}-${Date.now()}${ext}`;
      bannerUrl = await webdavService.uploadFile('schools', filename, buffer, req.file.mimetype || 'image/jpeg');
    } else if (req.body?.bannerBase64) {
      const base64Data = req.body.bannerBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `banner-${userId}-${Date.now()}.jpg`;
      bannerUrl = await webdavService.uploadFile('schools', filename, buffer, 'image/jpeg');
    } else {
      return res.status(400).json({
        success: false,
        message: 'No banner image file or base64 data provided.'
      });
    }

    await query('UPDATE school_profiles SET banner_url = ? WHERE user_id = ?', [bannerUrl, userId]);

    // Clean up old banner from disk & WebDAV
    if (oldBannerUrl && oldBannerUrl !== bannerUrl) {
      webdavService.deleteByUrl(oldBannerUrl).catch((e) => console.warn('Old banner cleanup notice:', e.message));
    }

    return res.status(200).json({
      success: true,
      message: 'Campus banner uploaded successfully.',
      data: { bannerUrl }
    });
  } catch (error) {
    console.error('uploadBanner Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload banner.'
    });
  }
};

// POST /api/v1/school/jobs
const postJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const schoolRows = await query('SELECT id, is_verified, city, state FROM school_profiles WHERE user_id = ?', [userId]);
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

    const jobCity = (city || school.city || '').trim();
    const jobState = (state || school.state || '').trim();

    if (!title || !designation || !subject || !description || !jobCity || !jobState) {
      return res.status(400).json({
        success: false,
        message: 'Title, designation, subject, description, and school location (city and state) are mandatory.'
      });
    }

    const crypto = require('crypto');
    const shareCode = crypto.randomBytes(4).toString('hex');

    const result = await query(
      `INSERT INTO jobs 
       (school_id, title, designation, subject, qualification_required, experience_required, salary_min, salary_max, salary_negotiable, job_type, openings, description, responsibilities, benefits, city, state, deadline, status, share_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        jobCity,
        jobState,
        deadline || null,
        'active',
        shareCode
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Vacancy posted successfully!',
      data: { jobId: result.insertId, shareCode }
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
        COUNT(a.id) as applicant_count,
        COUNT(a.id) as applicants_count,
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
        a.id as application_id,
        a.*,
        t.id as teacher_profile_id,
        t.*,
        COALESCE(t.id, a.teacher_id) as teacher_id, 
        COALESCE(t.full_name, u.email, 'Candidate') as candidate_name, 
        COALESCE(t.full_name, u.email, 'Candidate') as full_name, 
        COALESCE(t.phone, u.phone, '') as candidate_phone, 
        COALESCE(t.phone, u.phone, '') as phone, 
        COALESCE(u.email, '') as candidate_email,
        COALESCE(u.email, '') as teacher_email
      FROM job_applications a
      LEFT JOIN teacher_profiles t ON (a.teacher_id = t.id OR a.teacher_id = t.user_id)
      LEFT JOIN users u ON (t.user_id = u.id OR a.teacher_id = u.id)
      WHERE a.job_id = ?
      ORDER BY a.id DESC
    `;

    const rawRows = await query(sql, [jobId]);

    const applicants = (rawRows || []).map((r) => ({
      ...r,
      id: r.application_id || r.id,
      application_id: r.application_id || r.id,
      status: r.status || 'applied',
      application_status: r.status || 'applied',
      applied_at: r.applied_at || r.created_at || new Date().toISOString(),
      candidate_name: r.candidate_name || r.full_name || 'Candidate',
      candidate_headline: r.headline || r.highest_qualification || 'Educator',
      teaching_levels: r.teaching_levels || r.post_type || r.designation || '',
      candidate_email: r.candidate_email || r.teacher_email || '',
      candidate_phone: r.candidate_phone || r.phone || ''
    }));

    return res.status(200).json({
      success: true,
      data: {
        job: jobCheck[0],
        applicants,
        totalApplicants: applicants.length
      }
    });
  } catch (error) {
    console.error('getJobApplicants Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve applicants: ' + error.message
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
      `SELECT a.id, a.teacher_id, j.title as job_title, s.school_name, COALESCE(t.user_id, a.teacher_id) as teacher_user_id
       FROM job_applications a
       JOIN jobs j ON a.job_id = j.id
       JOIN school_profiles s ON j.school_id = s.id
       LEFT JOIN teacher_profiles t ON (a.teacher_id = t.id OR a.teacher_id = t.user_id)
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
        COALESCE(t.full_name, u.email, 'Candidate') as teacher_name, 
        t.highest_qualification, 
        t.experience_years, 
        t.primary_subject
       FROM job_applications a
       JOIN jobs j ON a.job_id = j.id
       LEFT JOIN teacher_profiles t ON (a.teacher_id = t.id OR a.teacher_id = t.user_id)
       LEFT JOIN users u ON (t.user_id = u.id OR a.teacher_id = u.id)
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

// GET /api/v1/school/search?q=...&city=...
const searchSchools = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const city = (req.query.city || '').trim();

    let sql = `
      SELECT id, school_name, board, city, state, logo_url, is_verified, verification_status
      FROM school_profiles
      WHERE 1=1
    `;
    const params = [];
    if (q) {
      sql += ' AND (school_name LIKE ? OR city LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    if (city) {
      sql += ' AND city LIKE ?';
      params.push(`%${city}%`);
    }
    sql += ' ORDER BY is_verified DESC, school_name ASC LIMIT 25';

    const rows = await query(sql, params);
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('searchSchools Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to search schools.' });
  }
};

// GET /api/v1/school/public/:id (Accepts numeric ID or SEO slug)
const getPublicSchoolProfile = async (req, res) => {
  try {
    const identifier = req.params.id;
    let rows = [];
    if (/^\d+$/.test(identifier)) {
      rows = await query('SELECT * FROM school_profiles WHERE id = ? OR slug = ?', [parseInt(identifier, 10), identifier]);
    } else {
      rows = await query('SELECT * FROM school_profiles WHERE slug = ?', [identifier]);
    }

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }
    const school = rows[0];
    const schoolId = school.id;

    const safeParse = (val, fallback) => {
      if (!val) return fallback;
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch { return fallback; }
    };
    school.facilities = safeParse(school.facilities, []);
    school.campus_photos = safeParse(school.campus_photos, []);
    school.social_links = safeParse(school.social_links, {});

    // Active vacancies
    const activeJobs = await query(
      `SELECT id, title, designation, subject, salary_min, salary_max, job_type, openings, city, state, created_at
       FROM jobs 
       WHERE school_id = ? AND status = 'active'
       ORDER BY created_at DESC`,
      [schoolId]
    );

    // Follower count & follow state
    const followerRows = await query(
      'SELECT COUNT(*) as count FROM follows WHERE target_type = "school" AND target_id = ?',
      [schoolId]
    );

    let isFollowing = false;
    if (req.user?.id) {
      const followCheck = await query(
        'SELECT id FROM follows WHERE follower_user_id = ? AND target_type = "school" AND target_id = ?',
        [req.user.id, schoolId]
      );
      isFollowing = followCheck.length > 0;
    }

    // Staff summary
    const staffCountRows = await query(
      `SELECT 
         SUM(CASE WHEN status = 'current' THEN 1 ELSE 0 END) as current_count,
         SUM(CASE WHEN status = 'previous' THEN 1 ELSE 0 END) as previous_count
       FROM school_staff WHERE school_id = ?`,
      [schoolId]
    );

    return res.status(200).json({
      success: true,
      data: {
        school,
        activeJobs,
        stats: {
          followersCount: followerRows[0]?.count || 0,
          currentStaffCount: staffCountRows[0]?.current_count || 0,
          previousStaffCount: staffCountRows[0]?.previous_count || 0,
          activeJobsCount: activeJobs.length
        },
        isFollowing
      }
    });
  } catch (err) {
    console.error('getPublicSchoolProfile Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve school profile.' });
  }
};

// GET /api/v1/school/:id/staff (Supports numeric ID or slug)
const getSchoolStaff = async (req, res) => {
  try {
    const identifier = req.params.id;
    let schoolId = parseInt(identifier, 10);
    if (isNaN(schoolId) || !/^\d+$/.test(identifier)) {
      const schoolRows = await query('SELECT id FROM school_profiles WHERE slug = ? LIMIT 1', [identifier]);
      if (!schoolRows.length) {
        return res.status(404).json({ success: false, message: 'School not found.' });
      }
      schoolId = schoolRows[0].id;
    }

    const staffRows = await query(
      `SELECT 
         ss.id,
         ss.school_id,
         ss.teacher_id,
         ss.status,
         ss.category,
         ss.designation,
         ss.subject,
         ss.from_year,
         ss.to_year,
         ss.is_verified_by_school,
         tp.full_name,
         tp.avatar_url,
         tp.highest_qualification,
         tp.experience_years,
         tp.primary_subject,
         tp.current_city,
         tp.current_state
       FROM school_staff ss
       JOIN teacher_profiles tp ON ss.teacher_id = tp.id
       WHERE ss.school_id = ?
       ORDER BY 
         CASE WHEN ss.category = 'Leadership' THEN 1
              WHEN ss.category = 'Teaching Staff' THEN 2
              WHEN ss.category = 'Sports & Arts' THEN 3
              ELSE 4 END,
         ss.from_year DESC`,
      [schoolId]
    );

    const currentStaff = staffRows.filter((s) => s.status === 'current');
    const previousStaff = staffRows.filter((s) => s.status === 'previous');

    // Group current staff by category
    const categories = ['Leadership', 'Teaching Staff', 'Sports & Arts', 'Non-Teaching Staff'];
    const currentByCategory = {};
    for (const cat of categories) {
      currentByCategory[cat] = currentStaff.filter((s) => s.category === cat);
    }
    const otherStaff = currentStaff.filter((s) => !categories.includes(s.category));
    if (otherStaff.length > 0) {
      currentByCategory['Other Staff'] = otherStaff;
    }

    return res.status(200).json({
      success: true,
      data: {
        currentStaff,
        currentByCategory,
        previousStaff,
        totalCurrent: currentStaff.length,
        totalPrevious: previousStaff.length
      }
    });
  } catch (err) {
    console.error('getSchoolStaff Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve school staff.' });
  }
};

// POST /api/v1/school/:id/query
const submitSchoolInquiry = async (req, res) => {
  try {
    const schoolParam = req.params.id;
    const { senderName, senderEmail, senderPhone, subject, message } = req.body;

    if (!senderName || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name and message are required to submit an inquiry.'
      });
    }

    // Resolve school profile
    let schoolRows = [];
    if (/^\d+$/.test(schoolParam)) {
      schoolRows = await query(
        `SELECT sp.*, u.email as user_email 
         FROM school_profiles sp 
         JOIN users u ON sp.user_id = u.id 
         WHERE sp.id = ?`,
        [schoolParam]
      );
    } else {
      schoolRows = await query(
        `SELECT sp.*, u.email as user_email 
         FROM school_profiles sp 
         JOIN users u ON sp.user_id = u.id 
         WHERE sp.slug = ? OR sp.id = ?`,
        [schoolParam, schoolParam]
      );
    }

    if (schoolRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'School institution not found.'
      });
    }

    const school = schoolRows[0];
    const senderUserId = req.user ? req.user.id : null;
    const senderRole = req.user ? req.user.role : 'visitor';
    const cleanEmail = senderEmail && typeof senderEmail === 'string' && senderEmail.trim() ? senderEmail.trim() : null;
    const cleanPhone = senderPhone && typeof senderPhone === 'string' && senderPhone.trim() ? senderPhone.trim() : null;

    await query(
      `INSERT INTO school_inquiries 
       (school_id, sender_name, sender_email, sender_phone, subject, message, sender_role, sender_user_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unread')`,
      [
        school.id,
        senderName.trim(),
        cleanEmail,
        cleanPhone,
        subject && subject.trim() ? subject.trim() : 'General Inquiry',
        message.trim(),
        senderRole,
        senderUserId
      ]
    );

    // Dispatch email alert to school's registered email
    const schoolEmail = school.contact_email || school.user_email;
    if (schoolEmail) {
      try {
        const emailSubject = `New Inquiry from ${senderName.trim()} - ProHiring`;
        const emailHtml = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF;">
            <div style="background: linear-gradient(135deg, #4F46E5 0%, #3730A3 100%); padding: 20px; border-radius: 12px; color: #FFFFFF; margin-bottom: 20px;">
              <h2 style="margin: 0; font-size: 20px; font-weight: 700;">New Inquiry Received</h2>
              <p style="margin: 4px 0 0 0; opacity: 0.9; font-size: 13px;">School: ${school.school_name}</p>
            </div>
            <div style="padding: 16px; background-color: #F8FAFC; border-radius: 8px; border: 1px solid #E2E8F0; margin-bottom: 20px;">
              <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>From:</strong> ${senderName.trim()} (${senderRole === 'teacher' ? 'Registered Teacher' : 'Platform Visitor'})</p>
              ${cleanEmail ? `<p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Email:</strong> <a href="mailto:${cleanEmail}">${cleanEmail}</a></p>` : '<p style="margin: 0 0 8px 0; font-size: 14px; color: #64748B;"><strong>Email:</strong> Not provided</p>'}
              ${cleanPhone ? `<p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Phone:</strong> ${cleanPhone}</p>` : ''}
              ${subject ? `<p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Subject:</strong> ${subject.trim()}</p>` : ''}
            </div>
            <div style="padding: 16px; background-color: #FFFFFF; border-radius: 8px; border: 1px solid #E2E8F0; border-left: 4px solid #4F46E5; margin-bottom: 20px;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase;">Message Content</p>
              <p style="margin: 0; font-size: 14px; color: #1E293B; line-height: 1.6; white-space: pre-wrap;">${message.trim()}</p>
            </div>
            <p style="font-size: 12px; color: #64748B; margin: 0; text-align: center;">
              You can review and manage this inquiry in your <a href="https://prohiring.in/school/dashboard" style="color: #4F46E5; font-weight: 600;">School Recruiter Dashboard</a>.
            </p>
          </div>
        `;
        await dispatchEmail(schoolEmail, null, emailSubject, emailHtml);
      } catch (emailErr) {
        console.warn('[School Inquiry] Failed to send email alert:', emailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Your inquiry has been submitted successfully to the institution.'
    });
  } catch (error) {
    console.error('submitSchoolInquiry Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit inquiry. Please try again later.'
    });
  }
};

// GET /api/v1/school/inquiries
const getSchoolInquiries = async (req, res) => {
  try {
    const userId = req.user.id;
    const schoolRows = await query('SELECT id FROM school_profiles WHERE user_id = ?', [userId]);
    if (schoolRows.length === 0) {
      return res.status(404).json({ success: false, message: 'School profile not found.' });
    }

    const schoolId = schoolRows[0].id;
    const inquiries = await query(
      `SELECT * FROM school_inquiries WHERE school_id = ? ORDER BY created_at DESC`,
      [schoolId]
    );

    const unreadCount = inquiries.filter((i) => i.status === 'unread').length;

    return res.status(200).json({
      success: true,
      data: inquiries,
      unreadCount
    });
  } catch (error) {
    console.error('getSchoolInquiries Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve inquiries.'
    });
  }
};

// PUT /api/v1/school/inquiries/:id/status
const updateInquiryStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const inquiryId = req.params.id;
    const { status } = req.body;

    const allowedStatuses = ['unread', 'read', 'replied', 'archived'];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid inquiry status.' });
    }

    const schoolRows = await query('SELECT id FROM school_profiles WHERE user_id = ?', [userId]);
    if (schoolRows.length === 0) {
      return res.status(404).json({ success: false, message: 'School profile not found.' });
    }

    const schoolId = schoolRows[0].id;
    await query(
      `UPDATE school_inquiries SET status = ? WHERE id = ? AND school_id = ?`,
      [status, inquiryId, schoolId]
    );

    return res.status(200).json({
      success: true,
      message: 'Inquiry status updated successfully.'
    });
  } catch (error) {
    console.error('updateInquiryStatus Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update inquiry status.'
    });
  }
};

// Helper to check if photo is a server-stored file
const isServerUpload = (url) => {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('/uploads/') || url.includes('backend.prohiring.in') || url.includes('drive2.xhost.co.in');
};

// POST /api/v1/school/upload-campus-photo
const uploadCampusPhoto = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No photo image provided.' });
    }

    const schoolRows = await query('SELECT id, campus_photos FROM school_profiles WHERE user_id = ?', [userId]);
    if (schoolRows.length === 0) {
      return res.status(404).json({ success: false, message: 'School profile not found.' });
    }

    const school = schoolRows[0];
    let photos = [];
    try {
      photos = typeof school.campus_photos === 'string' ? JSON.parse(school.campus_photos || '[]') : (school.campus_photos || []);
      if (!Array.isArray(photos)) photos = [];
    } catch (_) {
      photos = [];
    }

    // 6 photo limit applies only to server-uploaded files; external image links have no limit
    const serverPhotoCount = photos.filter((p) => {
      const u = typeof p === 'string' ? p : (p?.url || '');
      return isServerUpload(u);
    }).length;

    if (serverPhotoCount >= 6) {
      return res.status(400).json({
        success: false,
        message: 'Campus photo gallery is limited to a maximum of 6 uploaded server photos. You can add unlimited photos via external image links, or remove an uploaded photo to make room.'
      });
    }

    const buffer = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);
    if (!buffer) {
      return res.status(400).json({ success: false, message: 'Invalid or empty photo buffer.' });
    }

    const ext = path.extname(req.file.originalname || '') || '.jpg';
    const filename = req.file.filename || `campus-${school.id}-${Date.now()}${ext}`;
    const photoUrl = await webdavService.uploadFile('schools', filename, buffer, req.file.mimetype || 'image/jpeg');

    photos.push(photoUrl);

    await query('UPDATE school_profiles SET campus_photos = ? WHERE id = ?', [JSON.stringify(photos), school.id]);

    return res.status(200).json({
      success: true,
      message: 'Campus photo uploaded successfully.',
      data: {
        photoUrl,
        campusPhotos: photos
      }
    });
  } catch (error) {
    console.error('uploadCampusPhoto Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload campus photo.'
    });
  }
};

// POST /api/v1/school/add-campus-link
// Adds external image URLs with NO limit
const addCampusPhotoLink = async (req, res) => {
  try {
    const userId = req.user.id;
    const { url } = req.body;
    if (!url || typeof url !== 'string' || !url.trim().match(/^https?:\/\/.+/i)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid image URL starting with http:// or https://'
      });
    }
    const cleanUrl = url.trim();

    const schoolRows = await query('SELECT id, campus_photos FROM school_profiles WHERE user_id = ?', [userId]);
    if (schoolRows.length === 0) {
      return res.status(404).json({ success: false, message: 'School profile not found.' });
    }

    const school = schoolRows[0];
    let photos = [];
    try {
      photos = typeof school.campus_photos === 'string' ? JSON.parse(school.campus_photos || '[]') : (school.campus_photos || []);
      if (!Array.isArray(photos)) photos = [];
    } catch (_) {
      photos = [];
    }

    // Unlimited external links allowed!
    photos.push(cleanUrl);

    await query('UPDATE school_profiles SET campus_photos = ? WHERE id = ?', [JSON.stringify(photos), school.id]);

    return res.status(200).json({
      success: true,
      message: 'External campus photo link added successfully!',
      data: {
        photoUrl: cleanUrl,
        campusPhotos: photos
      }
    });
  } catch (error) {
    console.error('addCampusPhotoLink Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add campus photo link.'
    });
  }
};

// DELETE /api/v1/school/campus-photos/:index
const deleteCampusPhoto = async (req, res) => {
  try {
    const userId = req.user.id;
    const photoIndex = parseInt(req.params.index, 10);

    const schoolRows = await query('SELECT id, campus_photos FROM school_profiles WHERE user_id = ?', [userId]);
    if (schoolRows.length === 0) {
      return res.status(404).json({ success: false, message: 'School profile not found.' });
    }

    const school = schoolRows[0];
    let photos = [];
    try {
      photos = typeof school.campus_photos === 'string' ? JSON.parse(school.campus_photos || '[]') : (school.campus_photos || []);
      if (!Array.isArray(photos)) photos = [];
    } catch (_) {
      photos = [];
    }

    if (isNaN(photoIndex) || photoIndex < 0 || photoIndex >= photos.length) {
      return res.status(400).json({ success: false, message: 'Invalid photo index specified.' });
    }

    const removedItem = photos.splice(photoIndex, 1)[0];
    const removedUrl = typeof removedItem === 'string' ? removedItem : (removedItem?.url || '');

    if (removedUrl && isServerUpload(removedUrl)) {
      webdavService.deleteByUrl(removedUrl).catch((e) => console.warn('Campus photo cleanup notice:', e.message));
    }

    await query('UPDATE school_profiles SET campus_photos = ? WHERE id = ?', [JSON.stringify(photos), school.id]);

    return res.status(200).json({
      success: true,
      message: 'Campus photo deleted successfully.',
      data: {
        campusPhotos: photos
      }
    });
  } catch (error) {
    console.error('deleteCampusPhoto Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete campus photo.'
    });
  }
};

// GET /api/v1/school/my-staff
// Retrieve current and previous working faculty for the logged-in school
const getMyStaff = async (req, res) => {
  try {
    const userId = req.user.id;
    const schoolRows = await query('SELECT id, school_name, slug FROM school_profiles WHERE user_id = ?', [userId]);
    if (schoolRows.length === 0) {
      return res.status(404).json({ success: false, message: 'School profile not found.' });
    }

    const school = schoolRows[0];

    const staffRows = await query(
      `SELECT 
         ss.id as staff_id,
         ss.school_id,
         ss.teacher_id,
         ss.status,
         ss.category,
         ss.designation,
         ss.subject,
         ss.from_year,
         ss.to_year,
         ss.is_verified_by_school,
         ss.is_disputed,
         ss.dispute_reason,
         ss.disputed_at,
         tp.id as teacher_profile_id,
         tp.user_id as teacher_user_id,
         tp.full_name,
         tp.avatar_url,
         tp.highest_qualification,
         tp.experience_years,
         tp.primary_subject,
         tp.current_city,
         tp.current_state,
         tp.phone as teacher_phone,
         u.email as teacher_email
       FROM school_staff ss
       JOIN teacher_profiles tp ON ss.teacher_id = tp.id
       JOIN users u ON tp.user_id = u.id
       WHERE ss.school_id = ?
       ORDER BY 
         ss.is_disputed ASC,
         CASE WHEN ss.category = 'Leadership' THEN 1
              WHEN ss.category = 'Teaching Staff' THEN 2
              WHEN ss.category = 'Sports & Arts' THEN 3
              ELSE 4 END,
         ss.from_year DESC`,
      [school.id]
    );

    const currentStaff = staffRows.filter((s) => s.status === 'current');
    const previousStaff = staffRows.filter((s) => s.status === 'previous');
    const disputedStaff = staffRows.filter((s) => Boolean(s.is_disputed));

    return res.status(200).json({
      success: true,
      data: {
        school,
        currentStaff,
        previousStaff,
        disputedStaff,
        totalCurrent: currentStaff.length,
        totalPrevious: previousStaff.length,
        totalDisputed: disputedStaff.length,
        totalStaff: staffRows.length
      }
    });
  } catch (error) {
    console.error('getMyStaff Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve staff directory.'
    });
  }
};

// POST /api/v1/school/staff/:staffId/dispute
// School can report a staff claim as false or misleading
const disputeStaff = async (req, res) => {
  try {
    const userId = req.user.id;
    const staffId = req.params.staffId;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A clear reason is required to dispute or report this staff claim.'
      });
    }

    const schoolRows = await query('SELECT id, school_name FROM school_profiles WHERE user_id = ?', [userId]);
    if (schoolRows.length === 0) {
      return res.status(404).json({ success: false, message: 'School profile not found.' });
    }

    const school = schoolRows[0];

    const staffRows = await query(
      `SELECT ss.*, tp.full_name as teacher_name 
       FROM school_staff ss 
       JOIN teacher_profiles tp ON ss.teacher_id = tp.id 
       WHERE ss.id = ? AND ss.school_id = ?`,
      [staffId, school.id]
    );

    if (staffRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Staff member record not found or does not belong to your institution.'
      });
    }

    const staffMember = staffRows[0];

    await query(
      `UPDATE school_staff 
       SET is_disputed = 1, 
           dispute_reason = ?, 
           disputed_at = NOW(), 
           disputed_by_school_id = ? 
       WHERE id = ?`,
      [reason.trim(), school.id, staffId]
    );

    // Notify administrators about the dispute
    notificationService.notifyStaffDisputed({
      schoolName: school.school_name,
      teacherName: staffMember.teacher_name,
      reason: reason.trim(),
      staffId
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Staff claim reported to Platform Administrators for verification and removal.',
      data: {
        staffId,
        isDisputed: true,
        disputeReason: reason.trim()
      }
    });
  } catch (error) {
    console.error('disputeStaff Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit staff dispute.'
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  uploadLogo,
  uploadBanner,
  postJob,
  getMyJobs,
  updateJob,
  getJobApplicants,
  updateApplicationStatus,
  getSchoolDashboard,
  searchSchools,
  getPublicSchoolProfile,
  getSchoolStaff,
  getMyStaff,
  disputeStaff,
  submitSchoolInquiry,
  getSchoolInquiries,
  updateInquiryStatus,
  uploadCampusPhoto,
  addCampusPhotoLink,
  deleteCampusPhoto
};

