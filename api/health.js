const { createResponse, createHealthPayload, enforceAllowedOrigin } = require('./_lib/personal-backend');

module.exports = async function handler(req, res = createResponse()) {
  if (!enforceAllowedOrigin(req, res)) return res;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(createHealthPayload());
};
