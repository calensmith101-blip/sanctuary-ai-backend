// Sanctuary Guide OpenAI backend for Vercel
// Endpoint: POST /api/sanctuary-guide
// Keep OPENAI_API_KEY in Vercel Environment Variables only.

const {
  createResponse,
  buildError,
  authenticateUser,
  enforceAllowedOrigin,
  optionalRateLimit,
  getUserState,
  createId,
  sanitizeUserInput
} = require('../lib/personal-backend');

const MODE_PROMPTS = {
  reflect: `You are Sanctuary Guide, a calm self-reflection coach. Support the user with reflection, feelings, thoughts, triggers, behaviour patterns, and grounded coping steps. Be warm, direct, and concise. Ask one meaningful question at a time. Avoid medical diagnosis. Never claim to be a psychologist, doctor, or therapist.`,
  accountable: `You are Sanctuary Guide in Accountability Mode. Gently challenge avoidance without shaming. Help the user notice patterns, own their choices, and identify a small next step.`,
  calm: `You are Sanctuary Guide in Calm Mode. Help the user feel grounded, present, and steady. Offer simple coping steps and calm reflection.`,
  recovery: `You are Sanctuary Guide in Recovery Mode. Support reflection, cravings, urges, relapse prevention, and compassionate coping without being clinical.`,
  relationships: `You are Sanctuary Guide in Relationships Mode. Help the user reflect on connection, boundary-setting, communication, and closeness.`,
  communication: `You are Sanctuary Guide in Communication Mode. Help the user reflect on how they express needs, listen, and repair misunderstandings.`,
  anger: `You are Sanctuary Guide in Anger Mode. Help the user understand what is underneath anger and identify safe next steps.`,
  anxiety: `You are Sanctuary Guide in Anxiety Mode. Help the user notice anxious patterns, body signals, and grounding strategies without diagnosing.`,
  confidence: `You are Sanctuary Guide in Confidence Mode. Help the user notice strengths, self-doubt, and practical ways to take action.`,
  motivation: `You are Sanctuary Guide in Motivation Mode. Help the user reduce overwhelm and find a realistic next step.`,
  grief: `You are Sanctuary Guide in Grief Mode. Offer gentle, grounded support around loss, sadness, and pacing.`,
  parenting: `You are Sanctuary Guide in Parenting Mode. Help the user reflect on care, repair, patience, and connection.`,
  workStress: `You are Sanctuary Guide in Work Stress Mode. Help the user notice pressure, overwhelm, and practical boundaries.`,
  cravings: `You are Sanctuary Guide in Cravings Mode. Help the user notice urges and choose one grounding action.`,
  sleep: `You are Sanctuary Guide in Sleep Mode. Help the user reflect on rest, stress, and a calming routine.`,
  decisions: `You are Sanctuary Guide in Decisions Mode. Help the user weigh options and take one practical next step.`,
  selfEsteem: `You are Sanctuary Guide in Self-Esteem Mode. Help the user notice inner criticism and build steadier self-trust.`
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function buildSystemPrompt(mode, memory = []) {
  const base = MODE_PROMPTS[mode] || MODE_PROMPTS.reflect;
  const memoryText = Array.isArray(memory) && memory.length ? `\n\nUser-approved memory context:\n${memory.map(item => `- ${item.type}: ${item.value}`).join('\n')}` : '';
  return `${base}${memoryText}\n\nSafety: If the user describes immediate danger, self-harm, or wanting to hurt someone, stop normal coaching and return a crisis response. In Australia, include emergency 000 and Lifeline 13 11 14. Do not diagnose or prescribe medication. Do not claim to be a licensed therapist or to have contacted emergency services. Ask one meaningful question at a time. Avoid giving huge lists.`;
}

function sanitiseConversation(conversation) {
  if (!Array.isArray(conversation)) return [];
  return conversation.slice(-12).map(item => ({ role: item.role, content: sanitizeUserInput(String(item.content || ''), 2500) })).filter(item => item.role && item.content);
}

function detectCrisis(message) {
  const text = `${message || ''}`.toLowerCase();
  const urgentSigns = [
    /suicide/i,
    /end my life/i,
    /kill myself/i,
    /hurt myself/i,
    /self-harm/i,
    /not want to be here/i,
    /want to die/i,
    /take my life/i,
    /jump off/i,
    /overdose/i,
    /hurt someone/i,
    /attack someone/i,
    /immediate danger/i
  ];
  const highRisk = urgentSigns.some(pattern => pattern.test(text));
  const hopeless = /(nothing left|can't go on|can't cope|won't make it through today|can't survive)/i.test(text);
  if (highRisk || hopeless) {
    return { crisisDetected: true, level: 'urgent', resources: [{ name: 'Emergency', phone: '000' }, { name: 'Lifeline', phone: '13 11 14' }] };
  }
  return { crisisDetected: false, level: 'none', resources: [] };
}

function ensureGuideResponse(reply, suggestedMemory = [], safety = { crisisDetected: false, level: 'none' }) {
  return {
    ok: true,
    reply,
    suggestedMemory,
    safety
  };
}

module.exports = async function handler(req, res = createResponse()) {
  setCors(res);
  if (!enforceAllowedOrigin(req, res)) return res;

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'sanctuary-guide' });
  if (req.method !== 'POST') return res.status(405).json(buildError('INVALID_REQUEST', 'Only POST is supported for this endpoint.', 405));

  const rate = optionalRateLimit(`guide:${req.headers['x-forwarded-for'] || 'local'}`, 60000, 120);
  if (!rate.ok) {
    return res.status(429).json(buildError('OPENAI_RATE_LIMITED', 'Sanctuary Guide is temporarily busy. Please try again shortly.', 429));
  }

  try {
    const payload = req.body || {};
    const message = sanitizeUserInput(String(payload.message || payload.input || ''), 2000);
    const mode = String(payload.mode || payload.modeId || 'reflect').toLowerCase();
    const conversation = sanitiseConversation(payload.conversation || payload.history || []);
    const memory = Array.isArray(payload.memory) ? payload.memory.filter(item => item && item.type && item.value) : [];

    if (!message) {
      return res.status(400).json(buildError('INVALID_REQUEST', 'A non-empty message is required.', 400));
    }

    const safety = detectCrisis(message);
    if (safety.crisisDetected) {
      const response = ensureGuideResponse('I’m concerned about your immediate safety. Please contact emergency or crisis support now.', [], safety);
      return res.status(200).json(response);
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json(buildError('OPENAI_NOT_CONFIGURED', 'Sanctuary Guide is not configured yet.', 500));
    }

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 700,
        messages: [
          { role: 'system', content: buildSystemPrompt(mode, memory) },
          ...conversation,
          { role: 'user', content: message }
        ]
      })
    });

    if (!openaiResponse.ok) {
      const data = await openaiResponse.json().catch(() => ({}));
      if (openaiResponse.status === 401) {
        return res.status(401).json(buildError('OPENAI_AUTH_FAILED', 'Sanctuary Guide is temporarily unavailable. Please try again soon.', 401));
      }
      if (openaiResponse.status === 429) {
        return res.status(429).json(buildError('OPENAI_RATE_LIMITED', 'Sanctuary Guide is temporarily busy. Please try again shortly.', 429));
      }
      if (openaiResponse.status === 403) {
        return res.status(500).json(buildError('OPENAI_QUOTA_EXCEEDED', 'Sanctuary Guide is temporarily busy. Please try again shortly.', 500));
      }
      return res.status(502).json(buildError('OPENAI_TEMPORARY_FAILURE', 'Sanctuary Guide is temporarily unavailable. Please try again soon.', 502));
    }

    const data = await openaiResponse.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || 'I hear you. What feels most important right now?';
    const suggestedMemory = [];

    const auth = authenticateUser(req);
    if (!auth.user) {
      return res.status(200).json(ensureGuideResponse(reply, suggestedMemory, safety));
    }

    const state = getUserState(auth.user.id);
    state.guideConversations[auth.user.id].push({ id: createId('conv'), createdAt: new Date().toISOString(), conversation: [...conversation, { role: 'user', content: message }, { role: 'assistant', content: reply }] });

    return res.status(200).json(ensureGuideResponse(reply, suggestedMemory, safety));
  } catch (error) {
    if (error && /timeout|aborted|ETIMEDOUT/i.test(String(error.message || error))) {
      return res.status(504).json(buildError('REQUEST_TIMEOUT', 'Sanctuary Guide took too long to respond. Please try again shortly.', 504));
    }
    return res.status(500).json(buildError('BACKEND_CONFIGURATION_ERROR', 'The personal Sanctuary backend could not complete that request.', 500));
  }
};
