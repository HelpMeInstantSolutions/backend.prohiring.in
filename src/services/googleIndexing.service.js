const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let cachedToken = null;
let tokenExpiresAt = 0;

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Loads service account credentials from file or environment variables
 */
function getCredentials() {
  const keyPath = path.join(__dirname, '../../config/google-indexing-key.json');
  if (fs.existsSync(keyPath)) {
    try {
      return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    } catch (e) {
      console.warn('[Google Indexing] Error parsing key file:', e.message);
    }
  }

  // Fallback to env vars
  if (process.env.GOOGLE_INDEXING_CLIENT_EMAIL && process.env.GOOGLE_INDEXING_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_INDEXING_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_INDEXING_PRIVATE_KEY.replace(/\\n/g, '\n'),
      token_uri: process.env.GOOGLE_INDEXING_TOKEN_URI || 'https://oauth2.googleapis.com/token'
    };
  }

  return null;
}

/**
 * Generates an OAuth2 access token for the Indexing API using RS256 JWT
 */
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiresAt > now + 60) {
    return cachedToken;
  }

  const creds = getCredentials();
  if (!creds || !creds.client_email || !creds.private_key) {
    return null;
  }

  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const claimSet = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: creds.token_uri || 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
  const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  const signature = signer.sign(creds.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const jwt = `${signatureInput}.${signature}`;

  const res = await fetch(creds.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  const data = await res.json();
  if (!res.ok) {
    console.warn('[Google Indexing] Failed to obtain access token:', data);
    return null;
  }

  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 3600);
  return cachedToken;
}

/**
 * Publishes a single URL to Google Indexing API
 * @param {string} targetUrl - Full URL or share_code
 * @param {'URL_UPDATED' | 'URL_DELETED'} type
 */
async function publishUrl(targetUrl, type = 'URL_UPDATED') {
  try {
    const creds = getCredentials();
    if (!creds) {
      return { success: false, skipped: true, reason: 'Credentials not configured' };
    }

    const fullUrl = targetUrl.startsWith('http') 
      ? targetUrl 
      : `https://prohiring.in/v/${targetUrl}`;

    const token = await getAccessToken();
    if (!token) {
      return { success: false, reason: 'Authentication failed' };
    }

    const response = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        url: fullUrl,
        type: type
      })
    });

    const data = await response.json();
    if (response.ok) {
      console.log(`[Google Indexing API] Successfully notified Google: ${fullUrl} (${type})`);
      return { success: true, url: fullUrl, type, data };
    } else {
      console.warn(`[Google Indexing API] Notice for ${fullUrl}:`, data?.error?.message || data);
      return { success: false, url: fullUrl, error: data };
    }
  } catch (err) {
    console.warn(`[Google Indexing API] Error notifying ${targetUrl}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Helper to notify for a job shareCode
 */
async function notifyJobPublished(shareCode) {
  if (!shareCode) return;
  return publishUrl(shareCode, 'URL_UPDATED');
}

/**
 * Helper to notify for a deleted or closed job
 */
async function notifyJobRemoved(shareCode) {
  if (!shareCode) return;
  return publishUrl(shareCode, 'URL_DELETED');
}

module.exports = {
  publishUrl,
  notifyJobPublished,
  notifyJobRemoved
};
