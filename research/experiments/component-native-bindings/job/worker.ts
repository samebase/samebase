import type { WorkerEnv } from "./alchemy.ts";

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.headers.get("Authorization") !== `Bearer ${env.SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    const result = (await request.text()).toUpperCase();
    await env.STORAGE.put("latest", result);
    await env.ARCHIVE.put("latest", result);
    const stored = await env.STORAGE.get("latest");
    const archived = await env.ARCHIVE.get("latest");
    if ((await archived?.text()) !== result) throw new Error("Shared archive write failed");
    return new Response(stored?.body);
  },
};
