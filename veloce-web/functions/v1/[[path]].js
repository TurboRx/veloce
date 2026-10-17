export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.pathname === "/v1/auth/login") {
    const redirect = url.searchParams.get("redirect") || "/apps";
    const target = redirect.startsWith("/") ? `${url.origin}${redirect}` : redirect;
    return Response.redirect(target, 302);
  }

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
