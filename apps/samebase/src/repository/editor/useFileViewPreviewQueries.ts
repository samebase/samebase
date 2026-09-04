import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { getBranchComparePreviewReloadMode } from "@/repository/editor/fileViewCompare";
import {
  BRANCH_COMPARE_PREVIEW_STAGING_DEBOUNCE_MS,
  parseUpstreamConflictPaths,
} from "./fileViewShared";

function getActionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

export function useCommitPreviewQuery(args: {
  branch: string;
  enabled: boolean;
  onSuccess: () => void;
  onUpstreamConflict: (message: string) => void;
  refreshKey: string;
  githubRepositoryFullName: string;
  repositoryId: string;
}) {
  const getCommitPreview = useAction(api.fileStagingActions.getCommitPreview);
  const onSuccessRef = useRef(args.onSuccess);
  const onUpstreamConflictRef = useRef(args.onUpstreamConflict);
  const handledSuccessRef = useRef<{ identity: string; value: unknown } | null>(null);
  const handledErrorRef = useRef<{ identity: string; value: unknown } | null>(null);
  onSuccessRef.current = args.onSuccess;
  onUpstreamConflictRef.current = args.onUpstreamConflict;
  const queryIdentity = JSON.stringify([
    args.repositoryId,
    args.githubRepositoryFullName,
    args.branch,
    args.enabled,
    args.refreshKey,
  ]);

  const query = useQuery({
    queryKey: [
      "commit-preview",
      args.repositoryId,
      args.githubRepositoryFullName,
      args.branch,
      args.enabled,
      args.refreshKey,
    ] as const,
    queryFn: () =>
      getCommitPreview({
        githubRepositoryFullName: args.githubRepositoryFullName,
        branch: args.branch,
        includePatch: true,
      }),
    enabled: args.enabled,
    gcTime: 0,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 0,
  });

  const errorMessage = query.isError
    ? getActionErrorMessage(query.error, "Failed to load commit preview")
    : null;
  const hasUpstreamConflict = parseUpstreamConflictPaths(errorMessage).length > 0;

  useEffect(() => {
    if (query.data === undefined) {
      return;
    }
    const handled = handledSuccessRef.current;
    if (handled?.identity === queryIdentity && handled.value === query.data) {
      return;
    }

    handledSuccessRef.current = { identity: queryIdentity, value: query.data };
    onSuccessRef.current();
  }, [query.data, queryIdentity]);

  useEffect(() => {
    if (!hasUpstreamConflict || errorMessage === null) {
      return;
    }
    const handled = handledErrorRef.current;
    if (handled?.identity === queryIdentity && handled.value === query.error) {
      return;
    }

    handledErrorRef.current = { identity: queryIdentity, value: query.error };
    onUpstreamConflictRef.current(errorMessage);
  }, [errorMessage, hasUpstreamConflict, query.error, queryIdentity]);

  return {
    error: args.enabled && !hasUpstreamConflict ? errorMessage : null,
    isFetching: args.enabled && query.isFetching,
    preview: args.enabled && !hasUpstreamConflict ? (query.data ?? null) : null,
    refetch: query.refetch,
  };
}

function useBranchCompareRequestStagingKey(args: {
  enabled: boolean;
  stagingKey: string;
  targetKey: string;
}) {
  const [requestIdentity, setRequestIdentity] = useState(() => ({
    enabled: args.enabled,
    stagingKey: args.stagingKey,
    targetKey: args.targetKey,
  }));

  useEffect(() => {
    if (!args.enabled) {
      setRequestIdentity((current) => {
        if (
          !current.enabled &&
          current.stagingKey === args.stagingKey &&
          current.targetKey === args.targetKey
        ) {
          return current;
        }

        return {
          enabled: false,
          stagingKey: args.stagingKey,
          targetKey: args.targetKey,
        };
      });
      return;
    }

    if (!requestIdentity.enabled) {
      setRequestIdentity({
        enabled: true,
        stagingKey: args.stagingKey,
        targetKey: args.targetKey,
      });
      return;
    }

    const reloadMode = getBranchComparePreviewReloadMode({
      previousTargetKey: requestIdentity.targetKey,
      previousStagingKey: requestIdentity.stagingKey,
      nextTargetKey: args.targetKey,
      nextStagingKey: args.stagingKey,
    });
    if (reloadMode === "none") {
      return;
    }
    if (reloadMode === "immediate") {
      setRequestIdentity({
        enabled: true,
        stagingKey: args.stagingKey,
        targetKey: args.targetKey,
      });
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRequestIdentity({
        enabled: true,
        stagingKey: args.stagingKey,
        targetKey: args.targetKey,
      });
    }, BRANCH_COMPARE_PREVIEW_STAGING_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    args.enabled,
    args.stagingKey,
    args.targetKey,
    requestIdentity.enabled,
    requestIdentity.stagingKey,
    requestIdentity.targetKey,
  ]);

  if (args.enabled && requestIdentity.enabled && requestIdentity.targetKey === args.targetKey) {
    return requestIdentity.stagingKey;
  }

  return args.stagingKey;
}

export function useBranchComparePreviewQuery(args: {
  branch: string;
  enabled: boolean;
  githubRepositoryFullName: string;
  stagingRefreshKey: string;
  targetRefreshKey: string;
  repositoryId: string;
}) {
  const getBranchComparePreview = useAction(api.fileStagingActions.getBranchComparePreview);
  const requestStagingKey = useBranchCompareRequestStagingKey({
    enabled: args.enabled,
    stagingKey: args.stagingRefreshKey,
    targetKey: args.targetRefreshKey,
  });
  const query = useQuery({
    queryKey: [
      "branch-compare-preview",
      args.repositoryId,
      args.githubRepositoryFullName,
      args.branch,
      args.enabled,
      args.targetRefreshKey,
      requestStagingKey,
    ] as const,
    queryFn: () =>
      getBranchComparePreview({
        githubRepositoryFullName: args.githubRepositoryFullName,
        branch: args.branch,
        includePatch: true,
      }),
    enabled: args.enabled,
    gcTime: 0,
    placeholderData: (previousData, previousQuery) => {
      const previousKey = previousQuery?.queryKey;
      if (
        previousKey?.[0] === "branch-compare-preview" &&
        previousKey[1] === args.repositoryId &&
        previousKey[2] === args.githubRepositoryFullName &&
        previousKey[3] === args.branch &&
        previousKey[4] === true &&
        previousKey[5] === args.targetRefreshKey
      ) {
        return previousData;
      }

      return undefined;
    },
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 0,
  });
  const error = query.isError
    ? getActionErrorMessage(query.error, "Failed to load branch comparison")
    : null;

  return {
    error: args.enabled ? error : null,
    isLoading: args.enabled && query.isPending && query.fetchStatus === "fetching",
    preview: args.enabled && !query.isError ? (query.data ?? null) : null,
  };
}
