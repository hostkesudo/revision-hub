interface Env {
  FILES: R2Bucket;
  ALLOWED_ORIGIN?: string;
}

function corsHeaders(origin: string | null, allowedOrigin?: string): Record<string, string> {
  const allowed = allowedOrigin || "";
  const useOrigin = (origin && allowed && origin === allowed) ? origin : (allowed || "*");
  return {
    "Access-Control-Allow-Origin": useOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/upload") {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...headers } });
      }

      const formData = await request.formData();
      const file = formData.get("file") as File;
      if (!file) {
        return new Response(JSON.stringify({ error: "No file provided" }), { status: 400, headers: { "Content-Type": "application/json", ...headers } });
      }

      const ext = file.name.split(".").pop() || "bin";
      const key = `papers/${Date.now()}_${file.name}`;
      await env.FILES.put(key, file, { httpMetadata: { contentType: file.type } });

      const publicUrl = `${url.origin}/file/${key}`;
      return new Response(JSON.stringify({ url: publicUrl, key }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }

    if (request.method === "GET" && url.pathname.startsWith("/file/")) {
      const key = decodeURIComponent(url.pathname.replace("/file/", ""));
      const object = await env.FILES.get(key);
      if (!object) {
        return new Response("Not found", { status: 404 });
      }

      const headers2 = new Headers(headers);
      headers2.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
      headers2.set("Cache-Control", "public, max-age=31536000");

      return new Response(object.body, { headers: headers2 });
    }

    return new Response("Not found", { status: 404 });
  },
};
