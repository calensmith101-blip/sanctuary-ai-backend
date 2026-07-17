const { createResponse, buildError, authenticateUser, enforceAllowedOrigin, getUserState } = require('./_lib/personal-backend');

module.exports = async function handler(req, res = createResponse()) {
  if (!enforceAllowedOrigin(req, res)) return res;
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = authenticateUser(req);
  if (!auth.user) {
    const message = req.method === 'GET'
      ? 'Authentication is required to export your private Sanctuary data.'
      : 'Authentication is required before deleting your private account data.';
    return res.status(401).json(buildError('AUTH_REQUIRED', message, 401));
  }

  const state = getUserState(auth.user.id);

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      export: {
        conversations: state.guideConversations[auth.user.id],
        memories: state.guideMemories[auth.user.id],
        mealPlans: state.mealPlans[auth.user.id],
        exercises: state.exercisePlans[auth.user.id],
      },
    });
  }

  if (req.method === 'DELETE') {
    state.guideConversations[auth.user.id] = [];
    state.guideMemories[auth.user.id] = [];
    state.mealPlans[auth.user.id] = [];
    state.exercisePlans[auth.user.id] = [];
    state.exerciseSessions[auth.user.id] = [];
    state.trustedContacts[auth.user.id] = [];
    state.professionalContacts[auth.user.id] = [];
    return res.status(200).json({ ok: true, message: 'Private account data has been cleared.' });
  }

  return res.status(405).json(buildError('INVALID_REQUEST', 'Only GET and DELETE are supported for this endpoint.', 405));
};
