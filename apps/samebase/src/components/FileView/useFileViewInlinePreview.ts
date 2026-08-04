import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ProsemarkMergeEditorOptions } from "@/components/ProsemarkMergeEditor";
import { getReviewSplitDiffHighlights } from "@/lib/reviewSplitDiff";
import { usePageLeaveGuard } from "@/lib/pageLeaveGuard";
import { isStaleBaseVersionError } from "../../../shared/stagingErrors";
import {
  buildInlinePreviewAutosaveContextKey,
  type CommitReviewMode,
  DEFAULT_INLINE_PREVIEW_OPTIONS,
  DEFAULT_SHOW_INLINE_PREVIEW_PATCH,
  DEFAULT_SHOW_INLINE_PREVIEW_SIDE_BY_SIDE,
  type InlinePreviewSaveSnapshot,
  matchesInlinePreviewSaveSnapshot,
  type StagedFileRecord,
} from "./fileViewShared";

type UpdateStagedFileContent = (args: {
  stagingId: StagedFileRecord["_id"];
  content: string;
  expectedVersion: number;
}) => Promise<Pick<StagedFileRecord, "version">>;

export function useFileViewInlinePreview({
  commitReviewMode,
  selectedFile,
  selectedPreviewBaseContent,
  selectedPreviewRichNewContent,
  selectedPreviewStagedFile,
  updateStagedFileContent,
}: {
  commitReviewMode: CommitReviewMode;
  selectedFile: string;
  selectedPreviewBaseContent: string;
  selectedPreviewRichNewContent: string | undefined;
  selectedPreviewStagedFile: StagedFileRecord | null;
  updateStagedFileContent: UpdateStagedFileContent;
}) {
  const [inlinePreviewDraftStagingId, setInlinePreviewDraftStagingId] = useState<
    StagedFileRecord["_id"] | null
  >(null);
  const [inlinePreviewDraftContent, setInlinePreviewDraftContent] = useState("");
  const [inlinePreviewDraftBaseVersion, setInlinePreviewDraftBaseVersion] = useState(0);
  const [inlinePreviewHasPendingLocalEdit, setInlinePreviewHasPendingLocalEdit] = useState(false);
  const [inlinePreviewOptions, setInlinePreviewOptions] = useState<ProsemarkMergeEditorOptions>(
    DEFAULT_INLINE_PREVIEW_OPTIONS,
  );
  const [showInlinePreviewPatch, setShowInlinePreviewPatch] = useState(
    DEFAULT_SHOW_INLINE_PREVIEW_PATCH,
  );
  const [showInlinePreviewSideBySide, setShowInlinePreviewSideBySide] = useState(
    DEFAULT_SHOW_INLINE_PREVIEW_SIDE_BY_SIDE,
  );
  const [inlinePreviewSaveError, setInlinePreviewSaveError] = useState<string | null>(null);
  const [inlinePreviewInFlightSave, setInlinePreviewInFlightSave] =
    useState<InlinePreviewSaveSnapshot | null>(null);
  const [inlinePreviewFailedSave, setInlinePreviewFailedSave] =
    useState<InlinePreviewSaveSnapshot | null>(null);
  const inlinePreviewDraftContentRef = useRef("");
  const activePreviewStagingIdRef = useRef<StagedFileRecord["_id"] | null>(null);
  const flushPendingInlinePreviewSaveRef = useRef<(() => void) | null>(null);
  const inlinePreviewAutosaveContextKeyRef = useRef("");
  const inlinePreviewMountedRef = useRef(true);

  const activePreviewPersistedContent = selectedPreviewStagedFile
    ? selectedPreviewStagedFile.fileDeleted
      ? ""
      : selectedPreviewStagedFile.content
    : (selectedPreviewRichNewContent ?? "");
  const activePreviewPersistedVersion = selectedPreviewStagedFile?.version ?? 0;
  const activePreviewStagingId = selectedPreviewStagedFile?._id ?? null;
  const inlinePreviewEditable = Boolean(
    selectedPreviewStagedFile && !selectedPreviewStagedFile.fileDeleted,
  );
  const inlinePreviewEditorContent =
    inlinePreviewDraftStagingId === activePreviewStagingId
      ? inlinePreviewDraftContent
      : activePreviewPersistedContent;
  const inlinePreviewSplitDiffHighlights = useMemo(() => {
    if (!showInlinePreviewSideBySide) {
      return { oldLines: [], newLines: [] };
    }

    return getReviewSplitDiffHighlights(selectedPreviewBaseContent, inlinePreviewEditorContent);
  }, [inlinePreviewEditorContent, selectedPreviewBaseContent, showInlinePreviewSideBySide]);
  const inlinePreviewAutosaveContextKey = buildInlinePreviewAutosaveContextKey(
    commitReviewMode,
    activePreviewStagingId,
    inlinePreviewDraftStagingId,
  );
  const hasUnpersistedInlinePreviewEdit =
    inlinePreviewHasPendingLocalEdit ||
    inlinePreviewInFlightSave !== null ||
    inlinePreviewFailedSave !== null;

  inlinePreviewDraftContentRef.current = inlinePreviewDraftContent;
  activePreviewStagingIdRef.current = activePreviewStagingId;
  inlinePreviewAutosaveContextKeyRef.current = inlinePreviewAutosaveContextKey;

  usePageLeaveGuard({
    enabled:
      commitReviewMode === "review" &&
      inlinePreviewEditable &&
      activePreviewStagingId !== null &&
      hasUnpersistedInlinePreviewEdit,
    reason: "Pending inline review edits",
  });

  const persistInlinePreviewSave = useCallback(
    (
      nextSave: InlinePreviewSaveSnapshot,
      options?: {
        trackStartState?: boolean;
      },
    ) => {
      if (options?.trackStartState !== false) {
        setInlinePreviewInFlightSave(nextSave);
      }
      void updateStagedFileContent({
        stagingId: nextSave.stagingId,
        content: nextSave.content,
        expectedVersion: nextSave.baseVersion,
      })
        .then((updatedStaging) => {
          if (!inlinePreviewMountedRef.current) {
            return;
          }
          setInlinePreviewInFlightSave((current) =>
            matchesInlinePreviewSaveSnapshot(current, nextSave) ? null : current,
          );
          if (activePreviewStagingIdRef.current !== nextSave.stagingId) {
            return;
          }
          setInlinePreviewDraftBaseVersion(updatedStaging.version);
          setInlinePreviewFailedSave(null);
          setInlinePreviewSaveError(null);
          if (inlinePreviewDraftContentRef.current === nextSave.content) {
            setInlinePreviewHasPendingLocalEdit(false);
          }
        })
        .catch((error: unknown) => {
          if (!inlinePreviewMountedRef.current) {
            return;
          }
          setInlinePreviewInFlightSave((current) =>
            matchesInlinePreviewSaveSnapshot(current, nextSave) ? null : current,
          );
          if (activePreviewStagingIdRef.current !== nextSave.stagingId) {
            return;
          }
          const message = isStaleBaseVersionError(error)
            ? "Inline review is out of date. Reopen the file to continue editing."
            : error instanceof Error && error.message.length > 0
              ? error.message
              : "Failed to save inline review edits.";
          setInlinePreviewFailedSave(nextSave);
          setInlinePreviewSaveError(message);
        });
    },
    [updateStagedFileContent],
  );

  const flushPendingInlinePreviewSave = useCallback(() => {
    if (
      !activePreviewStagingId ||
      inlinePreviewDraftStagingId !== activePreviewStagingId ||
      !inlinePreviewEditable ||
      !inlinePreviewHasPendingLocalEdit
    ) {
      return;
    }

    if (
      activePreviewPersistedVersion >= inlinePreviewDraftBaseVersion &&
      inlinePreviewDraftContent === activePreviewPersistedContent
    ) {
      return;
    }

    if (inlinePreviewInFlightSave?.stagingId === activePreviewStagingId) {
      return;
    }

    const nextSave: InlinePreviewSaveSnapshot = {
      stagingId: activePreviewStagingId,
      content: inlinePreviewDraftContent,
      baseVersion: inlinePreviewDraftBaseVersion,
    };

    if (matchesInlinePreviewSaveSnapshot(inlinePreviewFailedSave, nextSave)) {
      return;
    }

    persistInlinePreviewSave(nextSave, { trackStartState: false });
  }, [
    activePreviewPersistedContent,
    activePreviewPersistedVersion,
    activePreviewStagingId,
    inlinePreviewDraftBaseVersion,
    inlinePreviewDraftContent,
    inlinePreviewDraftStagingId,
    inlinePreviewEditable,
    inlinePreviewFailedSave,
    inlinePreviewHasPendingLocalEdit,
    inlinePreviewInFlightSave,
    persistInlinePreviewSave,
  ]);

  useLayoutEffect(() => {
    flushPendingInlinePreviewSaveRef.current = flushPendingInlinePreviewSave;
  }, [flushPendingInlinePreviewSave]);

  // Flush the last inline edit before unmount so navigation does not drop it.
  useEffect(() => {
    return () => {
      flushPendingInlinePreviewSaveRef.current?.();
      inlinePreviewMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (inlinePreviewDraftStagingId !== activePreviewStagingId) {
      setInlinePreviewDraftStagingId(activePreviewStagingId);
      setInlinePreviewDraftContent(activePreviewPersistedContent);
      setInlinePreviewDraftBaseVersion(activePreviewPersistedVersion);
      setInlinePreviewHasPendingLocalEdit(false);
      setInlinePreviewInFlightSave(null);
      setInlinePreviewFailedSave(null);
      setInlinePreviewSaveError(null);
      return;
    }

    if (activePreviewPersistedVersion < inlinePreviewDraftBaseVersion) {
      return;
    }

    if (inlinePreviewHasPendingLocalEdit) {
      return;
    }

    setInlinePreviewDraftContent(activePreviewPersistedContent);
    setInlinePreviewDraftBaseVersion(activePreviewPersistedVersion);
    setInlinePreviewFailedSave(null);
    setInlinePreviewSaveError(null);
  }, [
    activePreviewPersistedContent,
    activePreviewPersistedVersion,
    activePreviewStagingId,
    inlinePreviewDraftBaseVersion,
    inlinePreviewHasPendingLocalEdit,
    inlinePreviewDraftStagingId,
  ]);

  useEffect(() => {
    setShowInlinePreviewPatch(false);
    setShowInlinePreviewSideBySide(false);
  }, [selectedFile]);

  useEffect(() => {
    if (
      commitReviewMode !== "review" ||
      !inlinePreviewEditable ||
      !activePreviewStagingId ||
      inlinePreviewDraftStagingId !== activePreviewStagingId ||
      !inlinePreviewHasPendingLocalEdit
    ) {
      return;
    }

    if (
      activePreviewPersistedVersion >= inlinePreviewDraftBaseVersion &&
      inlinePreviewDraftContent === activePreviewPersistedContent
    ) {
      setInlinePreviewDraftBaseVersion(activePreviewPersistedVersion);
      setInlinePreviewHasPendingLocalEdit(false);
      setInlinePreviewFailedSave(null);
      setInlinePreviewSaveError(null);
      return;
    }

    if (inlinePreviewInFlightSave?.stagingId === activePreviewStagingId) {
      return;
    }

    const nextSave: InlinePreviewSaveSnapshot = {
      stagingId: activePreviewStagingId,
      content: inlinePreviewDraftContent,
      baseVersion: inlinePreviewDraftBaseVersion,
    };

    if (matchesInlinePreviewSaveSnapshot(inlinePreviewFailedSave, nextSave)) {
      return;
    }

    let didStartSave = false;
    const timeoutId = window.setTimeout(() => {
      didStartSave = true;
      persistInlinePreviewSave(nextSave);
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      if (
        didStartSave ||
        inlinePreviewAutosaveContextKeyRef.current === inlinePreviewAutosaveContextKey
      ) {
        return;
      }
      persistInlinePreviewSave(nextSave, { trackStartState: false });
    };
  }, [
    activePreviewPersistedContent,
    activePreviewPersistedVersion,
    activePreviewStagingId,
    commitReviewMode,
    inlinePreviewAutosaveContextKey,
    inlinePreviewDraftBaseVersion,
    inlinePreviewDraftContent,
    inlinePreviewDraftStagingId,
    inlinePreviewEditable,
    inlinePreviewFailedSave,
    inlinePreviewHasPendingLocalEdit,
    inlinePreviewInFlightSave,
    persistInlinePreviewSave,
  ]);

  const handleInlinePreviewChange = useCallback((nextContent: string) => {
    setInlinePreviewDraftContent(nextContent);
    setInlinePreviewHasPendingLocalEdit(true);
    setInlinePreviewFailedSave(null);
    setInlinePreviewSaveError(null);
  }, []);

  const clearInlinePreviewSaveError = useCallback(() => {
    setInlinePreviewFailedSave(null);
    setInlinePreviewSaveError(null);
  }, []);

  return {
    activePreviewStagingId,
    clearInlinePreviewSaveError,
    handleInlinePreviewChange,
    inlinePreviewEditorContent,
    inlinePreviewEditable,
    inlinePreviewOptions,
    inlinePreviewSaveError,
    inlinePreviewSplitDiffHighlights,
    setInlinePreviewOptions,
    setShowInlinePreviewPatch,
    setShowInlinePreviewSideBySide,
    showInlinePreviewPatch,
    showInlinePreviewSideBySide,
  };
}
