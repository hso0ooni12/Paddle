import { getStore } from "@netlify/blobs";

export default async function visitors(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json", Allow: "POST" },
    });
  }

  const store = getStore({ name: "paddle-loveuall-analytics", consistency: "strong" });
  const cookie = request.headers.get("cookie") || "";
  const alreadyCounted = /(?:^|;\s*)paddle_visitor_seen=1(?:;|$)/.test(cookie);
  const saved = (await store.get("visitor-count", { type: "json" })) || {};
  let count = Number(saved.count || 0);

  if (!alreadyCounted) {
    count += 1;
    await store.setJSON("visitor-count", {
      count,
      updatedAt: new Date().toISOString(),
    });
  }

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
  };
  if (!alreadyCounted) {
    headers["set-cookie"] = "paddle_visitor_seen=1; Max-Age=31536000; Path=/; SameSite=Lax";
  }

  return new Response(JSON.stringify({ count }), { headers });
}

export const config = {
  path: "/api/visitors",
  method: ["POST"],
};
