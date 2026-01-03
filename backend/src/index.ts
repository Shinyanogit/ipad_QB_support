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
const RATE_LIMIT_HOURLY_MAX = 100;
const RATE_LIMIT_HOURLY_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_DAILY_FREE_MAX = 50;
const RATE_LIMIT_DAILY_PLUS_MAX = 500;
const BACKEND_DEFAULT_MODEL = "gpt-5-mini";
const BACKEND_ALLOWED_MODELS_DEFAULT = new Set(["gpt-5-mini", "gpt-4.1"]);
const BACKEND_ALLOWED_MODELS_SPECIAL = new Set([
  "gpt-5-mini",
  "gpt-5.2",
  "gpt-5.2-chat-latest",
  "gpt-4.1",
]);
const SPECIAL_PLUS_EMAIL = "ymgtsny7@gmail.com";
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const USAGE_COLLECTION = "qb_support_usage_v2";
const ENTITLEMENTS_COLLECTION = "qb_support_entitlements_v1";
const APPLE_IAP_ENVIRONMENT = (process.env.APPLE_IAP_ENVIRONMENT ?? "production")
  .trim()
  .toLowerCase();
const APPLE_BUNDLE_ID = (process.env.APPLE_BUNDLE_ID ?? "").trim();
const APPLE_SUBSCRIPTION_PRODUCT_ID = (process.env.APPLE_SUBSCRIPTION_PRODUCT_ID ?? "").trim();
const IAP_PAYWALL_URL = (process.env.IAP_PAYWALL_URL ?? "").trim();
const APPLE_JWS_PROD_URL = "https://api.storekit.itunes.apple.com/inApps/v1/jwsPublicKeys";
const APPLE_JWS_SANDBOX_URL =
  "https://api.storekit-sandbox.itunes.apple.com/inApps/v1/jwsPublicKeys";
const APPLE_JWS_URL =
  APPLE_IAP_ENVIRONMENT === "sandbox" ? APPLE_JWS_SANDBOX_URL : APPLE_JWS_PROD_URL;
type JoseModule = typeof import("jose");
type JwkSet = ReturnType<JoseModule["createRemoteJWKSet"]>;
let appleJwks: JwkSet | null = null;
const SETTINGS_COLLECTION = "qb_support_settings";
const AUTH_SESSION_COLLECTION = "qb_support_auth_sessions";
const AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTH_STATE_TTL_MS = 10 * 60 * 1000;

type AuthContext = {
  uid: string;
  email: string;
  source: "firebase" | "google";
};

type EntitlementTier = "free" | "plus" | "special";

type EntitlementStatus = {
  tier: EntitlementTier;
  active: boolean;
  expiresAt?: number;
  productId?: string;
  environment?: string;
  source: "special" | "iap" | "none";
};

type UsageWindow = {
  limit: number;
  remaining: number;
  resetAt: number;
  count: number;
};

type UsageResult = {
  allowed: boolean;
  reason?: "hourly" | "daily";
  hourly: UsageWindow;
  daily: UsageWindow;
};

type AppleTransactionPayload = {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  bundleId?: string;
  environment?: string;
  expiresDate?: number | string;
  purchaseDate?: number | string;
  revocationDate?: number | string;
  revocationReason?: number | string;
  appAccountToken?: string;
};

type AppleTransactionInfo = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  bundleId: string;
  environment: string;
  expiresAt: number | null;
  purchaseAt: number | null;
  revocationAt: number | null;
  revocationReason: number | null;
  appAccountToken: string | null;
};

const resolveBackendModel = (requested: string | undefined, auth: AuthContext): string => {
  const trimmed = typeof requested === "string" ? requested.trim() : "";
  const allowed = isSpecialUser(auth.email)
    ? BACKEND_ALLOWED_MODELS_SPECIAL
    : BACKEND_ALLOWED_MODELS_DEFAULT;
  return allowed.has(trimmed) ? trimmed : BACKEND_DEFAULT_MODEL;
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
if (APPLE_IAP_ENVIRONMENT !== "sandbox" && APPLE_IAP_ENVIRONMENT !== "production") {
  console.warn("APPLE_IAP_ENVIRONMENT should be 'sandbox' or 'production'.");
}
if (!APPLE_BUNDLE_ID) {
  console.warn("APPLE_BUNDLE_ID is not set. IAP bundleId checks are disabled.");
}
if (!APPLE_SUBSCRIPTION_PRODUCT_ID) {
  console.warn("APPLE_SUBSCRIPTION_PRODUCT_ID is not set. IAP productId checks are disabled.");
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
    req.url.startsWith("/settings") ||
    req.url.startsWith("/iap") ||
    req.url.startsWith("/me")
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
      "<!doctype html><html><head><meta charset=\"utf-8\"><title>Login Complete</title><script>setTimeout(function(){window.close();},200);</script></head><body>ログインが完了しました。このタブを閉じて拡張機能に戻ってください。</body></html>"
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

app.post("/iap/apple/transaction", async (req, res) => {
  const auth = await authenticateRequest(req, res);
  if (!auth) return;
  const body = req.body as { signedTransactionInfo?: string } | undefined;
  const jws =
    typeof body?.signedTransactionInfo === "string" ? body.signedTransactionInfo.trim() : "";
  if (!jws) {
    res.status(400).json({ error: "Missing signedTransactionInfo." });
    return;
  }
  let payload: AppleTransactionPayload;
  try {
    payload = await verifyAppleTransactionInfo(jws);
  } catch (error) {
    console.warn("IAP JWS verification failed", error);
    res.status(400).json({ error: "Invalid signedTransactionInfo." });
    return;
  }
  const transaction = normalizeAppleTransaction(payload);
  if (!transaction) {
    res.status(400).json({ error: "Invalid transaction payload." });
    return;
  }
  const validationError = validateAppleTransaction(transaction);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const now = Date.now();
  const isRevoked = transaction.revocationAt !== null;
  const expiresAt = transaction.expiresAt ?? 0;
  const active = Boolean(!isRevoked && expiresAt && expiresAt > now);
  const status = active ? "active" : isRevoked ? "revoked" : "expired";

  try {
    const db = getFirestore();
    await db.collection(ENTITLEMENTS_COLLECTION).doc(auth.uid).set(
      {
        status,
        productId: transaction.productId,
        bundleId: transaction.bundleId,
        environment: transaction.environment,
        transactionId: transaction.transactionId,
        originalTransactionId: transaction.originalTransactionId,
        expiresAt: transaction.expiresAt,
        purchaseAt: transaction.purchaseAt,
        revocationAt: transaction.revocationAt,
        revocationReason: transaction.revocationReason,
        appAccountToken: transaction.appAccountToken,
        email: auth.email,
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (error) {
    console.warn("IAP entitlement store failed", error);
    res.status(503).json({ error: "Entitlement store failed." });
    return;
  }

  res.status(200).json({
    ok: true,
    entitlement: {
      status,
      expiresAt: transaction.expiresAt,
      productId: transaction.productId,
      environment: transaction.environment,
    },
  });
});

app.get("/me/entitlement", async (req, res) => {
  const auth = await authenticateRequest(req, res);
  if (!auth) return;
  try {
    const entitlement = await resolveEntitlement(auth);
    const dailyLimit =
      entitlement.tier === "free" ? RATE_LIMIT_DAILY_FREE_MAX : RATE_LIMIT_DAILY_PLUS_MAX;
    const usage = await getUsageSnapshot(auth.uid, auth.email, dailyLimit);
    res.status(200).json({
      uid: auth.uid,
      email: auth.email,
      entitlement,
      usage,
    });
  } catch (error) {
    console.warn("Entitlement fetch failed", error);
    res.status(503).json({ error: "Entitlement fetch failed." });
  }
});

app.post("/chat", async (req, res) => {
  if (!assertRequiredConfig(res)) return;
  const auth = await authenticateRequest(req, res);
  if (!auth) return;

  const body = req.body as { model?: string; messages?: unknown } | undefined;
  const policyError = await enforceUsagePolicy(auth);
  if (policyError) {
    res.status(policyError.status).json(policyError.body);
    return;
  }
  const messages = Array.isArray(body?.messages) ? body?.messages : [];

  const model = resolveBackendModel(body?.model, auth);
  const payload: Record<string, unknown> = { model, messages };

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

  const policyError = await enforceUsagePolicy(auth);
  if (policyError) {
    res.status(policyError.status).json(policyError.body);
    return;
  }

  const model = resolveBackendModel(body?.model, auth);
  const payload: Record<string, unknown> = {
    model,
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
  auth: AuthContext
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try {
    const entitlement = await resolveEntitlement(auth);
    const dailyLimit =
      entitlement.tier === "free" ? RATE_LIMIT_DAILY_FREE_MAX : RATE_LIMIT_DAILY_PLUS_MAX;
    const usage = await consumeUsage(auth.uid, auth.email, dailyLimit);
    if (!usage.allowed) {
      return {
        status: 429,
        body: buildUsageErrorBody(entitlement, usage),
      };
    }
  } catch (error) {
    console.warn("Usage policy check failed", error);
    return {
      status: 503,
      body: { error: "Usage policy check failed." },
    };
  }
  return null;
}

function buildUsageErrorBody(entitlement: EntitlementStatus, usage: UsageResult) {
  const isDaily = usage.reason === "daily";
  const paywall = IAP_PAYWALL_URL || null;
  const dailyMessage =
    entitlement.tier === "free"
      ? "本日の上限に達しました。サブスクで上限を引き上げるにはアプリから購入してください。"
      : "本日の上限に達しました。明日(JST)にリセットされます。追加枠が必要な場合はアプリから購入してください。";
  const hourlyMessage =
    "1時間あたりの上限に達しました。しばらくしてからお試しください。日次上限を引き上げたい場合はアプリから購入してください。";
  return {
    error: "Rate limit exceeded.",
    reason: usage.reason ?? "unknown",
    message: isDaily ? dailyMessage : hourlyMessage,
    purchase_url: paywall,
    entitlement: {
      tier: entitlement.tier,
      active: entitlement.active,
      expiresAt: entitlement.expiresAt ?? null,
      productId: entitlement.productId ?? null,
    },
    hourly: usage.hourly,
    daily: usage.daily,
  };
}

async function consumeUsage(
  uid: string,
  email: string,
  dailyLimit: number
): Promise<UsageResult> {
  const db = getFirestore();
  const ref = db.collection(USAGE_COLLECTION).doc(uid);
  const now = Date.now();
  const { dayKey, dayResetAt } = getJstDayWindow(now);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as {
          hourWindowStart?: number;
          hourCount?: number;
          dayKey?: string;
          dayCount?: number;
        })
      : {};

    const hourWindowStart =
      typeof data.hourWindowStart === "number" ? data.hourWindowStart : 0;
    const hourCount = typeof data.hourCount === "number" ? data.hourCount : 0;
    const dayKeyStored = typeof data.dayKey === "string" ? data.dayKey : "";
    const dayCountStored = typeof data.dayCount === "number" ? data.dayCount : 0;

    const hourExpired = !hourWindowStart || now - hourWindowStart >= RATE_LIMIT_HOURLY_WINDOW_MS;
    const nextHourWindowStart = hourExpired ? now : hourWindowStart;
    const nextHourCount = hourExpired ? 0 : hourCount;

    const dayExpired = !dayKeyStored || dayKeyStored !== dayKey;
    const nextDayCount = dayExpired ? 0 : dayCountStored;

    const hourlyRemaining = Math.max(0, RATE_LIMIT_HOURLY_MAX - nextHourCount);
    const dailyRemaining = Math.max(0, dailyLimit - nextDayCount);

    const hourlyBlocked = nextHourCount >= RATE_LIMIT_HOURLY_MAX;
    const dailyBlocked = nextDayCount >= dailyLimit;

    if (hourlyBlocked || dailyBlocked) {
      return {
        allowed: false,
        reason: hourlyBlocked ? "hourly" : "daily",
        hourly: {
          limit: RATE_LIMIT_HOURLY_MAX,
          remaining: hourlyRemaining,
          resetAt: nextHourWindowStart + RATE_LIMIT_HOURLY_WINDOW_MS,
          count: nextHourCount,
        },
        daily: {
          limit: dailyLimit,
          remaining: dailyRemaining,
          resetAt: dayResetAt,
          count: nextDayCount,
        },
      };
    }

    const updatedHourCount = nextHourCount + 1;
    const updatedDayCount = nextDayCount + 1;
    tx.set(
      ref,
      {
        hourWindowStart: nextHourWindowStart,
        hourCount: updatedHourCount,
        dayKey,
        dayCount: updatedDayCount,
        updatedAt: now,
        email,
      },
      { merge: true }
    );

    return {
      allowed: true,
      hourly: {
        limit: RATE_LIMIT_HOURLY_MAX,
        remaining: Math.max(0, RATE_LIMIT_HOURLY_MAX - updatedHourCount),
        resetAt: nextHourWindowStart + RATE_LIMIT_HOURLY_WINDOW_MS,
        count: updatedHourCount,
      },
      daily: {
        limit: dailyLimit,
        remaining: Math.max(0, dailyLimit - updatedDayCount),
        resetAt: dayResetAt,
        count: updatedDayCount,
      },
    };
  });
}

async function getUsageSnapshot(
  uid: string,
  email: string,
  dailyLimit: number
): Promise<UsageResult> {
  const db = getFirestore();
  const ref = db.collection(USAGE_COLLECTION).doc(uid);
  const now = Date.now();
  const { dayKey, dayResetAt } = getJstDayWindow(now);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as {
          hourWindowStart?: number;
          hourCount?: number;
          dayKey?: string;
          dayCount?: number;
        })
      : {};

    const hourWindowStart =
      typeof data.hourWindowStart === "number" ? data.hourWindowStart : 0;
    const hourCount = typeof data.hourCount === "number" ? data.hourCount : 0;
    const dayKeyStored = typeof data.dayKey === "string" ? data.dayKey : "";
    const dayCountStored = typeof data.dayCount === "number" ? data.dayCount : 0;

    const hourExpired = !hourWindowStart || now - hourWindowStart >= RATE_LIMIT_HOURLY_WINDOW_MS;
    const nextHourWindowStart = hourExpired ? now : hourWindowStart;
    const nextHourCount = hourExpired ? 0 : hourCount;

    const dayExpired = !dayKeyStored || dayKeyStored !== dayKey;
    const nextDayCount = dayExpired ? 0 : dayCountStored;

    if (hourExpired || dayExpired || !snap.exists) {
      tx.set(
        ref,
        {
          hourWindowStart: nextHourWindowStart,
          hourCount: nextHourCount,
          dayKey,
          dayCount: nextDayCount,
          updatedAt: now,
          email,
        },
        { merge: true }
      );
    }

    const hourlyBlocked = nextHourCount >= RATE_LIMIT_HOURLY_MAX;
    const dailyBlocked = nextDayCount >= dailyLimit;
    return {
      allowed: !(hourlyBlocked || dailyBlocked),
      reason: hourlyBlocked ? "hourly" : dailyBlocked ? "daily" : undefined,
      hourly: {
        limit: RATE_LIMIT_HOURLY_MAX,
        remaining: Math.max(0, RATE_LIMIT_HOURLY_MAX - nextHourCount),
        resetAt: nextHourWindowStart + RATE_LIMIT_HOURLY_WINDOW_MS,
        count: nextHourCount,
      },
      daily: {
        limit: dailyLimit,
        remaining: Math.max(0, dailyLimit - nextDayCount),
        resetAt: dayResetAt,
        count: nextDayCount,
      },
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

function isSpecialUser(email: string): boolean {
  return email.trim().toLowerCase() === SPECIAL_PLUS_EMAIL;
}

async function resolveEntitlement(auth: AuthContext): Promise<EntitlementStatus> {
  if (isSpecialUser(auth.email)) {
    return { tier: "special", active: true, source: "special" };
  }
  const db = getFirestore();
  const ref = db.collection(ENTITLEMENTS_COLLECTION).doc(auth.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return { tier: "free", active: false, source: "none" };
  }
  const data = snap.data() as
    | {
        status?: string;
        expiresAt?: number;
        productId?: string;
        environment?: string;
        revocationAt?: number | null;
      }
    | undefined;
  const expiresAt = typeof data?.expiresAt === "number" ? data.expiresAt : 0;
  const revoked = Boolean(data?.status === "revoked" || data?.revocationAt);
  const active = Boolean(!revoked && expiresAt && expiresAt > Date.now());
  return {
    tier: active ? "plus" : "free",
    active,
    expiresAt: active ? expiresAt : undefined,
    productId: data?.productId,
    environment: data?.environment,
    source: "iap",
  };
}

function getJstDayWindow(nowMs: number): { dayKey: string; dayResetAt: number } {
  const jst = new Date(nowMs + JST_OFFSET_MS);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  const day = jst.getUTCDate();
  const dayKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const nextDayStartUtc = Date.UTC(year, month, day + 1) - JST_OFFSET_MS;
  if (Number.isNaN(nextDayStartUtc)) {
    return { dayKey, dayResetAt: nowMs + 24 * 60 * 60 * 1000 };
  }
  return { dayKey, dayResetAt: nextDayStartUtc };
}

function parseAppleDate(input?: number | string): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function normalizeAppleTransaction(
  payload: AppleTransactionPayload
): AppleTransactionInfo | null {
  const transactionId = (payload.transactionId ?? "").trim();
  const originalTransactionId = (payload.originalTransactionId ?? "").trim() || transactionId;
  const productId = (payload.productId ?? "").trim();
  const bundleId = (payload.bundleId ?? "").trim();
  const environment = (payload.environment ?? "").trim().toLowerCase();
  if (!transactionId || !originalTransactionId || !productId || !bundleId) {
    return null;
  }
  return {
    transactionId,
    originalTransactionId,
    productId,
    bundleId,
    environment,
    expiresAt: parseAppleDate(payload.expiresDate),
    purchaseAt: parseAppleDate(payload.purchaseDate),
    revocationAt: parseAppleDate(payload.revocationDate),
    revocationReason: (() => {
      if (typeof payload.revocationReason === "number") return payload.revocationReason;
      if (!payload.revocationReason) return null;
      const parsed = Number(payload.revocationReason);
      return Number.isNaN(parsed) ? null : parsed;
    })(),
    appAccountToken: payload.appAccountToken ? payload.appAccountToken.trim() : null,
  };
}

function validateAppleTransaction(transaction: AppleTransactionInfo): string | null {
  if (APPLE_BUNDLE_ID && transaction.bundleId !== APPLE_BUNDLE_ID) {
    return "Bundle ID mismatch.";
  }
  if (
    APPLE_SUBSCRIPTION_PRODUCT_ID &&
    transaction.productId !== APPLE_SUBSCRIPTION_PRODUCT_ID
  ) {
    return "Product ID mismatch.";
  }
  if (
    APPLE_IAP_ENVIRONMENT &&
    (transaction.environment || APPLE_IAP_ENVIRONMENT === "sandbox") &&
    transaction.environment !== APPLE_IAP_ENVIRONMENT
  ) {
    return "Environment mismatch.";
  }
  return null;
}

async function verifyAppleTransactionInfo(
  jws: string
): Promise<AppleTransactionPayload> {
  const { jwtVerify } = await import("jose");
  const jwks = await getAppleJwks();
  const { payload } = await jwtVerify(jws, jwks, { algorithms: ["ES256"] });
  return payload as AppleTransactionPayload;
}

async function getAppleJwks(): Promise<JwkSet> {
  if (appleJwks) return appleJwks;
  const { createRemoteJWKSet } = await import("jose");
  appleJwks = createRemoteJWKSet(new URL(APPLE_JWS_URL));
  return appleJwks;
}
