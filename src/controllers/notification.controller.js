const { query } = require('../config/database');

// GET /api/v1/notifications
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // 1. Fetch persisted user notifications from DB using resilient SELECT *
    let rows = [];
    try {
      rows = await query(
        `SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 40`,
        [userId]
      );
    } catch (dbErr) {
      console.warn('Notifications DB query notice:', dbErr.message);
      rows = [];
    }

    const notifications = (rows || []).map((r) => {
      let parsedData = {};
      try {
        if (r.data) {
          parsedData = typeof r.data === 'string' ? JSON.parse(r.data || '{}') : (r.data || {});
        } else if (r.link) {
          parsedData = { link: r.link };
        }
      } catch (_) {
        parsedData = r.link ? { link: r.link } : {};
      }
      return {
        id: r.id,
        type: r.type || 'info',
        title: r.title || 'Notification',
        message: r.message || '',
        data: parsedData,
        isRead: Boolean(r.is_read),
        createdAt: r.created_at || new Date().toISOString()
      };
    });

    // 2. Compute dynamic nearby activity suggestions
    const nearbyActivities = [];

    if (userRole === 'teacher') {
      const teacherRows = await query(
        'SELECT current_city, current_state, primary_subject, designation FROM teacher_profiles WHERE user_id = ?',
        [userId]
      );
      if (teacherRows.length > 0 && (teacherRows[0].current_city || teacherRows[0].current_state)) {
        const city = teacherRows[0].current_city || '';
        const state = teacherRows[0].current_state || '';
        const subject = teacherRows[0].primary_subject || '';

        const nearbyJobs = await query(
          `SELECT j.id, j.title, j.city, j.state, j.subject, sp.school_name, j.created_at
           FROM jobs j
           JOIN school_profiles sp ON j.school_id = sp.id
           WHERE j.status = 'active'
             AND (LOWER(TRIM(j.city)) = LOWER(TRIM(?)) OR LOWER(TRIM(j.state)) = LOWER(TRIM(?)))
           ORDER BY j.created_at DESC
           LIMIT 2`,
          [city, state]
        );

        for (const job of nearbyJobs) {
          nearbyActivities.push({
            id: `nearby-job-${job.id}`,
            type: 'nearby',
            title: `Nearby Vacancy in ${job.city || job.state}`,
            message: `${job.school_name} posted a requirement for "${job.title}" (${job.subject || 'All Subjects'}) in your vicinity.`,
            data: {
              link: `/jobs/${job.id}`,
              jobId: job.id
            },
            isRead: false,
            createdAt: job.created_at,
            isDynamic: true
          });
        }
      }
    } else if (userRole === 'school') {
      const schoolRows = await query(
        'SELECT city, state FROM school_profiles WHERE user_id = ?',
        [userId]
      );
      if (schoolRows.length > 0 && (schoolRows[0].city || schoolRows[0].state)) {
        const city = schoolRows[0].city || '';
        const state = schoolRows[0].state || '';

        const nearbyTeachers = await query(
          `SELECT tp.id, tp.full_name, tp.primary_subject, tp.designation, tp.current_city, tp.created_at
           FROM teacher_profiles tp
           WHERE (LOWER(TRIM(tp.current_city)) = LOWER(TRIM(?)) OR LOWER(TRIM(tp.current_state)) = LOWER(TRIM(?)))
           ORDER BY tp.created_at DESC
           LIMIT 2`,
          [city, state]
        );

        for (const teacher of nearbyTeachers) {
          nearbyActivities.push({
            id: `nearby-teacher-${teacher.id}`,
            type: 'nearby',
            title: `Verified Educator in ${teacher.current_city || city}`,
            message: `${teacher.full_name} (${teacher.designation || teacher.primary_subject || 'Educator'}) registered nearby in ${teacher.current_city || city}.`,
            data: {
              link: `/teachers/${teacher.id}`,
              teacherId: teacher.id
            },
            isRead: false,
            createdAt: teacher.created_at,
            isDynamic: true
          });
        }
      }
    }

    // Combine persisted notifications and nearby alerts
    const allNotifications = [...notifications, ...nearbyActivities].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    const unreadCount = allNotifications.filter((n) => !n.isRead).length;

    return res.status(200).json({
      success: true,
      data: {
        notifications: allNotifications,
        unreadCount
      }
    });
  } catch (error) {
    console.error('getNotifications Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve notifications: ' + error.message
    });
  }
};

// PUT /api/v1/notifications/:id/read
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    // If dynamic, return success directly
    if (String(notificationId).startsWith('nearby-')) {
      return res.status(200).json({ success: true, message: 'Notification marked as read.' });
    }

    await query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.'
    });
  } catch (error) {
    console.error('markAsRead Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update notification.'
    });
  }
};

// PUT /api/v1/notifications/read-all
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    await query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.'
    });
  } catch (error) {
    console.error('markAllAsRead Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read.'
    });
  }
};

// DELETE /api/v1/notifications/:id
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    if (!String(notificationId).startsWith('nearby-')) {
      await query(
        'DELETE FROM notifications WHERE id = ? AND user_id = ?',
        [notificationId, userId]
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Notification removed successfully.'
    });
  } catch (error) {
    console.error('deleteNotification Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete notification.'
    });
  }
};

// POST /api/v1/notifications/fcm-token
// Used by Android application to register FCM cloud messaging push token
const registerFcmToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fcmToken, deviceType = 'android' } = req.body;

    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Valid fcmToken is required.'
      });
    }

    await query(
      `INSERT INTO user_devices (user_id, fcm_token, device_type, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), device_type = VALUES(device_type), updated_at = NOW()`,
      [userId, fcmToken.trim(), deviceType]
    );

    return res.status(200).json({
      success: true,
      message: 'FCM push token registered successfully for Android device.'
    });
  } catch (error) {
    console.error('registerFcmToken Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register FCM device token.'
    });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  registerFcmToken
};
