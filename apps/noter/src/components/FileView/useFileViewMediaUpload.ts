import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { isRenderableRepositoryMediaPath } from "../../../shared/repositoryMedia";
import {
  readUploadStorageId,
  uploadMediaWithCleanup,
} from "#src/lib/mediaUploadWorkflow.ts";
import {
  getDefaultUploadFolderPath,
  normalizeFolderPath,
  type PendingMediaUpload,
} from "./fileViewShared";
import { usePageLeaveGuard } from "#src/lib/pageLeaveGuard.ts";

type VaultId = NonNullable<
  (typeof api.vault.records.getVaultByRepository)["_returnType"]
>["_id"];
type StorageId = Id<"_storage">;

type GenerateUploadUrl = (args: { vaultId: VaultId }) => Promise<string>;
type StageUploadedMedia = (args: {
  repositoryFullName: string;
  filePath: string;
  storageId: StorageId;
  branch: string;
  replaceExisting: boolean;
}) => Promise<unknown>;
type DeletePendingUploadBlob = (args: {
  vaultId: VaultId;
  storageId: StorageId;
}) => Promise<unknown>;

export function useFileViewMediaUpload({
  branch,
  buildVaultFileUrl,
  deletePendingUploadBlob,
  generateUploadUrl,
  navigateByHref,
  repositoryFullName,
  selectedFile,
  stageUploadedMedia,
  vaultId,
}: {
  branch: string;
  buildVaultFileUrl: (path: string) => string;
  deletePendingUploadBlob: DeletePendingUploadBlob;
  generateUploadUrl: GenerateUploadUrl;
  navigateByHref: (href: string, options?: { replace?: boolean }) => void;
  repositoryFullName: string;
  selectedFile: string;
  stageUploadedMedia: StageUploadedMedia;
  vaultId: VaultId;
}) {
  const mediaUploadInputRef = useRef<HTMLInputElement>(null);
  const pendingMediaUploadFolderPathRef = useRef("");
  const [pendingMediaUpload, setPendingMediaUpload] =
    useState<PendingMediaUpload | null>(null);
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isMediaUploadDragOver, setIsMediaUploadDragOver] = useState(false);

  usePageLeaveGuard({
    enabled: pendingMediaUpload !== null || isUploadingMedia,
    reason: "Pending media upload",
  });

  const prepareMediaUpload = useCallback(
    (file: File, preferredFolderPath: string) => {
      const looksLikeImage =
        file.type.startsWith("image/") ||
        isRenderableRepositoryMediaPath(file.name);
      if (!looksLikeImage) {
        // Clear any older staged file so a failed validation cannot submit
        // stale media from a previous selection.
        setPendingMediaUpload(null);
        setMediaUploadError("Only image uploads are supported right now.");
        return;
      }

      setMediaUploadError(null);
      setPendingMediaUpload({
        file,
        preferredFolderPath: normalizeFolderPath(preferredFolderPath),
      });
    },
    [],
  );

  const handleRequestMediaUpload = useCallback(
    (preferredFolderPath?: string) => {
      pendingMediaUploadFolderPathRef.current =
        preferredFolderPath ?? getDefaultUploadFolderPath(selectedFile);
      mediaUploadInputRef.current?.click();
    },
    [selectedFile],
  );

  const handleMediaUploadInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }

      prepareMediaUpload(file, pendingMediaUploadFolderPathRef.current);
    },
    [prepareMediaUpload],
  );

  const handleMediaUploadSubmit = useCallback(
    ({
      replaceExisting,
      targetPath,
    }: {
      replaceExisting: boolean;
      targetPath: string;
    }) => {
      if (!pendingMediaUpload) {
        return;
      }

      setIsUploadingMedia(true);
      setMediaUploadError(null);

      void uploadMediaWithCleanup({
        requestUploadUrl: () => generateUploadUrl({ vaultId }),
        uploadFile: async (uploadUrl) => {
          const response = await fetch(uploadUrl, {
            method: "POST",
            headers: {
              "Content-Type":
                pendingMediaUpload.file.type || "application/octet-stream",
            },
            body: pendingMediaUpload.file,
          });
          if (!response.ok) {
            throw new Error("Failed to upload image.");
          }
          return readUploadStorageId(await response.json());
        },
        stageUploadedMedia: async (storageId) => {
          await stageUploadedMedia({
            repositoryFullName,
            filePath: targetPath,
            // Convex returns upload ids as opaque strings over HTTP even though
            // the generated client types brand storage ids locally.
            // @ts-expect-error Upload responses cannot preserve the `_storage` brand across fetch JSON.
            storageId,
            branch,
            replaceExisting,
          });
        },
        deleteUploadedMedia: async (storageId) => {
          await deletePendingUploadBlob({
            vaultId,
            // Upload responses cannot preserve the storage id brand.
            // @ts-expect-error Upload responses are plain strings from fetch JSON.
            storageId,
          });
        },
        onCleanupError: (cleanupError, storageId) => {
          console.warn("Failed to clean up uploaded media blob", {
            storageId,
            cleanupError,
          });
        },
      })
        .then(() => {
          setPendingMediaUpload(null);
          navigateByHref(buildVaultFileUrl(targetPath));
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error && error.message.length > 0
              ? error.message
              : "Failed to upload image.";
          setMediaUploadError(message);
        })
        .finally(() => {
          setIsUploadingMedia(false);
        });
    },
    [
      branch,
      buildVaultFileUrl,
      deletePendingUploadBlob,
      generateUploadUrl,
      navigateByHref,
      pendingMediaUpload,
      repositoryFullName,
      stageUploadedMedia,
      vaultId,
    ],
  );

  const handleMediaUploadDrop = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setIsMediaUploadDragOver(false);

      const fileList = event.dataTransfer.files;
      if (fileList.length === 0) {
        return;
      }

      const file = fileList[0];
      prepareMediaUpload(file, getDefaultUploadFolderPath(selectedFile));
    },
    [prepareMediaUpload, selectedFile],
  );

  const handleCloseMediaUploadDialog = useCallback(() => {
    if (isUploadingMedia) {
      return;
    }
    setPendingMediaUpload(null);
    setMediaUploadError(null);
  }, [isUploadingMedia]);

  return {
    handleCloseMediaUploadDialog,
    handleMediaUploadDrop,
    handleMediaUploadInputChange,
    handleMediaUploadSubmit,
    handleRequestMediaUpload,
    isMediaUploadDragOver,
    isUploadingMedia,
    mediaUploadError,
    mediaUploadInputRef,
    pendingMediaUpload,
    setIsMediaUploadDragOver,
  };
}
