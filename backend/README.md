# QB Support Backend

This service proxies OpenAI Responses API for logged-in users. It verifies Firebase ID tokens and streams the upstream response back to the extension.

## Endpoints
- `GET /health`
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
- `GOOGLE_OAUTH_CLIENT_ID` (optional, enables Google token audience check)
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
Set the Chat Backend URL in the extension settings to your service base URL (e.g. `https://your-service.run.app`).
If you use a custom domain, ensure the extension `host_permissions` includes it.
