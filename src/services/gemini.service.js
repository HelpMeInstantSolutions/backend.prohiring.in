let db = null;
try {
  db = require('../config/database');
} catch (e) {}

class GeminiService {
  constructor() {
    this.defaultApiKey = process.env.GEMINI_API_KEY || '';
    this.defaultProjectId = process.env.GEMINI_PROJECT_ID || '457270571268';
    this.defaultModel = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  }

  /**
   * Retrieves active AI configurations from system_settings with fallbacks
   */
  async getConfig() {
    try {
      const rows = await db.query(
        `SELECT setting_key, setting_value FROM system_settings 
         WHERE setting_key IN ('ai_enabled', 'ai_job_extraction_enabled', 'gemini_api_key', 'gemini_project_id', 'gemini_model')`
      );

      const map = {};
      for (const r of rows) {
        map[r.setting_key] = r.setting_value;
      }

      return {
        aiEnabled: map.ai_enabled !== 'false',
        jobExtractionEnabled: map.ai_job_extraction_enabled !== 'false',
        apiKey: (map.gemini_api_key || this.defaultApiKey).trim(),
        projectId: (map.gemini_project_id || this.defaultProjectId).trim(),
        model: (map.gemini_model || this.defaultModel).trim()
      };
    } catch (e) {
      console.warn('[GeminiService] Could not read system_settings, using defaults:', e.message);
      return {
        aiEnabled: true,
        jobExtractionEnabled: true,
        apiKey: this.defaultApiKey,
        projectId: this.defaultProjectId,
        model: this.defaultModel
      };
    }
  }

  /**
   * Test and verify Google Gemini credentials
   */
  async verifyCredentials(customApiKey = null, customModel = null, customProjectId = null) {
    const config = await this.getConfig();
    const apiKey = (customApiKey || config.apiKey).trim();
    const model = (customModel || config.model).trim();

    if (!apiKey) {
      return { success: false, message: 'Google Gemini API key is required.' };
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with valid JSON: {"status":"verified","service":"gemini_vision"}' }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `API returned status ${res.status}`);
      }

      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return {
        success: true,
        message: `Google Gemini Vision connected successfully! Model "${model}" is active.`,
        model,
        sampleOutput: responseText
      };
    } catch (err) {
      console.error('[GeminiService] verifyCredentials error:', err.message);
      return {
        success: false,
        message: `Gemini verification failed: ${err.message}`
      };
    }
  }

  /**
   * Analyzes a school hiring advertisement / flyer image and extracts structured jobs JSON
   * @param {Buffer} imageBuffer - Binary buffer of image
   * @param {string} mimeType - e.g. 'image/jpeg', 'image/png'
   */
  async extractJobsFromImage(imageBuffer, mimeType = 'image/jpeg') {
    const config = await this.getConfig();

    if (!config.aiEnabled) {
      throw new Error('AI features are currently disabled in platform settings.');
    }
    if (!config.jobExtractionEnabled) {
      throw new Error('AI Job Extraction through image upload is currently turned off by administrator.');
    }
    if (!config.apiKey) {
      throw new Error('Google Gemini API Key is missing. Please configure it in Admin Settings.');
    }

    const base64Data = imageBuffer.toString('base64');

    const promptText = `
You are an expert recruitment assistant for Indian schools, academies, colleges, and educational institutes.
Analyze this school recruitment advertisement / hiring flyer / newspaper clipping image carefully and extract ALL job vacancies listed.

IMPORTANT RULES:
1. A single recruitment flyer often lists MULTIPLE vacancies (e.g. NTT, PRT, TGT, PGT, Principal, Vice Principal, Admin Clerk, Accountant, Lab Assistant, Peon, Mali, Sports Coach, Driver, etc.). Extract every single one of them as a separate item in the "jobs" array.
2. For each vacancy, determine:
   - "title": Clean, professional vacancy title (e.g., "PGT Mathematics Teacher", "TGT English Teacher", "School Office Clerk / Front Desk")
   - "post_type": Must be one of: "Teaching Staff", "Non-Teaching Staff", "Sports, Arts & Activity Staff"
   - "designation": Specific designation name (e.g., "PGT (Post Graduate Teacher - Classes XI-XII)", "TGT (Trained Graduate Teacher - Classes VI-X)", "PRT (Primary Teacher - Classes I-V)", "NTT (Nursery / Kindergarten / Pre-Primary)", "Clerk / Office Assistant", "Peon / Multitasking Staff (MTS)", "Accountant / Cashier", "Librarian / Assistant Librarian")
   - "subject": Specific subject being taught or department (e.g. "Mathematics", "English", "General Administration", "Physics", "Chemistry", "Computer Science / IT", "All Subjects (General PRT)")
   - "qualification": Qualification mentioned or inferred (e.g. "M.Sc, B.Ed", "B.A, B.Ed", "Graduate with computer skills")
   - "experience_required": e.g. "1-3 Years", "2-5 Years", "Fresher / 0-2 Years"
   - "salary_min": number in INR (e.g. 25000) or 0 if not stated
   - "salary_max": number in INR (e.g. 35000) or 0 if not stated
   - "salary_negotiable": true
   - "job_type": "full_time" | "part_time" | "contract"
   - "openings": number (default 1)
   - "description": Comprehensive, professional job summary combining responsibilities, subject requirements, and school expectations.
   - "responsibilities": Key responsibilities
   - "benefits": Benefits if mentioned (e.g. "PF, Transport, Subsidized Child Education")

3. Extract overall flyer metadata if visible:
   - "school_name": School or institute name
   - "contact_phone": Phone number(s)
   - "contact_email": Email address(es)
   - "address": Campus location / address
   - "interview_timing": e.g. "10:00 AM to 01:00 PM" or "Walk-in interview on Sunday"
   - "deadline": If an application deadline is mentioned (format YYYY-MM-DD), else null

Return ONLY a valid JSON object matching this structure:
{
  "flyer_metadata": {
    "school_name": "string or null",
    "contact_phone": "string or null",
    "contact_email": "string or null",
    "address": "string or null",
    "interview_timing": "string or null",
    "deadline": "YYYY-MM-DD or null"
  },
  "jobs": [
    {
      "title": "string",
      "post_type": "Teaching Staff",
      "designation": "string",
      "subject": "string",
      "qualification": "string",
      "experience_required": "string",
      "salary_min": 0,
      "salary_max": 0,
      "salary_negotiable": true,
      "job_type": "full_time",
      "openings": 1,
      "description": "string",
      "responsibilities": "string",
      "benefits": "string"
    }
  ]
}
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Gemini Vision failed with status ${res.status}`);
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('Gemini Vision did not return content.');
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[GeminiService] Failed to parse JSON response:', rawText);
      throw new Error('Could not parse AI response as valid JSON.');
    }

    const jobs = Array.isArray(parsedResult.jobs) ? parsedResult.jobs : [];
    if (jobs.length === 0) {
      throw new Error('No job vacancies could be identified in the uploaded image.');
    }

    return {
      success: true,
      flyerMetadata: parsedResult.flyer_metadata || {},
      jobsCount: jobs.length,
      jobs
    };
  }
}

module.exports = new GeminiService();
