const {
  createResponse,
  buildError,
  authenticateUser,
  enforceAllowedOrigin,
  getUserState,
  createId
} = require('../../lib/personal-backend');

module.exports = async function handler(req, res = createResponse()) {
  if (!enforceAllowedOrigin(req, res)) return res;
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = authenticateUser(req);
  if (!auth.user) return res.status(401).json(buildError('AUTH_REQUIRED', 'Authentication is required for your private movement plans.', 401));

  const state = getUserState(auth.user.id);
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, plans: state.exercisePlans[auth.user.id] });
  }
  if (req.method === 'POST') {
    const payload = req.body || {};
    const plan = {
      id: createId('exercise-plan'),
      title: payload.title || 'My movement plan',
      exercises: payload.exercises || [],
      createdAt: new Date().toISOString(),
      userId: auth.user.id
    };
    state.exercisePlans[auth.user.id].push(plan);
    return res.status(200).json({ ok: true, plan });
  }
  return res.status(405).json(buildError('INVALID_REQUEST', 'Only GET and POST are supported for this endpoint.', 405));
};
