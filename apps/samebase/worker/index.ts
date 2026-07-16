export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.body === null) {
      return assetResponse;
    }

    const headers = new Headers(assetResponse.headers);
    headers.delete("Content-Length");

    // Workers Cache entries are isolated by deployment version, so the edge
    // can keep this immutable asset without serving it after a video update.
    headers.set("Cloudflare-CDN-Cache-Control", "public, max-age=31536000");

    const responseInit = {
      headers,
      status: assetResponse.status,
      statusText: assetResponse.statusText,
    };
    const contentLength = assetResponse.headers.get("Content-Length");
    const expectedLength = Number(contentLength);

    if (contentLength === null || !Number.isSafeInteger(expectedLength) || expectedLength < 0) {
      return new Response(await assetResponse.arrayBuffer(), responseInit);
    }

    return new Response(
      assetResponse.body.pipeThrough(new FixedLengthStream(expectedLength)),
      responseInit,
    );
  },
} satisfies ExportedHandler<Env>;
