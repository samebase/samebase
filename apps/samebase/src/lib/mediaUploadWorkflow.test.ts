import { describe, expect, it, vi } from "vite-plus/test";

import { readUploadStorageId, uploadMediaWithCleanup } from "@/lib/mediaUploadWorkflow";

describe("readUploadStorageId", () => {
  it("reads the storage id from a valid upload response", () => {
    expect(readUploadStorageId({ storageId: "storage-123" })).toBe("storage-123");
  });

  it("throws when the upload response is missing the storage id", () => {
    expect(() => readUploadStorageId({})).toThrow("Upload response did not include a storage id.");
  });
});

describe("uploadMediaWithCleanup", () => {
  it("stages the uploaded media when upload succeeds", async () => {
    const capability = {
      uploadUrl: "https://upload.example.test",
      leaseId: "lease-123",
      operationId: "operation-123",
      operationName: "stage_uploaded_media:vault-123",
    };
    const requestUploadUrl = vi.fn(async () => capability);
    const uploadFile = vi.fn(async () => "storage-123");
    const stageUploadedMedia = vi.fn(async () => {});
    const deleteUploadedMedia = vi.fn(async () => {});

    await uploadMediaWithCleanup({
      requestUploadUrl,
      uploadFile,
      stageUploadedMedia,
      deleteUploadedMedia,
    });

    expect(requestUploadUrl).toHaveBeenCalledOnce();
    expect(uploadFile).toHaveBeenCalledWith("https://upload.example.test");
    expect(stageUploadedMedia).toHaveBeenCalledWith({ storageId: "storage-123", capability });
    expect(deleteUploadedMedia).not.toHaveBeenCalled();
  });

  it("cleans up the uploaded blob when staging fails", async () => {
    const stageError = new Error("Staging failed");
    const deleteUploadedMedia = vi.fn(async () => {});

    await expect(
      uploadMediaWithCleanup({
        requestUploadUrl: async () => ({
          uploadUrl: "https://upload.example.test",
          leaseId: "lease-123",
          operationId: "operation-123",
          operationName: "stage_uploaded_media:vault-123",
        }),
        uploadFile: async () => "storage-123",
        stageUploadedMedia: async () => {
          throw stageError;
        },
        deleteUploadedMedia,
      }),
    ).rejects.toThrow(stageError);

    expect(deleteUploadedMedia).toHaveBeenCalledWith("storage-123");
  });

  it("does not attempt cleanup when upload fails before a storage id exists", async () => {
    const uploadError = new Error("Upload failed");
    const deleteUploadedMedia = vi.fn(async () => {});

    await expect(
      uploadMediaWithCleanup({
        requestUploadUrl: async () => ({
          uploadUrl: "https://upload.example.test",
          leaseId: "lease-123",
          operationId: "operation-123",
          operationName: "stage_uploaded_media:vault-123",
        }),
        uploadFile: async () => {
          throw uploadError;
        },
        stageUploadedMedia: async () => {},
        deleteUploadedMedia,
      }),
    ).rejects.toThrow(uploadError);

    expect(deleteUploadedMedia).not.toHaveBeenCalled();
  });

  it("preserves the original staging error when cleanup also fails", async () => {
    const stageError = new Error("Staging failed");
    const cleanupError = new Error("Cleanup failed");
    const onCleanupError = vi.fn();

    await expect(
      uploadMediaWithCleanup({
        requestUploadUrl: async () => ({
          uploadUrl: "https://upload.example.test",
          leaseId: "lease-123",
          operationId: "operation-123",
          operationName: "stage_uploaded_media:vault-123",
        }),
        uploadFile: async () => "storage-123",
        stageUploadedMedia: async () => {
          throw stageError;
        },
        deleteUploadedMedia: async () => {
          throw cleanupError;
        },
        onCleanupError,
      }),
    ).rejects.toThrow(stageError);

    expect(onCleanupError).toHaveBeenCalledWith(cleanupError, "storage-123");
  });
});
