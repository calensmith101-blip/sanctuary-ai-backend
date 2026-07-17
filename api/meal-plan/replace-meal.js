const { createResponse, buildError, authenticateUser, enforceAllowedOrigin, getUserState } = require('../../lib/personal-backend');

module.exports = async function handler(req, res = createResponse()) {
  if (!enforceAllowedOrigin(req, res)) return res;
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json(buildError('INVALID_REQUEST', 'Only POST is supported for this endpoint.', 405));

  const auth = authenticateUser(req);
  if (!auth.user) return res.status(401).json(buildError('AUTH_REQUIRED', 'Authentication is required for your private meal plan.', 401));

  const state = getUserState(auth.user.id);
  const payload = req.body || {};
  const weekPlan = state.mealPlans[auth.user.id].slice(-1)[0];
  if (!weekPlan) return res.status(404).json(buildError('INVALID_REQUEST', 'No weekly meal plan exists yet.', 404));

  const mealIndex = weekPlan.plan.findIndex(item => item.id === payload.mealId);
  if (mealIndex === -1) return res.status(404).json(buildError('INVALID_REQUEST', 'The requested meal was not found.', 404));

  weekPlan.plan[mealIndex] = { ...weekPlan.plan[mealIndex], ...payload.replacement, title: payload.replacement?.title || weekPlan.plan[mealIndex].title };
  return res.status(200).json({ ok: true, plan: weekPlan.plan, weekId: weekPlan.weekId });
};
