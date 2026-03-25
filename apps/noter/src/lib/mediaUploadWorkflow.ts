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

export async function uploadMediaWithCleanup(args: {
  requestUploadUrl: () => Promise<string>;
  uploadFile: (uploadUrl: string) => Promise<string>;
  stageUploadedMedia: (storageId: string) => Promise<void>;
  deleteUploadedMedia: (storageId: string) => Promise<void>;
  onCleanupError?: (error: unknown, storageId: string) => void;
}): Promise<void> {
  const uploadUrl = await args.requestUploadUrl();
  const storageId = await args.uploadFile(uploadUrl);

  try {
    await args.stageUploadedMedia(storageId);
  } catch (error) {
    try {
      await args.deleteUploadedMedia(storageId);
    } catch (cleanupError) {
      args.onCleanupError?.(cleanupError, storageId);
    }

    throw error;
  }
}
