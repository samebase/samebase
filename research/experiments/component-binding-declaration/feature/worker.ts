export default {
  async fetch(request: Request, env: { BRIDGE_SECRET: string }) {
    if (request.headers.get("authorization") !== `Bearer ${env.BRIDGE_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (request.method !== "POST") return new Response("Use POST", { status: 405 });
    return new Response((await request.text()).trim().toUpperCase(), {
      headers: { "content-type": "text/plain" },
    });
  },
};
