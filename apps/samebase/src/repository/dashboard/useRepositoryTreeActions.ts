import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

/**
The folder and organization mutations of the repository tree, shared by the `/repo` picker and the
left pane of a repository page.
*/
export function useRepositoryTreeActions() {
  const onCreateRepositoryFolder = useMutation(api.repository.folders.createRepositoryFolder);
  const onDeleteRepositoryFolder = useMutation(api.repository.folders.deleteRepositoryFolder);
  const onMoveRepositoryFolder = useMutation(api.repository.folders.moveRepositoryFolder);
  const onMoveRepositoryToFolder = useMutation(api.repository.folders.moveRepositoryToFolder);
  const onRenameRepositoryFolder = useMutation(api.repository.folders.renameRepositoryFolder);
  const onSetRepositoryFolderCollapsed = useMutation(
    api.repository.folders.setRepositoryFolderCollapsed,
  );
  const onSetRepositoryOrganizationCollapsed = useMutation(
    api.repository.organizationTree.setRepositoryOrganizationCollapsed,
  ).withOptimisticUpdate((localStore, args) => {
    const currentSettings = localStore.getQuery(
      api.repository.organizationTree.getRepositoryOrganizationTreeSettings,
      {},
    );
    if (!currentSettings) {
      return;
    }

    const nextSettings = currentSettings
      .filter((setting) => setting.organizationId !== args.organizationId)
      .concat({ collapsed: args.collapsed, organizationId: args.organizationId })
      .sort((left, right) => left.organizationId.localeCompare(right.organizationId));
    localStore.setQuery(
      api.repository.organizationTree.getRepositoryOrganizationTreeSettings,
      {},
      nextSettings,
    );
  });

  return {
    onCreateRepositoryFolder,
    onDeleteRepositoryFolder,
    onMoveRepositoryFolder,
    onMoveRepositoryToFolder,
    onRenameRepositoryFolder,
    onSetRepositoryFolderCollapsed,
    onSetRepositoryOrganizationCollapsed,
  };
}
