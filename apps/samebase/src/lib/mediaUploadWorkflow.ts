export function readUploadStorageId(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "storageId" in value &&
    typeof value.storageId === "string" &&
    value.storageId.length > 0
  ) {
    return value.storageId;
  }

  throw new Error("Upload response did not include a storage id.");
}

export type MediaUploadCapability = {
  uploadUrl: string;
  leaseId: string;
  operationId: string;
  operationName: string;
};

export async function uploadMediaWithCleanup<Capability extends MediaUploadCapability>(args: {
  requestUploadUrl: () => Promise<Capability>;
  uploadFile: (uploadUrl: string) => Promise<string>;
  stageUploadedMedia: (args: { storageId: string; capability: Capability }) => Promise<void>;
  deleteUploadedMedia: (storageId: string) => Promise<void>;
  onCleanupError?: (error: unknown, storageId: string) => void;
}): Promise<void> {
  const capability = await args.requestUploadUrl();
  const storageId = await args.uploadFile(capability.uploadUrl);

  try {
    await args.stageUploadedMedia({ storageId, capability });
  } catch (error) {
    try {
      await args.deleteUploadedMedia(storageId);
    } catch (cleanupError) {
      args.onCleanupError?.(cleanupError, storageId);
    }

    throw error;
  }
}
