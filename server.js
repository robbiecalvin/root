const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const app = express();

const ROOT_DIR = __dirname;
const EDITS_FILE = path.join(ROOT_DIR, "data", "editor-edits.json");
const SESSION_COOKIE = "ps_editor_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;

const EDITOR_USERNAME = process.env.EDITOR_USERNAME || "Robbie";
const EDITOR_PASSWORD = process.env.EDITOR_PASSWORD || "Password1234";
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-in-production";

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

function readEditsSync() {
  try {
    const content = fs.readFileSync(EDITS_FILE, "utf8");
    const parsed = JSON.parse(content);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (error) {
    return {};
  }
}

async function writeEdits(edits) {
  await fsp.mkdir(path.dirname(EDITS_FILE), { recursive: true });
  await fsp.writeFile(EDITS_FILE, JSON.stringify(edits, null, 2), "utf8");
}

function createSessionToken(username) {
  const payload = {
    username,
    exp: Date.now() + SESSION_DURATION_MS
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  const providedBuffer = Buffer.from(providedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));

    if (!payload || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

function getSession(req) {
  return verifySessionToken(req.cookies[SESSION_COOKIE]);
}

function requireAuth(req, res, next) {
  const session = getSession(req);

  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.session = session;
  return next();
}

function sanitizePagePath(pagePath) {
  if (typeof pagePath !== "string") {
    return "/";
  }

  if (!pagePath.startsWith("/")) {
    return "/";
  }

  if (pagePath.length > 200 || pagePath.includes("..")) {
    return "/";
  }

  return pagePath;
}

function sanitizeContentEdits(content) {
  if (!content || typeof content !== "object") {
    return {};
  }

  const sanitized = {};

  Object.keys(content).forEach((selector) => {
    const value = content[selector];

    if (typeof selector !== "string" || selector.length > 300) {
      return;
    }

    if (typeof value !== "string" || value.length > 5000) {
      return;
    }

    sanitized[selector] = value;
  });

  return sanitized;
}

function sanitizeStyleEdits(style) {
  if (!style || typeof style !== "object") {
    return {};
  }

  const allowedProperties = new Set(["color", "backgroundColor", "borderColor"]);
  const sanitized = {};

  Object.keys(style).forEach((selector) => {
    if (typeof selector !== "string" || selector.length > 300) {
      return;
    }

    const styleBlock = style[selector];
    if (!styleBlock || typeof styleBlock !== "object") {
      return;
    }

    const cleanBlock = {};

    Object.keys(styleBlock).forEach((property) => {
      const value = styleBlock[property];

      if (!allowedProperties.has(property)) {
        return;
      }

      if (typeof value !== "string" || value.length > 64) {
        return;
      }

      cleanBlock[property] = value;
    });

    if (Object.keys(cleanBlock).length > 0) {
      sanitized[selector] = cleanBlock;
    }
  });

  return sanitized;
}

app.post("/api/editor/login", (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (username !== EDITOR_USERNAME || password !== EDITOR_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = createSessionToken(username);

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_MS,
    path: "/"
  });

  return res.json({ ok: true });
});

app.post("/api/editor/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  return res.json({ ok: true });
});

app.get("/api/editor/session", (req, res) => {
  const session = getSession(req);
  return res.json({ authenticated: Boolean(session) });
});

app.get("/api/editor/edits", (req, res) => {
  const page = sanitizePagePath(req.query.page);
  const edits = readEditsSync();
  const pageEdits = edits[page] || {};

  return res.json({
    page,
    content: pageEdits.content || {},
    style: pageEdits.style || {}
  });
});

app.post("/api/editor/edits", requireAuth, async (req, res) => {
  const page = sanitizePagePath(req.body?.page);
  const content = sanitizeContentEdits(req.body?.content);
  const style = sanitizeStyleEdits(req.body?.style);

  const existing = readEditsSync();
  const pageExisting = existing[page] || { content: {}, style: {} };

  existing[page] = {
    content: {
      ...(pageExisting.content || {}),
      ...content
    },
    style: {
      ...(pageExisting.style || {}),
      ...style
    }
  };

  await writeEdits(existing);
  return res.json({ ok: true });
});

app.use(express.static(ROOT_DIR, { index: ["index.html"] }));

app.use((req, res) => {
  const cleanPath = req.path.endsWith("/") ? req.path : `${req.path}/`;
  const candidate = path.join(ROOT_DIR, cleanPath, "index.html");

  if (candidate.startsWith(ROOT_DIR) && fs.existsSync(candidate)) {
    return res.sendFile(candidate);
  }

  return res.status(404).send("Not Found");
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
