import { Hono } from "hono";
import { cors } from "hono/cors";
import { rowToTemplate, templateToRow } from "./db";
import { authMiddleware, sessionMiddleware, requireSession, requireModerator, requireAdmin } from "./auth";
import type { Env } from "./auth";
import { validateTemplate } from "./validate";
import { checkRateLimit, cleanupExpiredRateLimits } from "./rateLimiter";

const app = new Hono<Env>();

app.use(
  "*",
  cors({
    origin: [
      "https://easyschematic.live",
      "https://www.easyschematic.live",
      "https://devices.easyschematic.live",
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    credentials: true,
  })
);

// Session middleware on all routes
app.use("*", sessionMiddleware);

// Admin token auth on template write routes
app.use("/templates/*", authMiddleware);
app.use("/templates", authMiddleware);

// Admin token auth on library write routes
app.use("/signals/*", authMiddleware);
app.use("/signals", authMiddleware);
app.use("/connectors/*", authMiddleware);
app.use("/connectors", authMiddleware);
app.use("/connector-compatibility/*", authMiddleware);
app.use("/connector-compatibility", authMiddleware);
app.use("/categories/*", authMiddleware);
app.use("/categories", authMiddleware);

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=3600",
};

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-cache",
};

function sessionCookie(sessionId: string, maxAge: number): string {
  return `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;
}

function getClientIP(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}

// ==================== AUTH ENDPOINTS ====================

app.post("/auth/login", async (c) => {
  const body = await c.req.json<{ email?: string }>();
  const email = body.email?.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return c.json({ error: "Valid email is required" }, 400);
  }

  const db = c.env.easyschematic_db;

  // Rate limit: 3 per email per hour, 10 per IP per hour
  const ip = getClientIP(c);
  const emailLimit = await checkRateLimit(db, `login:email:${email}`, 3);
  if (!emailLimit.allowed) {
    return c.json({ error: "Too many login attempts for this email. Try again later." }, 429);
  }
  const ipLimit = await checkRateLimit(db, `login:ip:${ip}`, 10);
  if (!ipLimit.allowed) {
    return c.json({ error: "Too many login attempts. Try again later." }, 429);
  }

  // Generate magic link token
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await db
    .prepare("INSERT INTO magic_links (id, email, token, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, email, token, expiresAt)
    .run();

  // Send magic link email via Resend
  const verifyUrl = `https://api.easyschematic.live/auth/verify?token=${token}`;

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "EasySchematic <noreply@easyschematic.live>",
      to: email,
      subject: "Your login link",
      html: `<p>Click below to log in to EasySchematic Devices:</p>
<p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#1e293b;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Log in to EasySchematic</a></p>
<p style="color:#64748b;font-size:14px;">This link expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`,
    }),
  });

  if (!emailRes.ok) {
    console.error("Resend error:", await emailRes.text());
    return c.json({ error: "Failed to send login email" }, 500);
  }

  return c.json({ ok: true });
});

app.get("/auth/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.json({ error: "Token required" }, 400);
  }

  const db = c.env.easyschematic_db;

  // Find and validate magic link
  const link = await db
    .prepare("SELECT * FROM magic_links WHERE token = ? AND used = 0 AND expires_at > datetime('now')")
    .bind(token)
    .first<{ id: string; email: string }>();

  if (!link) {
    return c.redirect("https://devices.easyschematic.live/#/login?error=expired");
  }

  // Mark as used
  await db.prepare("UPDATE magic_links SET used = 1 WHERE id = ?").bind(link.id).run();

  // Find or create user
  let user = await db.prepare("SELECT id FROM users WHERE email = ?").bind(link.email).first<{ id: string }>();

  if (!user) {
    const userId = crypto.randomUUID();
    await db
      .prepare("INSERT INTO users (id, email, last_login_at) VALUES (?, ?, datetime('now'))")
      .bind(userId, link.email)
      .run();
    user = { id: userId };
  } else {
    await db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run();
  }

  // Create session (30-day TTL)
  const sessionId = crypto.randomUUID();
  const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(sessionId, user.id, sessionExpires)
    .run();

  // Redirect to devices site with session cookie
  return new Response(null, {
    status: 302,
    headers: {
      Location: "https://devices.easyschematic.live/#/",
      "Set-Cookie": sessionCookie(sessionId, 30 * 24 * 60 * 60),
    },
  });
});

app.post("/auth/logout", async (c) => {
  const cookie = c.req.header("Cookie");
  const match = cookie?.match(/(?:^|;\s*)session=([^\s;]+)/);

  if (match) {
    await c.env.easyschematic_db.prepare("DELETE FROM sessions WHERE id = ?").bind(match[1]).run();
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookie("", 0),
    },
  });
});

app.get("/auth/me", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  // Fetch submission stats
  const stats = await c.env.easyschematic_db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
       FROM submissions WHERE user_id = ?`,
    )
    .bind(user.id)
    .first<{ total: number; approved: number; pending: number; rejected: number }>();

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    stats: stats ?? { total: 0, approved: 0, pending: 0, rejected: 0 },
  });
});

app.put("/auth/me", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const body = await c.req.json<{ name?: string }>();

  if (body.name != null) {
    const name = body.name.trim();
    if (name.length > 50) {
      return c.json({ error: "Name must be 50 characters or fewer" }, 400);
    }
    await c.env.easyschematic_db
      .prepare("UPDATE users SET name = ? WHERE id = ?")
      .bind(name || null, user.id)
      .run();
  }

  return c.json({ ok: true });
});

// ==================== SUBMISSION ENDPOINTS ====================

app.post("/submissions", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  if (user.banned) return c.json({ error: "Account suspended" }, 403);

  const db = c.env.easyschematic_db;

  // Rate limit: 10 submissions per user per hour
  const limit = await checkRateLimit(db, `submit:user:${user.id}`, 10);
  if (!limit.allowed) {
    return c.json({ error: "Too many submissions. Try again later." }, 429);
  }

  const body = await c.req.json<{ action?: string; templateId?: string; data?: unknown }>();

  if (!body.action || (body.action !== "create" && body.action !== "update")) {
    return c.json({ error: "action must be 'create' or 'update'" }, 400);
  }

  if (body.action === "update" && !body.templateId) {
    return c.json({ error: "templateId is required for update submissions" }, 400);
  }

  // Validate the template data
  const validation = validateTemplate(body.data);
  if (!validation.ok) {
    return c.json({ error: validation.error }, 400);
  }

  const id = crypto.randomUUID();

  await db
    .prepare(
      "INSERT INTO submissions (id, user_id, action, template_id, data) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, user.id, body.action, body.templateId ?? null, JSON.stringify(body.data))
    .run();

  const created = await db.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first();
  return c.json(formatSubmission(created as unknown as SubmissionRow), 201, NO_CACHE_HEADERS);
});

app.get("/submissions/mine", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const { results } = await c.env.easyschematic_db
    .prepare("SELECT * FROM submissions WHERE user_id = ? ORDER BY created_at DESC")
    .bind(user.id)
    .all();

  return c.json(results.map((r: any) => formatSubmission(r as unknown as SubmissionRow)));
});

app.get("/submissions/pending", async (c) => {
  const mod = requireModerator(c);
  if (!mod) return c.json({ error: "Moderator access required" }, 403);

  const { results } = await c.env.easyschematic_db
    .prepare(
      `SELECT s.*, u.email as submitter_email, u.name as submitter_name
       FROM submissions s JOIN users u ON s.user_id = u.id
       WHERE s.status = 'pending' ORDER BY s.created_at ASC`,
    )
    .all();

  return c.json(results.map((r: any) => formatSubmission(r as unknown as SubmissionRow)));
});

app.get("/submissions/:id", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const id = c.req.param("id");
  const row = await c.env.easyschematic_db.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first();

  if (!row) return c.json({ error: "Submission not found" }, 404);

  const submission = row as unknown as SubmissionRow;
  // Users can see their own, moderators can see all
  if (submission.user_id !== user.id && user.role !== "moderator" && user.role !== "admin") {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(formatSubmission(submission));
});

app.post("/submissions/:id/approve", async (c) => {
  const mod = requireModerator(c);
  if (!mod) return c.json({ error: "Moderator access required" }, 403);

  const id = c.req.param("id");
  const db = c.env.easyschematic_db;

  const row = await db.prepare("SELECT * FROM submissions WHERE id = ? AND status = 'pending'").bind(id).first();
  if (!row) return c.json({ error: "Pending submission not found" }, 404);

  const submission = row as unknown as SubmissionRow;

  // Allow moderator to override submission data with edits
  const body = await c.req.json<{ data?: unknown }>().catch(() => ({}) as { data?: unknown });
  let data = JSON.parse(submission.data);
  if (body.data) {
    const validation = validateTemplate(body.data);
    if (!validation.ok) {
      return c.json({ error: validation.error }, 400);
    }
    data = body.data;
  }

  const libraryCheck = await validatePortsAgainstLibrary(db, (data as { ports: { signalType: string; connectorType?: string }[] }).ports);
  if (!libraryCheck.ok) {
    return c.json({ error: libraryCheck.error }, 400);
  }

  if (submission.action === "create") {
    // Create new template with attribution
    const templateId = crypto.randomUUID();
    const templateRow = templateToRow({ ...data, id: templateId });

    await db
      .prepare(
        `INSERT INTO templates (id, version, device_type, label, manufacturer, model_number, color, image_url, reference_url, search_terms, ports, sort_order, submitted_by)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        templateRow.id,
        templateRow.device_type,
        templateRow.label,
        templateRow.manufacturer,
        templateRow.model_number,
        templateRow.color,
        templateRow.image_url,
        templateRow.reference_url,
        templateRow.search_terms,
        templateRow.ports,
        templateRow.sort_order,
        submission.user_id,
      )
      .run();
  } else if (submission.action === "update" && submission.template_id) {
    // Update existing template with edit attribution
    const templateRow = templateToRow({ ...data, id: submission.template_id });

    await db
      .prepare(
        `UPDATE templates
         SET device_type = ?, label = ?, manufacturer = ?, model_number = ?,
             color = ?, image_url = ?, reference_url = ?, search_terms = ?, ports = ?, sort_order = ?,
             version = version + 1, updated_at = CURRENT_TIMESTAMP, last_edited_by = ?
         WHERE id = ?`,
      )
      .bind(
        templateRow.device_type,
        templateRow.label,
        templateRow.manufacturer,
        templateRow.model_number,
        templateRow.color,
        templateRow.image_url,
        templateRow.reference_url,
        templateRow.search_terms,
        templateRow.ports,
        templateRow.sort_order,
        submission.user_id,
        submission.template_id,
      )
      .run();
  }

  // Mark submission approved
  await db
    .prepare("UPDATE submissions SET status = 'approved', reviewer_id = ?, reviewed_at = datetime('now') WHERE id = ?")
    .bind(mod.id, id)
    .run();

  return c.json({ ok: true, status: "approved" }, 200, NO_CACHE_HEADERS);
});

app.post("/submissions/:id/reject", async (c) => {
  const mod = requireModerator(c);
  if (!mod) return c.json({ error: "Moderator access required" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json<{ note?: string }>();

  const row = await c.env.easyschematic_db
    .prepare("SELECT id FROM submissions WHERE id = ? AND status = 'pending'")
    .bind(id)
    .first();

  if (!row) return c.json({ error: "Pending submission not found" }, 404);

  await c.env.easyschematic_db
    .prepare(
      "UPDATE submissions SET status = 'rejected', reviewer_id = ?, reviewer_note = ?, reviewed_at = datetime('now') WHERE id = ?",
    )
    .bind(mod.id, body.note ?? null, id)
    .run();

  return c.json({ ok: true, status: "rejected" }, 200, NO_CACHE_HEADERS);
});

// ==================== USER MANAGEMENT (ADMIN) ====================

app.get("/users", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin access required" }, 403);

  const { results } = await c.env.easyschematic_db
    .prepare("SELECT id, email, name, role, banned, created_at, last_login_at FROM users ORDER BY created_at DESC")
    .all();

  return c.json(results);
});

app.put("/users/:id/role", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin access required" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json<{ role?: string }>();

  if (!body.role || !["contributor", "moderator", "admin"].includes(body.role)) {
    return c.json({ error: "role must be 'contributor', 'moderator', or 'admin'" }, 400);
  }

  await c.env.easyschematic_db.prepare("UPDATE users SET role = ? WHERE id = ?").bind(body.role, id).run();
  return c.json({ ok: true });
});

app.put("/users/:id/ban", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin access required" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json<{ banned?: boolean }>();

  await c.env.easyschematic_db
    .prepare("UPDATE users SET banned = ? WHERE id = ?")
    .bind(body.banned ? 1 : 0, id)
    .run();
  return c.json({ ok: true });
});

// ==================== CONTRIBUTORS (public) ====================

app.get("/contributors", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare(
      `SELECT u.id, u.name, u.email,
              COUNT(*) as approved_count
       FROM submissions s JOIN users u ON s.user_id = u.id
       WHERE s.status = 'approved'
       GROUP BY u.id
       ORDER BY approved_count DESC
       LIMIT 50`,
    )
    .all();

  // Only expose name (or anonymized email) — not full email
  const contributors = (results as unknown as { id: string; name: string | null; email: string; approved_count: number }[]).map((r: any) => ({
    id: r.id,
    name: r.name || "Awesome Community Member",
    approvedCount: r.approved_count,
  }));

  return c.json(contributors, 200, CACHE_HEADERS);
});

async function validatePortsAgainstLibrary(
  db: any,
  ports: { signalType: string; connectorType?: string }[],
) {
  const signalTypes = [...new Set(ports.map((p) => p.signalType).filter(Boolean))];
  if (signalTypes.length === 0) return { ok: true as const };

  const signalPlaceholders = signalTypes.map(() => "?").join(", ");
  const { results } = await db
    .prepare(`SELECT id FROM signals WHERE id IN (${signalPlaceholders})`)
    .bind(...signalTypes)
    .all();

  const found = new Set(results.map((r: any) => (r as { id: string }).id));
  const missing = signalTypes.filter((s) => !found.has(s));
  if (missing.length) return { ok: false as const, error: `Unknown signalType(s): ${missing.join(", ")}` };

  const connectorTypes = [...new Set(ports.map((p) => p.connectorType).filter((x): x is string => !!x))];
  if (connectorTypes.length === 0) return { ok: true as const };

  const connectorPlaceholders = connectorTypes.map(() => "?").join(", ");
  const connRes = await db
    .prepare(`SELECT id FROM connectors WHERE id IN (${connectorPlaceholders})`)
    .bind(...connectorTypes)
    .all();

  const connFound = new Set(connRes.results.map((r: any) => (r as { id: string }).id));
  const connMissing = connectorTypes.filter((s) => !connFound.has(s));
  if (connMissing.length) return { ok: false as const, error: `Unknown connectorType(s): ${connMissing.join(", ")}` };

  return { ok: true as const };
}

// -------------------- signals --------------------
app.get("/signals", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT id, label, default_color, cable_label, default_connector_id, is_network, is_video FROM signals ORDER BY label")
    .all();
  return c.json(
    results.map((r: any) => ({
      id: r.id,
      label: r.label,
      defaultColor: r.default_color,
      cableLabel: r.cable_label,
      defaultConnectorId: r.default_connector_id,
      isNetwork: !!r.is_network,
      isVideo: !!r.is_video,
    })),
    200,
    CACHE_HEADERS,
  );
});

app.get("/signals/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.easyschematic_db
    .prepare("SELECT id, label, default_color, cable_label, default_connector_id, is_network, is_video FROM signals WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return c.json({ error: "Signal not found" }, 404);
  return c.json({
    id: row.id,
    label: row.label,
    defaultColor: row.default_color,
    cableLabel: row.cable_label,
    defaultConnectorId: row.default_connector_id,
    isNetwork: !!row.is_network,
    isVideo: !!row.is_video,
  });
});

app.post("/signals", async (c) => {
  const body = await c.req.json() as {
    id?: string;
    label?: string;
    defaultColor?: string;
    cableLabel?: string;
    defaultConnectorId?: string | null;
    isNetwork?: boolean;
    isVideo?: boolean;
  };

  const id = body.id?.trim();
  const label = body.label?.trim();
  const defaultColor = body.defaultColor?.trim();
  const cableLabel = body.cableLabel?.trim();

  if (!id) return c.json({ error: "id is required" }, 400);
  if (!label) return c.json({ error: "label is required" }, 400);
  if (!defaultColor) return c.json({ error: "defaultColor is required" }, 400);
  if (!cableLabel) return c.json({ error: "cableLabel is required" }, 400);

  const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
  if (!HEX_COLOR_RE.test(defaultColor)) {
    return c.json({ error: "defaultColor must be a hex color like #3b82f6" }, 400);
  }

  const defaultConnectorId = body.defaultConnectorId ? String(body.defaultConnectorId) : null;
  const isNetwork = body.isNetwork ? 1 : 0;
  const isVideo = body.isVideo ? 1 : 0;

  await c.env.easyschematic_db
    .prepare(
      `INSERT OR REPLACE INTO signals
       (id, label, default_color, cable_label, default_connector_id, is_network, is_video, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    )
    .bind(id, label, defaultColor, cableLabel, defaultConnectorId, isNetwork, isVideo)
    .run();

  const created = await c.env.easyschematic_db.prepare("SELECT * FROM signals WHERE id = ?").bind(id).first();
  return c.json(
    {
      id: created.id,
      label: created.label,
      defaultColor: created.default_color,
      cableLabel: created.cable_label,
      defaultConnectorId: created.default_connector_id,
      isNetwork: !!created.is_network,
      isVideo: !!created.is_video,
    },
    201,
    NO_CACHE_HEADERS,
  );
});

app.put("/signals/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json() as {
    label?: string;
    defaultColor?: string;
    cableLabel?: string;
    defaultConnectorId?: string | null;
    isNetwork?: boolean;
    isVideo?: boolean;
  };

  const label = body.label?.trim();
  const defaultColor = body.defaultColor?.trim();
  const cableLabel = body.cableLabel?.trim();

  if (!label) return c.json({ error: "label is required" }, 400);
  if (!defaultColor) return c.json({ error: "defaultColor is required" }, 400);
  if (!cableLabel) return c.json({ error: "cableLabel is required" }, 400);

  const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
  if (!HEX_COLOR_RE.test(defaultColor)) {
    return c.json({ error: "defaultColor must be a hex color like #3b82f6" }, 400);
  }

  const defaultConnectorId = body.defaultConnectorId ? String(body.defaultConnectorId) : null;
  const isNetwork = body.isNetwork ? 1 : 0;
  const isVideo = body.isVideo ? 1 : 0;

  const existing = await c.env.easyschematic_db.prepare("SELECT id FROM signals WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Signal not found" }, 404);

  await c.env.easyschematic_db
    .prepare(
      `UPDATE signals
       SET label = ?, default_color = ?, cable_label = ?, default_connector_id = ?,
           is_network = ?, is_video = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(label, defaultColor, cableLabel, defaultConnectorId, isNetwork, isVideo, id)
    .run();

  const updated = await c.env.easyschematic_db.prepare("SELECT * FROM signals WHERE id = ?").bind(id).first();
  return c.json(
    {
      id: updated.id,
      label: updated.label,
      defaultColor: updated.default_color,
      cableLabel: updated.cable_label,
      defaultConnectorId: updated.default_connector_id,
      isNetwork: !!updated.is_network,
      isVideo: !!updated.is_video,
    },
    200,
    NO_CACHE_HEADERS,
  );
});

app.delete("/signals/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.easyschematic_db.prepare("SELECT id FROM signals WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Signal not found" }, 404);

  // Ports are stored as JSON in templates. Block deletion if referenced.
  const { results } = await c.env.easyschematic_db
    .prepare(`SELECT id FROM templates WHERE ports LIKE ? LIMIT 1`)
    .bind(`%\"signalType\":\"${id}\"%`)
    .all();
  if (results.length) return c.json({ error: "Cannot delete signal referenced by templates" }, 409);

  await c.env.easyschematic_db.prepare("DELETE FROM signals WHERE id = ?").bind(id).run();
  return c.body(null, 204);
});

// -------------------- connectors --------------------
app.get("/connectors", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT id, label, cable_label FROM connectors ORDER BY label")
    .all();
  return c.json(
    results.map((r: any) => ({
      id: r.id,
      label: r.label,
      cableLabel: r.cable_label,
    })),
    200,
    CACHE_HEADERS,
  );
});

app.get("/connectors/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.easyschematic_db
    .prepare("SELECT id, label, cable_label FROM connectors WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return c.json({ error: "Connector not found" }, 404);
  return c.json({ id: row.id, label: row.label, cableLabel: row.cable_label });
});

app.post("/connectors", async (c) => {
  const body = await c.req.json() as { id?: string; label?: string; cableLabel?: string };
  const id = body.id?.trim();
  const label = body.label?.trim();
  const cableLabel = body.cableLabel?.trim();
  if (!id) return c.json({ error: "id is required" }, 400);
  if (!label) return c.json({ error: "label is required" }, 400);
  if (!cableLabel) return c.json({ error: "cableLabel is required" }, 400);

  await c.env.easyschematic_db
    .prepare(
      `INSERT OR REPLACE INTO connectors
       (id, label, cable_label, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    )
    .bind(id, label, cableLabel)
    .run();

  const created = await c.env.easyschematic_db.prepare("SELECT * FROM connectors WHERE id = ?").bind(id).first();
  return c.json({ id: created.id, label: created.label, cableLabel: created.cable_label }, 201, NO_CACHE_HEADERS);
});

app.put("/connectors/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json() as { label?: string; cableLabel?: string };
  const label = body.label?.trim();
  const cableLabel = body.cableLabel?.trim();
  if (!label) return c.json({ error: "label is required" }, 400);
  if (!cableLabel) return c.json({ error: "cableLabel is required" }, 400);

  const existing = await c.env.easyschematic_db.prepare("SELECT id FROM connectors WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Connector not found" }, 404);

  await c.env.easyschematic_db
    .prepare(
      `UPDATE connectors
       SET label = ?, cable_label = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(label, cableLabel, id)
    .run();

  const updated = await c.env.easyschematic_db.prepare("SELECT * FROM connectors WHERE id = ?").bind(id).first();
  return c.json({ id: updated.id, label: updated.label, cableLabel: updated.cable_label }, 200, NO_CACHE_HEADERS);
});

app.delete("/connectors/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.easyschematic_db.prepare("SELECT id FROM connectors WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Connector not found" }, 404);

  const { results } = await c.env.easyschematic_db
    .prepare(`SELECT id FROM templates WHERE ports LIKE ? LIMIT 1`)
    .bind(`%\"connectorType\":\"${id}\"%`)
    .all();
  if (results.length) return c.json({ error: "Cannot delete connector referenced by templates" }, 409);

  await c.env.easyschematic_db.prepare("DELETE FROM connectors WHERE id = ?").bind(id).run();
  return c.body(null, 204);
});

// -------------------- connector-compatibility --------------------
app.get("/connector-compatibility", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT connector_a, connector_b FROM connector_compatibility ORDER BY connector_a, connector_b")
    .all();
  return c.json(results.map((r: any) => ({ connectorA: r.connector_a, connectorB: r.connector_b })), 200, CACHE_HEADERS);
});

app.put("/connector-compatibility", async (c) => {
  const body = await c.req.json() as { pairs?: { connectorA?: string; connectorB?: string }[] };
  const pairs = body.pairs ?? [];

  const normalized = pairs
    .map((p) => ({ a: p.connectorA?.trim(), b: p.connectorB?.trim() }))
    .filter((p): p is { a: string; b: string } => !!p.a && !!p.b && p.a !== p.b)
    .map((p) => (p.a <= p.b ? { connectorA: p.a, connectorB: p.b } : { connectorA: p.b, connectorB: p.a }));

  const unique = new Set<string>();
  const deduped: { connectorA: string; connectorB: string }[] = [];
  for (const p of normalized) {
    const key = `${p.connectorA}|${p.connectorB}`;
    if (unique.has(key)) continue;
    unique.add(key);
    deduped.push(p);
  }

  // Validate referenced connectors exist.
  const ids = [...new Set(deduped.flatMap((p) => [p.connectorA, p.connectorB]))];
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(", ");
    const { results } = await c.env.easyschematic_db
      .prepare(`SELECT id FROM connectors WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all();
    const found = new Set(results.map((r: any) => r.id as string));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) return c.json({ error: `Unknown connector(s): ${missing.join(", ")}` }, 400);
  }

  await c.env.easyschematic_db.prepare("DELETE FROM connector_compatibility").run();
  for (const p of deduped) {
    await c.env.easyschematic_db
      .prepare("INSERT OR REPLACE INTO connector_compatibility (connector_a, connector_b) VALUES (?, ?)")
      .bind(p.connectorA, p.connectorB)
      .run();
  }

  return c.json({ ok: true, count: deduped.length }, 200, NO_CACHE_HEADERS);
});

// -------------------- categories --------------------
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

app.get("/categories", async (c) => {
  const { results } = await c.env.easyschematic_db.prepare("SELECT id, label FROM categories ORDER BY label").all();
  return c.json(results.map((r: any) => ({ id: r.id, label: r.label })), 200, CACHE_HEADERS);
});

app.get("/categories/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.easyschematic_db.prepare("SELECT id, label FROM categories WHERE id = ?").bind(id).first();
  if (!row) return c.json({ error: "Category not found" }, 404);

  const { results } = await c.env.easyschematic_db
    .prepare("SELECT device_type, sort_order FROM category_device_types WHERE category_id = ? ORDER BY sort_order, device_type")
    .bind(id)
    .all();

  return c.json({ id: row.id, label: row.label, deviceTypes: results.map((r: any) => r.device_type) }, 200);
});

app.post("/categories", async (c) => {
  const body = await c.req.json() as { id?: string; label?: string; deviceTypes?: string[] };
  const label = body.label?.trim();
  if (!label) return c.json({ error: "label is required" }, 400);

  const id = (body.id?.trim() ?? slugify(label)).trim();
  if (!id) return c.json({ error: "id is required" }, 400);

  const deviceTypes = (body.deviceTypes ?? []).map((d) => String(d).trim()).filter(Boolean);
  if (deviceTypes.length === 0) return c.json({ error: "deviceTypes must be non-empty" }, 400);

  await c.env.easyschematic_db
    .prepare(`INSERT OR REPLACE INTO categories (id, label, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`)
    .bind(id, label)
    .run();

  await c.env.easyschematic_db.prepare("DELETE FROM category_device_types WHERE category_id = ?").bind(id).run();
  for (let i = 0; i < deviceTypes.length; i++) {
    await c.env.easyschematic_db
      .prepare("INSERT INTO category_device_types (category_id, device_type, sort_order) VALUES (?, ?, ?)")
      .bind(id, deviceTypes[i], i)
      .run();
  }

  return c.json({ id, label, deviceTypes }, 201, NO_CACHE_HEADERS);
});

app.put("/categories/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json() as { label?: string; deviceTypes?: string[] };

  const existing = await c.env.easyschematic_db.prepare("SELECT id FROM categories WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Category not found" }, 404);

  const label = body.label?.trim();
  if (!label) return c.json({ error: "label is required" }, 400);

  const deviceTypes = (body.deviceTypes ?? []).map((d) => String(d).trim()).filter(Boolean);
  if (deviceTypes.length === 0) return c.json({ error: "deviceTypes must be non-empty" }, 400);

  await c.env.easyschematic_db
    .prepare("UPDATE categories SET label = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(label, id)
    .run();

  await c.env.easyschematic_db.prepare("DELETE FROM category_device_types WHERE category_id = ?").bind(id).run();
  for (let i = 0; i < deviceTypes.length; i++) {
    await c.env.easyschematic_db
      .prepare("INSERT INTO category_device_types (category_id, device_type, sort_order) VALUES (?, ?, ?)")
      .bind(id, deviceTypes[i], i)
      .run();
  }

  return c.json({ ok: true }, 200, NO_CACHE_HEADERS);
});

app.delete("/categories/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.easyschematic_db.prepare("SELECT id FROM categories WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Category not found" }, 404);

  await c.env.easyschematic_db.prepare("DELETE FROM category_device_types WHERE category_id = ?").bind(id).run();
  await c.env.easyschematic_db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
  return c.body(null, 204);
});

// ==================== TEMPLATE ENDPOINTS ====================

app.get("/templates/device-types", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT DISTINCT device_type FROM templates ORDER BY device_type")
    .all();
  return c.json(results.map((r: any) => (r as { device_type: string }).device_type), 200, CACHE_HEADERS);
});

app.get("/templates/search-terms", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT search_terms FROM templates WHERE search_terms IS NOT NULL")
    .all();
  const allTerms = new Set<string>();
  for (const row of results) {
    const terms = JSON.parse((row as { search_terms: string }).search_terms) as string[];
    for (const t of terms) allTerms.add(t.toLowerCase());
  }
  const sorted = [...allTerms].sort();
  return c.json(sorted, 200, CACHE_HEADERS);
});

app.get("/templates", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT * FROM templates ORDER BY sort_order, label")
    .all();

  const templates = results.map((row: any) => rowToTemplate(row as never));
  return c.json(templates, 200, CACHE_HEADERS);
});

app.get("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.easyschematic_db
    .prepare(
      `SELECT t.*,
              su.name as submitter_name, su.email as submitter_email,
              eu.name as editor_name, eu.email as editor_email
       FROM templates t
       LEFT JOIN users su ON t.submitted_by = su.id
       LEFT JOIN users eu ON t.last_edited_by = eu.id
       WHERE t.id = ?`,
    )
    .bind(id)
    .first();

  if (!row) {
    return c.json({ error: "Template not found" }, 404);
  }

  const template = rowToTemplate(row as never);
  const r = row as Record<string, unknown>;
  const result: Record<string, unknown> = { ...template };

  if (r.submitted_by) {
    result.submittedBy = {
      name: (r.submitter_name as string) || anonymizeEmail(r.submitter_email as string),
    };
  }
  if (r.last_edited_by) {
    result.lastEditedBy = {
      name: (r.editor_name as string) || anonymizeEmail(r.editor_email as string),
    };
  }

  return c.json(result, 200, CACHE_HEADERS);
});

app.post("/templates", async (c) => {
  const body = await c.req.json();
  const result = validateTemplate(body);

  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }

  const libraryCheck = await validatePortsAgainstLibrary(c.env.easyschematic_db, result.data.ports);
  if (!libraryCheck.ok) {
    return c.json({ error: libraryCheck.error }, 400);
  }

  const id = crypto.randomUUID();
  const row = templateToRow({ ...result.data, id });

  await c.env.easyschematic_db
    .prepare(
      `INSERT INTO templates (id, version, device_type, label, manufacturer, model_number, color, image_url, reference_url, search_terms, ports, sort_order)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.device_type,
      row.label,
      row.manufacturer,
      row.model_number,
      row.color,
      row.image_url,
      row.reference_url,
      row.search_terms,
      row.ports,
      row.sort_order,
    )
    .run();

  const created = await c.env.easyschematic_db
    .prepare("SELECT * FROM templates WHERE id = ?")
    .bind(id)
    .first();

  return c.json(rowToTemplate(created as never), 201, NO_CACHE_HEADERS);
});

app.put("/templates/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await c.env.easyschematic_db
    .prepare("SELECT * FROM templates WHERE id = ?")
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: "Template not found" }, 404);
  }

  const body = await c.req.json();
  const result = validateTemplate(body);

  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }

  const libraryCheck = await validatePortsAgainstLibrary(c.env.easyschematic_db, result.data.ports);
  if (!libraryCheck.ok) {
    return c.json({ error: libraryCheck.error }, 400);
  }

  const row = templateToRow({ ...result.data, id });

  await c.env.easyschematic_db
    .prepare(
      `UPDATE templates
     SET device_type = ?, label = ?, manufacturer = ?, model_number = ?,
         color = ?, image_url = ?, reference_url = ?, search_terms = ?, ports = ?, sort_order = ?,
         version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    )
    .bind(
      row.device_type,
      row.label,
      row.manufacturer,
      row.model_number,
      row.color,
      row.image_url,
      row.reference_url,
      row.search_terms,
      row.ports,
      row.sort_order,
      id,
    )
    .run();

  const updated = await c.env.easyschematic_db
    .prepare("SELECT * FROM templates WHERE id = ?")
    .bind(id)
    .first();

  return c.json(rowToTemplate(updated as never), 200, NO_CACHE_HEADERS);
});

app.delete("/templates/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await c.env.easyschematic_db
    .prepare("SELECT id FROM templates WHERE id = ?")
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: "Template not found" }, 404);
  }

  await c.env.easyschematic_db.prepare("DELETE FROM templates WHERE id = ?").bind(id).run();

  return c.body(null, 204);
});

// ==================== HEALTH ====================

app.get("/health", async (c) => {
  // Opportunistically clean up expired rate limits
  await cleanupExpiredRateLimits(c.env.easyschematic_db).catch(() => {});
  return c.json({ ok: true });
});

export default app;

// ==================== HELPERS ====================

interface SubmissionRow {
  id: string;
  user_id: string;
  action: string;
  template_id: string | null;
  data: string;
  status: string;
  reviewer_id: string | null;
  reviewer_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  // Joined fields (optional)
  submitter_email?: string;
  submitter_name?: string;
}

function anonymizeEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "Anonymous";
  return `${local[0]}${"*".repeat(Math.min(local.length - 1, 5))}@${domain}`;
}

function formatSubmission(row: SubmissionRow) {
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    templateId: row.template_id,
    data: JSON.parse(row.data),
    status: row.status,
    reviewerId: row.reviewer_id,
    reviewerNote: row.reviewer_note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    ...(row.submitter_email && { submitterEmail: row.submitter_email }),
    ...(row.submitter_name && { submitterName: row.submitter_name }),
  };
}
