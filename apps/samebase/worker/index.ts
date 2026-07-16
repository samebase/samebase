export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    const responseInit = {
      headers,
      status: assetResponse.status,
      statusText: assetResponse.statusText,
    };

    // Workers Cache entries are isolated by deployment version, so the edge
    // can keep this immutable asset without serving it after a video update.
    headers.set("Cloudflare-CDN-Cache-Control", "public, max-age=31536000");
    headers.set("X-Samebase-Video-Delivery", "worker-cache");

    if (assetResponse.body === null) {
      return new Response(null, responseInit);
    }

    const contentLength = assetResponse.headers.get("Content-Length");
    if (contentLength === null) {
      return new Response(assetResponse.body, responseInit);
    }

    const { readable, writable } = new FixedLengthStream(BigInt(contentLength));
    void assetResponse.body.pipeTo(writable);

    return new Response(readable, responseInit);
  },
} satisfies ExportedHandler<Env>;
