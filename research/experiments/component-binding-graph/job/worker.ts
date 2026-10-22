export default {
  async fetch(request: Request, env: { SECRET: string }): Promise<Response> {
    if (request.headers.get("Authorization") !== `Bearer ${env.SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    return new Response((await request.text()).toUpperCase());
  },
};
