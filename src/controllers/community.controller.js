const { query } = require('../config/database');

/**
 * Get Community Posts Feed
 * GET /api/v1/community/posts?filter=all|following|schools|teachers&page=1&limit=20
 */
const getPosts = async (req, res) => {
  try {
    const currentUserId = req.user?.id || null;
    const filter = req.query.filter || 'all';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    let filterClause = "cp.status = 'published'";
    const queryParams = [];

    if (filter === 'schools') {
      filterClause += " AND cp.author_role = 'school'";
    } else if (filter === 'teachers') {
      filterClause += " AND cp.author_role = 'teacher'";
    } else if (filter === 'following' && currentUserId) {
      filterClause += ` AND (
        (cp.author_role = 'school' AND EXISTS (
          SELECT 1 FROM follows f 
          JOIN school_profiles sp ON f.target_id = sp.id 
          WHERE f.follower_user_id = ? AND f.target_type = 'school' AND sp.user_id = cp.author_user_id
        ))
        OR
        (cp.author_role = 'teacher' AND EXISTS (
          SELECT 1 FROM follows f 
          JOIN teacher_profiles tp ON f.target_id = tp.id 
          WHERE f.follower_user_id = ? AND f.target_type = 'teacher' AND tp.user_id = cp.author_user_id
        ))
        OR cp.author_user_id = ?
      )`;
      queryParams.push(currentUserId, currentUserId, currentUserId);
    }

    const postsSql = `
      SELECT 
        cp.id,
        cp.author_user_id,
        cp.author_role,
        cp.content,
        cp.post_type,
        cp.media_url,
        cp.likes_count,
        cp.comments_count,
        cp.created_at,
        -- School Author info
        sp.id AS school_id,
        sp.school_name,
        sp.logo_url AS school_logo,
        sp.board AS school_board,
        sp.city AS school_city,
        sp.is_verified AS school_verified,
        -- Teacher Author info
        tp.id AS teacher_id,
        tp.full_name AS teacher_name,
        tp.avatar_url AS teacher_avatar,
        tp.designation AS teacher_designation,
        tp.primary_subject AS teacher_subject,
        tp.current_city AS teacher_city,
        -- User reaction
        CASE WHEN ? IS NOT NULL AND pl.id IS NOT NULL THEN 1 ELSE 0 END AS is_liked
      FROM community_posts cp
      LEFT JOIN school_profiles sp ON (cp.author_role = 'school' AND sp.user_id = cp.author_user_id)
      LEFT JOIN teacher_profiles tp ON (cp.author_role = 'teacher' AND tp.user_id = cp.author_user_id)
      LEFT JOIN post_likes pl ON (pl.post_id = cp.id AND pl.user_id = ?)
      WHERE ${filterClause}
      ORDER BY cp.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const allParams = [currentUserId, currentUserId, ...queryParams, limit, offset];
    const posts = await query(postsSql, allParams);

    // Format author object for clean consumption on frontend
    const formatted = posts.map((p) => {
      const isSchool = p.author_role === 'school';
      return {
        id: p.id,
        author: {
          userId: p.author_user_id,
          role: p.author_role,
          id: isSchool ? p.school_id : p.teacher_id,
          name: isSchool ? p.school_name : p.teacher_name,
          avatar: isSchool ? p.school_logo : p.teacher_avatar,
          title: isSchool ? `${p.school_board || 'CBSE'} Affiliated School` : (p.teacher_designation || p.teacher_subject || 'Educator'),
          city: isSchool ? p.school_city : p.teacher_city,
          isVerified: isSchool ? !!p.school_verified : true
        },
        content: p.content,
        postType: p.post_type,
        mediaUrl: p.media_url,
        likesCount: p.likes_count || 0,
        commentsCount: p.comments_count || 0,
        isLiked: !!p.is_liked,
        createdAt: p.created_at
      };
    });

    return res.status(200).json({
      success: true,
      data: formatted,
      page,
      limit
    });
  } catch (error) {
    console.error('getPosts Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve community feed.'
    });
  }
};

/**
 * Create a new Post
 * POST /api/v1/community/posts
 * Body: { content, postType, mediaUrl }
 */
const createPost = async (req, res) => {
  try {
    const authorUserId = req.user.id;
    const authorRole = req.user.role;
    const { content, postType = 'general', mediaUrl } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Post content cannot be empty.'
      });
    }

    const validTypes = ['general', 'hiring_alert', 'achievement', 'pedagogy_tip', 'event'];
    const safeType = validTypes.includes(postType) ? postType : 'general';

    const result = await query(
      `INSERT INTO community_posts (author_user_id, author_role, content, post_type, media_url)
       VALUES (?, ?, ?, ?, ?)`,
      [authorUserId, authorRole, content.trim(), safeType, mediaUrl || null]
    );

    return res.status(201).json({
      success: true,
      message: 'Post published to the community!',
      data: {
        postId: result.insertId
      }
    });
  } catch (error) {
    console.error('createPost Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to publish post.'
    });
  }
};

/**
 * Toggle Like on Post
 * POST /api/v1/community/posts/:id/like
 */
const toggleLike = async (req, res) => {
  try {
    const userId = req.user.id;
    const postId = parseInt(req.params.id, 10);

    const existing = await query(
      'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?',
      [postId, userId]
    );

    let isLiked = false;
    if (existing.length > 0) {
      await query('DELETE FROM post_likes WHERE id = ?', [existing[0].id]);
      await query('UPDATE community_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = ?', [postId]);
      isLiked = false;
    } else {
      await query('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)', [postId, userId]);
      await query('UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = ?', [postId]);
      isLiked = true;
    }

    const postRows = await query('SELECT likes_count FROM community_posts WHERE id = ?', [postId]);

    return res.status(200).json({
      success: true,
      data: {
        isLiked,
        likesCount: postRows[0]?.likes_count || 0
      }
    });
  } catch (error) {
    console.error('toggleLike Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to like/unlike post.'
    });
  }
};

/**
 * Get comments for a post
 * GET /api/v1/community/posts/:id/comments
 */
const getComments = async (req, res) => {
  try {
    const postId = parseInt(req.params.id, 10);

    const comments = await query(
      `SELECT 
         pc.id,
         pc.post_id,
         pc.user_id,
         pc.comment,
         pc.created_at,
         u.role,
         sp.school_name,
         sp.logo_url AS school_logo,
         tp.full_name AS teacher_name,
         tp.avatar_url AS teacher_avatar
       FROM post_comments pc
       JOIN users u ON pc.user_id = u.id
       LEFT JOIN school_profiles sp ON (u.role = 'school' AND sp.user_id = u.id)
       LEFT JOIN teacher_profiles tp ON (u.role = 'teacher' AND tp.user_id = u.id)
       WHERE pc.post_id = ?
       ORDER BY pc.created_at ASC`,
      [postId]
    );

    const formatted = comments.map((c) => ({
      id: c.id,
      userId: c.user_id,
      role: c.role,
      name: c.role === 'school' ? c.school_name : c.teacher_name,
      avatar: c.role === 'school' ? c.school_logo : c.teacher_avatar,
      comment: c.comment,
      createdAt: c.created_at
    }));

    return res.status(200).json({
      success: true,
      data: formatted
    });
  } catch (error) {
    console.error('getComments Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve comments.'
    });
  }
};

/**
 * Add Comment to a post
 * POST /api/v1/community/posts/:id/comments
 * Body: { comment }
 */
const addComment = async (req, res) => {
  try {
    const userId = req.user.id;
    const postId = parseInt(req.params.id, 10);
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Comment text is required.'
      });
    }

    const insertRes = await query(
      'INSERT INTO post_comments (post_id, user_id, comment) VALUES (?, ?, ?)',
      [postId, userId, comment.trim()]
    );

    await query('UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = ?', [postId]);

    return res.status(201).json({
      success: true,
      message: 'Comment posted.',
      data: {
        id: insertRes.insertId,
        comment: comment.trim()
      }
    });
  } catch (error) {
    console.error('addComment Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to post comment.'
    });
  }
};

/**
 * Delete a post (by author or admin)
 * DELETE /api/v1/community/posts/:id
 */
const deletePost = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const postId = parseInt(req.params.id, 10);

    const rows = await query('SELECT author_user_id FROM community_posts WHERE id = ?', [postId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    if (rows[0].author_user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this post.' });
    }

    await query('DELETE FROM community_posts WHERE id = ?', [postId]);

    return res.status(200).json({
      success: true,
      message: 'Post deleted successfully.'
    });
  } catch (error) {
    console.error('deletePost Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete post.'
    });
  }
};

module.exports = {
  getPosts,
  createPost,
  toggleLike,
  getComments,
  addComment,
  deletePost
};
