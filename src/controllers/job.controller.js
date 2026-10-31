const { query } = require('../config/database');

// GET /api/v1/jobs (Public with advanced filtering & pagination)
const getPublicJobs = async (req, res) => {
  try {
    const {
      search,
      subject,
      city,
      designation,
      jobType,
      minSalary,
      page = 1,
      limit = 10,
      sort = 'newest'
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const conditions = ["j.status = 'active'"];
    const params = [];

    if (search) {
      conditions.push('(j.title LIKE ? OR j.description LIKE ? OR s.school_name LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (subject) {
      conditions.push('j.subject = ?');
      params.push(subject.trim());
    }

    if (city) {
      conditions.push('j.city LIKE ?');
      params.push(`%${city.trim()}%`);
    }

    if (designation) {
      conditions.push('j.designation = ?');
      params.push(designation.trim());
    }

    if (jobType) {
      conditions.push('j.job_type = ?');
      params.push(jobType.trim());
    }

    if (minSalary) {
      conditions.push('j.salary_max >= ?');
      params.push(parseInt(minSalary, 10));
    }

    const whereClause = conditions.join(' AND ');

    let orderClause = 'ORDER BY j.created_at DESC';
    if (sort === 'salary_high') orderClause = 'ORDER BY j.salary_max DESC';
    if (sort === 'salary_low') orderClause = 'ORDER BY j.salary_min ASC';

    // Count query
    const countSql = `
      SELECT COUNT(*) as total 
      FROM jobs j
      JOIN school_profiles s ON j.school_id = s.id
      WHERE ${whereClause}
    `;
    const countResult = await query(countSql, params);
    const totalJobs = countResult[0].total;

    // Data query
    const dataSql = `
      SELECT 
        j.id, j.title, j.designation, j.subject, j.qualification_required, 
        j.experience_required, j.salary_min, j.salary_max, j.salary_negotiable, 
        j.job_type, j.openings, j.city, j.state, j.deadline, j.created_at,
        s.id as school_id, s.school_name, s.logo_url as school_logo, s.board, s.is_verified
      FROM jobs j
      JOIN school_profiles s ON j.school_id = s.id
      WHERE ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const jobs = await query(dataSql, [...params, parseInt(limit, 10), parseInt(offset, 10)]);

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
        j.id, j.title, j.designation, j.subject, j.qualification_required, 
        j.experience_required, j.salary_min, j.salary_max, j.salary_negotiable, 
        j.job_type, j.city, j.state, j.created_at,
        s.school_name, s.logo_url as school_logo, s.board
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

// GET /api/v1/jobs/:id (Job Details)
const getJobById = async (req, res) => {
  try {
    const jobId = req.params.id;

    const sql = `
      SELECT 
        j.*,
        s.school_name, s.logo_url as school_logo, s.banner_url as school_banner,
        s.board, s.website as school_website, s.about as school_about, 
        s.city as school_city, s.state as school_state, s.is_verified
      FROM jobs j
      JOIN school_profiles s ON j.school_id = s.id
      WHERE j.id = ?
    `;

    const rows = await query(sql, [jobId]);
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
