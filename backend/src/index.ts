import cors from "cors";
import express from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PORT = Number(process.env.PORT ?? 8080);
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? "").trim();
const FIREBASE_PROJECT_ID = (process.env.FIREBASE_PROJECT_ID ?? "").trim();
const GOOGLE_OAUTH_CLIENT_ID = (process.env.GOOGLE_OAUTH_CLIENT_ID ?? "").trim();
const GOOGLE_OAUTH_CLIENT_SECRET = (process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "").trim();
const AUTH_SESSION_SECRET = (process.env.AUTH_SESSION_SECRET ?? "").trim();
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
const AUTH_SESSION_COLLECTION = "qb_support_auth_sessions";
const AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTH_STATE_TTL_MS = 10 * 60 * 1000;

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
if (!GOOGLE_OAUTH_CLIENT_SECRET) {
  console.warn("GOOGLE_OAUTH_CLIENT_SECRET is not set. Backend OAuth login is disabled.");
}
if (!AUTH_SESSION_SECRET) {
  console.warn("AUTH_SESSION_SECRET is not set. Backend OAuth login is disabled.");
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

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

app.get("/auth/start", async (req, res) => {
  if (!assertAuthConfig(res)) return;
  if (!ensureFirebaseInitialized(res)) return;
  const baseUrl = resolvePublicBaseUrl(req);
  if (!baseUrl) {
    res.status(500).json({ error: "Failed to resolve public base URL." });
    return;
  }
  const state = randomUUID();
  const now = Date.now();
  const stateExpiresAt = now + AUTH_STATE_TTL_MS;
  try {
    const db = getFirestore();
    await db.collection(AUTH_SESSION_COLLECTION).doc(state).set({
      status: "pending",
      createdAt: now,
      stateExpiresAt,
    });
  } catch (error) {
    console.warn("Auth start storage failed", error);
    res.status(503).json({ error: "Auth session store failed." });
    return;
  }
  const redirectUri = `${baseUrl}/auth/callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_OAUTH_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("state", state);
  res.status(200).json({ authUrl: authUrl.toString(), state, expiresAt: stateExpiresAt });
});

app.get("/auth/session", async (req, res) => {
  if (!ensureFirebaseInitialized(res)) return;
  const state = typeof req.query.state === "string" ? req.query.state.trim() : "";
  if (!state) {
    res.status(400).json({ error: "Missing state." });
    return;
  }
  const db = getFirestore();
  const ref = db.collection(AUTH_SESSION_COLLECTION).doc(state);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  const data = snap.data() as
    | {
        status?: string;
        stateExpiresAt?: number;
        token?: string;
        tokenExpiresAt?: number;
        uid?: string;
        email?: string;
      }
    | undefined;
  const now = Date.now();
  if (data?.status !== "complete") {
    if (data?.stateExpiresAt && now > data.stateExpiresAt) {
      await ref.delete();
      res.status(410).json({ error: "Session expired." });
      return;
    }
    res.status(204).end();
    return;
  }
  if (!data?.token || !data.uid || !data.email) {
    res.status(500).json({ error: "Invalid session payload." });
    return;
  }
  if (data.tokenExpiresAt && now > data.tokenExpiresAt) {
    await ref.delete();
    res.status(410).json({ error: "Session expired." });
    return;
  }
  await ref.delete();
  res.status(200).json({
    token: data.token,
    profile: { uid: data.uid, email: data.email, source: "google" },
    expiresAt: data.tokenExpiresAt ?? now + AUTH_SESSION_TTL_MS,
  });
});

app.get("/auth/callback", async (req, res) => {
  if (!assertAuthConfig(res)) return;
  if (!ensureFirebaseInitialized(res)) return;
  const error = typeof req.query.error === "string" ? req.query.error : "";
  if (error) {
    res.status(400).type("text/plain").send(`OAuth error: ${error}`);
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
  const state = typeof req.query.state === "string" ? req.query.state.trim() : "";
  if (!code || !state) {
    res.status(400).type("text/plain").send("Missing code or state.");
    return;
  }
  const baseUrl = resolvePublicBaseUrl(req);
  if (!baseUrl) {
    res.status(500).type("text/plain").send("Failed to resolve public base URL.");
    return;
  }
  const db = getFirestore();
  const ref = db.collection(AUTH_SESSION_COLLECTION).doc(state);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).type("text/plain").send("Auth session not found.");
    return;
  }
  const data = snap.data() as { stateExpiresAt?: number } | undefined;
  if (data?.stateExpiresAt && Date.now() > data.stateExpiresAt) {
    await ref.delete();
    res.status(410).type("text/plain").send("Auth session expired.");
    return;
  }
  const redirectUri = `${baseUrl}/auth/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text();
    console.warn("OAuth token exchange failed", detail);
    res.status(400).type("text/plain").send("OAuth token exchange failed.");
    return;
  }
  const tokenData = (await tokenResponse.json()) as { id_token?: string };
  if (!tokenData.id_token) {
    res.status(400).type("text/plain").send("Missing id_token.");
    return;
  }
  const google = await verifyGoogleIdToken(tokenData.id_token);
  if (!google) {
    res.status(400).type("text/plain").send("Invalid Google login.");
    return;
  }
  if (!isAllowedEmail(google.email)) {
    res.status(403).type("text/plain").send("User not allowed.");
    return;
  }
  const session = createSessionToken({
    uid: google.uid,
    email: google.email,
    source: "google",
  });
  const tokenExpiresAt = session.expiresAt;
  await ref.set(
    {
      status: "complete",
      uid: google.uid,
      email: google.email,
      token: session.token,
      tokenExpiresAt,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  res
    .status(200)
    .type("text/html")
    .send(
      "<!doctype html><html><head><meta charset=\"utf-8\"><title>Login Complete</title></head><body>ログインが完了しました。このタブを閉じて拡張機能に戻ってください。</body></html>"
    );
});

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

  const session = verifySessionToken(token);
  if (session) {
    if (!isAllowedEmail(session.email)) {
      res.status(403).json({ error: "User not allowed." });
      return null;
    }
    return session;
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

async function verifyGoogleIdToken(
  token: string
): Promise<{ uid: string; email: string } | null> {
  try {
    const url = new URL("https://oauth2.googleapis.com/tokeninfo");
    url.searchParams.set("id_token", token);
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const data = (await response.json()) as {
      sub?: string;
      email?: string;
      email_verified?: string;
      aud?: string;
    };
    const email = (data.email ?? "").toLowerCase();
    if (!data.sub || !email) return null;
    if (data.email_verified && data.email_verified !== "true") return null;
    if (GOOGLE_OAUTH_CLIENT_ID && data.aud !== GOOGLE_OAUTH_CLIENT_ID) {
      console.warn("Google id token aud mismatch", data.aud);
      return null;
    }
    return { uid: data.sub, email };
  } catch (error) {
    console.warn("Google id token verification failed", error);
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

function assertAuthConfig(res: express.Response): boolean {
  const missing: string[] = [];
  if (!GOOGLE_OAUTH_CLIENT_ID) missing.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!GOOGLE_OAUTH_CLIENT_SECRET) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!AUTH_SESSION_SECRET) missing.push("AUTH_SESSION_SECRET");
  if (!missing.length) return true;
  res.status(503).json({ error: "Auth configuration is missing.", missing });
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

function resolvePublicBaseUrl(req: express.Request): string | null {
  const protoHeader = req.headers["x-forwarded-proto"];
  const hostHeader = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  const proto =
    (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader)?.split(",")[0]?.trim() ||
    req.protocol ||
    "https";
  const host = Array.isArray(hostHeader)
    ? hostHeader[0]
    : String(hostHeader).split(",")[0]?.trim();
  if (!host) return null;
  return `${proto}://${host}`;
}

function base64UrlEncode(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = normalized.length % 4;
  const padded = padLength ? normalized + "=".repeat(4 - padLength) : normalized;
  return Buffer.from(padded, "base64");
}

function createSessionToken(payload: {
  uid: string;
  email: string;
  source: "google";
}): { token: string; expiresAt: number } {
  if (!AUTH_SESSION_SECRET) {
    throw new Error("AUTH_SESSION_SECRET is not configured.");
  }
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.floor(AUTH_SESSION_TTL_MS / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    sub: payload.uid,
    email: payload.email,
    source: payload.source,
    iat: now,
    exp,
    iss: "qb-support-backend",
    aud: "qb-support-extension",
  };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(body)
  )}`;
  const signature = base64UrlEncode(
    createHmac("sha256", AUTH_SESSION_SECRET).update(unsigned).digest()
  );
  return { token: `${unsigned}.${signature}`, expiresAt: exp * 1000 };
}

function verifySessionToken(token: string): AuthContext | null {
  if (!AUTH_SESSION_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const unsigned = `${header}.${payload}`;
  const expected = base64UrlEncode(
    createHmac("sha256", AUTH_SESSION_SECRET).update(unsigned).digest()
  );
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(base64UrlDecode(payload).toString("utf8")) as {
      sub?: string;
      email?: string;
      source?: string;
      exp?: number;
      iss?: string;
      aud?: string;
    };
    if (!decoded.sub || !decoded.email) return null;
    if (decoded.iss && decoded.iss !== "qb-support-backend") return null;
    if (decoded.aud && decoded.aud !== "qb-support-extension") return null;
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && now >= decoded.exp) return null;
    return {
      uid: decoded.sub,
      email: decoded.email.toLowerCase(),
      source: "google",
    };
  } catch (error) {
    console.warn("Session token verification failed", error);
    return null;
  }
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
