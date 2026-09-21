const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
};

function json(data, init = {}) {
  const headers = new Headers(JSON_HEADERS);
  if (init.headers) {
    for (const [key, value] of new Headers(init.headers)) headers.set(key, value);
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function ensureCounterTable(env) {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS counters (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
}

async function handleVisitors(request, env) {
  if (request.method !== "POST") {
    return json(
      { error: "Method not allowed" },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  try {
    await ensureCounterTable(env);

    const cookie = request.headers.get("cookie") || "";
    const alreadyCounted = /(?:^|;\s*)paddle_visitor_seen=1(?:;|$)/.test(cookie);
    let count = 0;

    if (alreadyCounted) {
      const row = await env.DB.prepare(
        "SELECT value FROM counters WHERE key = ?1",
      ).bind("visitor-count").first();
      count = Number(row?.value || 0);
    } else {
      const row = await env.DB.prepare(`
        INSERT INTO counters (key, value, updated_at)
        VALUES (?1, 1, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
          value = value + 1,
          updated_at = datetime('now')
        RETURNING value
      `).bind("visitor-count").first();

      count = Number(row?.value || 0);
    }

    const headers = {};
    if (!alreadyCounted) {
      headers["set-cookie"] =
        "paddle_visitor_seen=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure; HttpOnly";
    }

    return json({ count }, { headers });
  } catch (error) {
    console.error("Visitor counter error", error);
    return json({ error: "Counter unavailable" }, { status: 500 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/visitors") {
      return handleVisitors(request, env);
    }

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") {
        return json(
          { error: "Method not allowed" },
          { status: 405, headers: { Allow: "GET" } },
        );
      }
      return json({ ok: true, service: "padel-loveuall", platform: "cloudflare" });
    }

    return json({ error: "Not found" }, { status: 404 });
  },
};
