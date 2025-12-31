import cors from "cors";
import express from "express";
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

const PORT = Number(process.env.PORT ?? 8080);
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? "").trim();
const FIREBASE_PROJECT_ID = (process.env.FIREBASE_PROJECT_ID ?? "").trim();
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN ?? "").trim().toLowerCase();

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY.");
  process.exit(1);
}
if (!FIREBASE_PROJECT_ID) {
  console.error("Missing FIREBASE_PROJECT_ID.");
  process.exit(1);
}

initializeFirebase();

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: true }));
app.use(express.json({ limit: "25mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.post("/chat", async (req, res) => {
  const decoded = await authenticateRequest(req, res);
  if (!decoded) return;

  const body = req.body as { model?: string; messages?: unknown } | undefined;
  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : "gpt-4o-mini";
  const messages = Array.isArray(body?.messages) ? body?.messages : [];

  const payload: Record<string, unknown> = { model, messages };
  if (model === "gpt-5.2") {
    payload.temperature = 0.2;
  }

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await upstream.text();
  res.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }
  res.send(text);
});

app.post("/chat/stream", async (req, res) => {
  const decoded = await authenticateRequest(req, res);
  if (!decoded) return;

  const body = req.body as
    | {
        model?: string;
        input?: unknown;
        instructions?: string;
        previous_response_id?: string | null;
      }
    | undefined;
  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : "gpt-4o-mini";
  const instructions = typeof body?.instructions === "string" ? body.instructions.trim() : "";
  const input = body?.input ?? [];
  const previousResponseId =
    typeof body?.previous_response_id === "string" && body?.previous_response_id
      ? body.previous_response_id
      : null;

  const payload: Record<string, unknown> = {
    model,
    input,
    instructions: instructions || undefined,
    previous_response_id: previousResponseId ?? undefined,
    stream: true,
    store: true,
  };
  if (model === "gpt-5.2") {
    payload.temperature = 0.2;
  }

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    res.status(upstream.status).type("text/plain").send(errorText);
    return;
  }

  if (!upstream.body) {
    res.status(502).json({ error: "Upstream stream missing." });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        res.write(Buffer.from(value));
      }
    }
  } catch (error) {
    console.warn("Stream error", error);
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`qb-support-backend listening on :${PORT}`);
});

function initializeFirebase() {
  if (getApps().length) return;
  const serviceAccount = loadServiceAccount();
  if (serviceAccount) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: FIREBASE_PROJECT_ID,
    });
    return;
  }
  initializeApp({ projectId: FIREBASE_PROJECT_ID });
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      return JSON.parse(raw) as ServiceAccount;
    } catch (error) {
      console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON", error);
    }
  }
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (path) {
    try {
      const content = readFileSync(path, "utf8");
      return JSON.parse(content) as ServiceAccount;
    } catch (error) {
      console.warn("Failed to read FIREBASE_SERVICE_ACCOUNT_PATH", error);
    }
  }
  return null;
}

async function authenticateRequest(
  req: express.Request,
  res: express.Response
): Promise<DecodedIdToken | null> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing Authorization bearer token." });
    return null;
  }
  let decoded: DecodedIdToken;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch (error) {
    console.warn("Token verification failed", error);
    res.status(401).json({ error: "Invalid Firebase ID token." });
    return null;
  }
  if (decoded.email_verified === false) {
    res.status(403).json({ error: "Email not verified." });
    return null;
  }
  if (!isAllowedUser(decoded)) {
    res.status(403).json({ error: "User not allowed." });
    return null;
  }
  return decoded;
}

function getBearerToken(req: express.Request): string | null {
  const header = req.headers.authorization ?? "";
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() === "bearer" && value) {
    return value.trim();
  }
  const alt = req.headers["x-firebase-token"];
  if (typeof alt === "string" && alt.trim()) return alt.trim();
  return null;
}

function isAllowedUser(decoded: DecodedIdToken): boolean {
  if (!ALLOWED_EMAILS.length && !ALLOWED_DOMAIN) return true;
  const email = decoded.email?.toLowerCase() ?? "";
  if (!email) return false;
  if (ALLOWED_EMAILS.length && !ALLOWED_EMAILS.includes(email)) return false;
  if (ALLOWED_DOMAIN && !email.endsWith(`@${ALLOWED_DOMAIN}`)) return false;
  return true;
}
