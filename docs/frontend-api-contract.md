# Personal Sanctuary Backend API Contract

## Health
- Method: GET `/api/health`
- Authentication: none
- Success: `{ "status": "ok", "service": "sanctuary-ai-backend", "version": "personal" }`
- Errors: safe error payloads with codes such as `BACKEND_CONFIGURATION_ERROR`

## Sanctuary Guide
- Method: POST `/api/sanctuary-guide`
- Authentication: optional for guide chat; required for private saved conversations and memories
- Request: `{ "message": "...", "mode": "reflect", "conversation": [], "memory": [], "profile": {}, "timezone": "Australia/Adelaide" }`
- Success: `{ "ok": true, "reply": "...", "suggestedMemory": [], "safety": { "crisisDetected": false, "level": "none" } }`
- Errors: `INVALID_REQUEST`, `OPENAI_AUTH_FAILED`, `OPENAI_RATE_LIMITED`, `REQUEST_TIMEOUT`

## Horoscope
- Method: GET `/api/horoscope?sign=taurus&period=daily`
- Authentication: optional
- Success: `{ "ok": true, "sign": "taurus", "period": "daily", "reading": "...", "provider": "...", "updatedAt": "...", "cached": false }`
- Errors: `INVALID_REQUEST`, `HOROSCOPE_NOT_CONFIGURED`, `HOROSCOPE_PROVIDER_UNAVAILABLE`

## Meal Plan
- Method: POST `/api/meal-plan/generate`
- Authentication: required
- Success: `{ "ok": true, "plan": [...], "weekId": "..." }`
- Errors: `AUTH_REQUIRED`, `INVALID_REQUEST`

## Account
- Method: GET `/api/account/export`
- Method: DELETE `/api/account`
- Authentication: required
- Success: export payload or deletion confirmation
