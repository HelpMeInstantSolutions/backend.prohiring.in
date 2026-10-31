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

module.exports = {
  getPublicSettings,
  getAllSettings,
  updateSettings
};
