type RepositoryConvexProjectAttachmentLookupRow = {
  githubRepositoryFullName: string;
  convexProjects: readonly {
    convexProjectId: string;
  }[];
};

export function findRepositoryConvexProjectAttachment<
  Repository extends RepositoryConvexProjectAttachmentLookupRow,
>(
  repositories: readonly Repository[],
  githubRepositoryFullName: string,
  convexProjectId: string,
): {
  repository: Repository;
  project: Repository["convexProjects"][number] | null;
} | null {
  const repository = repositories.find(
    (candidate) => candidate.githubRepositoryFullName === githubRepositoryFullName,
  );
  if (!repository) {
    return null;
  }

  return {
    repository,
    project:
      repository.convexProjects.find((project) => project.convexProjectId === convexProjectId) ??
      null,
  };
}
