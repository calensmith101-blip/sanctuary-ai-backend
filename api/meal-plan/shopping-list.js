const { createResponse, buildError, authenticateUser, enforceAllowedOrigin, getUserState } = require('../_lib/personal-backend');

module.exports = async function handler(req, res = createResponse()) {
  if (!enforceAllowedOrigin(req, res)) return res;
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json(buildError('INVALID_REQUEST', 'Only GET is supported for this endpoint.', 405));

  const auth = authenticateUser(req);
  if (!auth.user) return res.status(401).json(buildError('AUTH_REQUIRED', 'Authentication is required for your private meal plan.', 401));

  const state = getUserState(auth.user.id);
  const weekPlan = state.mealPlans[auth.user.id].slice(-1)[0];
  if (!weekPlan) return res.status(200).json({ ok: true, items: [] });

  const items = weekPlan.plan.flatMap(item => item.recipe?.ingredients || []);
  return res.status(200).json({ ok: true, items });
};
