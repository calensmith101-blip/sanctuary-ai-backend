# Sanctuary AI Backend

This repository contains the personal Sanctuary backend for private use. It supports the Sanctuary Guide, safe crisis handling, horoscope lookups, meal planning, movement plans, and private account export/deletion without introducing Stripe, subscriptions, or marketplace features.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and fill the values you need.
3. Start the local server using `vercel dev`.

## Key endpoints

- `GET /api/health`
- `POST /api/sanctuary-guide`
- `GET /api/horoscope`
- `POST /api/meal-plan/generate`
- `GET /api/meal-plan/current`
- `POST /api/meal-plan/replace-meal`
- `GET /api/meal-plan/shopping-list`
- `GET /api/account/export`
- `DELETE /api/account`

## Full compatibility reading

`POST /api/compatibility-reading` generates a structured relationship reflection from the two signs, ages/life stage, the app's compatibility scores, relationship stage, focus areas, and optional user context.

It uses `OPENAI_API_KEY` when available and returns a structured local fallback when the provider is unavailable. It does not claim that astrology is scientific or that compatibility percentages predict relationship success.
