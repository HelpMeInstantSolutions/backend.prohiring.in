const fs = require('fs');
const path = require('path');

class WebDAVService {
  constructor() {
    this.baseUrl = (process.env.WEBDAV_BASE_URL || 'https://drive2.xhost.co.in/remote.php/dav/files/dicdo679/prohiring').replace(/\/+$/, '');
    this.username = process.env.WEBDAV_USERNAME || 'dicdo679';
    this.password = process.env.WEBDAV_PASSWORD || 'dJKkbJJr6mN5';
    this.authHeader = 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64');
    this.localUploadDir = path.join(__dirname, '../../uploads');

    this.ensureLocalDirs();
  }

  ensureLocalDirs() {
    try {
      if (!fs.existsSync(this.localUploadDir)) {
        fs.mkdirSync(this.localUploadDir, { recursive: true });
      }
      const folders = ['avatars', 'resumes', 'logos', 'posts', 'schools'];
      for (const f of folders) {
        const p = path.join(this.localUploadDir, f);
        if (!fs.existsSync(p)) {
          fs.mkdirSync(p, { recursive: true });
        }
      }
    } catch (err) {
      console.error('[WebDAVService] Error creating local upload directories:', err.message);
    }
  }

  async ensureRemoteFolder(folderName) {
    try {
      const url = `${this.baseUrl}/${folderName}`;
      await fetch(url, {
        method: 'MKCOL',
        headers: { Authorization: this.authHeader }
      });
    } catch (err) {
      // Ignore if folder already exists
    }
  }

  /**
   * Upload buffer to WebDAV and cache locally on disk
   * @param {string} subfolder - 'avatars' | 'resumes' | 'logos' | 'posts' | 'schools'
   * @param {string} filename - e.g. 'avatar-123.jpg'
   * @param {Buffer} buffer - File buffer
   * @param {string} mimeType - e.g. 'image/jpeg'
   * @returns {Promise<string>} Relative URL path e.g. '/uploads/avatars/avatar-123.jpg'
   */
  async uploadFile(subfolder, filename, buffer, mimeType = 'application/octet-stream') {
    // 1. Save to local disk cache immediately
    const folderPath = path.join(this.localUploadDir, subfolder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    const localFilePath = path.join(folderPath, filename);
    fs.writeFileSync(localFilePath, buffer);

    // 2. Upload to Nextcloud WebDAV
    const remoteUrl = `${this.baseUrl}/${subfolder}/${filename}`;
    try {
      const res = await fetch(remoteUrl, {
        method: 'PUT',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': mimeType,
          'Content-Length': buffer.length.toString()
        },
        body: buffer
      });

      if (!res.ok && res.status !== 201 && res.status !== 204) {
        console.warn(`[WebDAVService] WebDAV PUT ${remoteUrl} returned status ${res.status} ${res.statusText}`);
      } else {
        console.log(`[WebDAVService] Successfully synced to Nextcloud WebDAV: ${subfolder}/${filename}`);
      }
    } catch (remoteErr) {
      console.error('[WebDAVService] Error syncing file to Nextcloud WebDAV:', remoteErr.message);
    }

    return `/uploads/${subfolder}/${filename}`;
  }

  /**
   * Get file from local cache or fallback to Nextcloud WebDAV
   * @param {string} subfolder
   * @param {string} filename
   * @returns {Promise<{ stream?: any, buffer?: Buffer, mimeType: string, fromCache: boolean } | null>}
   */
  async getFile(subfolder, filename) {
    const localFilePath = path.join(this.localUploadDir, subfolder, filename);

    // 1. Check local cache
    if (fs.existsSync(localFilePath)) {
      const ext = path.extname(filename).toLowerCase();
      const mimeType = this.getMimeType(ext);
      return {
        buffer: fs.readFileSync(localFilePath),
        mimeType,
        fromCache: true
      };
    }

    // 2. Fallback to Nextcloud WebDAV
    try {
      const remoteUrl = `${this.baseUrl}/${subfolder}/${filename}`;
      const res = await fetch(remoteUrl, {
        method: 'GET',
        headers: { Authorization: this.authHeader }
      });

      if (!res.ok) {
        return null;
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = res.headers.get('content-type') || this.getMimeType(path.extname(filename).toLowerCase());

      // Cache locally for next time
      try {
        const folderPath = path.join(this.localUploadDir, subfolder);
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
        fs.writeFileSync(localFilePath, buffer);
      } catch (cacheErr) {
        console.error('[WebDAVService] Failed to cache WebDAV file locally:', cacheErr.message);
      }

      return {
        buffer,
        mimeType,
        fromCache: false
      };
    } catch (err) {
      console.error('[WebDAVService] Failed to fetch file from WebDAV:', err.message);
      return null;
    }
  }

  getMimeType(ext) {
    const map = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain'
    };
    return map[ext] || 'application/octet-stream';
  }
}

module.exports = new WebDAVService();
