export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || url.pathname.includes(".")) return response;
    const fallback = new URL("/index.html", url);
    return env.ASSETS.fetch(new Request(fallback, request));
  }
};
