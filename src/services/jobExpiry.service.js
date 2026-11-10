const { notifyJobRemoved } = require('./googleIndexing.service');
const { query } = require('../config/database');

/**
 * Automatically marks active jobs older than job_auto_expire_days as closed
 */
async function expireOldJobs() {
  try {
    const setting = await query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'job_auto_expire_days' LIMIT 1"
    );
    const days = parseInt(setting?.[0]?.setting_value, 10) || 15;
    if (days > 0) {
      // Fetch expiring share_codes first to notify Google
      try {
        const expiring = await query(
          "SELECT share_code FROM jobs WHERE status = 'active' AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
          [days]
        );
        for (const j of expiring) {
          if (j.share_code) notifyJobRemoved(j.share_code).catch(() => {});
        }
      } catch (_) {}

      const result = await query(
        "UPDATE jobs SET status = 'closed' WHERE status = 'active' AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
        [days]
      );
      if (result && result.affectedRows > 0) {
        console.log(`[Job Expiry Service] Automatically marked ${result.affectedRows} jobs older than ${days} days as closed.`);
      }
      return result ? result.affectedRows : 0;
    }
  } catch (err) {
    console.warn('[Job Expiry Service Notice]:', err.message);
  }
  return 0;
}

module.exports = {
  expireOldJobs
};
