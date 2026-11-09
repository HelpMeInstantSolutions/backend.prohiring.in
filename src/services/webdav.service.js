const fs = require('fs');
const path = require('path');
let db = null;
try {
  db = require('../config/database');
} catch (e) {}

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
      const folders = ['avatars', 'resumes', 'logos', 'posts', 'schools', 'jobs'];
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
    let localDeleted = false;
    let remoteDeleted = false;

    const rawFilename = decodeURIComponent(filename);
    const encodedFilename = encodeURIComponent(rawFilename);

    // 1. Delete local file
    try {
      const localFilePath = path.join(this.localUploadDir, subfolder, rawFilename);
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
        localDeleted = true;
      }
    } catch (e) {
      console.warn('[WebDAVService] Local delete notice:', e.message);
    }

    // 2. Delete remote file on Nextcloud WebDAV
    try {
      const remoteUrl = `${this.baseUrl}/${subfolder}/${encodedFilename}`;
      const res = await fetch(remoteUrl, {
        method: 'DELETE',
        headers: { Authorization: this.authHeader }
      });
      remoteDeleted = res.ok || res.status === 404;
      if (!res.ok && res.status !== 404) {
        console.warn(`[WebDAVService] WebDAV DELETE ${remoteUrl} returned status ${res.status}: ${res.statusText}`);
      }
    } catch (err) {
      console.error('[WebDAVService] WebDAV DELETE error:', err.message);
    }

    // 3. Clean up database references if any exist so file doesn't reappear in listings
    if (db && typeof db.query === 'function') {
      try {
        const filePattern = `%${rawFilename}%`;
        const relativeUrl = `/uploads/${subfolder}/${rawFilename}`;

        if (subfolder === 'avatars') {
          await db.query('UPDATE teacher_profiles SET avatar_url = NULL WHERE avatar_url LIKE ? OR avatar_url = ?', [filePattern, relativeUrl]);
        } else if (subfolder === 'resumes') {
          await db.query('UPDATE teacher_profiles SET resume_url = NULL WHERE resume_url LIKE ? OR resume_url = ?', [filePattern, relativeUrl]);
        } else if (subfolder === 'logos') {
          await db.query('UPDATE school_profiles SET logo_url = NULL WHERE logo_url LIKE ? OR logo_url = ?', [filePattern, relativeUrl]);
        } else if (subfolder === 'schools') {
          await db.query('UPDATE school_profiles SET banner_url = NULL WHERE banner_url LIKE ? OR banner_url = ?', [filePattern, relativeUrl]);
        } else if (subfolder === 'jobs') {
          await db.query('UPDATE jobs SET poster_url = NULL WHERE poster_url LIKE ? OR poster_url = ?', [filePattern, relativeUrl]);
        } else if (subfolder === 'posts') {
          await db.query('UPDATE community_posts SET media_url = NULL WHERE media_url LIKE ? OR media_url = ?', [filePattern, relativeUrl]);
        }
      } catch (dbErr) {
        console.warn('[WebDAVService] Database reference cleanup notice:', dbErr.message);
      }
    }

    return true;
  }

  /**
   * Delete file using relative or full URL
   * e.g. '/uploads/avatars/avatar-123.jpg'
   */
  async deleteByUrl(url, fallbackSubfolder = null, fallbackFilename = null) {
    if (url && typeof url === 'string') {
      const match = url.match(/\/(?:uploads|prohiring)\/([^\/]+)\/([^\/?#]+)/i);
      if (match) {
        const [, subfolder, filename] = match;
        return await this.deleteFile(subfolder, decodeURIComponent(filename));
      }
    }
    if (fallbackSubfolder && fallbackFilename) {
      return await this.deleteFile(fallbackSubfolder, decodeURIComponent(fallbackFilename));
    }
    return false;
  }

  /**
   * List files from remote Nextcloud WebDAV for a given folder
   * @param {string} subfolder
   * @returns {Promise<Array>}
   */
  async listRemoteFolderFiles(subfolder) {
    try {
      const url = `${this.baseUrl}/${subfolder}`;
      const res = await fetch(url, {
        method: 'PROPFIND',
        headers: {
          Authorization: this.authHeader,
          Depth: '1',
          'Content-Type': 'application/xml; charset=utf-8'
        }
      });

      if (!res.ok && res.status !== 207) {
        return [];
      }

      const xml = await res.text();
      const responses = xml.split('</d:response>');
      const files = [];

      for (const chunk of responses) {
        if (!chunk.includes('<d:response>') && !chunk.includes('<d:href>')) continue;
        // Skip directory / collection itself
        if (chunk.includes('<d:collection/>') || chunk.includes('<collection/>') || chunk.includes('<d:collection />')) continue;

        const hrefMatch = chunk.match(/<d:href>([^<]+)<\/d:href>/i) || chunk.match(/<href>([^<]+)<\/href>/i);
        if (!hrefMatch) continue;

        const decodedHref = decodeURIComponent(hrefMatch[1]);
        const filename = decodedHref.split('/').filter(Boolean).pop();
        if (!filename) continue;

        const sizeMatch = chunk.match(/<d:getcontentlength>(\d+)<\/d:getcontentlength>/i) || chunk.match(/<getcontentlength>(\d+)<\/getcontentlength>/i);
        const sizeBytes = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;

        const mimeMatch = chunk.match(/<d:getcontenttype>([^<]+)<\/d:getcontenttype>/i) || chunk.match(/<getcontenttype>([^<]+)<\/getcontenttype>/i);
        const mimeType = mimeMatch ? mimeMatch[1] : this.getMimeType(path.extname(filename).toLowerCase());

        const modMatch = chunk.match(/<d:getlastmodified>([^<]+)<\/d:getlastmodified>/i) || chunk.match(/<getlastmodified>([^<]+)<\/getlastmodified>/i);
        const modifiedAt = modMatch ? new Date(modMatch[1]) : new Date();

        files.push({
          name: filename,
          subfolder,
          url: `/uploads/${subfolder}/${filename}`,
          sizeBytes,
          sizeFormatted: this.formatBytes(sizeBytes),
          mimeType,
          modifiedAt,
          source: 'cloud-webdav'
        });
      }

      return files;
    } catch (err) {
      console.warn(`[WebDAVService] Error listing remote folder ${subfolder}:`, err.message);
      return [];
    }
  }

  /**
   * List files in uploads folder (aggregates remote Nextcloud WebDAV, local disk, and DB records)
   * @param {string} [subfolder] - optional filter
   */
  async listFiles(subfolder = null) {
    const folders = subfolder ? [subfolder] : ['avatars', 'resumes', 'logos', 'schools', 'posts', 'jobs'];
    const fileMap = new Map();

    // 1. Fetch remote Nextcloud WebDAV files in parallel
    try {
      const remoteResults = await Promise.all(folders.map((f) => this.listRemoteFolderFiles(f)));
      for (const list of remoteResults) {
        for (const item of list) {
          fileMap.set(item.url, item);
        }
      }
    } catch (e) {
      console.warn('[WebDAVService] Remote listing notice:', e.message);
    }

    // 2. Scan local disk uploads
    for (const f of folders) {
      const dir = path.join(this.localUploadDir, f);
      if (fs.existsSync(dir)) {
        try {
          const filenames = fs.readdirSync(dir);
          for (const fname of filenames) {
            try {
              const fpath = path.join(dir, fname);
              const stats = fs.statSync(fpath);
              if (stats.isFile()) {
                const url = `/uploads/${f}/${fname}`;
                if (!fileMap.has(url)) {
                  fileMap.set(url, {
                    name: fname,
                    subfolder: f,
                    url,
                    sizeBytes: stats.size,
                    sizeFormatted: this.formatBytes(stats.size),
                    mimeType: this.getMimeType(path.extname(fname).toLowerCase()),
                    modifiedAt: stats.mtime,
                    source: 'local-disk'
                  });
                } else {
                  const existing = fileMap.get(url);
                  existing.isCachedLocally = true;
                }
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
    }

    // 3. Scan database for any referenced upload URLs to ensure complete visibility
    if (db && typeof db.query === 'function') {
      try {
        const addDbAsset = (rawUrl, extraMeta = {}) => {
          if (!rawUrl || typeof rawUrl !== 'string') return;
          const match = rawUrl.match(/\/uploads\/([^\/]+)\/([^\/?#]+)/i);
          if (match) {
            const [, folder, fname] = match;
            if (folders.includes(folder)) {
              const url = `/uploads/${folder}/${fname}`;
              if (!fileMap.has(url)) {
                fileMap.set(url, {
                  name: fname,
                  subfolder: folder,
                  url,
                  sizeBytes: 0,
                  sizeFormatted: 'Uploaded',
                  mimeType: this.getMimeType(path.extname(fname).toLowerCase()),
                  modifiedAt: extraMeta.createdAt ? new Date(extraMeta.createdAt) : new Date(),
                  source: 'database-record',
                  ...extraMeta
                });
              } else {
                const existing = fileMap.get(url);
                if (extraMeta.jobTitle) existing.jobTitle = extraMeta.jobTitle;
                if (extraMeta.deadline) existing.deadline = extraMeta.deadline;
                if (extraMeta.createdAt) {
                  existing.createdAt = extraMeta.createdAt;
                  existing.modifiedAt = extraMeta.createdAt;
                }
              }
            }
          }
        };

        const teachers = await db.query('SELECT avatar_url, resume_url FROM teacher_profiles WHERE avatar_url IS NOT NULL OR resume_url IS NOT NULL');
        for (const t of teachers) {
          addDbAsset(t.avatar_url);
          addDbAsset(t.resume_url);
        }

        const schools = await db.query('SELECT logo_url, banner_url, campus_photos FROM school_profiles WHERE logo_url IS NOT NULL OR banner_url IS NOT NULL OR campus_photos IS NOT NULL');
        for (const s of schools) {
          addDbAsset(s.logo_url);
          addDbAsset(s.banner_url);
          if (s.campus_photos) {
            try {
              const photos = typeof s.campus_photos === 'string' ? JSON.parse(s.campus_photos) : s.campus_photos;
              if (Array.isArray(photos)) {
                for (const p of photos) {
                  const u = typeof p === 'string' ? p : p?.url;
                  addDbAsset(u);
                }
              }
            } catch (_) {}
          }
        }

        const posts = await db.query('SELECT image_url FROM community_posts WHERE image_url IS NOT NULL');
        for (const p of posts) {
          addDbAsset(p.image_url);
        }

        // Include vacancy recruitment flyers & posters from jobs table
        const jobs = await db.query('SELECT poster_url, title, deadline, created_at FROM jobs WHERE poster_url IS NOT NULL');
        for (const j of jobs) {
          addDbAsset(j.poster_url, {
            jobTitle: j.title,
            deadline: j.deadline,
            createdAt: j.created_at
          });
        }
      } catch (dbErr) {
        console.warn('[WebDAVService] DB scan notice:', dbErr.message);
      }
    }

    const files = Array.from(fileMap.values());
    // Sort newest first
    files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    return files;
  }

  /**
   * Aggregate storage usage across all categories
   */
  async getStorageStats() {
    const allFiles = await this.listFiles();
    const folders = ['avatars', 'resumes', 'logos', 'schools', 'posts', 'jobs'];
    const categories = {};
    let totalFiles = allFiles.length;
    let totalSizeBytes = 0;

    for (const f of folders) {
      const folderFiles = allFiles.filter((file) => file.subfolder === f);
      const sizeBytes = folderFiles.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0);
      totalSizeBytes += sizeBytes;
      categories[f] = {
        folder: f,
        count: folderFiles.length,
        sizeBytes,
        sizeFormatted: this.formatBytes(sizeBytes)
      };
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
