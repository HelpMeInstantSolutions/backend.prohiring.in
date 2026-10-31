const nodemailer = require('nodemailer');
const { query } = require('../config/database');

/**
 * Sanitize phone number to standard digit format
 */
function sanitizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d]/g, '');
  // If user entered 10 digit Indian number without country code
  if (cleaned.length === 10) {
    return cleaned;
  }
  // If user entered 91 followed by 10 digits
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return cleaned.slice(2);
  }
  return cleaned;
}

/**
 * Helper to get dynamic config from database or fallback to process.env
 */
async function getConfigValue(key, fallback = '') {
  try {
    const rows = await query('SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1', [key]);
    if (rows && rows.length > 0 && rows[0].setting_value !== null && rows[0].setting_value !== '') {
      return rows[0].setting_value;
    }
  } catch (err) {
    // Database might not be initialized yet
  }
  return process.env[key.toUpperCase()] || fallback;
}

/**
 * Send real SMS using configured SMS Provider or fallback to server simulation
 * Supports AutoMsgHub (autosmshub.in WhatsApp template), Fast2SMS, 2Factor, and Simulation
 */
async function dispatchSms(phone, otp) {
  const cleanPhone = sanitizePhone(phone);

  const autosmsApiKey = await getConfigValue('autosmshub_api_key', '5062b348cd2829cbe17999155eb1a560e52b346c29e0ca1aaf55e88f19d08f1c');
  const autosmsTemplate = await getConfigValue('autosmshub_template_name', 'general_otp_verification');
  const autosmsLang = await getConfigValue('autosmshub_template_language', 'en');
  const fast2SmsKey = await getConfigValue('fast2sms_api_key', process.env.FAST2SMS_API_KEY || '');
  const twoFactorKey = await getConfigValue('two_factor_api_key', process.env.TWO_FACTOR_API_KEY || '');

  // 1. Try WhatsApp OTP via AutoMsgHub API (autosmshub.in)
  if (autosmsApiKey) {
    try {
      const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
      const url = 'https://autosmshub.in/api/v1/messages/template';
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': autosmsApiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          phone: formattedPhone,
          template_name: autosmsTemplate,
          language: autosmsLang,
          variables: [
            String(otp) // maps to {{1}} in your template
          ],
          button_variables: [
            {
              index: 0,
              sub_type: "copy_code",
              text: String(otp)
            }
          ]
        })
      });

      const data = await res.json();
      if (res.ok && (data.success === true || data.data?.wa_message_id)) {
        console.log(`[OTP Service] WhatsApp OTP delivered via autosmshub.in to +${formattedPhone}`);
        return { success: true, provider: 'whatsapp', method: 'whatsapp', data };
      }
      console.warn(`[OTP Service] autosmshub.in WhatsApp response:`, data?.message || data);
    } catch (err) {
      console.error('[OTP Service] autosmshub.in WhatsApp dispatch failed:', err.message);
    }
  }

  // 2. Try Fast2SMS if API key provided
  if (fast2SmsKey) {
    try {
      const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${encodeURIComponent(fast2SmsKey)}&route=otp&variables_values=${otp}&numbers=${cleanPhone}`;
      const res = await fetch(url, { method: 'GET' });
      const data = await res.json();
      if (data.return) {
        console.log(`[OTP Service] Fast2SMS dispatched successfully to +91 ${cleanPhone}`);
        return { success: true, provider: 'fast2sms', data };
      }
      console.warn(`[OTP Service] Fast2SMS response:`, data.message);
    } catch (err) {
      console.error('[OTP Service] Fast2SMS dispatch failed:', err.message);
    }
  }

  // 3. Try 2Factor.in if API key provided
  if (twoFactorKey) {
    try {
      const url = `https://2factor.in/API/V1/${encodeURIComponent(twoFactorKey)}/SMS/${cleanPhone}/${otp}/DataListOTP`;
      const res = await fetch(url, { method: 'GET' });
      const data = await res.json();
      if (data.Status === 'Success') {
        console.log(`[OTP Service] 2Factor SMS dispatched successfully to +91 ${cleanPhone}`);
        return { success: true, provider: '2factor', data };
      }
      console.warn(`[OTP Service] 2Factor response:`, data.Details);
    } catch (err) {
      console.error('[OTP Service] 2Factor dispatch failed:', err.message);
    }
  }

  // 4. Fallback: Log to server console for development & staging
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📱 [OTP SERVICE] Mobile: +91 ${cleanPhone} | CODE: [ ${otp} ]`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return { success: true, provider: 'simulation', simulated: true };
}

/**
 * Dispatch Email OTP using configured dynamic SMTP settings
 */
async function dispatchEmail(toEmail, otp, customSubject, customHtml) {
  const host = await getConfigValue('smtp_host', process.env.SMTP_HOST || 'smtp.gmail.com');
  const port = parseInt(await getConfigValue('smtp_port', process.env.SMTP_PORT || '587'), 10);
  const secure = (await getConfigValue('smtp_secure', 'false')) === 'true' || port === 465;
  const user = await getConfigValue('smtp_user', process.env.SMTP_USER || '');
  const pass = await getConfigValue('smtp_pass', process.env.SMTP_PASS || '');
  const fromEmail = await getConfigValue('smtp_from_email', process.env.SMTP_FROM || user || 'noreply@prohiring.in');
  const fromName = await getConfigValue('smtp_from_name', 'ProHiring Recruitment');
  const appName = await getConfigValue('app_name', 'ProHiring');

  // If no SMTP credentials configured, fallback to simulation console output
  if (!user || !pass) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✉️ [EMAIL SIMULATION] To: ${toEmail} | OTP CODE: [ ${otp} ]`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return { success: true, provider: 'simulation', simulated: true };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });

  const subject = customSubject || `${otp} is your verification code for ${appName}`;
  const html = customHtml || `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #4F46E5; margin: 0; font-size: 24px; font-weight: 800;">${appName}</h2>
        <p style="color: #64748B; font-size: 13px; margin: 4px 0 0 0;">School & Educator Job Connect</p>
      </div>
      <div style="background-color: #F8FAFC; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 20px;">
        <p style="font-size: 14px; color: #0F172A; margin: 0 0 12px 0;">Use the following verification code to complete your verification:</p>
        <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #4F46E5; padding: 12px 20px; background: #FFFFFF; border: 1px dashed #CBD5E1; border-radius: 8px; display: inline-block;">
          ${otp}
        </div>
        <p style="font-size: 12px; color: #94A3B8; margin: 12px 0 0 0;">This code is valid for 10 minutes. Do not share it with anyone.</p>
      </div>
      <p style="font-size: 12px; color: #64748B; text-align: center; margin: 0;">If you did not request this verification, please ignore this email.</p>
    </div>
  `;

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    subject,
    html
  });

  console.log(`[Email Service] Verification mail sent to ${toEmail}: ${info.messageId}`);
  return { success: true, provider: 'smtp', messageId: info.messageId };
}

/**
 * Send Test Email (Admin Function)
 */
async function sendTestMail(toEmail, customConfig = {}) {
  const host = customConfig.host || await getConfigValue('smtp_host', 'smtp.gmail.com');
  const port = parseInt(customConfig.port || await getConfigValue('smtp_port', '587'), 10);
  const secure = customConfig.secure !== undefined ? customConfig.secure : ((await getConfigValue('smtp_secure', 'false')) === 'true' || port === 465);
  const user = customConfig.user || await getConfigValue('smtp_user', '');
  const pass = customConfig.pass || await getConfigValue('smtp_pass', '');
  const fromEmail = customConfig.fromEmail || await getConfigValue('smtp_from_email', user || 'noreply@prohiring.in');
  const fromName = customConfig.fromName || await getConfigValue('smtp_from_name', 'ProHiring Verification');

  if (!user || !pass) {
    throw new Error('SMTP Username and Password must be provided.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });

  // Verify connection configuration
  await transporter.verify();

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    subject: `✅ SMTP Test Email from ProHiring System`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #E2E8F0; border-radius: 12px;">
        <h2 style="color: #16A34A;">SMTP Connection Successful!</h2>
        <p>This is a test email sent from your ProHiring Admin Panel.</p>
        <ul style="color: #475569; font-size: 13px;">
          <li><b>SMTP Host:</b> ${host}:${port}</li>
          <li><b>Secure:</b> ${secure ? 'Yes (SSL/TLS)' : 'No (STARTTLS)'}</li>
          <li><b>From:</b> ${fromName} &lt;${fromEmail}&gt;</li>
          <li><b>Timestamp:</b> ${new Date().toISOString()}</li>
        </ul>
      </div>
    `
  });

  return { success: true, messageId: info.messageId };
}

/**
 * Send Test SMS / WhatsApp (Admin Function)
 */
async function sendTestSms(toPhone, customConfig = {}) {
  const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
  return await dispatchSms(toPhone, testOtp);
}

module.exports = {
  sanitizePhone,
  dispatchSms,
  dispatchEmail,
  sendTestMail,
  sendTestSms
};
