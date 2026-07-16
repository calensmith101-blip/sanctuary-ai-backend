const { createResponse, buildError, authenticateUser, enforceAllowedOrigin, getUserState } = require('./_lib/personal-backend');

module.exports = async function handler(req, res = createResponse()) {
  if (!enforceAllowedOrigin(req, res)) return res;
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json(buildError('INVALID_REQUEST', 'Only DELETE is supported for this endpoint.', 405));

  const auth = authenticateUser(req);
  if (!auth.user) return res.status(401).json(buildError('AUTH_REQUIRED', 'Authentication is required before deleting your private account data.', 401));

  const state = getUserState(auth.user.id);
  state.guideConversations[auth.user.id] = [];
  state.guideMemories[auth.user.id] = [];
  state.mealPlans[auth.user.id] = [];
  state.exercisePlans[auth.user.id] = [];
  state.exerciseSessions[auth.user.id] = [];
  state.trustedContacts[auth.user.id] = [];
  state.professionalContacts[auth.user.id] = [];
  return res.status(200).json({ ok: true, message: 'Private account data has been cleared.' });
};
