import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SIMPLE_VIEW_CONFIG_PATH } from "@/repository/editor/simpleView";

type StagedSimpleViewConfigFile =
  | {
      content: string;
      fileDeleted: boolean;
    }
  | null
  | undefined;

export function useRepositorySimpleViewConfig(args: {
  branch: string;
  githubRepositoryFullName: string;
  stagedConfigFile: StagedSimpleViewConfigFile;
  treeSHA: string;
  repositoryId: string;
}) {
  const loadRepositoryFileContent = useAction(api.github.getRepositoryFileContent);
  const repositoryConfigQuery = useQuery({
    queryKey: [
      "repository-simple-view-config",
      args.repositoryId,
      args.githubRepositoryFullName,
      args.branch,
      SIMPLE_VIEW_CONFIG_PATH,
      args.treeSHA,
    ],
    queryFn: async () => {
      try {
        return await loadRepositoryFileContent({
          githubRepositoryFullName: args.githubRepositoryFullName,
          filePath: SIMPLE_VIEW_CONFIG_PATH,
          branch: args.branch,
        });
      } catch {
        return { exists: false as const };
      }
    },
    enabled: args.stagedConfigFile === null,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Infinity,
  });
  const repositoryConfigContent =
    args.stagedConfigFile === null && repositoryConfigQuery.data?.exists === true
      ? repositoryConfigQuery.data.content
      : null;
  const resolved =
    args.stagedConfigFile !== undefined &&
    (args.stagedConfigFile !== null ||
      repositoryConfigQuery.isSuccess ||
      repositoryConfigQuery.isError);

  return { content: repositoryConfigContent, resolved };
}
