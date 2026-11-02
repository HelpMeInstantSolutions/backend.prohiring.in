const { query } = require('../config/database');

/**
 * Notification Service
 * Manages in-app notifications and Firebase Cloud Messaging (FCM) push alerts
 */
class NotificationService {
  /**
   * Create a notification record in database and optionally dispatch FCM push alert
   * @param {Object} params
   * @param {number} params.userId - Recipient user ID
   * @param {'application' | 'recruitment' | 'nearby' | 'social' | 'inquiry' | 'system'} params.type
   * @param {string} params.title - Short header
   * @param {string} params.message - Descriptive body
   * @param {Object} [params.data] - Contextual metadata (jobId, link, etc.)
   * @param {boolean} [params.sendFcm] - Whether to send push notification to Android device
   */
  async createNotification({ userId, type = 'system', title, message, data = {}, sendFcm = true }) {
    try {
      if (!userId || !title || !message) return null;

      const serializedData = typeof data === 'object' ? JSON.stringify(data) : (data || '{}');
      const directLink = data?.link || null;

      let result;
      try {
        result = await query(
          `INSERT INTO notifications (user_id, type, title, message, data, link, is_read, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, NOW())`,
          [userId, type, title.trim(), message.trim(), serializedData, directLink]
        );
      } catch (_) {
        try {
          result = await query(
            `INSERT INTO notifications (user_id, type, title, message, data, is_read, created_at)
             VALUES (?, ?, ?, ?, ?, 0, NOW())`,
            [userId, type, title.trim(), message.trim(), serializedData]
          );
        } catch (_2) {
          result = await query(
            `INSERT INTO notifications (user_id, title, message, type)
             VALUES (?, ?, ?, ?)`,
            [userId, title.trim(), message.trim(), type]
          );
        }
      }

      const notificationId = result.insertId;

      // Dispatch to FCM Android devices if registered
      if (sendFcm) {
        this.dispatchFcmToUser(userId, {
          title: title.trim(),
          body: message.trim(),
          type,
          notificationId: String(notificationId),
          ...data
        }).catch((fcmErr) => {
          console.warn('[NotificationService] FCM push dispatch notice:', fcmErr.message);
        });
      }

      return {
        id: notificationId,
        userId,
        type,
        title,
        message,
        data,
        isRead: false,
        createdAt: new Date()
      };
    } catch (err) {
      console.error('[NotificationService] Error creating notification:', err);
      return null;
    }
  }

  /**
   * Dispatch push notification to registered Android FCM tokens
   */
  async dispatchFcmToUser(userId, payload) {
    try {
      const devices = await query(
        'SELECT fcm_token FROM user_devices WHERE user_id = ?',
        [userId]
      );

      if (!devices || devices.length === 0) return;

      const fcmServerKey = process.env.FCM_SERVER_KEY;
      if (!fcmServerKey) {
        // FCM credentials can be set via env, tokens are securely recorded
        return;
      }

      const tokens = devices.map((d) => d.fcm_token).filter(Boolean);
      for (const token of tokens) {
        try {
          await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `key=${fcmServerKey}`
            },
            body: JSON.stringify({
              to: token,
              notification: {
                title: payload.title,
                body: payload.body,
                sound: 'default'
              },
              data: payload,
              priority: 'high'
            })
          });
        } catch (_) {}
      }
    } catch (err) {
      console.warn('[NotificationService] dispatchFcmToUser notice:', err.message);
    }
  }

  /**
   * Trigger notification: New teacher applied to school's vacancy
   */
  async notifyApplicationReceived({ schoolUserId, jobTitle, teacherName, jobId, applicationId }) {
    return this.createNotification({
      userId: schoolUserId,
      type: 'application',
      title: 'New Applicant for Vacancy',
      message: `${teacherName} applied for "${jobTitle}". Review qualifications and profile.`,
      data: {
        link: '/school/jobs',
        jobId,
        applicationId
      }
    });
  }

  /**
   * Trigger notification: School updated applicant status (Shortlisted, Interview, Hired, etc.)
   */
  async notifyApplicationStatusUpdated({ teacherUserId, jobTitle, schoolName, newStatus, jobId, applicationId }) {
    const formattedStatus = newStatus.replace(/_/g, ' ').toUpperCase();
    return this.createNotification({
      userId: teacherUserId,
      type: 'recruitment',
      title: `Application Update: ${formattedStatus}`,
      message: `${schoolName} updated your application status for "${jobTitle}" to ${formattedStatus}.`,
      data: {
        link: '/teacher/dashboard#applications',
        jobId,
        applicationId,
        newStatus
      }
    });
  }

  /**
   * Trigger notification: User received a new follower
   */
  async notifyNewFollower({ targetUserId, followerName, followerRole, followerId }) {
    return this.createNotification({
      userId: targetUserId,
      type: 'social',
      title: 'New Connection & Follower',
      message: `${followerName} (${followerRole === 'school' ? 'Institution' : 'Verified Educator'}) started following your profile.`,
      data: {
        link: followerRole === 'school' ? `/schools/${followerId}` : `/teachers/${followerId}`,
        followerId,
        followerRole
      }
    });
  }

  /**
   * Trigger notification: New community interaction or mention
   */
  async notifyCommunityInteraction({ targetUserId, actorName, postSnippet, postId, interactionType = 'liked' }) {
    return this.createNotification({
      userId: targetUserId,
      type: 'social',
      title: `Community Update: ${interactionType === 'liked' ? 'Post Liked' : 'New Comment'}`,
      message: `${actorName} ${interactionType} your post: "${(postSnippet || '').slice(0, 50)}..."`,
      data: {
        link: '/feed',
        postId
      }
    });
  }

  /**
   * Trigger notification: School received a direct query/inquiry
   */
  async notifyInquiryReceived({ schoolUserId, senderName, subject, inquiryId }) {
    return this.createNotification({
      userId: schoolUserId,
      type: 'inquiry',
      title: 'New Institution Inquiry',
      message: `${senderName} submitted an inquiry: "${subject || 'General Inquiry'}".`,
      data: {
        link: '/school/dashboard#inquiries',
        inquiryId
      }
    });
  }

  /**
   * Trigger notification: School reported/disputed staff
   */
  async notifyStaffDisputed({ schoolName, teacherName, reason, staffId }) {
    try {
      const admins = await query("SELECT id FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        await this.createNotification({
          userId: admin.id,
          type: 'system',
          title: `Staff Dispute: ${schoolName}`,
          message: `${schoolName} flagged staff record for "${teacherName}": ${reason}`,
          data: {
            link: '/admin/schools',
            staffId
          }
        });
      }
    } catch (_) {}
  }
}

module.exports = new NotificationService();
