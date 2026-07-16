export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);

    // Workers Cache entries are isolated by deployment version, so the edge
    // can keep this immutable asset without serving it after a video update.
    headers.set("Cloudflare-CDN-Cache-Control", "public, max-age=31536000, immutable");

    return new Response(assetResponse.body, {
      headers,
      status: assetResponse.status,
      statusText: assetResponse.statusText,
    });
  },
} satisfies ExportedHandler<Env>;
