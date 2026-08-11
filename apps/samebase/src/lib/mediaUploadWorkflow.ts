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

export type PendingMediaUploadTarget = {
  uploadId: string;
  uploadUrl: string;
};

export async function uploadMediaWithCleanup(args: {
  requestUploadUrl: () => Promise<PendingMediaUploadTarget>;
  uploadFile: (target: PendingMediaUploadTarget) => Promise<string>;
  stageUploadedMedia: (storageId: string, uploadId: string) => Promise<void>;
  deleteUploadedMedia: (storageId: string, uploadId: string) => Promise<void>;
  onCleanupError?: (error: unknown, storageId: string) => void;
}): Promise<void> {
  const target = await args.requestUploadUrl();
  const storageId = await args.uploadFile(target);

  try {
    await args.stageUploadedMedia(storageId, target.uploadId);
  } catch (error) {
    try {
      await args.deleteUploadedMedia(storageId, target.uploadId);
    } catch (cleanupError) {
      args.onCleanupError?.(cleanupError, storageId);
    }

    throw error;
  }
}
