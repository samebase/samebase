import { parseByteRangeSpec, resolveByteRange, sliceByteRangeStream } from "./byteRange";

const readContentLength = (headers: Headers): number | null => {
  const value = headers.get("Content-Length");
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }

  const contentLength = Number(value);
  return Number.isSafeInteger(contentLength) && contentLength >= 0 ? contentLength : null;
};

const matchesIfRange = (ifRange: string | null, headers: Headers): boolean => {
  if (ifRange === null) {
    return true;
  }

  const etag = headers.get("ETag");
  if (etag !== null && !etag.startsWith("W/") && ifRange === etag) {
    return true;
  }

  return false;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const rangeHeader = request.method === "GET" ? request.headers.get("Range") : null;
    const ifRange = request.headers.get("If-Range");
    const assetRequestHeaders = new Headers(request.headers);

    // Static Assets ignore byte ranges on Workers preview URLs. Fetch the full
    // asset, then return the requested bytes from this Worker instead.
    assetRequestHeaders.delete("Range");
    assetRequestHeaders.delete("If-Range");

    const assetResponse = await env.ASSETS.fetch(
      new Request(request, { headers: assetRequestHeaders }),
    );
    const assetBody = assetResponse.body;
    if (assetResponse.status !== 200 || assetBody === null) {
      return assetResponse;
    }

    const headers = new Headers(assetResponse.headers);
    headers.delete("Content-Length");
    headers.set("Accept-Ranges", "bytes");

    const responseInit = {
      headers,
      status: assetResponse.status,
      statusText: assetResponse.statusText,
    };
    const declaredContentLength = readContentLength(assetResponse.headers);
    const fullResponse = async (): Promise<Response> => {
      if (declaredContentLength === null) {
        return new Response(await assetResponse.arrayBuffer(), responseInit);
      }

      return new Response(
        assetBody.pipeThrough(new FixedLengthStream(declaredContentLength)),
        responseInit,
      );
    };

    if (rangeHeader === null || !matchesIfRange(ifRange, assetResponse.headers)) {
      return fullResponse();
    }

    const spec = parseByteRangeSpec(rangeHeader);
    if (spec.kind === "ignore") {
      return fullResponse();
    }

    const bufferedBody = declaredContentLength === null ? await assetResponse.arrayBuffer() : null;
    const contentLength = declaredContentLength ?? bufferedBody?.byteLength ?? 0;
    const range = resolveByteRange(spec, contentLength);

    if (range.kind === "ignore") {
      return bufferedBody === null ? fullResponse() : new Response(bufferedBody, responseInit);
    }
    if (range.kind === "unsatisfiable") {
      if (bufferedBody === null) {
        await assetBody.cancel();
      }

      headers.set("Content-Range", `bytes */${contentLength}`);
      return new Response(null, { headers, status: 416 });
    }

    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${contentLength}`);
    const bufferedRangeBody =
      bufferedBody !== null && range.start === 0 && range.end === bufferedBody.byteLength - 1
        ? bufferedBody
        : bufferedBody?.slice(range.start, range.end + 1);
    const responseBody =
      bufferedRangeBody === undefined
        ? sliceByteRangeStream(assetBody, range.start, range.end).pipeThrough(
            new FixedLengthStream(range.end - range.start + 1),
          )
        : bufferedRangeBody;

    return new Response(responseBody, {
      headers,
      status: 206,
      statusText: "Partial Content",
    });
  },
} satisfies ExportedHandler<Env>;
