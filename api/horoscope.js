const {
  createResponse,
  buildError,
  authenticateUser,
  enforceAllowedOrigin,
  optionalRateLimit,
  getUserState,
  createId,
  getCurrentDateId,
  getCurrentMonthId,
  getCurrentWeekId
} = require('./_lib/personal-backend');

const VALID_SIGNS = new Set(['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces']);
const VALID_PERIODS = new Set(['daily','weekly','monthly']);

function normaliseProviderResponse(payload) {
  const reading = payload && (payload.reading || payload.text || payload.summary || payload.horoscope || '');
  return {
    reading: String(reading || '').trim(),
    provider: payload && (payload.provider || process.env.HOROSCOPE_PROVIDER_NAME || 'Provider'),
    updatedAt: payload && (payload.updatedAt || payload.date || new Date().toISOString())
  };
}

function getTimeIdentifier(period) {
  if (period === 'daily') return getCurrentDateId();
  if (period === 'weekly') return getCurrentWeekId();
  return getCurrentMonthId();
}

async function fetchProviderReading(sign, period) {
  if (!process.env.HOROSCOPE_API_URL || !process.env.HOROSCOPE_API_KEY) {
    return { configured: false };
  }

  const url = new URL(process.env.HOROSCOPE_API_URL);
  url.searchParams.set('sign', sign);
  url.searchParams.set('period', period);
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${process.env.HOROSCOPE_API_KEY}` }
  });
  if (!response.ok) {
    throw new Error(`provider:${response.status}`);
  }
  const payload = await response.json().catch(() => ({}));
  return { configured: true, payload: normaliseProviderResponse(payload) };
}

module.exports = async function handler(req, res = createResponse()) {
  if (!enforceAllowedOrigin(req, res)) return res;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json(buildError('INVALID_REQUEST', 'Only GET is supported for this endpoint.', 405));

  const rate = optionalRateLimit(`horoscope:${req.headers['x-forwarded-for'] || 'local'}`, 60000, 30);
  if (!rate.ok) return res.status(429).json(buildError('OPENAI_RATE_LIMITED', 'Horoscope lookups are being rate-limited. Please try again shortly.', 429));

  const sign = String((req.query && req.query.sign) || '').toLowerCase();
  const period = String((req.query && req.query.period) || '').toLowerCase();
  if (!VALID_SIGNS.has(sign) || !VALID_PERIODS.has(period)) {
    return res.status(400).json(buildError('INVALID_REQUEST', 'Provide a valid sign and period.', 400));
  }

  const auth = authenticateUser(req);
  const userId = auth.user ? auth.user.id : 'anonymous';
  const state = getUserState(userId);
  const timeId = getTimeIdentifier(period);
  const existing = state.horoscopeCache.find(item => item.userId === userId && item.sign === sign && item.period === period && item.timeId === timeId);
  const sharedFallback = state.horoscopeCache.find(item => item.sign === sign && item.period === period && item.timeId === timeId);
  if (existing || sharedFallback) {
    const fallback = existing || sharedFallback;
    return res.status(200).json({ ok: true, sign, period, reading: fallback.reading, provider: fallback.provider, updatedAt: fallback.updatedAt, cached: true });
  }

  if (!process.env.HOROSCOPE_API_URL || !process.env.HOROSCOPE_API_KEY) {
    return res.status(500).json(buildError('HOROSCOPE_NOT_CONFIGURED', 'Current horoscope readings have not been configured yet.', 500));
  }

  try {
    const providerResult = await fetchProviderReading(sign, period);
    if (!providerResult.configured) {
      return res.status(500).json(buildError('HOROSCOPE_NOT_CONFIGURED', 'Current horoscope readings have not been configured yet.', 500));
    }

    const payload = {
      id: createId('horoscope'),
      userId,
      sign,
      period,
      timeId,
      reading: providerResult.payload.reading,
      provider: providerResult.payload.provider,
      updatedAt: providerResult.payload.updatedAt || new Date().toISOString(),
      cached: false
    };
    state.horoscopeCache.push(payload);
    return res.status(200).json({ ok: true, sign, period, reading: payload.reading, provider: payload.provider, updatedAt: payload.updatedAt, cached: false });
  } catch (error) {
    const fallback = state.horoscopeCache.find(item => item.userId === userId && item.sign === sign && item.period === period && item.timeId === timeId);
    if (fallback) {
      return res.status(200).json({ ok: true, sign, period, reading: fallback.reading, provider: fallback.provider, updatedAt: fallback.updatedAt, cached: true });
    }
    return res.status(503).json(buildError('HOROSCOPE_PROVIDER_UNAVAILABLE', 'The horoscope provider is temporarily unavailable.', 503));
  }
};
