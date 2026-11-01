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

module.exports = {
  followTarget,
  unfollowTarget,
  getFollowStatus,
  getMyFollowing
};
