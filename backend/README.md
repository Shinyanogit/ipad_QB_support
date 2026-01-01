# QB Support Backend

This service proxies OpenAI Responses API for logged-in users. It verifies Firebase ID tokens and streams the upstream response back to the extension.

## Endpoints
- `GET /health`
- `GET /auth/start`
- `GET /auth/session`
- `GET /auth/callback`
- `GET /auth/me`
- `GET /settings`
- `POST /settings`
- `POST /chat/stream` (streaming)
- `POST /chat` (non-stream)

Health check example:
```bash
curl -i "$SERVICE_URL/health"
```

## Usage policy
- Authenticated users are restricted to `gpt-4.1` only.
- Rate limit: 60 requests per user per hour.
- Rate limiting uses Firestore (`qb_support_rate_limits_v1`).

## Environment
- `OPENAI_API_KEY` (required)
- `FIREBASE_PROJECT_ID` (required)
- `FIREBASE_SERVICE_ACCOUNT_JSON` (optional, JSON string)
- `FIREBASE_SERVICE_ACCOUNT_PATH` (optional, file path)
- `GOOGLE_OAUTH_CLIENT_ID` (required for backend OAuth login, also enables token aud check)
- `GOOGLE_OAUTH_CLIENT_SECRET` (required for backend OAuth login)
- `AUTH_SESSION_SECRET` (required for backend OAuth login, used to sign session tokens)
- `ALLOWED_EMAILS` (optional, comma-separated list)
- `ALLOWED_DOMAIN` (optional, single domain, example: `example.com`)

## Local dev
```bash
npm install
export OPENAI_API_KEY=sk-...
export FIREBASE_PROJECT_ID=your-project-id
export FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json
npm run dev
```

## Cloud Run (example)
```bash
gcloud run deploy qb-support-backend \
  --source . \
  --region asia-northeast1 \
  --set-env-vars OPENAI_API_KEY=sk-...,FIREBASE_PROJECT_ID=your-project-id
```

## Extension config
The extension uses `GET /auth/start` for login and polls `GET /auth/session`.
Make sure the Google OAuth client includes `https://<service-url>/auth/callback` in its authorized redirect URIs.
If you use a custom domain, ensure the extension `host_permissions` includes it.
