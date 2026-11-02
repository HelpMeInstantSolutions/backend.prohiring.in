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
    // 1. Save to local disk cache (best effort - never fail request if disk permissions restricted)
    try {
      const folderPath = path.join(this.localUploadDir, subfolder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      const localFilePath = path.join(folderPath, filename);
      fs.writeFileSync(localFilePath, buffer);
    } catch (cacheErr) {
      console.warn(`[WebDAVService] Local cache notice (write skipped): ${cacheErr.message}`);
    }

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

  /**
   * Delete file from both local cache and remote WebDAV
   * @param {string} subfolder
   * @param {string} filename
   */
  async deleteFile(subfolder, filename) {
    if (!subfolder || !filename) return false;
    // 1. Delete local file
    try {
      const localFilePath = path.join(this.localUploadDir, subfolder, filename);
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch (e) {
      console.warn('[WebDAVService] Local delete notice:', e.message);
    }

    // 2. Delete remote file on Nextcloud WebDAV
    try {
      const remoteUrl = `${this.baseUrl}/${subfolder}/${filename}`;
      const res = await fetch(remoteUrl, {
        method: 'DELETE',
        headers: { Authorization: this.authHeader }
      });
      return res.ok || res.status === 404;
    } catch (err) {
      console.error('[WebDAVService] WebDAV DELETE error:', err.message);
      return false;
    }
  }

  /**
   * Delete file using relative or full URL
   * e.g. '/uploads/avatars/avatar-123.jpg'
   */
  async deleteByUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const match = url.match(/\/uploads\/([^\/]+)\/([^\/?#]+)/i);
    if (match) {
      const [, subfolder, filename] = match;
      return await this.deleteFile(subfolder, filename);
    }
    return false;
  }

  /**
   * List files in uploads folder
   * @param {string} [subfolder] - optional filter
   */
  async listFiles(subfolder = null) {
    const folders = subfolder ? [subfolder] : ['avatars', 'resumes', 'logos', 'schools', 'posts'];
    const files = [];

    for (const f of folders) {
      const dir = path.join(this.localUploadDir, f);
      if (fs.existsSync(dir)) {
        const filenames = fs.readdirSync(dir);
        for (const fname of filenames) {
          try {
            const fpath = path.join(dir, fname);
            const stats = fs.statSync(fpath);
            if (stats.isFile()) {
              files.push({
                name: fname,
                subfolder: f,
                url: `/uploads/${f}/${fname}`,
                sizeBytes: stats.size,
                sizeFormatted: this.formatBytes(stats.size),
                mimeType: this.getMimeType(path.extname(fname).toLowerCase()),
                modifiedAt: stats.mtime
              });
            }
          } catch (e) {}
        }
      }
    }

    // Sort newest first
    files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    return files;
  }

  /**
   * Aggregate storage usage across all categories
   */
  async getStorageStats() {
    const folders = ['avatars', 'resumes', 'logos', 'schools', 'posts'];
    const categories = {};
    let totalFiles = 0;
    let totalSizeBytes = 0;

    for (const f of folders) {
      let count = 0;
      let sizeBytes = 0;
      const dir = path.join(this.localUploadDir, f);
      if (fs.existsSync(dir)) {
        const filenames = fs.readdirSync(dir);
        for (const fname of filenames) {
          try {
            const fpath = path.join(dir, fname);
            const stats = fs.statSync(fpath);
            if (stats.isFile()) {
              count++;
              sizeBytes += stats.size;
            }
          } catch (e) {}
        }
      }
      categories[f] = {
        folder: f,
        count,
        sizeBytes,
        sizeFormatted: this.formatBytes(sizeBytes)
      };
      totalFiles += count;
      totalSizeBytes += sizeBytes;
    }

    // Check remote Nextcloud connectivity & quota
    let webdavConnected = false;
    let quotaInfo = null;
    try {
      const res = await fetch(this.baseUrl, {
        method: 'PROPFIND',
        headers: {
          Authorization: this.authHeader,
          Depth: '0',
          'Content-Type': 'application/xml; charset=utf-8'
        },
        body: `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:quota-used-bytes/>
    <d:quota-available-bytes/>
  </d:prop>
</d:propfind>`
      });
      if (res.ok || res.status === 207) {
        webdavConnected = true;
        const xml = await res.text();
        const usedMatch = xml.match(/<d:quota-used-bytes>(\d+)<\/d:quota-used-bytes>/i);
        const availMatch = xml.match(/<d:quota-available-bytes>(\d+)<\/d:quota-available-bytes>/i);
        if (usedMatch || availMatch) {
          const usedBytes = usedMatch ? parseInt(usedMatch[1], 10) : 0;
          const availBytes = availMatch ? parseInt(availMatch[1], 10) : 0;
          quotaInfo = {
            usedBytes,
            usedFormatted: this.formatBytes(usedBytes),
            availBytes,
            availFormatted: this.formatBytes(availBytes),
            totalBytes: usedBytes + availBytes,
            totalFormatted: this.formatBytes(usedBytes + availBytes)
          };
        }
      }
    } catch (e) {
      console.warn('[WebDAVService] PROPFIND quota check notice:', e.message);
    }

    return {
      totalFiles,
      totalSizeBytes,
      totalFormatted: this.formatBytes(totalSizeBytes),
      categories,
      webdav: {
        baseUrl: this.baseUrl,
        connected: webdavConnected,
        quota: quotaInfo
      }
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
