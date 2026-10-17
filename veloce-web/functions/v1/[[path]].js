export async function onRequest(context) {
  const url = new URL(context.request.url);
  const upstreamBase = context.env.API_UPSTREAM_URL;

  if (!upstreamBase) {
    return new Response(
      JSON.stringify({ error: "API_UPSTREAM_URL environment variable is not configured" }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const targetUrl = `${upstreamBase.replace(/\/$/, "")}${url.pathname}${url.search}`;
  const headers = new Headers(context.request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  const init = {
    method: context.request.method,
    headers,
    redirect: "manual",
  };

  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    init.body = await context.request.arrayBuffer();
  }

  return fetch(targetUrl, init);
}
