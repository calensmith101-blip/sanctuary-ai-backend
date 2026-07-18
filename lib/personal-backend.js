const crypto = require('node:crypto');

const DEFAULT_ALLOWED_ORIGINS = 'https://sanctuary-app.example.com,http://localhost:3000,http://localhost:5173';
const ALLOWED_ORIGINS = [
  ...(process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS).split(','),
  process.env.APP_URL,
  process.env.VITE_APP_URL
].map(v => String(v || '').trim().replace(/\/+$/, '')).filter(Boolean);
const PERSONAL_ORIGINS = new Set(ALLOWED_ORIGINS);

const STATE = globalThis.__personalStore || (globalThis.__personalStore = {
  guideConversations: {},
  guideMemories: {},
  mealPlans: {},
  exercisePlans: {},
  exerciseSessions: {},
  horoscopeCache: [],
  trustedContacts: {},
  professionalContacts: {},
  accountExports: {},
  deletedUsers: new Set()
});

function createResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      if (payload !== undefined) this.body = payload;
      return this;
    }
  };
  return res;
}

function isJsonContent(req) {
  return req.headers && req.headers['content-type'] && req.headers['content-type'].includes('application/json');
}

function parseBody(req) {
  if (req.body !== undefined) return req.body;
  if (req.method === 'GET' || req.method === 'DELETE') return {};
  return {}; 
}

function getRequestBody(req) {
  if (req.body !== undefined) return req.body;
  return {};
}

function buildError(code, message, statusCode = 500) {
  return {
    ok: false,
    error: { code, message }
  };
}

function sanitizeUserInput(value, maxLength = 2000) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function authenticateUser(req) {
  const authHeader = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: buildError('AUTH_REQUIRED', 'Authentication is required for this private Sanctuary resource.', 401) };
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return { user: null, error: buildError('AUTH_REQUIRED', 'Authentication is required for this private Sanctuary resource.', 401) };
  }
  const userId = token.startsWith('user-') ? token : `user:${token}`;
  return { user: { id: userId }, error: null };
}

function validateRequest(payload, rules = {}) {
  const errors = [];
  for (const [field, rule] of Object.entries(rules)) {
    if (rule.required && !payload[field]) errors.push(`${field} is required`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

function handleApiError(res, errorCode, message, statusCode = 500) {
  res.status(statusCode).json(buildError(errorCode, message, statusCode));
}

function enforceAllowedOrigin(req, res) {
  const origin = req.headers && (req.headers.origin || req.headers.Origin);
  if (!origin) return true;
  if (PERSONAL_ORIGINS.has('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    return true;
  }
  if (PERSONAL_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    return true;
  }
  res.status(403).json(buildError('FORBIDDEN', 'Origin is not allowed for this personal Sanctuary backend.', 403));
  return false;
}

function optionalRateLimit(key, windowMs = 60000, maxRequests = 120) {
  const now = Date.now();
  const bucket = globalThis.__personalRateLimit || (globalThis.__personalRateLimit = {});
  const entry = bucket[key] || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  if (entry.count >= maxRequests) {
    return { ok: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  bucket[key] = entry;
  return { ok: true, retryAfterSeconds: 0 };
}

function getUserState(userId) {
  if (!userId) return null;
  if (!STATE.guideConversations[userId]) STATE.guideConversations[userId] = [];
  if (!STATE.guideMemories[userId]) STATE.guideMemories[userId] = [];
  if (!STATE.mealPlans[userId]) STATE.mealPlans[userId] = [];
  if (!STATE.exercisePlans[userId]) STATE.exercisePlans[userId] = [];
  if (!STATE.exerciseSessions[userId]) STATE.exerciseSessions[userId] = [];
  if (!STATE.trustedContacts[userId]) STATE.trustedContacts[userId] = [];
  if (!STATE.professionalContacts[userId]) STATE.professionalContacts[userId] = [];
  if (!STATE.accountExports[userId]) STATE.accountExports[userId] = { conversations: [], memories: [], mealPlans: [] };
  return STATE;
}

function listToHash(items) {
  return items.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});
}

function createId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

function getCurrentWeekId() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 1));
  const diff = now.getUTCDate() - 1;
  const week = Math.ceil((((now.getTime() - first.getTime()) / 86400000) + first.getDay() + 1) / 7);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

function getCurrentDateId() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentMonthId() {
  return new Date().toISOString().slice(0, 7);
}

function createHealthPayload() {
  return {
    status: 'ok',
    service: 'sanctuary-ai-backend',
    version: 'personal',
    timestamp: new Date().toISOString(),
    services: {
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      horoscopeConfigured: Boolean(process.env.HOROSCOPE_API_URL && process.env.HOROSCOPE_API_KEY)
    }
  };
}

module.exports = {
  ALLOWED_ORIGINS,
  PERSONAL_ORIGINS,
  STATE,
  createResponse,
  isJsonContent,
  parseBody,
  getRequestBody,
  buildError,
  sanitizeUserInput,
  authenticateUser,
  validateRequest,
  handleApiError,
  enforceAllowedOrigin,
  optionalRateLimit,
  getUserState,
  listToHash,
  createId,
  getCurrentWeekId,
  getCurrentDateId,
  getCurrentMonthId,
  createHealthPayload
};
