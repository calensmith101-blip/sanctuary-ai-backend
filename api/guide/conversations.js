const { createResponse, buildError, authenticateUser, enforceAllowedOrigin, getUserState, createId } = require('../../lib/personal-backend');

module.exports = async function handler(req, res = createResponse()) {
  if (!enforceAllowedOrigin(req, res)) return res;
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = authenticateUser(req);
  if (!auth.user) return res.status(401).json(buildError('AUTH_REQUIRED', 'Authentication is required for your private Guide conversations.', 401));

  const state = getUserState(auth.user.id);
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, conversations: state.guideConversations[auth.user.id] });
  }
  if (req.method === 'POST') {
    const payload = req.body || {};
    const conversation = {
      id: createId('conversation'),
      createdAt: new Date().toISOString(),
      conversation: payload.conversation || []
    };
    state.guideConversations[auth.user.id].push(conversation);
    return res.status(200).json({ ok: true, conversation });
  }
  if (req.method === 'DELETE') {
    const id = req.query && req.query.id;
    if (id) {
      state.guideConversations[auth.user.id] = state.guideConversations[auth.user.id].filter(item => item.id !== id);
    } else {
      state.guideConversations[auth.user.id] = [];
    }
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json(buildError('INVALID_REQUEST', 'Only GET, POST, and DELETE are supported for this endpoint.', 405));
};
