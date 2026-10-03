import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { Loader2 } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import {
  buildAvailableAppResourceNameSuggestion,
  buildDefaultAppResourceName,
  formatAppResourceNameConflictMessage,
  validateAppResourceName,
} from "../../../shared/appResourceNames";
import {
  getConvexCodeLocationKey,
  getConvexCodeLocationPath,
  type ConvexCodeLocation,
} from "../../../shared/convexCodeLocation";
import { AppDialogContent } from "@/components/AppDialogContent";
import {
  AppResourceNameFeedback,
  AppResourceNameNotice,
} from "@/repository/setup/AppResourceNameFeedback";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RepositoryProviderDiscoveryLoadingState } from "./RepositoryProviderDiscoveryLoadingState";
import { ConvexDeploymentRegionField } from "@/repository/setup/ConvexDeploymentRegionField";
import { useConvexDeploymentRegion } from "@/repository/setup/useConvexDeploymentRegions";
import {
  formatConvexDeploymentRegionLabel,
  type ConvexDeploymentRegion,
} from "../../../shared/convexDeploymentRegions";

type ConvexProjectOption =
  (typeof api.repository.convex.findProjects)["_returnType"]["projects"][number];
type ConvexCodeLocationOption =
  (typeof api.repository.convex.findProjects)["_returnType"]["source"]["locations"][number];
type ConvexSourceCompleteness =
  (typeof api.repository.convex.findProjects)["_returnType"]["source"]["completeness"];
type ConvexProjectConnectMode = "existing" | "create";

function compareConvexProjectOption(left: ConvexProjectOption, right: ConvexProjectOption): number {
  return (
    Number(right.workerReferences.length > 0) - Number(left.workerReferences.length > 0) ||
    left.projectName.localeCompare(right.projectName) ||
    left.projectSlug.localeCompare(right.projectSlug) ||
    left.projectId.localeCompare(right.projectId)
  );
}

function readConvexCodeLocationOption(option: ConvexCodeLocationOption): ConvexCodeLocation {
  switch (option.kind) {
    case "config":
      return { kind: "config", convexConfigPath: option.convexConfigPath };
    case "directory":
      return { kind: "directory", convexDirectoryPath: option.convexDirectoryPath };
    default:
      option satisfies never;
      throw new Error("Unsupported Convex code location.");
  }
}

function getConvexCodeLocationOptionKey(option: ConvexCodeLocationOption): string {
  return getConvexCodeLocationKey(readConvexCodeLocationOption(option));
}

function getConvexCodeLocationOptionLabel(option: ConvexCodeLocationOption): string {
  const path = getConvexCodeLocationPath(readConvexCodeLocationOption(option));
  return option.kind === "directory" ? `${path} (default layout)` : path;
}

function getConvexCodeLocationSelection(option: ConvexCodeLocationOption) {
  switch (option.kind) {
    case "config":
      return {
        kind: "config" as const,
        convexConfigPath: option.convexConfigPath,
        blobSha: option.blobSha,
      };
    case "directory":
      return {
        kind: "directory" as const,
        convexDirectoryPath: option.convexDirectoryPath,
        convexDirectoryTreeSha: option.convexDirectoryTreeSha,
        packageJsonBlobSha: option.packageJsonBlobSha,
      };
    default:
      option satisfies never;
      throw new Error("Unsupported Convex code location.");
  }
}

export function RepositoryConvexDialogContent({
  blockedReason,
  codeLocations,
  createCodeLocationKey,
  createDeploymentRegion,
  convexDeploymentRegionField,
  createProjectNameConflict,
  createProjectName,
  projects,
  error,
  isLoading,
  isSubmitting,
  mode,
  onCreateCodeLocationKeyChange,
  onCreateProjectNameChange,
  onModeChange,
  onOpenChange,
  onProjectCodeLocationKeyChange,
  onProjectToggle,
  onSubmit,
  repairProject,
  selectedProjectCodeLocationKeys,
  sourceCompleteness,
  repository,
}: {
  blockedReason?: string | null;
  codeLocations: readonly ConvexCodeLocationOption[];
  createCodeLocationKey: string;
  createDeploymentRegion: ConvexDeploymentRegion | null;
  convexDeploymentRegionField: ReactNode;
  createProjectNameConflict: { message: string; suggestion: string | null } | null;
  createProjectName: string;
  projects: readonly ConvexProjectOption[];
  error: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  mode: ConvexProjectConnectMode;
  onCreateCodeLocationKeyChange: (codeLocationKey: string) => void;
  onCreateProjectNameChange: (projectName: string) => void;
  onModeChange: (mode: ConvexProjectConnectMode) => void;
  onOpenChange: (isOpen: boolean) => void;
  onProjectCodeLocationKeyChange: (projectId: string, codeLocationKey: string) => void;
  onProjectToggle: (projectId: string) => void;
  onSubmit: () => void;
  repairProject: { codeLocation: ConvexCodeLocation; projectId: string } | null;
  selectedProjectCodeLocationKeys: Readonly<Record<string, string | undefined>>;
  sourceCompleteness: ConvexSourceCompleteness | null;
  repository: Pick<UserRepositoryResult, "githubRepositoryFullName">;
}) {
  const codeLocationOptions = codeLocations.map((location) => ({
    key: getConvexCodeLocationOptionKey(location),
    label: getConvexCodeLocationOptionLabel(location),
  }));
  const sortedProjects = [...projects].sort(compareConvexProjectOption);
  const selectedProjectCount = Object.keys(selectedProjectCodeLocationKeys).length;
  const createProjectNameValidation = validateAppResourceName(createProjectName, "convex");
  const createProjectNameError = createProjectNameValidation.valid
    ? createProjectNameConflict
    : createProjectNameValidation;
  const createProjectNameNotice =
    createProjectNameValidation.valid &&
    createProjectNameValidation.changed &&
    !createProjectNameConflict
      ? createProjectNameValidation.value
      : null;
  const submitDisabled =
    Boolean(blockedReason) ||
    isLoading ||
    isSubmitting ||
    codeLocationOptions.length === 0 ||
    (repairProject
      ? !createCodeLocationKey
      : mode === "existing"
        ? selectedProjectCount === 0 ||
          Object.values(selectedProjectCodeLocationKeys).some((key) => !key)
        : !createProjectNameValidation.valid ||
          Boolean(createProjectNameConflict) ||
          !createDeploymentRegion ||
          !createCodeLocationKey);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>
            {repairProject
              ? `Change ${repairProject.projectId} code location`
              : `Add Convex to ${repository.githubRepositoryFullName}`}
          </DialogTitle>
          <DialogDescription>
            {repairProject
              ? `Choose the code location for this project. Current location: ${getConvexCodeLocationPath(repairProject.codeLocation)}.`
              : mode === "existing"
                ? "Choose one or more projects and the code location for each."
                : "Choose a project name and its code location."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isLoading ? (
            <RepositoryProviderDiscoveryLoadingState label="Searching for Convex code and projects" />
          ) : (
            <>
              {!repairProject ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={mode === "existing" ? "default" : "outline"}
                    onClick={() => onModeChange("existing")}
                    disabled={isSubmitting}
                  >
                    Existing
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "create" ? "default" : "outline"}
                    onClick={() => onModeChange("create")}
                    disabled={isSubmitting}
                  >
                    Create
                  </Button>
                </div>
              ) : null}
              {sourceCompleteness === "partial" ? (
                <div className="text-sm text-muted-foreground">
                  The repository could not be fully scanned. Verified locations found so far are
                  shown.
                </div>
              ) : null}
              {codeLocationOptions.length === 0 ? (
                sourceCompleteness === "complete" ? (
                  <div className="text-sm text-muted-foreground">
                    No convex.json or package.json with a sibling convex/ directory was found on the
                    default branch.
                  </div>
                ) : null
              ) : repairProject ? (
                <Select
                  modal={false}
                  value={createCodeLocationKey}
                  onValueChange={onCreateCodeLocationKeyChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger aria-label="New Convex code location" className="w-full">
                    <SelectValue placeholder="Convex code location" />
                  </SelectTrigger>
                  <AppSelectContent>
                    {codeLocationOptions.map((location) => (
                      <AppSelectItem key={location.key} value={location.key}>
                        <span className="font-mono">{location.label}</span>
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </Select>
              ) : mode === "existing" ? (
                sortedProjects.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No unattached Convex projects are available.
                  </div>
                ) : (
                  <div className="grid max-h-80 gap-3 overflow-y-auto">
                    {sortedProjects.map((project) => {
                      const selectedCodeLocationKey =
                        selectedProjectCodeLocationKeys[project.projectId];
                      const selected = selectedCodeLocationKey !== undefined;
                      return (
                        <div
                          key={project.projectId}
                          className="grid gap-2 border-b pb-3 last:border-b-0"
                        >
                          <label className="flex min-w-0 items-start gap-2">
                            <Checkbox
                              checked={selected}
                              disabled={isSubmitting}
                              onCheckedChange={() => onProjectToggle(project.projectId)}
                            />
                            <span className="grid min-w-0 gap-0.5">
                              <span className="truncate text-sm">{project.projectName}</span>
                              <span className="truncate text-xs text-muted-foreground">
                                {project.teamSlug}/{project.projectSlug}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {project.productionDeployment.state === "available"
                                  ? `Production: ${formatConvexDeploymentRegionLabel(project.productionDeployment.region)}`
                                  : "No production deployment"}
                              </span>
                              {project.workerReferences.length > 0 ? (
                                <span className="truncate text-xs text-muted-foreground">
                                  Used by{" "}
                                  {project.workerReferences
                                    .map((worker) => worker.workerName)
                                    .join(", ")}
                                </span>
                              ) : null}
                            </span>
                          </label>
                          {selected ? (
                            <Select
                              modal={false}
                              value={selectedCodeLocationKey}
                              onValueChange={(codeLocationKey) =>
                                onProjectCodeLocationKeyChange(project.projectId, codeLocationKey)
                              }
                              disabled={isSubmitting}
                            >
                              <SelectTrigger
                                aria-label={`Code location for ${project.projectName}`}
                                className="w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <AppSelectContent>
                                {codeLocationOptions.map((location) => (
                                  <AppSelectItem key={location.key} value={location.key}>
                                    <span className="font-mono">{location.label}</span>
                                  </AppSelectItem>
                                ))}
                              </AppSelectContent>
                            </Select>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Input
                      value={createProjectName}
                      onChange={(event) => onCreateProjectNameChange(event.target.value)}
                      disabled={isSubmitting}
                      placeholder="Project name"
                      aria-invalid={Boolean(createProjectNameError) || undefined}
                      aria-describedby={
                        createProjectNameError
                          ? "convex-project-name-error"
                          : createProjectNameNotice
                            ? "convex-project-name-notice"
                            : undefined
                      }
                    />
                    {createProjectNameError ? (
                      <AppResourceNameFeedback
                        id="convex-project-name-error"
                        message={createProjectNameError.message}
                        suggestion={createProjectNameError.suggestion}
                        onUseSuggestion={onCreateProjectNameChange}
                      />
                    ) : createProjectNameNotice ? (
                      <AppResourceNameNotice
                        id="convex-project-name-notice"
                        name={createProjectNameNotice}
                        onUseName={onCreateProjectNameChange}
                      />
                    ) : null}
                  </div>
                  {convexDeploymentRegionField}
                  <Select
                    modal={false}
                    value={createCodeLocationKey}
                    onValueChange={onCreateCodeLocationKeyChange}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger aria-label="Convex code location" className="w-full">
                      <SelectValue placeholder="Convex code location" />
                    </SelectTrigger>
                    <AppSelectContent>
                      {codeLocationOptions.map((location) => (
                        <AppSelectItem key={location.key} value={location.key}>
                          <span className="font-mono">{location.label}</span>
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
          {blockedReason ? (
            <div className="text-sm text-muted-foreground">{blockedReason}</div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isSubmitting && !blockedReason}
          >
            Cancel
          </Button>
          {!isLoading ? (
            <Button onClick={onSubmit} disabled={submitDisabled}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSubmitting
                ? repairProject
                  ? "Changing..."
                  : mode === "existing"
                    ? "Adding..."
                    : "Creating..."
                : repairProject
                  ? "Change code location"
                  : mode === "existing"
                    ? selectedProjectCount === 0
                      ? "Add projects"
                      : `Add ${selectedProjectCount} project${selectedProjectCount === 1 ? "" : "s"}`
                    : "Create project"}
            </Button>
          ) : null}
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}

export function RepositoryConvexDialog({
  blockedReason,
  onClose,
  onSaved,
  repairProjectId,
  repository,
}: {
  blockedReason: string | null;
  onClose: () => void;
  onSaved: () => void;
  repairProjectId: Id<"repositoryConvexProjects"> | null;
  repository: UserRepositoryResult;
}) {
  const findProjects = useAction(api.repository.convex.findProjects);
  const attachProject = useAction(api.repository.convex.attachProject);
  const changeProjectCodeLocation = useAction(api.repository.convex.changeProjectCodeLocation);
  const createProject = useAction(api.repository.convex.createProject);
  const [mode, setMode] = useState<ConvexProjectConnectMode>("existing");
  const convexDeploymentRegionSelection = useConvexDeploymentRegion({
    enabled: repairProjectId === null && mode === "create",
    organizationId: repository.organizationId,
    selectionKey: repository.repositoryId,
  });
  const [selectedCreateCodeLocationKey, setSelectedCreateCodeLocationKey] = useState("");
  const [createProjectName, setCreateProjectName] = useState(() =>
    buildDefaultAppResourceName({
      repositoryName: repository.githubRepositoryName,
      provider: "convex",
    }),
  );
  const [selectedProjectCodeLocationKeys, setSelectedProjectCodeLocationKeys] = useState<
    Record<string, string | undefined>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createProjectConflictName, setCreateProjectConflictName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createDeploymentRegion = convexDeploymentRegionSelection.selectedRegion;

  const resourcesQuery = useQuery({
    // Discovery marks the projects attached to this repository, so a cached result is valid only
    // for the attachment list that it was read with.
    queryKey: [
      "repository-provider-discovery",
      repository.repositoryId,
      "convex-projects",
      repository.convexProjects.map((project) => project.projectId),
      repository.providerWrite.lastWriteAt.convex,
    ],
    queryFn: () => findProjects({ repositoryId: repository.repositoryId }),
    retry: false,
  });

  const repairProject = repairProjectId
    ? (repository.convexProjects.find((project) => project.convexProjectId === repairProjectId) ??
      null)
    : null;
  const codeLocations = resourcesQuery.data?.source.locations ?? [];
  const createCodeLocationKey =
    selectedCreateCodeLocationKey ||
    (codeLocations[0] ? getConvexCodeLocationOptionKey(codeLocations[0]) : "");
  const allProjects = resourcesQuery.data?.projects ?? [];
  const unavailableProjectNames = new Set(
    allProjects.flatMap((project) => [project.projectName, project.projectSlug]),
  );
  if (createProjectConflictName) {
    unavailableProjectNames.add(createProjectConflictName);
  }
  const createProjectNameValidation = validateAppResourceName(createProjectName, "convex");
  const createProjectNameConflict =
    createProjectNameValidation.valid &&
    unavailableProjectNames.has(createProjectNameValidation.value)
      ? {
          message: `${formatAppResourceNameConflictMessage({ provider: "convex", name: createProjectNameValidation.value })} Choose another name.`,
          suggestion: buildAvailableAppResourceNameSuggestion({
            provider: "convex",
            baseName: createProjectNameValidation.value,
            unavailableNames: unavailableProjectNames,
          }),
        }
      : null;
  const projects = allProjects.filter((project) => project.attachment === "attachable");
  const resourceError = resourcesQuery.error ? "Could not discover Convex projects." : null;

  const handleSubmit = async () => {
    if (blockedReason || !resourcesQuery.data || isSubmitting) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const codeLocationsByKey = new Map(
        resourcesQuery.data.source.locations.map((location) => [
          getConvexCodeLocationOptionKey(location),
          location,
        ]),
      );
      if (repairProject) {
        const codeLocation = codeLocationsByKey.get(createCodeLocationKey);
        if (!codeLocation) {
          throw new Error("Choose a discovered Convex code location.");
        }
        await changeProjectCodeLocation({
          repositoryId: repository.repositoryId,
          convexProjectId: repairProject.convexProjectId,
          codeLocation: getConvexCodeLocationSelection(codeLocation),
        });
      } else if (mode === "existing") {
        const selectedProjects = Object.entries(selectedProjectCodeLocationKeys).map(
          ([projectId, codeLocationKey]) => {
            if (!codeLocationKey) {
              throw new Error("Choose a discovered Convex code location for every project.");
            }
            const codeLocation = codeLocationsByKey.get(codeLocationKey);
            if (!codeLocation) {
              throw new Error("Choose a discovered Convex code location for every project.");
            }
            return {
              codeLocation: getConvexCodeLocationSelection(codeLocation),
              projectId,
            };
          },
        );
        if (selectedProjects.length === 0) {
          throw new Error("Choose at least one Convex project.");
        }
        await attachProject({ repositoryId: repository.repositoryId, projects: selectedProjects });
      } else {
        const codeLocation = codeLocationsByKey.get(createCodeLocationKey);
        if (!codeLocation) {
          throw new Error("Choose a discovered Convex code location.");
        }
        if (!createDeploymentRegion) {
          throw new Error("Choose a Convex production region.");
        }
        await createProject({
          repositoryId: repository.repositoryId,
          projectName: createProjectName,
          deploymentRegion: createDeploymentRegion,
          codeLocation: getConvexCodeLocationSelection(codeLocation),
        });
      }
      onSaved();
    } catch (error) {
      const publicMessage =
        error instanceof ConvexError && typeof error.data === "string" ? error.data : null;
      const submittedName = validateAppResourceName(createProjectName, "convex");
      if (
        mode === "create" &&
        submittedName.valid &&
        publicMessage ===
          formatAppResourceNameConflictMessage({
            provider: "convex",
            name: submittedName.value,
          })
      ) {
        setCreateProjectConflictName(submittedName.value);
        setSubmitError(null);
      } else {
        setSubmitError(publicMessage ?? "Could not add Convex projects.");
      }
      setIsSubmitting(false);
    }
  };

  return (
    <RepositoryConvexDialogContent
      blockedReason={blockedReason}
      codeLocations={codeLocations}
      createCodeLocationKey={createCodeLocationKey}
      createDeploymentRegion={createDeploymentRegion}
      convexDeploymentRegionField={
        <ConvexDeploymentRegionField
          disabled={isSubmitting}
          id="repository-convex-production-region"
          onValueChange={convexDeploymentRegionSelection.setRequestedRegion}
          showEuPricing
          value={createDeploymentRegion}
        />
      }
      createProjectNameConflict={createProjectNameConflict}
      createProjectName={createProjectName}
      projects={projects}
      error={submitError ?? resourceError}
      isLoading={resourcesQuery.isPending}
      isSubmitting={isSubmitting}
      mode={mode}
      onCreateCodeLocationKeyChange={setSelectedCreateCodeLocationKey}
      onCreateProjectNameChange={(projectName) => {
        setCreateProjectName(projectName);
        setCreateProjectConflictName(null);
        setSubmitError(null);
      }}
      onModeChange={(nextMode) => {
        setMode(nextMode);
        setCreateProjectConflictName(null);
        setSubmitError(null);
      }}
      onOpenChange={(isOpen) => {
        if (!isOpen && (!isSubmitting || blockedReason)) {
          onClose();
        }
      }}
      onProjectCodeLocationKeyChange={(projectId, codeLocationKey) => {
        setSelectedProjectCodeLocationKeys((current) => ({
          ...current,
          [projectId]: codeLocationKey,
        }));
      }}
      onProjectToggle={(projectId) => {
        setSelectedProjectCodeLocationKeys((current) => {
          if (current[projectId] !== undefined) {
            return Object.fromEntries(
              Object.entries(current).filter(([candidate]) => candidate !== projectId),
            );
          }
          return {
            ...current,
            [projectId]:
              codeLocations.length === 1 && codeLocations[0]
                ? getConvexCodeLocationOptionKey(codeLocations[0])
                : "",
          };
        });
      }}
      onSubmit={() => {
        void handleSubmit();
      }}
      repairProject={
        repairProject
          ? {
              codeLocation: repairProject.codeLocation,
              projectId: repairProject.projectId,
            }
          : null
      }
      selectedProjectCodeLocationKeys={selectedProjectCodeLocationKeys}
      sourceCompleteness={resourcesQuery.data?.source.completeness ?? null}
      repository={repository}
    />
  );
}
