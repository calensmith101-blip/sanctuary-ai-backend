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
