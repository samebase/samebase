import { describe, expect, it } from "vite-plus/test";

import { publicMediaManifest } from "../apps/samebase/shared/publicMediaManifest.ts";
import { validatePublicMediaResponse } from "./check-public-media.ts";

const asset = publicMediaManifest.landingFounderDemo;

describe("check-public-media", () => {
  it("accepts an origin-backed one-byte range response matching the manifest", () => {
    expect(
      validatePublicMediaResponse(asset, {
        status: 206,
        bodyByteLength: 1,
        headers: new Headers({
          "cache-control": asset.cacheControl,
          "cf-cache-status": "MISS",
          "content-disposition": asset.contentDisposition,
          "content-range": `bytes 0-0/${asset.byteLength}`,
          "content-type": asset.contentType,
          etag: asset.etag,
        }),
      }),
    ).toEqual([]);
  });

  it("reports an unavailable or cached response without hiding mismatched metadata", () => {
    expect(
      validatePublicMediaResponse(asset, {
        status: 404,
        bodyByteLength: null,
        headers: new Headers({
          "cf-cache-status": "HIT",
          "content-type": "text/html",
        }),
      }),
    ).toEqual([
      "expected status 206, received 404",
      "expected a one-byte body, received no body",
      `expected content-range bytes 0-0/${asset.byteLength}, received no header`,
      `expected content-type ${asset.contentType}, received text/html`,
      `expected content-disposition ${asset.contentDisposition}, received no header`,
      `expected cache-control ${asset.cacheControl}, received no header`,
      `expected etag ${asset.etag}, received no header`,
      "expected an origin-backed response, received cf-cache-status HIT",
    ]);
  });
});
