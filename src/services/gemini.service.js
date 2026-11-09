let db = null;
try {
  db = require('../config/database');
} catch (e) {}

const DEFAULT_TAXONOMY = [
  {
    name: 'Teaching Staff',
    designations: [
      {
        name: 'PGT (Post Graduate Teacher - Classes XI-XII)',
        code: 'PGT',
        subjects: ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English Core', 'Hindi Core', 'Computer Science / IP', 'Accountancy', 'Business Studies', 'Economics', 'History', 'Political Science', 'Geography', 'Physical Education', 'Psychology', 'Sociology']
      },
      {
        name: 'TGT (Trained Graduate Teacher - Classes VI-X)',
        code: 'TGT',
        subjects: ['Science (Physics/Chemistry/Bio)', 'Mathematics', 'English', 'Hindi', 'Social Science (SST)', 'Sanskrit', 'Computer Science / IT', 'Art & Craft']
      },
      {
        name: 'PRT (Primary Teacher - Classes I-V)',
        code: 'PRT',
        subjects: ['All Subjects (General PRT)', 'English', 'Mathematics', 'EVS / Environmental Science', 'Hindi', 'Social Studies']
      },
      {
        name: 'NTT (Nursery / Kindergarten / Pre-Primary)',
        code: 'NTT',
        subjects: ['Early Childhood Education (ECCE)', 'Phonics & Rhymes', 'Activity & Creative Play']
      },
      {
        name: 'Principal / Vice Principal',
        code: 'LEADERSHIP',
        subjects: ['Academic Administration', 'School Leadership & Operations']
      },
      {
        name: 'Special Educator',
        code: 'SPECIAL_ED',
        subjects: ['Special Education', 'Learning Disability Support']
      }
    ]
  },
  {
    name: 'Non-Teaching Staff',
    designations: [
      {
        name: 'Clerk / Office Assistant',
        code: 'CLERK',
        subjects: ['General Administration', 'Student Admissions & Records', 'Front Office Operations', 'Data Entry & Documentation']
      },
      {
        name: 'Accountant / Cashier',
        code: 'ACCOUNTS',
        subjects: ['School Accounts & Tally ERP', 'Student Fee Collection', 'Payroll & Staff Salaries', 'Taxation & Audits']
      },
      {
        name: 'Librarian / Assistant Librarian',
        code: 'LIBRARY',
        subjects: ['Library Science & Cataloging', 'Digital Library Operations', 'Resource & Book Management']
      },
      {
        name: 'Lab Assistant / Lab Technician',
        code: 'LAB',
        subjects: ['Physics Laboratory', 'Chemistry Laboratory', 'Biology Laboratory', 'Computer Hardware & Networking Lab']
      },
      {
        name: 'Receptionist / Front Desk Executive',
        code: 'FRONT_DESK',
        subjects: ['Front Desk & Reception', 'Parent Communication & Inquiries', 'Tele-calling & Admission Helpdesk']
      },
      {
        name: 'Counselor / Student Wellness',
        code: 'COUNSELOR',
        subjects: ['Student Career Guidance', 'Child Psychology & Behavioral Counseling']
      },
      {
        name: 'Peon / Multitasking Staff (MTS)',
        code: 'MTS',
        subjects: ['Office Support & Dispatch', 'Campus Maintenance & Utility']
      },
      {
        name: 'Transport Staff / Bus Driver',
        code: 'TRANSPORT',
        subjects: ['Heavy Bus Driving (RTO Licensed)', 'School Van Operations', 'Transport Supervisor']
      }
    ]
  },
  {
    name: 'Sports, Arts & Activity Staff',
    designations: [
      {
        name: 'Physical Education Teacher (PET) / Sports Coach',
        code: 'PET',
        subjects: ['Cricket Coaching', 'Football Coaching', 'Basketball Coaching', 'Badminton & Tennis', 'Athletics & Track', 'Yoga & Meditation']
      },
      {
        name: 'Music & Dance Teacher',
        code: 'MUSIC_DANCE',
        subjects: ['Classical Vocal Music', 'Western Music & Choir', 'Keyboard & Piano', 'Guitar & Instrumental', 'Classical Indian Dance', 'Western Dance']
      },
      {
        name: 'Art & Craft / Fine Arts Teacher',
        code: 'ART_CRAFT',
        subjects: ['Drawing & Painting', 'Clay Modeling & Pottery', 'Origami & Crafting', 'Commercial & Digital Art']
      }
    ]
  }
];

class GeminiService {
  constructor() {
    this.defaultApiKey = process.env.GEMINI_API_KEY || '';
    this.defaultProjectId = process.env.GEMINI_PROJECT_ID || '457270571268';
    this.defaultModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  }

  /**
   * Retrieves active AI configurations from system_settings with fallbacks
   */
  async getConfig() {
    try {
      if (!db || typeof db.query !== 'function') {
        throw new Error('Database connection not available');
      }
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
   * Queries active job taxonomy directly from MySQL database (job_categories, job_designations, job_subjects)
   * Mirroring https://admin.prohiring.in/categories
   */
  async getTaxonomy() {
    try {
      if (db && typeof db.query === 'function') {
        const categories = await db.query(
          'SELECT id, name, slug FROM job_categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
        );
        if (categories && categories.length > 0) {
          const designations = await db.query(
            'SELECT id, category_id, name, code FROM job_designations WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
          );
          const subjects = await db.query(
            'SELECT id, designation_id, name, code FROM job_subjects WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
          );

          const subjectsByDesig = {};
          subjects.forEach((s) => {
            if (!subjectsByDesig[s.designation_id]) subjectsByDesig[s.designation_id] = [];
            subjectsByDesig[s.designation_id].push(s.name);
          });

          const desigsByCat = {};
          designations.forEach((d) => {
            if (!desigsByCat[d.category_id]) desigsByCat[d.category_id] = [];
            desigsByCat[d.category_id].push({
              id: d.id,
              name: d.name,
              code: d.code,
              subjects: subjectsByDesig[d.id] || []
            });
          });

          return categories.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            designations: desigsByCat[c.id] || []
          }));
        }
      }
    } catch (err) {
      console.warn('[GeminiService] Could not query database taxonomy, using standard defaults:', err.message);
    }
    return DEFAULT_TAXONOMY;
  }

  /**
   * Builds prompt taxonomy summary according to admin categories
   */
  buildTaxonomyPrompt(taxonomy) {
    const lines = [];
    lines.push('OFFICIAL SCHOOL RECRUITMENT TAXONOMY (from https://admin.prohiring.in/categories):');
    for (const cat of taxonomy) {
      lines.push(`CATEGORY: "${cat.name}"`);
      for (const desig of cat.designations || []) {
        const subList = (desig.subjects || []).join(' | ');
        lines.push(`  - DESIGNATION: "${desig.name}" (Code: ${desig.code || 'None'})`);
        if (subList) {
          lines.push(`    STANDARD SUBJECTS: [${subList}]`);
        }
      }
    }
    return lines.join('\n');
  }

  /**
   * Normalizes extracted jobs so each job matches the dynamic taxonomy from admin.prohiring.in/categories
   */
  normalizeJobsWithTaxonomy(jobs, taxonomy) {
    if (!Array.isArray(jobs)) return [];

    return jobs.map((job) => {
      const rawPostType = (job.post_type || job.postType || '').toLowerCase().trim();
      const rawDesig = (job.designation || '').toLowerCase().trim();
      const rawTitle = (job.title || '').toLowerCase().trim();
      const rawSubject = (job.subject || '').trim();

      // 1. Resolve Category (post_type)
      let matchedCat = taxonomy.find((c) => c.name.toLowerCase() === rawPostType);
      if (!matchedCat) {
        matchedCat = taxonomy.find((c) => {
          const cName = c.name.toLowerCase();
          return rawPostType.includes(cName) || cName.includes(rawPostType);
        });
      }
      if (!matchedCat) {
        // If designation contains teacher/teaching
        if (rawDesig.includes('teacher') || rawTitle.includes('teacher') || rawDesig.includes('pgt') || rawDesig.includes('tgt') || rawDesig.includes('prt') || rawDesig.includes('ntt')) {
          matchedCat = taxonomy.find((c) => c.name.toLowerCase().includes('teaching')) || taxonomy[0];
        } else if (rawDesig.includes('clerk') || rawDesig.includes('accountant') || rawDesig.includes('librarian') || rawDesig.includes('peon') || rawDesig.includes('mts')) {
          matchedCat = taxonomy.find((c) => c.name.toLowerCase().includes('non-teaching')) || taxonomy[0];
        } else if (rawDesig.includes('sport') || rawDesig.includes('coach') || rawDesig.includes('pet') || rawDesig.includes('music') || rawDesig.includes('art')) {
          matchedCat = taxonomy.find((c) => c.name.toLowerCase().includes('sport') || c.name.toLowerCase().includes('art')) || taxonomy[0];
        } else {
          matchedCat = taxonomy[0];
        }
      }

      const postType = matchedCat.name;
      const desigsInCat = matchedCat.designations || [];

      // 2. Resolve Designation under category
      let matchedDesig = desigsInCat.find((d) => d.name.toLowerCase() === rawDesig);

      if (!matchedDesig) {
        // Match by code (PGT, TGT, PRT, NTT, etc.) or substring
        matchedDesig = desigsInCat.find((d) => {
          const dName = d.name.toLowerCase();
          const code = (d.code || '').toLowerCase();
          if (code && (rawDesig.includes(code) || rawTitle.includes(code))) return true;
          if (rawDesig && (dName.includes(rawDesig) || rawDesig.includes(dName.split(' ')[0]))) return true;
          return false;
        });
      }

      // If not found in current category, search across ALL categories
      if (!matchedDesig) {
        for (const cat of taxonomy) {
          const found = (cat.designations || []).find((d) => {
            const dName = d.name.toLowerCase();
            const code = (d.code || '').toLowerCase();
            return (code && (rawDesig.includes(code) || rawTitle.includes(code))) || dName.includes(rawDesig);
          });
          if (found) {
            matchedDesig = found;
            matchedCat = cat;
            break;
          }
        }
      }

      const finalPostType = matchedCat ? matchedCat.name : postType;
      const finalDesigName = matchedDesig ? matchedDesig.name : (desigsInCat[0]?.name || job.designation || 'Staff');
      const availableSubjects = matchedDesig?.subjects || [];

      // 3. Resolve Subject
      let finalSubject = rawSubject;
      if (finalSubject && availableSubjects.length > 0) {
        const rawSubjLower = finalSubject.toLowerCase();
        const matchedSubj = availableSubjects.find((s) => {
          const sLower = s.toLowerCase();
          return sLower === rawSubjLower || sLower.includes(rawSubjLower) || rawSubjLower.includes(sLower);
        });
        if (matchedSubj) {
          finalSubject = matchedSubj;
        }
      } else if (!finalSubject && availableSubjects.length > 0) {
        finalSubject = availableSubjects[0];
      }

      return {
        ...job,
        title: job.title || `${finalDesigName} - ${finalSubject || 'General'}`,
        post_type: finalPostType,
        postType: finalPostType,
        designation: finalDesigName,
        subject: finalSubject || 'General',
        qualification: job.qualification || job.qualification_required || 'Relevant Degree / Certification',
        qualification_required: job.qualification || job.qualification_required || 'Relevant Degree / Certification',
        experience_required: job.experience_required || '1-3 Years',
        salary_min: parseInt(job.salary_min, 10) || 0,
        salary_max: parseInt(job.salary_max, 10) || 0,
        salary_negotiable: job.salary_negotiable !== false,
        job_type: job.job_type || 'full_time',
        openings: parseInt(job.openings, 10) || 1,
        description: job.description || `${job.title || finalDesigName} position at school campus.`,
        responsibilities: job.responsibilities || '',
        benefits: job.benefits || 'Provident Fund, Campus Transport, Subsidized Child Education'
      };
    });
  }

  /**
   * Calls Google Gemini generateContent with automatic multi-model failover.
   * Handles 503 (high demand spikes) and 429 (rate limits) seamlessly by falling back
   * to alternative active models.
   */
  async callGeminiWithFailover(apiKey, configuredModel, bodyPayload) {
    const candidateModels = Array.from(new Set([
      configuredModel,
      'gemini-3.5-flash',
      'gemini-flash-lite-latest',
      'gemini-3.8-flash',
      'gemini-flash-latest'
    ].filter(Boolean)));

    let lastError = null;

    for (let i = 0; i < candidateModels.length; i++) {
      const currentModel = candidateModels[i];
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });

        const data = await res.json();

        // If high demand (503) or rate limit (429), attempt next model
        if (!res.ok) {
          const errMsg = data.error?.message || `HTTP ${res.status}`;
          const isHighDemandOrQuota = res.status === 503 || res.status === 429 || 
            errMsg.toLowerCase().includes('high demand') || 
            errMsg.toLowerCase().includes('quota') ||
            errMsg.toLowerCase().includes('capacity') ||
            errMsg.toLowerCase().includes('unavailable');

          if (isHighDemandOrQuota && i < candidateModels.length - 1) {
            console.warn(`[GeminiService] Model "${currentModel}" is experiencing high demand (${errMsg}). Auto-switching to fallback model "${candidateModels[i + 1]}"...`);
            lastError = new Error(`Model "${currentModel}" busy: ${errMsg}`);
            continue;
          }

          throw new Error(errMsg);
        }

        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
          throw new Error(`Model "${currentModel}" returned empty content.`);
        }

        return {
          modelUsed: currentModel,
          rawText,
          data
        };
      } catch (err) {
        lastError = err;
        const msg = err.message || '';
        const isHighDemand = msg.includes('503') || msg.toLowerCase().includes('high demand') || msg.toLowerCase().includes('fetch failed');
        if (isHighDemand && i < candidateModels.length - 1) {
          console.warn(`[GeminiService] Model "${currentModel}" notice (${msg}), falling back to "${candidateModels[i + 1]}"...`);
          continue;
        }
        if (i === candidateModels.length - 1) {
          throw err;
        }
      }
    }

    throw lastError || new Error('All Gemini candidate models failed.');
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
      const result = await this.callGeminiWithFailover(apiKey, model, {
        contents: [{ parts: [{ text: 'Respond with valid JSON: {"status":"verified","service":"gemini_vision"}' }] }],
        generationConfig: { responseMimeType: 'application/json' }
      });

      const modelNote = result.modelUsed === model ? `Model "${model}" is active.` : `Active (auto-routed to high-availability model "${result.modelUsed}").`;

      return {
        success: true,
        message: `Google Gemini Vision connected successfully! ${modelNote}`,
        model: result.modelUsed,
        sampleOutput: result.rawText
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

    // 1. Load active taxonomy directly from database (job_categories, job_designations, job_subjects)
    // according to https://admin.prohiring.in/categories
    const activeTaxonomy = await this.getTaxonomy();
    const taxonomyPromptText = this.buildTaxonomyPrompt(activeTaxonomy);
    const validCategoryNames = activeTaxonomy.map((c) => c.name);

    const promptText = `
You are an expert recruitment assistant for Indian schools, academies, colleges, and educational institutes.
Analyze this school recruitment advertisement / hiring flyer / newspaper clipping image carefully and extract ALL job vacancies listed.

=============================================================================
${taxonomyPromptText}
=============================================================================

MANDATORY RECRUITMENT RULES ACCORDING TO OFFICIAL TAXONOMY:
1. MULTIPLE VACANCIES: A single hiring advertisement often lists MULTIPLE vacancies (e.g. NTT, PRT, TGT, PGT, Principal, Clerk, Accountant, Librarian, Lab Assistant, Peon, Mali, Sports Coach, Music Teacher, Driver, etc.). Extract every single one of them as a distinct item in the "jobs" array.
2. STRICT TAXONOMY CLASSIFICATION (CRITICAL):
   - "post_type": MUST strictly match one of the official Category names: ${validCategoryNames.map((n) => `"${n}"`).join(', ')}.
   - "designation": MUST be matched to the most accurate Designation listed under that Category in the taxonomy above.
     * If the ad lists "PGT", map it to "PGT (Post Graduate Teacher - Classes XI-XII)".
     * If the ad lists "TGT", map it to "TGT (Trained Graduate Teacher - Classes VI-X)".
     * If the ad lists "PRT" or "Primary Teacher", map it to "PRT (Primary Teacher - Classes I-V)".
     * If the ad lists "NTT" or "Mother Teacher" or "Pre-Primary" or "Kindergarten", map it to "NTT (Nursery / Kindergarten / Pre-Primary)".
     * If the ad lists "Principal" or "Vice Principal" or "Director", map it to "Principal / Vice Principal".
     * If the ad lists "Clerk" or "Office Assistant", map it to "Clerk / Office Assistant".
     * If the ad lists "Accountant" or "Cashier", map it to "Accountant / Cashier".
     * If the ad lists "Librarian", map it to "Librarian / Assistant Librarian".
     * If the ad lists "Lab Assistant", map it to "Lab Assistant / Lab Technician".
     * If the ad lists "Receptionist", map it to "Receptionist / Front Desk Executive".
     * If the ad lists "Counselor", map it to "Counselor / Student Wellness".
     * If the ad lists "PET" or "Sports Coach" or "Physical Education", map it to "Physical Education Teacher (PET) / Sports Coach".
     * If the ad lists "Music" or "Dance", map it to "Music & Dance Teacher".
     * If the ad lists "Art" or "Craft" or "Drawing", map it to "Art & Craft / Fine Arts Teacher".
     * If the ad lists "Peon" or "Mali" or "Gardener" or "MTS" or "Attendant", map it to "Peon / Multitasking Staff (MTS)".
     * If the ad lists "Driver" or "Transport", map it to "Transport Staff / Bus Driver".
   - "subject": Select the matching subject from the STANDARD SUBJECTS listed under that designation. If the flyer specifies a specific subject not in the standard list (e.g., "French", "German", "Robotics", "Vedic Maths", "Skating"), keep the clean specific subject name.
   - "title": Clean, professional vacancy title (e.g., "PGT Mathematics Teacher", "TGT English Teacher", "School Office Clerk / Front Desk")
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

    const failoverResult = await this.callGeminiWithFailover(config.apiKey, config.model, {
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
    });

    const rawText = failoverResult.rawText;
    let parsedResult;
    try {
      parsedResult = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[GeminiService] Failed to parse JSON response:', rawText);
      throw new Error('Could not parse AI response as valid JSON.');
    }

    const rawJobs = Array.isArray(parsedResult.jobs) ? parsedResult.jobs : [];
    if (rawJobs.length === 0) {
      throw new Error('No job vacancies could be identified in the uploaded image.');
    }

    // Normalize all extracted jobs with the dynamic database taxonomy
    const normalizedJobs = this.normalizeJobsWithTaxonomy(rawJobs, activeTaxonomy);

    return {
      success: true,
      modelUsed: failoverResult.modelUsed,
      flyerMetadata: parsedResult.flyer_metadata || {},
      jobsCount: normalizedJobs.length,
      jobs: normalizedJobs
    };
  }
}

module.exports = new GeminiService();
