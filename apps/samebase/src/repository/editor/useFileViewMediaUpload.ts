import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { api } from "../../../convex/_generated/api";
import { isRenderableRepositoryMediaPath } from "@samebase/git-editor/repositoryMedia";
import {
  readUploadStorageId,
  uploadMediaWithCleanup,
} from "@/repository/editor/mediaUploadWorkflow";
import {
  getDefaultUploadFolderPath,
  normalizeFolderPath,
  type PendingMediaUpload,
} from "./fileViewShared";
import { usePageLeaveGuard } from "@/lib/pageLeaveGuard";

type RepositoryId = NonNullable<
  (typeof api.repository.records.getRepositoryByRepository)["_returnType"]
>["repositoryId"];

type GenerateUploadUrl = (args: { repositoryId: RepositoryId }) => Promise<{
  uploadUrl: string;
}>;
type StageUploadedMedia = (args: {
  githubRepositoryFullName: string;
  repositoryId: RepositoryId;
  filePath: string;
  storageId: string;
  branch: string;
  replaceExisting: boolean;
}) => Promise<unknown>;
type DeletePendingUploadBlob = (args: {
  repositoryId: RepositoryId;
  storageId: string;
}) => Promise<unknown>;

export function useFileViewMediaUpload({
  branch,
  buildRepositoryFileUrl,
  deletePendingUploadBlob,
  generateUploadUrl,
  navigateByHref,
  githubRepositoryFullName,
  selectedFile,
  stageUploadedMedia,
  repositoryId,
}: {
  branch: string;
  buildRepositoryFileUrl: (path: string) => string;
  deletePendingUploadBlob: DeletePendingUploadBlob;
  generateUploadUrl: GenerateUploadUrl;
  navigateByHref: (href: string, options?: { replace?: boolean }) => void;
  githubRepositoryFullName: string;
  selectedFile: string;
  stageUploadedMedia: StageUploadedMedia;
  repositoryId: RepositoryId;
}) {
  const mediaUploadInputRef = useRef<HTMLInputElement>(null);
  const pendingMediaUploadFolderPathRef = useRef("");
  const [pendingMediaUpload, setPendingMediaUpload] = useState<PendingMediaUpload | null>(null);
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isMediaUploadDragOver, setIsMediaUploadDragOver] = useState(false);

  usePageLeaveGuard({
    enabled: pendingMediaUpload !== null || isUploadingMedia,
    reason: "Pending media upload",
  });

  const prepareMediaUpload = useCallback((file: File, preferredFolderPath: string) => {
    const looksLikeImage =
      file.type.startsWith("image/") || isRenderableRepositoryMediaPath(file.name);
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
  }, []);

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
    ({ replaceExisting, targetPath }: { replaceExisting: boolean; targetPath: string }) => {
      if (!pendingMediaUpload) {
        return;
      }

      setIsUploadingMedia(true);
      setMediaUploadError(null);

      void uploadMediaWithCleanup({
        requestUploadUrl: () => generateUploadUrl({ repositoryId }),
        uploadFile: async (uploadUrl) => {
          const response = await fetch(uploadUrl, {
            method: "POST",
            headers: {
              "Content-Type": pendingMediaUpload.file.type || "application/octet-stream",
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
            githubRepositoryFullName,
            repositoryId,
            filePath: targetPath,
            storageId,
            branch,
            replaceExisting,
          });
        },
        deleteUploadedMedia: async (storageId) => {
          await deletePendingUploadBlob({
            repositoryId,
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
          navigateByHref(buildRepositoryFileUrl(targetPath));
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
      buildRepositoryFileUrl,
      deletePendingUploadBlob,
      generateUploadUrl,
      navigateByHref,
      pendingMediaUpload,
      githubRepositoryFullName,
      stageUploadedMedia,
      repositoryId,
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
