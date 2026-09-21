import { getStore } from "@netlify/blobs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
};

export default async function visitors(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...JSON_HEADERS, Allow: "POST" },
    });
  }

  try {
    const store = getStore({
      name: "paddle-rotation-analytics",
      consistency: "strong",
    });

    const cookie = request.headers.get("cookie") || "";
    const alreadyCounted =
      /(?:^|;\s*)paddle_visitor_seen=1(?:;|$)/.test(cookie);

    const saved = (await store.get("visitor-count", { type: "json" })) || {};
    let count = Number(saved.count || 0);

    if (!alreadyCounted) {
      count += 1;
      await store.setJSON("visitor-count", {
        count,
        updatedAt: new Date().toISOString(),
      });
    }

    const headers = { ...JSON_HEADERS };
    if (!alreadyCounted) {
      headers["set-cookie"] =
        "paddle_visitor_seen=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure; HttpOnly";
    }

    return new Response(JSON.stringify({ count }), { headers });
  } catch (error) {
    console.error("Visitor counter error", error);
    return new Response(JSON.stringify({ error: "Counter unavailable" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}

export const config = {
  path: "/api/visitors",
  method: ["POST"],
};
