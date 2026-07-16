import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { publicMediaManifest } from "../apps/samebase/shared/publicMediaManifest.ts";

type PublicMediaAsset = (typeof publicMediaManifest)[keyof typeof publicMediaManifest];

type PublicMediaResponse = {
  status: number;
  headers: Headers;
  bodyByteLength: number | null;
};

export function validatePublicMediaResponse(
  asset: PublicMediaAsset,
  response: PublicMediaResponse,
): string[] {
  const failures: string[] = [];

  if (response.status !== 206) {
    failures.push(`expected status 206, received ${response.status}`);
  }
  if (response.bodyByteLength !== 1) {
    failures.push(`expected a one-byte body, received ${response.bodyByteLength ?? "no body"}`);
  }
  if (response.headers.get("content-range") !== `bytes 0-0/${asset.byteLength}`) {
    failures.push(
      `expected content-range bytes 0-0/${asset.byteLength}, received ${response.headers.get("content-range") ?? "no header"}`,
    );
  }
  if (response.headers.get("content-type") !== asset.contentType) {
    failures.push(
      `expected content-type ${asset.contentType}, received ${response.headers.get("content-type") ?? "no header"}`,
    );
  }
  if (response.headers.get("content-disposition") !== asset.contentDisposition) {
    failures.push(
      `expected content-disposition ${asset.contentDisposition}, received ${response.headers.get("content-disposition") ?? "no header"}`,
    );
  }
  if (response.headers.get("cache-control") !== asset.cacheControl) {
    failures.push(
      `expected cache-control ${asset.cacheControl}, received ${response.headers.get("cache-control") ?? "no header"}`,
    );
  }
  if (response.headers.get("etag") !== asset.etag) {
    failures.push(
      `expected etag ${asset.etag}, received ${response.headers.get("etag") ?? "no header"}`,
    );
  }

  const cacheStatus = response.headers.get("cf-cache-status");
  if (cacheStatus !== "MISS" && cacheStatus !== "BYPASS" && cacheStatus !== "DYNAMIC") {
    failures.push(
      `expected an origin-backed response, received cf-cache-status ${cacheStatus ?? "no header"}`,
    );
  }

  return failures;
}

async function checkPublicMediaAsset(assetName: string, asset: PublicMediaAsset) {
  const url = new URL(asset.publicUrl);
  url.searchParams.set("samebase-public-media-check", randomUUID());

  const response = await fetch(url, {
    headers: {
      "cache-control": "no-cache",
      range: "bytes=0-0",
    },
    signal: AbortSignal.timeout(15_000),
  });

  const bodyByteLength = response.status === 206 ? (await response.arrayBuffer()).byteLength : null;
  if (response.status !== 206 && response.body) {
    await response.body.cancel();
  }

  const failures = validatePublicMediaResponse(asset, {
    status: response.status,
    headers: response.headers,
    bodyByteLength,
  });
  if (failures.length > 0) {
    throw new Error(`${assetName}: ${failures.join("; ")}`);
  }

  console.log(`${assetName}: ${asset.publicUrl} is available`);
}

export async function checkPublicMedia() {
  await Promise.all(
    Object.entries(publicMediaManifest).map(([assetName, asset]) =>
      checkPublicMediaAsset(assetName, asset),
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkPublicMedia();
}
