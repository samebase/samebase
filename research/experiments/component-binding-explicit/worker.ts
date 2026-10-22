export default {
  async fetch(request: Request, env: { JOB_SECRET: string }) {
    if (request.headers.get("authorization") !== `Bearer ${env.JOB_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    return new Response((await request.text()).trim().toUpperCase());
  },
};
