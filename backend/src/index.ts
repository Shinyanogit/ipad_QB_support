import cors from "cors";
import express from "express";
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PORT = Number(process.env.PORT ?? 8080);
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? "").trim();
const FIREBASE_PROJECT_ID = (process.env.FIREBASE_PROJECT_ID ?? "").trim();
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN ?? "").trim().toLowerCase();
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RESTRICTED_MODEL = "gpt-4.1";
const RATE_LIMIT_COLLECTION = "qb_support_rate_limits_v1";

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

app.use((req, _res, next) => {
  console.log("[req]", req.method, req.url);
  next();
});

app.get("/healthz", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

app.use(cors({ origin: true }));
app.use(express.json({ limit: "25mb" }));

app.post("/chat", async (req, res) => {
  const decoded = await authenticateRequest(req, res);
  if (!decoded) return;

  const body = req.body as { model?: string; messages?: unknown } | undefined;
  const policyError = await enforceUsagePolicy(decoded.uid);
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
  const instructions = typeof body?.instructions === "string" ? body.instructions.trim() : "";
  const input = body?.input ?? [];
  const previousResponseId =
    typeof body?.previous_response_id === "string" && body?.previous_response_id
      ? body.previous_response_id
      : null;

  const policyError = await enforceUsagePolicy(decoded.uid);
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

app.listen(PORT, () => {
  console.log(`qb-support-backend listening on :${PORT}`);
});

function logRoutes(appInstance: express.Express) {
  const stack = (appInstance as any)?._router?.stack ?? [];
  const routes: Array<{ method: string; path: string }> = [];
  for (const layer of stack) {
    if (!layer) continue;
    if (layer.route?.path && layer.route?.methods) {
      const methods = Object.keys(layer.route.methods)
        .filter((method) => layer.route.methods[method])
        .map((method) => method.toUpperCase());
      for (const method of methods) {
        routes.push({ method, path: String(layer.route.path) });
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      for (const nested of layer.handle.stack) {
        if (!nested?.route?.path || !nested?.route?.methods) continue;
        const methods = Object.keys(nested.route.methods)
          .filter((method) => nested.route.methods[method])
          .map((method) => method.toUpperCase());
        for (const method of methods) {
          routes.push({ method, path: String(nested.route.path) });
        }
      }
    }
  }
  console.log("[routes]", routes);
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

function isAllowedUser(decoded: DecodedIdToken): boolean {
  if (!ALLOWED_EMAILS.length && !ALLOWED_DOMAIN) return true;
  const email = decoded.email?.toLowerCase() ?? "";
  if (!email) return false;
  if (ALLOWED_EMAILS.length && !ALLOWED_EMAILS.includes(email)) return false;
  if (ALLOWED_DOMAIN && !email.endsWith(`@${ALLOWED_DOMAIN}`)) return false;
  return true;
}
