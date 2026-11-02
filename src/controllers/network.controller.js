const { query } = require('../config/database');

/**
 * Follow a school or teacher
 * POST /api/v1/network/follow
 * Body: { targetType: 'school' | 'teacher', targetId: number }
 */
const followTarget = async (req, res) => {
  try {
    const followerUserId = req.user.id;
    const followerRole = req.user.role;
    const { targetType, targetId } = req.body;

    if (followerRole !== 'teacher') {
      return res.status(403).json({
        success: false,
        message: 'Only registered teachers can follow schools or other educators.'
      });
    }

    if (!['school', 'teacher'].includes(targetType) || !targetId) {
      return res.status(400).json({
        success: false,
        message: 'Valid targetType (school|teacher) and targetId are required.'
      });
    }

    // Insert follow relationship
    await query(
      `INSERT INTO follows (follower_user_id, follower_role, target_type, target_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [followerUserId, followerRole, targetType, parseInt(targetId, 10)]
    );

    // Get updated follower count
    const countRows = await query(
      'SELECT COUNT(*) as count FROM follows WHERE target_type = ? AND target_id = ?',
      [targetType, parseInt(targetId, 10)]
    );

    return res.status(200).json({
      success: true,
      message: `Successfully followed ${targetType}.`,
      data: {
        isFollowing: true,
        followerCount: countRows[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('followTarget Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process follow request.'
    });
  }
};

/**
 * Unfollow a school or teacher
 * POST /api/v1/network/unfollow
 * Body: { targetType: 'school' | 'teacher', targetId: number }
 */
const unfollowTarget = async (req, res) => {
  try {
    const followerUserId = req.user.id;
    const { targetType, targetId } = req.body;

    if (!['school', 'teacher'].includes(targetType) || !targetId) {
      return res.status(400).json({
        success: false,
        message: 'Valid targetType (school|teacher) and targetId are required.'
      });
    }

    await query(
      'DELETE FROM follows WHERE follower_user_id = ? AND target_type = ? AND target_id = ?',
      [followerUserId, targetType, parseInt(targetId, 10)]
    );

    const countRows = await query(
      'SELECT COUNT(*) as count FROM follows WHERE target_type = ? AND target_id = ?',
      [targetType, parseInt(targetId, 10)]
    );

    return res.status(200).json({
      success: true,
      message: `Successfully unfollowed ${targetType}.`,
      data: {
        isFollowing: false,
        followerCount: countRows[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('unfollowTarget Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process unfollow request.'
    });
  }
};

/**
 * Get follow status for a specific target
 * GET /api/v1/network/status?targetType=school&targetId=123
 */
const getFollowStatus = async (req, res) => {
  try {
    const followerUserId = req.user?.id;
    const { targetType, targetId } = req.query;

    if (!targetType || !targetId) {
      return res.status(400).json({
        success: false,
        message: 'targetType and targetId are required query parameters.'
      });
    }

    const countRows = await query(
      'SELECT COUNT(*) as count FROM follows WHERE target_type = ? AND target_id = ?',
      [targetType, parseInt(targetId, 10)]
    );

    let isFollowing = false;
    if (followerUserId) {
      const followRows = await query(
        'SELECT id FROM follows WHERE follower_user_id = ? AND target_type = ? AND target_id = ?',
        [followerUserId, targetType, parseInt(targetId, 10)]
      );
      isFollowing = followRows.length > 0;
    }

    return res.status(200).json({
      success: true,
      data: {
        isFollowing,
        followerCount: countRows[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('getFollowStatus Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve follow status.'
    });
  }
};

/**
 * Get list of schools and teachers followed by the current user
 * GET /api/v1/network/following
 */
const getMyFollowing = async (req, res) => {
  try {
    const userId = req.user.id;

    // Followed schools
    const followedSchools = await query(
      `SELECT s.id, s.school_name, s.board, s.city, s.state, s.logo_url, s.is_verified, f.created_at as followed_at
       FROM follows f
       JOIN school_profiles s ON f.target_id = s.id
       WHERE f.follower_user_id = ? AND f.target_type = 'school'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    // Followed teachers
    const followedTeachers = await query(
      `SELECT t.id, t.full_name, t.primary_subject, t.designation, t.current_city, t.current_state, t.avatar_url, f.created_at as followed_at
       FROM follows f
       JOIN teacher_profiles t ON f.target_id = t.id
       WHERE f.follower_user_id = ? AND f.target_type = 'teacher'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: {
        schools: followedSchools,
        teachers: followedTeachers,
        totalFollowing: followedSchools.length + followedTeachers.length
      }
    });
  } catch (error) {
    console.error('getMyFollowing Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve followed institutions and educators.'
    });
  }
};

/**
 * Get list of followers for the current user
 * GET /api/v1/network/followers
 */
const getMyFollowers = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    let targetId = null;

    if (userRole === 'teacher') {
      const t = await query('SELECT id FROM teacher_profiles WHERE user_id = ?', [userId]);
      if (t.length > 0) targetId = t[0].id;
    } else if (userRole === 'school') {
      const s = await query('SELECT id FROM school_profiles WHERE user_id = ?', [userId]);
      if (s.length > 0) targetId = s[0].id;
    }

    if (!targetId) {
      return res.status(200).json({
        success: true,
        data: { followers: [], totalFollowers: 0 }
      });
    }

    const followers = await query(
      `SELECT u.id as user_id, u.email, u.role,
              t.id as teacher_id, t.full_name, t.primary_subject, t.designation, t.current_city, t.current_state, t.avatar_url,
              f.created_at as followed_at
       FROM follows f
       JOIN users u ON f.follower_user_id = u.id
       LEFT JOIN teacher_profiles t ON t.user_id = u.id
       WHERE f.target_type = ? AND f.target_id = ?
       ORDER BY f.created_at DESC`,
      [userRole, targetId]
    );

    return res.status(200).json({
      success: true,
      data: {
        followers,
        totalFollowers: followers.length
      }
    });
  } catch (error) {
    console.error('getMyFollowers Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve followers.'
    });
  }
};

/**
 * Unified network search for schools and teachers
 * GET /api/v1/network/search?q=...&type=all|school|teacher&subject=...&city=...
 */
const searchNetwork = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const type = (req.query.type || 'all').toLowerCase();
    const subject = (req.query.subject || '').trim();
    const city = (req.query.city || '').trim();
    const currentUserId = req.user?.id || 0;

    let schools = [];
    let teachers = [];

    // 1. Search Schools if type is 'all' or 'school'
    if (type === 'all' || type === 'school') {
      let schoolSql = `
        SELECT 
          s.id, 
          s.school_name, 
          s.board, 
          s.city, 
          s.state, 
          s.logo_url, 
          s.slug, 
          s.is_verified, 
          s.verification_status,
          (SELECT COUNT(*) FROM follows f_cnt WHERE f_cnt.target_type = 'school' AND f_cnt.target_id = s.id) as followers_count,
          CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END as is_following
        FROM school_profiles s
        LEFT JOIN follows f ON (f.follower_user_id = ? AND f.target_type = 'school' AND f.target_id = s.id)
        WHERE 1=1
      `;
      const schoolParams = [currentUserId];

      if (q) {
        schoolSql += ' AND (s.school_name LIKE ? OR s.city LIKE ? OR s.state LIKE ? OR s.board LIKE ?)';
        schoolParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      }
      if (city) {
        schoolSql += ' AND (s.city LIKE ? OR s.state LIKE ?)';
        schoolParams.push(`%${city}%`, `%${city}%`);
      }

      schoolSql += ' ORDER BY s.is_verified DESC, followers_count DESC, s.id DESC LIMIT 40';
      schools = await query(schoolSql, schoolParams);
    }

    // 2. Search Teachers if type is 'all' or 'teacher'
    if (type === 'all' || type === 'teacher') {
      let teacherSql = `
        SELECT 
          t.id, 
          t.user_id,
          t.full_name, 
          t.post_type,
          t.designation, 
          t.primary_subject, 
          t.secondary_subjects, 
          t.highest_qualification,
          t.experience_years, 
          t.current_city, 
          t.current_state, 
          t.avatar_url, 
          t.is_profile_completed,
          (SELECT COUNT(*) FROM follows f_cnt WHERE f_cnt.target_type = 'teacher' AND f_cnt.target_id = t.id) as followers_count,
          CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END as is_following
        FROM teacher_profiles t
        LEFT JOIN follows f ON (f.follower_user_id = ? AND f.target_type = 'teacher' AND f.target_id = t.id)
        WHERE 1=1
      `;
      const teacherParams = [currentUserId];

      // Exclude logged in user from teacher search results
      if (currentUserId) {
        teacherSql += ' AND t.user_id != ?';
        teacherParams.push(currentUserId);
      }

      if (q) {
        teacherSql += ' AND (t.full_name LIKE ? OR t.primary_subject LIKE ? OR t.secondary_subjects LIKE ? OR t.designation LIKE ? OR t.current_city LIKE ?)';
        teacherParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      }
      if (subject) {
        teacherSql += ' AND (t.primary_subject LIKE ? OR t.secondary_subjects LIKE ?)';
        teacherParams.push(`%${subject}%`, `%${subject}%`);
      }
      if (city) {
        teacherSql += ' AND (t.current_city LIKE ? OR t.current_state LIKE ?)';
        teacherParams.push(`%${city}%`, `%${city}%`);
      }

      teacherSql += ' ORDER BY t.is_profile_completed DESC, followers_count DESC, t.id DESC LIMIT 40';
      teachers = await query(teacherSql, teacherParams);
    }

    return res.status(200).json({
      success: true,
      data: {
        schools: (schools || []).map(s => ({ ...s, is_following: Boolean(s.is_following) })),
        teachers: (teachers || []).map(t => ({ ...t, is_following: Boolean(t.is_following) })),
        totalCount: (schools ? schools.length : 0) + (teachers ? teachers.length : 0)
      }
    });
  } catch (error) {
    console.error('searchNetwork Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search network directory.'
    });
  }
};

module.exports = {
  followTarget,
  unfollowTarget,
  getFollowStatus,
  getMyFollowing,
  getMyFollowers,
  searchNetwork
};
