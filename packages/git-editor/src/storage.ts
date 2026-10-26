import type { GenericActionCtx, GenericDataModel } from "convex/server";
import type { ComponentApi } from "./component/_generated/component.js";

type StorageContext = Pick<GenericActionCtx<GenericDataModel>, "runQuery" | "runMutation">;

/** Browser uploads and fetched Git blobs use the same component upload endpoint. */
export async function uploadBlob(
  ctx: StorageContext,
  component: Pick<ComponentApi, "storage">,
  blob: Blob,
) {
  const uploadUrl = await ctx.runMutation(component.storage.generateUploadUrl, {});
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!response.ok) throw new Error(`File upload failed (${response.status}).`);
  const result: unknown = await response.json();
  if (
    typeof result !== "object" ||
    result === null ||
    !("storageId" in result) ||
    typeof result.storageId !== "string" ||
    result.storageId.length === 0
  ) {
    throw new Error("Upload response did not include a storage id.");
  }
  return result.storageId;
}

export async function loadBlob(
  ctx: StorageContext,
  component: Pick<ComponentApi, "storage">,
  storageId: string,
): Promise<Blob | null> {
  const url = await ctx.runQuery(component.storage.getUrl, { storageId });
  if (!url) return null;
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`File download failed (${response.status}).`);
  return await response.blob();
}
