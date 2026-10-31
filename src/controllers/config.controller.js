const { query } = require('../config/database');

// GET /api/v1/config/app-settings (Public)
// Returns dynamic platform settings so Android app and Next.js frontends can adapt branding
const getPublicSettings = async (req, res) => {
  try {
    const rows = await query(
      'SELECT setting_key, setting_value, category FROM system_settings WHERE is_public = 1'
    );

    const settings = {};
    rows.forEach(r => {
      settings[r.setting_key] = r.setting_value;
    });

    return res.status(200).json({
      success: true,
      data: {
        appName: settings.app_name || 'ProHiring',
        tagline: settings.app_tagline || 'School & Teacher Recruitment Network',
        brandDomain: settings.brand_domain || 'prohiring.in',
        supportEmail: settings.support_email || 'support@prohiring.in',
        supportPhone: settings.support_phone || '+91 9876543210',
        primaryColor: settings.primary_color || '#4F46E5',
        primaryDark: settings.primary_dark || '#3730A3',
        secondaryColor: settings.secondary_color || '#0EA5A4',
        androidMinVersion: settings.android_min_version || '1.0.0',
        all: settings
      }
    });
  } catch (error) {
    console.error('getPublicSettings Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch platform configuration.'
    });
  }
};

// GET /api/v1/admin/settings (Admin Only)
const getAllSettings = async (req, res) => {
  try {
    const rows = await query('SELECT * FROM system_settings ORDER BY category, setting_key ASC');
    return res.status(200).json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('getAllSettings Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch settings.'
    });
  }
};

// PUT /api/v1/admin/settings (Admin Only)
// Update dynamic settings such as app_name, tagline, branding, contact
const updateSettings = async (req, res) => {
  try {
    const { settings } = req.body; // Array of { key, value } or object key-value
    if (!settings) {
      return res.status(400).json({
        success: false,
        message: 'Settings payload is required.'
      });
    }

    if (Array.isArray(settings)) {
      for (const item of settings) {
        if (item.key && item.value !== undefined) {
          await query(
            'UPDATE system_settings SET setting_value = ? WHERE setting_key = ?',
            [String(item.value), item.key]
          );
        }
      }
    } else if (typeof settings === 'object') {
      for (const [key, value] of Object.entries(settings)) {
        await query(
          'UPDATE system_settings SET setting_value = ? WHERE setting_key = ?',
          [String(value), key]
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Platform settings updated successfully.'
    });
  } catch (error) {
    console.error('updateSettings Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update platform settings.'
    });
  }
};

// POST /api/v1/admin/settings/test-mail
const testMail = async (req, res) => {
  try {
    const { email, host, port, secure, user, pass, fromEmail, fromName } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Recipient email is required for testing.' });
    }

    const { sendTestMail } = require('../services/otp.service');
    const result = await sendTestMail(email, { host, port, secure, user, pass, fromEmail, fromName });
    return res.status(200).json({
      success: true,
      message: `Test email dispatched successfully to ${email}.`,
      data: result
    });
  } catch (error) {
    console.error('testMail Error:', error);
    return res.status(400).json({
      success: false,
      message: `SMTP test failed: ${error.message}`
    });
  }
};

// POST /api/v1/admin/settings/test-sms
const testSms = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Recipient phone number is required.' });
    }

    const { sendTestSms } = require('../services/otp.service');
    const result = await sendTestSms(phone);
    return res.status(200).json({
      success: true,
      message: `Test SMS/WhatsApp dispatched to ${phone}. Provider: ${result.provider}.`,
      data: result
    });
  } catch (error) {
    console.error('testSms Error:', error);
    return res.status(400).json({
      success: false,
      message: `SMS test failed: ${error.message}`
    });
  }
};

module.exports = {
  getPublicSettings,
  getAllSettings,
  updateSettings,
  testMail,
  testSms
};
