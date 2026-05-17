export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: err?.message || 'Internal error' }, 500);
    }
  }
};

const APP_NAME = "FreeMC";
const SESSION_TTL_DAYS = 14;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function redirect(location, status = 302, headers = {}) {
  return new Response(null, {
    status,
    headers: { Location: location, "cache-control": "no-store", ...headers },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function readJson(request) {
  return request.json().catch(() => ({}));
}

function parseCookies(cookieHeader = "") {
  const out = {};
  cookieHeader.split(";").forEach(pair => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function sha256Hex(text) {
  const buf = new TextEncoder().encode(text);
  return crypto.subtle.digest("SHA-256", buf).then(hash => {
    return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
  });
}

function randomToken(bytes = 24) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
  return sha256Hex(`${salt}:${password}`);
}

async function getSession(request, env) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const token = cookies.session;
  if (!token) return null;

  const row = await env.DB.prepare(
    `SELECT s.id as session_id, s.user_id, s.expires_at, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ?1`
  ).bind(token).first();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare(`DELETE FROM sessions WHERE token = ?1`).bind(token).run();
    return null;
  }
  return row;
}

async function requireSession(request, env) {
  const sess = await getSession(request, env);
  if (!sess) throw new Error("Unauthorized");
  return sess;
}

async function createSession(env, userId) {
  const token = randomToken(32);
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4)`
  ).bind(token, userId, addDays(SESSION_TTL_DAYS), nowIso()).run();
  return token;
}

async function getUserByEmail(env, email) {
  return env.DB.prepare(`SELECT * FROM users WHERE email = ?1`).bind(email.toLowerCase()).first();
}

async function readBodyOrForm(request) {
  const ctype = request.headers.get("content-type") || "";
  if (ctype.includes("application/json")) return request.json();
  if (ctype.includes("application/x-www-form-urlencoded") || ctype.includes("multipart/form-data")) {
    const form = await request.formData();
    const out = {};
    for (const [k, v] of form.entries()) out[k] = String(v);
    return out;
  }
  return {};
}

function baseLayout(content, user = null) {
  const nav = user
    ? `
      <div class="nav">
        <div class="brand">${APP_NAME}</div>
        <div class="nav-right">
          <span class="pill">${escapeHtml(user.email)}</span>
          <a href="/dashboard" class="link">Dashboard</a>
          <a href="/logout" class="link danger">Logout</a>
        </div>
      </div>
    `
    : `
      <div class="nav">
        <div class="brand">${APP_NAME}</div>
        <div class="nav-right">
          <a href="/login" class="link">Login</a>
          <a href="/register" class="link">Register</a>
        </div>
      </div>
    `;

  return `
  <!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${APP_NAME}</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: radial-gradient(circle at top, #16213e 0%, #0f172a 45%, #020617 100%);
        color: #e5e7eb;
        min-height: 100vh;
      }
      a { color: inherit; text-decoration: none; }
      .wrap { max-width: 1100px; margin: 0 auto; padding: 20px; }
      .nav {
        display: flex; justify-content: space-between; align-items: center;
        gap: 12px; padding: 14px 0; margin-bottom: 18px;
      }
      .brand { font-weight: 800; letter-spacing: .4px; font-size: 1.2rem; }
      .nav-right { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .link, .btn {
        display: inline-flex; align-items: center; justify-content: center;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
        padding: 10px 14px; border-radius: 14px; backdrop-filter: blur(10px);
      }
      .link:hover, .btn:hover { background: rgba(255,255,255,.12); }
      .danger { border-color: rgba(248,113,113,.22); }
      .hero {
        display: grid; grid-template-columns: 1.35fr .95fr; gap: 18px;
        align-items: stretch;
      }
      .card {
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(15,23,42,.72);
        box-shadow: 0 20px 60px rgba(0,0,0,.35);
        border-radius: 24px; padding: 22px;
      }
      h1 { margin: 0 0 12px; font-size: clamp(2rem, 4vw, 4rem); line-height: 1.02; }
      p { line-height: 1.7; color: #cbd5e1; }
      .grid { display: grid; gap: 14px; }
      .muted { color: #94a3b8; font-size: .95rem; }
      .pill {
        padding: 7px 12px; border-radius: 999px; background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.08); color: #dbeafe;
        font-size: .92rem;
      }
      input, textarea, select {
        width: 100%; padding: 12px 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,.12);
        background: rgba(2,6,23,.72); color: #fff; outline: none;
      }
      input:focus, textarea:focus, select:focus { border-color: rgba(96,165,250,.75); }
      .btn { cursor: pointer; font: inherit; }
      .btn-primary { background: linear-gradient(135deg, #2563eb, #7c3aed); border: 0; }
      .btn-primary:hover { filter: brightness(1.05); }
      .stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
      .stat { padding: 14px; border-radius: 18px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); }
      .stat b { display: block; font-size: 1.35rem; margin-bottom: 4px; }
      .server { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
      .server + .server { margin-top: 10px; }
      .small { font-size: .92rem; }
      .footer { margin-top: 18px; color: #94a3b8; text-align: center; font-size: .9rem; }
      @media (max-width: 900px) { .hero { grid-template-columns: 1fr; } .stats { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      ${nav}
      ${content}
      <div class="footer">${APP_NAME} — Cloudflare Worker + Bridge</div>
    </div>
  </body>
  </html>`;
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function homePage(user) {
  const body = `
    <div class="hero">
      <div class="card">
        <span class="pill">Minecraft hosting control panel</span>
        <h1>استضافة مجانية بواجهة نظيفة، وBridge قابل للتبديل.</h1>
        <p>
          هذا المشروع مبني كواجهة Cloudflare Worker متصلة بطبقة خارجية.
          تقدر تبدل مزود الاستضافة لاحقًا بدون إعادة كتابة الموقع كله.
        </p>
        <div class="grid" style="grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 18px;">
          <a class="btn btn-primary" href="${user ? '/dashboard' : '/register'}">Get started</a>
          <a class="btn" href="/login">Login</a>
        </div>
        <div class="stats" style="margin-top: 18px;">
          <div class="stat"><b>Cloudflare</b><span class="muted">Worker UI + API</span></div>
          <div class="stat"><b>D1</b><span class="muted">Users and servers</span></div>
          <div class="stat"><b>Bridge</b><span class="muted">Aternos wrapper</span></div>
        </div>
      </div>
      <div class="card">
        <h2 style="margin-top:0;">What it does</h2>
        <div class="grid">
          <div class="stat"><b>Login</b><span class="muted">Secure session cookie</span></div>
          <div class="stat"><b>Create</b><span class="muted">Register a server record</span></div>
          <div class="stat"><b>Start / Stop</b><span class="muted">Forward actions to bridge</span></div>
        </div>
      </div>
    </div>`;
  return baseLayout(body, user);
}

function authPage(type, error = "") {
  const title = type === "login" ? "Login" : "Register";
  const action = type === "login" ? "/login" : "/register";
  const button = type === "login" ? "Login" : "Create account";
  return baseLayout(`
    <div class="card" style="max-width: 560px; margin: 20px auto;">
      <h1 style="font-size: 2rem; margin-bottom: 8px;">${title}</h1>
      <p class="muted">Use a real email and a password you remember.</p>
      ${error ? `<div class="card" style="padding: 12px; border-radius: 14px; border-color: rgba(248,113,113,.35); color:#fecaca;">${escapeHtml(error)}</div>` : ""}
      <form method="POST" action="${action}" class="grid" style="margin-top: 16px;">
        <input type="email" name="email" placeholder="Email" required />
        <input type="password" name="password" placeholder="Password" required />
        <button class="btn btn-primary" type="submit">${button}</button>
      </form>
    </div>
  `);
}

async function providerAction(env, server, action) {
  const provider = String(server.provider || "aternos-bridge");
  if (provider === "mock") {
    const map = { start: "running", stop: "stopped", refresh: server.status || "stopped" };
    return { ok: true, status: map[action] || server.status, message: "Mock provider", provider_ref: server.provider_ref || `mock-${server.id.slice(0, 8)}` };
  }

  const bridgeUrl = env.BRIDGE_URL;
  const bridgeKey = env.BRIDGE_KEY;

  if (!bridgeUrl || !bridgeKey) {
    return {
      ok: false,
      status: "error",
      message: "Bridge is not configured. Set BRIDGE_URL and BRIDGE_KEY.",
      provider_ref: server.provider_ref || null,
    };
  }

  const payload = {
    action,
    serverRef: server.provider_ref,
    name: server.name,
    settings: safeParse(server.settings_json),
  };

  const resp = await fetch(`${bridgeUrl.replace(/\/$/, "")}/${action}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${bridgeKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      status: "error",
      message: data.error || `Bridge error (${resp.status})`,
      provider_ref: server.provider_ref || null,
    };
  }
  return {
    ok: true,
    status: data.status || (action === "start" ? "running" : action === "stop" ? "stopped" : server.status),
    message: data.message || "OK",
    provider_ref: data.serverRef || server.provider_ref || null,
  };
}

function safeParse(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const session = await getSession(request, env);

  if (path === "/api/health") {
    return json({ ok: true, name: APP_NAME, time: nowIso() });
  }

  if (path === "/") {
    return html(homePage(session));
  }

  if (path === "/register" && method === "GET") return html(authPage("register"));
  if (path === "/login" && method === "GET") return html(authPage("login"));

  if (path === "/register" && method === "POST") {
    const body = await readBodyOrForm(request);
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");
    if (!email || !password) return html(authPage("register", "Email and password are required."));
    const exists = await getUserByEmail(env, email);
    if (exists) return html(authPage("register", "Email already exists."));

    const userId = randomToken(16);
    const salt = randomToken(16);
    const passHash = await hashPassword(password, salt);
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_salt, password_hash, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    ).bind(userId, email, salt, passHash, nowIso()).run();

    const token = await createSession(env, userId);
    return redirect("/dashboard", 302, { "set-cookie": `session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_DAYS * 24 * 60 * 60}` });
  }

  if (path === "/login" && method === "POST") {
    const body = await readBodyOrForm(request);
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");
    const user = await getUserByEmail(env, email);
    if (!user) return html(authPage("login", "Invalid credentials."));
    const passHash = await hashPassword(password, user.password_salt);
    if (passHash !== user.password_hash) return html(authPage("login", "Invalid credentials."));

    const token = await createSession(env, user.id);
    return redirect("/dashboard", 302, { "set-cookie": `session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_DAYS * 24 * 60 * 60}` });
  }

  if (path === "/logout") {
    const cookies = parseCookies(request.headers.get("cookie") || "");
    const token = cookies.session;
    if (token) await env.DB.prepare(`DELETE FROM sessions WHERE token = ?1`).bind(token).run();
    return redirect("/", 302, { "set-cookie": `session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
  }

  if (path === "/dashboard") {
    if (!session) return redirect("/login");
    const servers = await env.DB.prepare(`SELECT * FROM servers WHERE user_id = ?1 ORDER BY created_at DESC`).bind(session.user_id).all();
    const rows = (servers.results || []).map(server => `
      <div class="card server">
        <div>
          <b>${escapeHtml(server.name)}</b>
          <div class="muted small">${escapeHtml(server.provider)} • ${escapeHtml(server.status)} • ${escapeHtml(server.last_message || "")}</div>
        </div>
        <div class="nav-right">
          <form method="POST" action="/server/${encodeURIComponent(server.id)}/start"><button class="btn btn-primary" type="submit">Start</button></form>
          <form method="POST" action="/server/${encodeURIComponent(server.id)}/stop"><button class="btn" type="submit">Stop</button></form>
        </div>
      </div>
    `).join("");

    return html(baseLayout(`
      <div class="hero">
        <div class="card">
          <h1 style="font-size: 2.1rem;">Dashboard</h1>
          <p class="muted">Create a record for a server and forward actions to the bridge.</p>
          <form method="POST" action="/server/create" class="grid" style="margin: 14px 0 18px;">
            <input name="name" placeholder="Server name" required />
            <input name="provider_ref" placeholder="Aternos reference / identifier" />
            <textarea name="settings_json" rows="4" placeholder='{}'></textarea>
            <select name="provider">
              <option value="aternos-bridge">Aternos bridge</option>
              <option value="mock">Mock</option>
            </select>
            <button class="btn btn-primary" type="submit">Create server</button>
          </form>
          <div class="grid">${rows || `<div class="card" style="padding: 12px;">No servers yet.</div>`}</div>
        </div>
        <div class="card">
          <h2 style="margin-top:0;">Status</h2>
          <div class="stats">
            <div class="stat"><b>${escapeHtml(session.email)}</b><span class="muted">Signed in</span></div>
            <div class="stat"><b>${(servers.results || []).length}</b><span class="muted">Servers</span></div>
            <div class="stat"><b>Bridge</b><span class="muted">External provider</span></div>
          </div>
        </div>
      </div>
    `, session));
  }

  const serverActionMatch = path.match(/^\/server\/([^/]+)\/(start|stop)$/);
  if (serverActionMatch && method === "POST") {
    if (!session) return redirect("/login");
    const serverId = decodeURIComponent(serverActionMatch[1]);
    const action = serverActionMatch[2];
    const server = await env.DB.prepare(`SELECT * FROM servers WHERE id = ?1 AND user_id = ?2`).bind(serverId, session.user_id).first();
    if (!server) return html(baseLayout(`<div class="card">Server not found.</div>`, session), 404);

    const result = await providerAction(env, server, action);
    await env.DB.prepare(`UPDATE servers SET status = ?1, last_message = ?2, updated_at = ?3 WHERE id = ?4`).bind(
      result.status || server.status,
      result.message || "",
      nowIso(),
      server.id
    ).run();

    return redirect("/dashboard");
  }

  if (path === "/server/create" && method === "POST") {
    if (!session) return redirect("/login");
    const body = await readBodyOrForm(request);
    const id = randomToken(16);
    await env.DB.prepare(
      `INSERT INTO servers (id, user_id, name, provider, provider_ref, settings_json, status, last_message, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    ).bind(
      id,
      session.user_id,
      String(body.name || "Server").trim(),
      String(body.provider || "aternos-bridge"),
      String(body.provider_ref || "").trim() || null,
      String(body.settings_json || "{}").trim() || "{}",
      "stopped",
      "Created",
      nowIso(),
      nowIso()
    ).run();
    return redirect("/dashboard");
  }

  if (path === "/api/me") {
    if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
    return json({ ok: true, user: { email: session.email } });
  }

  return html(baseLayout(`<div class="card"><h1>404</h1><p>Page not found.</p></div>`, session), 404);
}
