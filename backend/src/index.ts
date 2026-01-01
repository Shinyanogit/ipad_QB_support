import cors from "cors";
import express from "express";
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PORT = Number(process.env.PORT ?? 8080);
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? "").trim();
const FIREBASE_PROJECT_ID = (process.env.FIREBASE_PROJECT_ID ?? "").trim();
const GOOGLE_OAUTH_CLIENT_ID = (process.env.GOOGLE_OAUTH_CLIENT_ID ?? "").trim();
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN ?? "").trim().toLowerCase();
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RESTRICTED_MODEL = "gpt-4.1";
const RATE_LIMIT_COLLECTION = "qb_support_rate_limits_v1";
const SETTINGS_COLLECTION = "qb_support_settings";

type AuthContext = {
  uid: string;
  email: string;
  source: "firebase" | "google";
};

const missingEnv: string[] = [];
if (!OPENAI_API_KEY) missingEnv.push("OPENAI_API_KEY");
if (!FIREBASE_PROJECT_ID) missingEnv.push("FIREBASE_PROJECT_ID");
if (missingEnv.length) {
  console.warn("Missing required envs. Service will start, but requests may fail.", {
    missing: missingEnv,
  });
}
if (!GOOGLE_OAUTH_CLIENT_ID) {
  console.warn("GOOGLE_OAUTH_CLIENT_ID is not set. Google token audience checks are disabled.");
}

const app = express();
app.disable("x-powered-by");

app.use((req, _res, next) => {
  if (
    req.url === "/" ||
    req.url.startsWith("/health") ||
    req.url.startsWith("/chat") ||
    req.url.startsWith("/auth") ||
    req.url.startsWith("/settings")
  ) {
    console.log("[req]", req.method, req.url);
  }
  next();
});

app.get("/", (_req, res) => {
  res.status(200).type("text/plain").send("OK");
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use(cors({ origin: true }));
app.use(express.json({ limit: "25mb" }));

app.get("/auth/me", async (req, res) => {
  const auth = await authenticateRequest(req, res);
  if (!auth) return;
  res.status(200).json({ uid: auth.uid, email: auth.email, source: auth.source });
});

app.get("/settings", async (req, res) => {
  const auth = await authenticateRequest(req, res);
  if (!auth) return;
  try {
    const db = getFirestore();
    const ref = db.collection(SETTINGS_COLLECTION).doc(auth.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(200).json({ settings: null });
      return;
    }
    const data = snap.data() as { settings?: Record<string, unknown> } | undefined;
    res.status(200).json({ settings: data?.settings ?? null });
  } catch (error) {
    console.warn("Settings fetch failed", error);
    res.status(503).json({ error: "Settings fetch failed." });
  }
});

app.post("/settings", async (req, res) => {
  const auth = await authenticateRequest(req, res);
  if (!auth) return;
  const body = req.body as { settings?: Record<string, unknown> } | undefined;
  if (!body?.settings || typeof body.settings !== "object") {
    res.status(400).json({ error: "Missing settings payload." });
    return;
  }
  try {
    const db = getFirestore();
    const ref = db.collection(SETTINGS_COLLECTION).doc(auth.uid);
    await ref.set(
      {
        settings: body.settings,
        schemaVersion: 1,
        updatedAt: Date.now(),
        email: auth.email,
      },
      { merge: true }
    );
    res.status(200).json({ ok: true });
  } catch (error) {
    console.warn("Settings update failed", error);
    res.status(503).json({ error: "Settings update failed." });
  }
});

app.post("/chat", async (req, res) => {
  if (!assertRequiredConfig(res)) return;
  const auth = await authenticateRequest(req, res);
  if (!auth) return;

  const body = req.body as { model?: string; messages?: unknown } | undefined;
  const policyError = await enforceUsagePolicy(auth.uid);
  if (policyError) {
    res.status(policyError.status).json(policyError.body);
    return;
  }
  const messages = Array.isArray(body?.messages) ? body?.messages : [];

  const payload: Record<string, unknown> = { model: RESTRICTED_MODEL, messages };

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
  if (!assertRequiredConfig(res)) return;
  const auth = await authenticateRequest(req, res);
  if (!auth) return;

  const body = req.body as
    | {
        model?: string;
        input?: unknown;
        instructions?: string;
        previous_response_id?: string | null;
      }
    | undefined;
  const instructions = typeof body?.instructions === "string" ? body.instructions.trim() : "";
  const input = body?.input ?? [];
  const previousResponseId =
    typeof body?.previous_response_id === "string" && body?.previous_response_id
      ? body.previous_response_id
      : null;

  const policyError = await enforceUsagePolicy(auth.uid);
  if (policyError) {
    res.status(policyError.status).json(policyError.body);
    return;
  }

  const payload: Record<string, unknown> = {
    model: RESTRICTED_MODEL,
    input,
    instructions: instructions || undefined,
    previous_response_id: previousResponseId ?? undefined,
    stream: true,
    store: true,
  };

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

logRoutes(app);

app.use((req, res) => {
  console.warn("[404]", req.method, req.url);
  res.status(404).json({ error: "Not Found" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("[startup]", {
    service: process.env.K_SERVICE ?? "",
    revision: process.env.K_REVISION ?? "",
    port: PORT,
    missingEnv,
  });
  console.log(`qb-support-backend listening on :${PORT}`);
});

function logRoutes(appInstance: express.Express) {
  const stack = (appInstance as any)?._router?.stack ?? [];
  for (const layer of stack) {
    if (!layer) continue;
    if (layer.route?.path && layer.route?.methods) {
      const methods = Object.keys(layer.route.methods)
        .filter((method) => layer.route.methods[method])
        .map((method) => method.toUpperCase());
      for (const method of methods) {
        console.log("[route]", method, String(layer.route.path));
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      for (const nested of layer.handle.stack) {
        if (!nested?.route?.path || !nested?.route?.methods) continue;
        const methods = Object.keys(nested.route.methods)
          .filter((method) => nested.route.methods[method])
          .map((method) => method.toUpperCase());
        for (const method of methods) {
          console.log("[route]", method, String(nested.route.path));
        }
      }
    }
  }
}

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

function ensureFirebaseInitialized(res: express.Response): boolean {
  if (!FIREBASE_PROJECT_ID) {
    res.status(503).json({ error: "Missing FIREBASE_PROJECT_ID." });
    return false;
  }
  if (getApps().length) return true;
  try {
    initializeFirebase();
    return true;
  } catch (error) {
    console.warn("Firebase initialization failed", error);
    res.status(503).json({ error: "Firebase initialization failed." });
    return false;
  }
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
): Promise<AuthContext | null> {
  if (!ensureFirebaseInitialized(res)) return null;
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing Authorization bearer token." });
    return null;
  }

  const firebase = await verifyFirebaseIdToken(token);
  if (firebase) {
    if (!isAllowedEmail(firebase.email)) {
      res.status(403).json({ error: "User not allowed." });
      return null;
    }
    return { uid: firebase.uid, email: firebase.email, source: "firebase" };
  }

  const google = await verifyGoogleAccessToken(token);
  if (google) {
    if (!isAllowedEmail(google.email)) {
      res.status(403).json({ error: "User not allowed." });
      return null;
    }
    return { uid: google.uid, email: google.email, source: "google" };
  }

  res.status(401).json({ error: "Invalid auth token." });
  return null;
}

async function verifyFirebaseIdToken(
  token: string
): Promise<{ uid: string; email: string } | null> {
  try {
    const decoded = await getAuth().verifyIdToken(token);
    const email = decoded.email?.toLowerCase() ?? "";
    if (decoded.email_verified === false) return null;
    if (!email) return null;
    return { uid: decoded.uid, email };
  } catch (error) {
    console.warn("Firebase token verification failed", error);
    return null;
  }
}

async function verifyGoogleAccessToken(
  token: string
): Promise<{ uid: string; email: string } | null> {
  try {
    const url = new URL("https://oauth2.googleapis.com/tokeninfo");
    url.searchParams.set("access_token", token);
    const response = await fetch(url.toString());
    if (!response.ok) {
      const detail = await response.text();
      console.warn("Google tokeninfo failed", response.status, detail);
      return null;
    }
    const data = (await response.json()) as {
      sub?: string;
      email?: string;
      email_verified?: string;
      aud?: string;
    };
    const email = (data.email ?? "").toLowerCase();
    if (!data.sub || !email) return null;
    if (data.email_verified === "false") return null;
    if (GOOGLE_OAUTH_CLIENT_ID && data.aud !== GOOGLE_OAUTH_CLIENT_ID) {
      console.warn("Google token aud mismatch", data.aud);
      return null;
    }
    return { uid: data.sub, email };
  } catch (error) {
    console.warn("Google token verification failed", error);
    return null;
  }
}

function assertRequiredConfig(res: express.Response): boolean {
  const missing: string[] = [];
  if (!OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (!FIREBASE_PROJECT_ID) missing.push("FIREBASE_PROJECT_ID");
  if (!missing.length) return true;
  res.status(503).json({ error: "Missing required configuration.", missing });
  return false;
}

async function enforceUsagePolicy(
  uid: string
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try {
    const result = await consumeRateLimit(uid);
    if (!result.allowed) {
      return {
        status: 429,
        body: {
          error: "Rate limit exceeded.",
          limit: RATE_LIMIT_MAX,
          remaining: 0,
          resetAt: result.resetAt,
        },
      };
    }
  } catch (error) {
    console.warn("Rate limit check failed", error);
    return {
      status: 503,
      body: { error: "Rate limit check failed." },
    };
  }
  return null;
}

async function consumeRateLimit(
  uid: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const db = getFirestore();
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(uid);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as { windowStart?: number; count?: number }) : {};
    const windowStart = typeof data.windowStart === "number" ? data.windowStart : 0;
    const count = typeof data.count === "number" ? data.count : 0;
    const windowExpired = !windowStart || now - windowStart >= RATE_LIMIT_WINDOW_MS;
    if (windowExpired) {
      tx.set(
        ref,
        { windowStart: now, count: 1, updatedAt: now },
        { merge: true }
      );
      return {
        allowed: true,
        remaining: RATE_LIMIT_MAX - 1,
        resetAt: now + RATE_LIMIT_WINDOW_MS,
      };
    }
    if (count >= RATE_LIMIT_MAX) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: windowStart + RATE_LIMIT_WINDOW_MS,
      };
    }
    const nextCount = count + 1;
    tx.set(
      ref,
      { windowStart, count: nextCount, updatedAt: now },
      { merge: true }
    );
    return {
      allowed: true,
      remaining: Math.max(0, RATE_LIMIT_MAX - nextCount),
      resetAt: windowStart + RATE_LIMIT_WINDOW_MS,
    };
  });
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

function isAllowedEmail(email: string): boolean {
  if (!ALLOWED_EMAILS.length && !ALLOWED_DOMAIN) return true;
  const normalized = email.toLowerCase();
  if (!normalized) return false;
  if (ALLOWED_EMAILS.length && !ALLOWED_EMAILS.includes(normalized)) return false;
  if (ALLOWED_DOMAIN && !normalized.endsWith(`@${ALLOWED_DOMAIN}`)) return false;
  return true;
}
