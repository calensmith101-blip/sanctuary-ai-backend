const {
  createResponse,
  buildError,
  enforceAllowedOrigin,
  optionalRateLimit,
  sanitizeUserInput
} = require('../lib/personal-backend');

const VALID_SIGNS = new Set([
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
]);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function normaliseSign(value) {
  const cleaned = sanitizeUserInput(String(value || ''), 20).toLowerCase();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function normaliseAge(value) {
  const age = Number.parseInt(value, 10);
  return Number.isFinite(age) && age >= 13 && age <= 110 ? age : null;
}

function normalisePerson(value, fallbackLabel) {
  const person = value && typeof value === 'object' ? value : {};
  return {
    name: sanitizeUserInput(String(person.name || fallbackLabel), 60) || fallbackLabel,
    age: normaliseAge(person.age),
    gender: sanitizeUserInput(String(person.gender || ''), 40),
    pronouns: sanitizeUserInput(String(person.pronouns || ''), 40),
    sign: normaliseSign(person.sign),
    birthDate: sanitizeUserInput(String(person.birthDate || ''), 20),
    birthTime: sanitizeUserInput(String(person.birthTime || ''), 20),
    birthPlace: sanitizeUserInput(String(person.birthPlace || ''), 100)
  };
}

function clampScore(value) {
  const score = Number.parseInt(value, 10);
  if (!Number.isFinite(score)) return 70;
  return Math.max(0, Math.min(100, score));
}

function normaliseScores(value) {
  const scores = value && typeof value === 'object' ? value : {};
  return {
    overall: clampScore(scores.overall),
    communication: clampScore(scores.communication),
    emotional: clampScore(scores.emotional),
    romance: clampScore(scores.romance),
    trust: clampScore(scores.trust),
    conflict: clampScore(scores.conflict),
    friendship: clampScore(scores.friendship),
    longterm: clampScore(scores.longterm)
  };
}

function listText(items) {
  return Array.isArray(items)
    ? items.map(item => sanitizeUserInput(String(item || ''), 50)).filter(Boolean).slice(0, 8)
    : [];
}

function fallbackReport(context) {
  const { personOne, personTwo, relationshipStage, additionalContext, focusAreas, scores, strengths, friction } = context;
  const focus = focusAreas.length ? focusAreas.join(', ').toLowerCase() : 'the relationship as a whole';
  const adultPair = (personOne.age === null || personOne.age >= 18) && (personTwo.age === null || personTwo.age >= 18);
  return {
    title: `${personOne.sign} + ${personTwo.sign}: Full Relationship Reading`,
    overview: `${personOne.name} and ${personTwo.name} bring a ${personOne.sign}–${personTwo.sign} dynamic with an overall compatibility indicator of ${scores.overall}%. In a ${relationshipStage.toLowerCase()} connection, the strongest path forward is to treat the scores as reflection points rather than fixed predictions. ${additionalContext ? `The context shared — ${additionalContext} — should be considered alongside the signs and scores. ` : ''}Your stated focus on ${focus} suggests the relationship will benefit most from honest expectations, emotional steadiness, and practical follow-through.`,
    strengths: strengths
      ? `The clearest natural advantage in this pairing is ${strengths.toLowerCase()}. When both people make room for the other person's pace and style, that strength can become the relationship's anchor.`
      : `This pairing can combine different strengths in a way that encourages growth, curiosity, and a stronger sense of partnership.`,
    communication: `With a communication indicator of ${scores.communication}%, the relationship is likely to feel strongest when needs are stated directly rather than hinted at. ${personOne.name} and ${personTwo.name} should check what the other person heard before assuming the message landed as intended.`,
    emotional: `The emotional indicator is ${scores.emotional}%. Emotional safety will grow through consistency: listening without immediately fixing, naming feelings without blame, and making repair attempts after tension rather than waiting for the other person to move first.`,
    romance: adultPair
      ? `The romance indicator is ${scores.romance}%. Attraction may be supported by a mix of familiarity and contrast. Keep affection intentional and discuss what closeness means to each person instead of relying on assumptions.`
      : `The connection indicator is ${scores.romance}%. Keep the reading age-appropriate and focus on respect, friendship, healthy boundaries, and emotional safety.`,
    trust: `Trust sits at ${scores.trust}%. It will be strengthened by predictable actions, clear boundaries, and avoiding tests or mind-reading. Small promises kept consistently will matter more than dramatic reassurance.`,
    conflict: `The conflict-recovery indicator is ${scores.conflict}%. ${friction ? `A likely pressure point is ${friction.toLowerCase()}. ` : ''}Pause before escalation, discuss one issue at a time, and agree on how to return to the conversation if either person needs space.`,
    longTerm: `The long-term indicator is ${scores.longterm}%. The future of this relationship depends less on the signs themselves and more on whether both people can align daily habits, values, expectations, and willingness to repair.`,
    advice: `Choose one practical conversation this week about ${focus}. Each person should explain what they need, what they can realistically offer, and one behaviour that would help them feel more secure.`,
    questions: [
      'What helps each of us feel heard rather than merely answered?',
      'Which differences between us are useful, and which require a clear agreement?',
      'What does trust look like in ordinary day-to-day behaviour?',
      'How do we want to repair after an argument?',
      'What are we each hoping this connection becomes?'
    ],
    exercises: [
      'Ten-minute check-in: five uninterrupted minutes each to speak, followed by one sentence summarising what you heard.',
      'Appreciation practice: name one specific action from the other person that made the relationship feel safer this week.',
      'Expectation reset: write down one need, one boundary, and one promise each person can realistically keep.'
    ],
    disclaimer: 'This is a reflective astrology-based interpretation for insight and entertainment. It is not a scientific prediction or a guarantee about a relationship.'
  };
}

function parseModelJson(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) { return null; }
    }
    return null;
  }
}

function mergeReport(modelReport, fallback) {
  if (!modelReport || typeof modelReport !== 'object') return fallback;
  const textFields = ['title', 'overview', 'strengths', 'communication', 'emotional', 'romance', 'trust', 'conflict', 'longTerm', 'advice', 'disclaimer'];
  const merged = { ...fallback };
  textFields.forEach(field => {
    const value = sanitizeUserInput(String(modelReport[field] || ''), field === 'title' ? 120 : 2200);
    if (value) merged[field] = value;
  });
  const questions = listText(modelReport.questions);
  const exercises = listText(modelReport.exercises);
  if (questions.length >= 3) merged.questions = questions;
  if (exercises.length >= 2) merged.exercises = exercises;
  return merged;
}

function buildPrompt(context) {
  const { personOne, personTwo, relationshipStage, additionalContext, focusAreas, scores, strengths, friction } = context;
  const minors = (personOne.age !== null && personOne.age < 18) || (personTwo.age !== null && personTwo.age < 18);
  return `Create a warm, thoughtful Sanctuary-style relationship compatibility reading.

Use astrology as a reflective framework, never as scientific fact or a guaranteed prediction. Base the reading only on the supplied signs, compatibility indicators, ages/life stage, relationship context, and stated concerns. Do not invent birth-chart placements, houses, synastry aspects, personality diagnoses, trauma, or facts not provided. Avoid stereotypes based on gender. Gender and pronouns are only for respectful wording. ${minors ? 'At least one person may be under 18: keep every section age-appropriate and do not include sexual or adult intimacy content.' : 'Keep romance tasteful and non-explicit.'}

Person one:
${JSON.stringify(personOne)}

Person two:
${JSON.stringify(personTwo)}

Relationship stage: ${relationshipStage}
Additional relationship context: ${additionalContext || 'None supplied'}
Focus areas: ${focusAreas.join(', ') || 'General relationship insight'}
Compatibility indicators: ${JSON.stringify(scores)}
Existing matrix strength: ${strengths || 'Not supplied'}
Existing matrix friction: ${friction || 'Not supplied'}

Return ONLY valid JSON with these exact keys:
{
  "title": "...",
  "overview": "...",
  "strengths": "...",
  "communication": "...",
  "emotional": "...",
  "romance": "...",
  "trust": "...",
  "conflict": "...",
  "longTerm": "...",
  "advice": "...",
  "questions": ["...", "...", "...", "...", "..."],
  "exercises": ["...", "...", "..."],
  "disclaimer": "This is a reflective astrology-based interpretation for insight and entertainment. It is not a scientific prediction or a guarantee about a relationship."
}

Make the writing specific to the supplied pairing and context. Give practical, grounded guidance. Do not claim a percentage is the chance the relationship will succeed.`;
}

module.exports = async function handler(req, res = createResponse()) {
  setCors(res);
  if (!enforceAllowedOrigin(req, res)) return res;
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json(buildError('INVALID_REQUEST', 'Only POST is supported for this endpoint.', 405));

  const rate = optionalRateLimit(`compatibility:${req.headers['x-forwarded-for'] || 'local'}`, 60000, 30);
  if (!rate.ok) return res.status(429).json(buildError('RATE_LIMITED', 'Compatibility readings are temporarily busy. Please try again shortly.', 429));

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const personOne = normalisePerson(payload.personOne, 'Person One');
  const personTwo = normalisePerson(payload.personTwo, 'Person Two');
  const relationshipStage = sanitizeUserInput(String(payload.relationshipStage || 'Exploring a connection'), 80) || 'Exploring a connection';
  const additionalContext = sanitizeUserInput(String(payload.additionalContext || ''), 700);
  const focusAreas = listText(payload.focusAreas);
  const scores = normaliseScores(payload.scores);
  const strengths = sanitizeUserInput(String(payload.strengths || ''), 200);
  const friction = sanitizeUserInput(String(payload.friction || ''), 200);

  if (!VALID_SIGNS.has(personOne.sign) || !VALID_SIGNS.has(personTwo.sign)) {
    return res.status(400).json(buildError('INVALID_REQUEST', 'Both people must have a valid zodiac sign.', 400));
  }

  const context = { personOne, personTwo, relationshipStage, additionalContext, focusAreas, scores, strengths, friction };
  const fallback = fallbackReport(context);

  if (!process.env.OPENAI_API_KEY) {
    return res.status(200).json({ ok: true, report: fallback, generatedBy: 'sanctuary-fallback' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.75,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You write nuanced, warm relationship reflections. You do not present astrology as scientific fact, do not diagnose people, and do not make guaranteed predictions.'
          },
          { role: 'user', content: buildPrompt(context) }
        ]
      })
    });

    if (!response.ok) {
      return res.status(200).json({ ok: true, report: fallback, generatedBy: 'sanctuary-fallback' });
    }

    const data = await response.json().catch(() => ({}));
    const raw = data.choices?.[0]?.message?.content || '';
    const report = mergeReport(parseModelJson(raw), fallback);
    return res.status(200).json({ ok: true, report, generatedBy: 'openai' });
  } catch (_) {
    return res.status(200).json({ ok: true, report: fallback, generatedBy: 'sanctuary-fallback' });
  }
};
