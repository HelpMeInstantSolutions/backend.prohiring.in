const { query } = require('../config/database');
const { expireOldJobs } = require('../services/jobExpiry.service');

// GET /api/v1/jobs (Public with advanced filtering, GPS distance & pagination)
const getPublicJobs = async (req, res) => {
  try {
    // Run auto-expiration check
    await expireOldJobs();

    const {
      search,
      subject,
      city,
      designation,
      jobType,
      minSalary,
      page = 1,
      limit = 10,
      sort = 'newest',
      lat,
      lng,
      radius
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const conditions = ["j.status = 'active'"];
    const baseParams = [];

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const hasCoords = !isNaN(userLat) && !isNaN(userLng);

    const haversineFormula = hasCoords
      ? `(6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(?)) * cos(radians(s.latitude)) *
            cos(radians(s.longitude) - radians(?)) +
            sin(radians(?)) * sin(radians(s.latitude))
          ))
        ))`
      : null;

    if (search) {
      conditions.push('(j.title LIKE ? OR j.description LIKE ? OR s.school_name LIKE ?)');
      const term = `%${search.trim()}%`;
      baseParams.push(term, term, term);
    }

    if (subject) {
      conditions.push('j.subject = ?');
      baseParams.push(subject.trim());
    }

    if (city) {
      conditions.push('j.city LIKE ?');
      baseParams.push(`%${city.trim()}%`);
    }

    if (designation) {
      conditions.push('j.designation = ?');
      baseParams.push(designation.trim());
    }

    if (jobType) {
      conditions.push('j.job_type = ?');
      baseParams.push(jobType.trim());
    }

    if (minSalary) {
      conditions.push('j.salary_max >= ?');
      baseParams.push(parseInt(minSalary, 10));
    }

    const countParams = [...baseParams];
    const dataParams = [];

    // Optional radius filter
    const maxRadius = parseFloat(radius);
    if (hasCoords && !isNaN(maxRadius) && maxRadius > 0) {
      conditions.push(`s.latitude IS NOT NULL AND s.longitude IS NOT NULL AND ${haversineFormula} <= ?`);
      countParams.push(userLat, userLng, userLat, maxRadius);
    }

    const whereClause = conditions.join(' AND ');

    // Sort order
    let orderClause = 'ORDER BY j.created_at DESC';
    if (sort === 'salary_high') orderClause = 'ORDER BY j.salary_max DESC';
    if (sort === 'salary_low') orderClause = 'ORDER BY j.salary_min ASC';
    if (sort === 'nearest' && hasCoords) {
      orderClause = 'ORDER BY (CASE WHEN distance_km IS NULL THEN 1 ELSE 0 END), distance_km ASC, j.created_at DESC';
    }

    // Count query
    const countSql = `
      SELECT COUNT(*) as total 
      FROM jobs j
      JOIN school_profiles s ON j.school_id = s.id
      WHERE ${whereClause}
    `;
    const countResult = await query(countSql, countParams);
    const totalJobs = countResult[0].total;

    // Build params for data query:
    // If hasCoords, haversine in SELECT requires 3 parameters
    if (hasCoords) {
      dataParams.push(userLat, userLng, userLat);
    }
    dataParams.push(...baseParams);
    if (hasCoords && !isNaN(maxRadius) && maxRadius > 0) {
      dataParams.push(userLat, userLng, userLat, maxRadius);
    }

    // Data query
    const dataSql = `
      SELECT 
        j.id, j.share_code, j.title, j.designation, j.subject, j.qualification_required, 
        j.experience_required, j.salary_min, j.salary_max, j.salary_negotiable, 
        j.job_type, j.openings, j.city, j.state, j.deadline, j.created_at, j.poster_url,
        j.interview_time, j.venue,
        s.id as school_id, s.school_name, s.logo_url as school_logo, s.board, s.is_verified, s.slug as school_slug,
        s.latitude as school_latitude, s.longitude as school_longitude, s.address as school_address,
        ${hasCoords ? `${haversineFormula} AS distance_km` : 'NULL AS distance_km'}
      FROM jobs j
      JOIN school_profiles s ON j.school_id = s.id
      WHERE ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const jobs = await query(dataSql, [...dataParams, parseInt(limit, 10), parseInt(offset, 10)]);

    return res.status(200).json({
      success: true,
      data: {
        total: totalJobs,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(totalJobs / parseInt(limit, 10)),
        jobs
      }
    });
  } catch (error) {
    console.error('getPublicJobs Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch job postings.'
    });
  }
};

// GET /api/v1/jobs/featured
const getFeaturedJobs = async (req, res) => {
  try {
    const sql = `
      SELECT 
        j.id, j.share_code, j.title, j.designation, j.subject, j.qualification_required, 
        j.experience_required, j.salary_min, j.salary_max, j.salary_negotiable, 
        j.job_type, j.city, j.state, j.created_at, j.poster_url, j.interview_time, j.venue,
        s.school_name, s.logo_url as school_logo, s.board, s.slug as school_slug,
        s.latitude as school_latitude, s.longitude as school_longitude
      FROM jobs j
      JOIN school_profiles s ON j.school_id = s.id
      WHERE j.status = 'active'
      ORDER BY j.created_at DESC
      LIMIT 6
    `;
    const jobs = await query(sql);

    return res.status(200).json({
      success: true,
      data: jobs
    });
  } catch (error) {
    console.error('getFeaturedJobs Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch featured jobs.'
    });
  }
};

// GET /api/v1/jobs/:id (Job Details by numeric id or random alphanumeric share_code)
const getJobById = async (req, res) => {
  try {
    const jobId = req.params.id;

    const sql = `
      SELECT 
        j.*,
        s.school_name, s.logo_url as school_logo, s.banner_url as school_banner,
        s.board, s.website as school_website, s.about as school_about, 
        s.city as school_city, s.state as school_state, s.is_verified, s.slug as school_slug,
        s.latitude as school_latitude, s.longitude as school_longitude,
        s.address as school_address, s.maps_url as school_maps_url
      FROM jobs j
      JOIN school_profiles s ON j.school_id = s.id
      WHERE j.id = ? OR j.share_code = ?
    `;

    const rows = await query(sql, [jobId, jobId]);
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job vacancy not found.'
      });
    }

    const job = rows[0];

    // Fetch similar vacancies
    const similarSql = `
      SELECT j.id, j.title, j.designation, j.subject, j.salary_min, j.salary_max, j.city, s.school_name, s.logo_url as school_logo
      FROM jobs j
      JOIN school_profiles s ON j.school_id = s.id
      WHERE j.id != ? AND (j.subject = ? OR j.designation = ?) AND j.status = 'active'
      ORDER BY j.created_at DESC
      LIMIT 4
    `;
    const similarJobs = await query(similarSql, [job.id, job.subject, job.designation]);

    return res.status(200).json({
      success: true,
      data: {
        job,
        similarJobs
      }
    });
  } catch (error) {
    console.error('getJobById Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve job details.'
    });
  }
};

module.exports = {
  getPublicJobs,
  getFeaturedJobs,
  getJobById
};
