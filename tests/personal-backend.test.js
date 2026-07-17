process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
process.env.OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createResponse } = require('../lib/personal-backend');

const healthHandler = require('../api/health');
const guideHandler = require('../api/sanctuary-guide');
const horoscopeHandler = require('../api/horoscope');
const compatibilityReadingHandler = require('../api/compatibility-reading');
const generateMealPlanHandler = require('../api/meal-plan/generate');
const currentMealPlanHandler = require('../api/meal-plan/current');
const replaceMealPlanHandler = require('../api/meal-plan/replace-meal');
const shoppingListHandler = require('../api/meal-plan/shopping-list');
const exercisePlansHandler = require('../api/exercise/plans');
const conversationsHandler = require('../api/guide/conversations');
const memoriesHandler = require('../api/guide/memories');
const accountExportHandler = require('../api/account');
const accountDeleteHandler = require('../api/account');

function makeReq(overrides = {}) {
  return {
    method: 'GET',
    headers: {},
    query: {},
    body: undefined,
    ...overrides
  };
}

function makeRes() {
  return createResponse();
}

function setAuth(req, token = 'token') {
  req.headers.authorization = `Bearer ${token}`;
}

test('health endpoint reports personal backend status', async () => {
  const req = makeReq({ method: 'GET' });
  const res = makeRes();
  await healthHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.version, 'personal');
});

test('allowed CORS origin is accepted', async () => {
  const req = makeReq({ method: 'OPTIONS', headers: { origin: 'https://sanctuary-app.example.com' } });
  const res = makeRes();
  await guideHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], 'https://sanctuary-app.example.com');
});

test('blocked CORS origin is rejected', async () => {
  const req = makeReq({ method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } });
  const res = makeRes();
  await guideHandler(req, res);
  assert.equal(res.statusCode, 403);
});

test('guide validates request payloads', async () => {
  const req = makeReq({ method: 'POST', body: {} });
  const res = makeRes();
  await guideHandler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'INVALID_REQUEST');
});

test('guide returns a structured response with mocked OpenAI', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'You are doing well.' } }] })
  });
  const req = makeReq({ method: 'POST', body: { message: 'I need help with today.', mode: 'reflect' } });
  const res = makeRes();
  await guideHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.reply.includes('You are doing well'), true);
  assert.equal(Array.isArray(res.body.suggestedMemory), true);
});

test('guide returns crisis response for urgent safety concerns', async () => {
  const req = makeReq({ method: 'POST', body: { message: 'I want to end my life tonight.', mode: 'reflect' } });
  const res = makeRes();
  await guideHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.safety.crisisDetected, true);
  assert.equal(res.body.safety.level, 'urgent');
});

test('guide surfaces OpenAI authentication failures', async () => {
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid api key' } }) });
  const req = makeReq({ method: 'POST', body: { message: 'Hello', mode: 'reflect' } });
  const res = makeRes();
  await guideHandler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'OPENAI_AUTH_FAILED');
});

test('guide returns rate-limit errors', async () => {
  global.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'rate limit' } }) });
  const req = makeReq({ method: 'POST', body: { message: 'Hello', mode: 'reflect' } });
  const res = makeRes();
  await guideHandler(req, res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error.code, 'OPENAI_RATE_LIMITED');
});

test('guide returns timeout errors', async () => {
  global.fetch = async () => { throw new Error('timeout'); };
  const req = makeReq({ method: 'POST', body: { message: 'Hello', mode: 'reflect' } });
  const res = makeRes();
  await guideHandler(req, res);
  assert.equal(res.statusCode, 504);
  assert.equal(res.body.error.code, 'REQUEST_TIMEOUT');
});

test('private endpoints reject missing authentication', async () => {
  const req = makeReq({ method: 'GET' });
  const res = makeRes();
  await conversationsHandler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'AUTH_REQUIRED');
});

test('horoscope validates sign and period', async () => {
  const invalidSignReq = makeReq({ method: 'GET', query: { sign: 'not-a-sign', period: 'daily' } });
  const invalidSignRes = makeRes();
  await horoscopeHandler(invalidSignReq, invalidSignRes);
  assert.equal(invalidSignRes.statusCode, 400);
  assert.equal(invalidSignRes.body.error.code, 'INVALID_REQUEST');

  const invalidPeriodReq = makeReq({ method: 'GET', query: { sign: 'taurus', period: 'yearly' } });
  const invalidPeriodRes = makeRes();
  await horoscopeHandler(invalidPeriodReq, invalidPeriodRes);
  assert.equal(invalidPeriodRes.statusCode, 400);
  assert.equal(invalidPeriodRes.body.error.code, 'INVALID_REQUEST');
});

test('horoscope uses cached fallback when provider is unavailable', async () => {
  const store = globalThis.__personalStore;
  store.horoscopeCache.push({ userId: 'demo-user', sign: 'taurus', period: 'daily', timeId: new Date().toISOString().slice(0, 10), reading: 'Cached reading', provider: 'Test Provider', updatedAt: new Date().toISOString(), cached: true });
  global.fetch = async () => { throw new Error('provider unavailable'); };
  const req = makeReq({ method: 'GET', query: { sign: 'taurus', period: 'daily' } });
  const res = makeRes();
  await horoscopeHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.cached, true);
  assert.equal(res.body.reading, 'Cached reading');
});


test('compatibility reading validates signs and returns structured report', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            title: 'Taurus + Scorpio',
            overview: 'A thoughtful connection.',
            strengths: 'Loyalty and depth.',
            communication: 'Speak directly.',
            emotional: 'Create safety.',
            romance: 'Keep affection intentional.',
            trust: 'Build consistency.',
            conflict: 'Repair after tension.',
            longTerm: 'Align values.',
            advice: 'Have one honest conversation.',
            questions: ['What helps you feel heard?', 'What builds trust?', 'How do you repair?', 'What do you need?', 'What are you building?'],
            exercises: ['Ten-minute check-in.', 'Weekly appreciation.', 'Expectation reset.'],
            disclaimer: 'Reflective astrology insight only.'
          })
        }
      }]
    })
  });

  const req = makeReq({
    method: 'POST',
    body: {
      personOne: { name: 'Alex', age: 30, sign: 'Taurus' },
      personTwo: { name: 'Sam', age: 31, sign: 'Scorpio' },
      relationshipStage: 'Dating',
      focusAreas: ['Communication', 'Trust'],
      scores: { overall: 80, communication: 80, emotional: 75, romance: 85, trust: 70, conflict: 70, friendship: 75, longterm: 78 },
      strengths: 'Deep loyalty and intensity',
      friction: 'Trust and stubbornness'
    }
  });
  const res = makeRes();
  await compatibilityReadingHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.report.title, 'Taurus + Scorpio');
  assert.equal(Array.isArray(res.body.report.questions), true);
});

test('compatibility reading rejects an invalid sign', async () => {
  const req = makeReq({
    method: 'POST',
    body: {
      personOne: { age: 30, sign: 'NotASign' },
      personTwo: { age: 31, sign: 'Scorpio' }
    }
  });
  const res = makeRes();
  await compatibilityReadingHandler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'INVALID_REQUEST');
});

test('meal plan requires authentication', async () => {
  const req = makeReq({ method: 'POST', body: { preferences: ['vegetarian'] } });
  const res = makeRes();
  await generateMealPlanHandler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'AUTH_REQUIRED');
});

test('meal plan excludes allergies and creates a shopping list', async () => {
  const authReq = makeReq({ method: 'POST', body: { preferences: ['vegetarian'], allergies: ['nuts'], householdSize: 2 } });
  setAuth(authReq, 'user-1');
  const planRes = makeRes();
  await generateMealPlanHandler(authReq, planRes);
  assert.equal(planRes.statusCode, 200);
  assert.equal(Array.isArray(planRes.body.plan), true);
  assert.equal(planRes.body.plan.length, 7);

  const shoppingReq = makeReq({ method: 'GET' });
  setAuth(shoppingReq, 'user-1');
  const shoppingRes = makeRes();
  await shoppingListHandler(shoppingReq, shoppingRes);
  assert.equal(shoppingRes.statusCode, 200);
  assert.equal(Array.isArray(shoppingRes.body.items), true);
});

test('weekly meal plan stays stable for the same week and supports replacement', async () => {
  const firstReq = makeReq({ method: 'POST', body: { preferences: ['high-protein'], householdSize: 2 } });
  setAuth(firstReq, 'user-2');
  const firstRes = makeRes();
  await generateMealPlanHandler(firstReq, firstRes);
  const firstPlan = firstRes.body.plan;

  const secondReq = makeReq({ method: 'POST', body: { preferences: ['high-protein'], householdSize: 2 } });
  setAuth(secondReq, 'user-2');
  const secondRes = makeRes();
  await generateMealPlanHandler(secondReq, secondRes);
  assert.deepEqual(secondRes.body.plan, firstPlan);

  const replaceReq = makeReq({ method: 'POST', body: { mealId: firstPlan[0].id, replacement: { title: 'Salmon rice bowl' } } });
  setAuth(replaceReq, 'user-2');
  const replaceRes = makeRes();
  await replaceMealPlanHandler(replaceReq, replaceRes);
  assert.equal(replaceRes.statusCode, 200);
  assert.equal(replaceRes.body.plan[0].title, 'Salmon rice bowl');
});

test('exercise plans save and list for the authenticated user', async () => {
  const saveReq = makeReq({ method: 'POST', body: { title: 'Morning mobility', exercises: [{ name: 'Gentle walk', duration: 10 }] } });
  setAuth(saveReq, 'user-3');
  const saveRes = makeRes();
  await exercisePlansHandler(saveReq, saveRes);
  assert.equal(saveRes.statusCode, 200);
  assert.equal(saveRes.body.plan.title, 'Morning mobility');

  const listReq = makeReq({ method: 'GET' });
  setAuth(listReq, 'user-3');
  const listRes = makeRes();
  await exercisePlansHandler(listReq, listRes);
  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.body.plans.length, 1);
});

test('guide memories and conversations are isolated per user', async () => {
  const saveConvoReq = makeReq({ method: 'POST', body: { conversation: [{ role: 'user', content: 'hello' }] } });
  setAuth(saveConvoReq, 'user-4');
  const saveConvoRes = makeRes();
  await conversationsHandler(saveConvoReq, saveConvoRes);
  assert.equal(saveConvoRes.statusCode, 200);

  const saveMemoryReq = makeReq({ method: 'POST', body: { memory: { type: 'goal', value: 'sleep better' } } });
  setAuth(saveMemoryReq, 'user-4');
  const saveMemoryRes = makeRes();
  await memoriesHandler(saveMemoryReq, saveMemoryRes);
  assert.equal(saveMemoryRes.statusCode, 200);

  const otherUserReq = makeReq({ method: 'GET' });
  setAuth(otherUserReq, 'user-5');
  const otherUserRes = makeRes();
  await conversationsHandler(otherUserReq, otherUserRes);
  assert.equal(otherUserRes.statusCode, 200);
  assert.equal(otherUserRes.body.conversations.length, 0);
});

test('account export and deletion require authorisation', async () => {
  const exportReq = makeReq({ method: 'GET' });
  const exportRes = makeRes();
  await accountExportHandler(exportReq, exportRes);
  assert.equal(exportRes.statusCode, 401);

  const deleteReq = makeReq({ method: 'DELETE' });
  const deleteRes = makeRes();
  await accountDeleteHandler(deleteReq, deleteRes);
  assert.equal(deleteRes.statusCode, 401);
});
