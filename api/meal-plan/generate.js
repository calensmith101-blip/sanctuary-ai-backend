const {
  createResponse,
  buildError,
  authenticateUser,
  enforceAllowedOrigin,
  optionalRateLimit,
  getUserState,
  createId,
  getCurrentWeekId
} = require('../_lib/personal-backend');

const RECIPE_DATA = [
  {
    id: 'recipe-1',
    title: 'Rainbow quinoa bowl',
    mealType: 'lunch',
    supportedDiets: ['vegetarian', 'gluten-free', 'high-protein'],
    allergens: ['none'],
    ingredients: ['quinoa', 'chickpeas', 'cucumber', 'tomato', 'spinach', 'olive oil'],
    instructions: ['Cook quinoa', 'Assemble bowl'],
    preparationTime: 20,
    servings: 2,
    proteinSource: 'chickpeas',
    fibreSource: 'quinoa',
    healthyFatSource: 'olive oil',
    vitaminsAndMinerals: ['iron', 'folate'],
    generalEnergyExplanation: 'Balanced and steady energy.',
    gutHealthExplanation: 'Supports fibre intake.',
    digestionExplanation: 'Easy to digest with fibre and hydration.',
    generalBrainHealthExplanation: 'Supports satiety and nutrient variety.',
    leftoverSuggestion: 'Pack for lunch the next day.',
    possibleMealSwaps: ['Add tofu', 'Swap quinoa for brown rice']
  },
  {
    id: 'recipe-2',
    title: 'Lemon herb salmon traybake',
    mealType: 'dinner',
    supportedDiets: ['pescatarian', 'gluten-free', 'high-protein'],
    allergens: ['fish'],
    ingredients: ['salmon', 'potatoes', 'broccoli', 'lemon', 'olive oil'],
    instructions: ['Roast salmon and vegetables', 'Serve warm'],
    preparationTime: 30,
    servings: 2,
    proteinSource: 'salmon',
    fibreSource: 'broccoli',
    healthyFatSource: 'olive oil',
    vitaminsAndMinerals: ['omega-3', 'vitamin C'],
    generalEnergyExplanation: 'Sustaining dinner for steady energy.',
    gutHealthExplanation: 'Vegetables support gut comfort.',
    digestionExplanation: 'Gentle meal with protein and vegetables.',
    generalBrainHealthExplanation: 'Omega-3 support and satisfying meal.',
    leftoverSuggestion: 'Use leftovers for lunch.',
    possibleMealSwaps: ['Swap salmon for tofu']
  },
  {
    id: 'recipe-3',
    title: 'Chickpea curry',
    mealType: 'dinner',
    supportedDiets: ['vegetarian', 'gluten-free', 'budget'],
    allergens: ['none'],
    ingredients: ['chickpeas', 'tomato', 'coconut milk', 'spinach', 'rice'],
    instructions: ['Simmer curry ingredients', 'Serve with rice'],
    preparationTime: 25,
    servings: 2,
    proteinSource: 'chickpeas',
    fibreSource: 'chickpeas',
    healthyFatSource: 'coconut milk',
    vitaminsAndMinerals: ['iron', 'vitamin A'],
    generalEnergyExplanation: 'Comforting and filling.',
    gutHealthExplanation: 'Fibre and legumes support gut health.',
    digestionExplanation: 'Warm and soothing.',
    generalBrainHealthExplanation: 'Provides steady energy and nutrients.',
    leftoverSuggestion: 'Freeze portions for later.',
    possibleMealSwaps: ['Use lentils instead of chickpeas']
  }
];

function getPreferenceSet(payload = {}) {
  const preferences = Array.isArray(payload.preferences) ? payload.preferences : [];
  const allergies = Array.isArray(payload.allergies) ? payload.allergies.map(item => item.toLowerCase()) : [];
  const householdSize = Number(payload.householdSize || 1);
  return { preferences: preferences.map(item => String(item).toLowerCase()), allergies, householdSize };
}

function mealMatchesPreferences(recipe, preferenceSet) {
  const prefs = new Set(preferenceSet.preferences);
  const allergies = new Set(preferenceSet.allergies);
  if (allergies.size) {
    const containsExcludedAllergen = recipe.allergens.some(item => allergies.has(String(item).toLowerCase())) || recipe.ingredients.some(item => allergies.has(String(item).toLowerCase()));
    if (containsExcludedAllergen) return false;
  }
  if (prefs.has('vegetarian') && !recipe.supportedDiets.includes('vegetarian') && !recipe.supportedDiets.includes('vegan')) return false;
  if (prefs.has('vegan') && !recipe.supportedDiets.includes('vegan')) return false;
  if (prefs.has('pescatarian') && !recipe.supportedDiets.includes('pescatarian') && !recipe.supportedDiets.includes('vegetarian')) return false;
  if (prefs.has('gluten-free') && !recipe.supportedDiets.includes('gluten-free')) return false;
  if (prefs.has('dairy-free') && recipe.ingredients.some(item => String(item).toLowerCase().includes('cheese'))) return false;
  if (prefs.has('egg-free') && recipe.ingredients.some(item => String(item).toLowerCase().includes('egg'))) return false;
  if (prefs.has('nut-free') && recipe.ingredients.some(item => String(item).toLowerCase().includes('nut'))) return false;
  if (prefs.has('shellfish-free') && recipe.ingredients.some(item => String(item).toLowerCase().includes('shellfish'))) return false;
  if (prefs.has('budget') && !recipe.supportedDiets.includes('budget')) return false;
  if (prefs.has('high-protein') && !recipe.supportedDiets.includes('high-protein')) return false;
  if (prefs.has('simple meals') && recipe.preparationTime > 25) return false;
  return true;
}

function createPlan(preferenceSet, userId) {
  const weekId = getCurrentWeekId();
  const eligibleRecipes = RECIPE_DATA.filter(recipe => mealMatchesPreferences(recipe, preferenceSet));
  const sourceRecipes = eligibleRecipes.length ? eligibleRecipes : RECIPE_DATA;
  const plan = [];

  for (let index = 0; index < 7; index += 1) {
    const previous = plan[plan.length - 1];
    const recipe = sourceRecipes.find(item => item.id !== (previous && previous.recipe.id)) || sourceRecipes[index % sourceRecipes.length];
    plan.push({
      id: createId(`meal-${index + 1}`),
      weekId,
      title: recipe.title,
      mealType: recipe.mealType,
      recipe,
      notes: `General wellbeing note: discuss significant dietary changes with a doctor or accredited dietitian if needed.`,
      userId
    });
  }

  return plan;
}

module.exports = async function handler(req, res = createResponse()) {
  if (!enforceAllowedOrigin(req, res)) return res;
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json(buildError('INVALID_REQUEST', 'Only POST is supported for this endpoint.', 405));

  const auth = authenticateUser(req);
  if (!auth.user) return res.status(401).json(buildError('AUTH_REQUIRED', 'Authentication is required for your private meal plan.', 401));

  const rate = optionalRateLimit(`meal-plan:${auth.user.id}`, 60000, 60);
  if (!rate.ok) return res.status(429).json(buildError('OPENAI_RATE_LIMITED', 'Meal plan generation is being rate-limited. Please try again shortly.', 429));

  const preferenceSet = getPreferenceSet(req.body || {});
  const state = getUserState(auth.user.id);
  const weekId = getCurrentWeekId();
  const existing = state.mealPlans[auth.user.id].find(item => item.weekId === weekId);
  if (existing) {
    return res.status(200).json({ ok: true, plan: existing.plan, weekId });
  }

  const plan = createPlan(preferenceSet, auth.user.id);
  state.mealPlans[auth.user.id].push({ id: createId('weekly-plan'), weekId, plan, createdAt: new Date().toISOString(), userId: auth.user.id });
  return res.status(200).json({ ok: true, plan, weekId });
};
