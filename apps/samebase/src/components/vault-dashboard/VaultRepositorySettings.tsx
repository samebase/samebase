import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { RootDirectoryLabel } from "@/components/vault-dashboard/VaultEnvironmentTree";
import type {
  VaultRepositorySettingsAction,
  VaultRepositorySettingsResource,
  VaultRepositorySettingsState,
} from "@/components/vault-dashboard/vaultRepositorySettingsState";
import { VaultWorkspaceDataInspector } from "@/components/vault-dashboard/VaultWorkspaceDataInspector";
import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import type { VaultWorkspaceSelected } from "./vaultWorkspaceModel";

function providerIcon(provider: "cloudflare" | "convex" | "github"): ReactNode {
  switch (provider) {
    case "cloudflare":
      return <CloudflareProviderLogo />;
    case "convex":
      return <ConvexProviderLogo />;
    case "github":
      return <GitHubProviderLogo />;
  }
  provider satisfies never;
  return null;
}

function invokeResourceAction(action: VaultRepositorySettingsAction) {
  if (!action.disabled) {
    action.onClick?.();
  }
}

function resourceAccessibleName(resource: VaultRepositorySettingsResource): string {
  return resource.provider === "cloudflare"
    ? `Cloudflare Worker ${resource.owner}/${resource.name}`
    : `Convex project ${resource.owner}/${resource.name}`;
}

function resourceActionAccessibleName(
  action: VaultRepositorySettingsAction,
  resource: VaultRepositorySettingsResource,
): string {
  const resourceName = resourceAccessibleName(resource);
  return action.kind === "remove"
    ? `Remove ${resourceName} from vault`
    : `${action.ariaLabel ?? action.label} for ${resourceName}`;
}

function ResourceActions({ resource }: { resource: VaultRepositorySettingsResource }) {
  const actions = resource.actions;
  if (!actions) {
    return null;
  }
  const directActions = actions.filter((action) => action.kind !== "remove");
  const removeActions = actions.filter((action) => action.kind === "remove");

  return (
    <div className="flex flex-wrap items-center gap-1">
      {directActions.map((action) => (
        <Button
          aria-label={resourceActionAccessibleName(action, resource)}
          key={`${action.kind}:${action.label}`}
          disabled={action.disabled || !action.onClick}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => invokeResourceAction(action)}
        >
          {action.label}
        </Button>
      ))}
      {removeActions.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild nativeButton>
            <Button
              aria-label={`Actions for ${resourceAccessibleName(resource)}`}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-none shadow-none">
            {removeActions.map((action) => (
              <DropdownMenuItem
                aria-label={resourceActionAccessibleName(action, resource)}
                key={`${action.kind}:${action.label}`}
                disabled={action.disabled || !action.onClick}
                variant="destructive"
                onClick={() => invokeResourceAction(action)}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function SettingsResourceRow({ resource }: { resource: VaultRepositorySettingsResource }) {
  const isAttention = resource.state === "failed" || resource.state === "missing";
  const actions = resource.actions;
  const onlyRemoveActions =
    actions !== undefined &&
    actions.length > 0 &&
    actions.every((action) => action.kind === "remove");

  return (
    <div className="relative grid min-w-0 gap-3 py-2.5 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-center">
      <div
        className={
          onlyRemoveActions
            ? "flex min-w-0 items-start gap-2.5 pr-10 @3xl:pr-0"
            : "flex min-w-0 items-start gap-2.5"
        }
      >
        <span
          aria-label={resource.provider === "cloudflare" ? "Cloudflare" : "Convex"}
          className="mt-0.5 flex h-4 w-5 shrink-0 items-center justify-center"
          role="img"
        >
          {providerIcon(resource.provider)}
        </span>
        <div className="min-w-0">
          <div className="line-clamp-2 text-xs leading-4 text-muted-foreground">
            {resource.owner}/
          </div>
          {resource.state === "loading" ? (
            <div className="mt-1 h-4 w-32 max-w-full bg-muted motion-safe:animate-pulse" />
          ) : resource.state === "available" && resource.href ? (
            <a
              className="line-clamp-2 text-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
              href={resource.href}
              rel="noreferrer noopener"
              target="_blank"
            >
              {resource.name}
            </a>
          ) : (
            <div className="line-clamp-2 text-sm font-medium text-foreground">{resource.name}</div>
          )}
          {resource.description ? (
            <div
              className={
                isAttention
                  ? "mt-1 text-xs leading-5 text-red-700"
                  : "mt-1 text-xs leading-5 text-muted-foreground"
              }
            >
              {resource.description}
            </div>
          ) : null}
        </div>
      </div>
      <div
        className={
          onlyRemoveActions
            ? "absolute right-0 top-1.5 @3xl:static @3xl:justify-self-end"
            : "justify-self-start @3xl:justify-self-end"
        }
      >
        <ResourceActions resource={resource} />
      </div>
    </div>
  );
}

function SettingsRoot({
  resources,
  rootDirectory,
}: {
  resources: readonly VaultRepositorySettingsResource[];
  rootDirectory: string;
}) {
  return (
    <div className="grid min-w-0 border-b border-border/60 last:border-b-0 @4xl:grid-cols-[minmax(10rem,0.32fr)_minmax(0,1fr)]">
      <div className="min-w-0 pb-1 pt-4 @4xl:py-3 @4xl:pr-5">
        <RootDirectoryLabel rootDirectory={rootDirectory} />
      </div>
      <div className="min-w-0 pb-2 pl-5 @4xl:border-l @4xl:pb-0 @4xl:pl-5">
        {resources.map((resource) => (
          <SettingsResourceRow
            key={`${resource.provider}:${resource.resourceId}`}
            resource={resource}
          />
        ))}
      </div>
    </div>
  );
}

function AddResourceButton({
  action,
  label,
  logo,
}: {
  action: VaultRepositorySettingsState["addCloudflareWorker"];
  label: string;
  logo: ReactNode;
}) {
  return (
    <Button
      disabled={action.disabled || !action.onClick}
      size="sm"
      type="button"
      variant="outline"
      onClick={() => {
        action.onClick?.();
      }}
    >
      {logo}
      {label}
    </Button>
  );
}

export function RepositorySettings({
  developerToolsVisible,
  onOpenDeleteDialog,
  settingsState,
  workspace,
}: {
  developerToolsVisible: boolean;
  onOpenDeleteDialog: () => void;
  settingsState: VaultRepositorySettingsState;
  workspace: VaultWorkspaceSelected;
}) {
  const deleteAction =
    workspace.vault.deletion.state === "not_deleting"
      ? workspace.vault.deletion.deleteAction
      : { state: "disabled" as const, reason: "Vault removal is already in progress." };

  return (
    <main className="mx-auto grid w-full max-w-[960px] gap-8 px-4 py-6 @3xl:px-6 @5xl:px-8 @5xl:py-8">
      <section aria-labelledby="vault-settings-repository-heading">
        <h2
          id="vault-settings-repository-heading"
          className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          Repository
        </h2>
        <div className="border-t border-border py-3">
          <a
            className="flex min-w-0 items-start gap-2.5 text-foreground no-underline hover:no-underline"
            href={workspace.githubRepositoryUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            <span className="mt-0.5 flex h-4 w-5 shrink-0 items-center justify-center">
              <GitHubProviderLogo />
            </span>
            <span className="min-w-0">
              <span className="block line-clamp-2 text-xs text-muted-foreground">
                {workspace.vault.ghRepoOwner}/
              </span>
              <span className="block line-clamp-2 text-sm font-medium underline decoration-border underline-offset-4">
                {workspace.vault.ghRepoName}
              </span>
            </span>
          </a>
        </div>
      </section>

      {settingsState.attentionResources.length > 0 ? (
        <section aria-labelledby="vault-settings-attention-heading">
          <h2
            id="vault-settings-attention-heading"
            className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-red-700"
          >
            Attention required
          </h2>
          <div className="border-t border-border">
            <SettingsRoot
              resources={settingsState.attentionResources}
              rootDirectory="Needs attention"
            />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="vault-settings-connections-heading">
        <div className="mb-3 grid gap-3 @4xl:grid-cols-[minmax(0,1fr)_auto] @4xl:items-end">
          <h2
            id="vault-settings-connections-heading"
            className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            Connections
          </h2>
          <div className="flex flex-wrap gap-2">
            <AddResourceButton
              action={settingsState.addCloudflareWorker}
              label="Add Cloudflare Worker"
              logo={<CloudflareProviderLogo />}
            />
            <AddResourceButton
              action={settingsState.addConvexProject}
              label="Add Convex project"
              logo={<ConvexProviderLogo />}
            />
          </div>
        </div>
        <div className="border-t border-border">
          {settingsState.pendingResources.map((resource) => (
            <SettingsResourceRow
              key={`${resource.provider}:${resource.resourceId}`}
              resource={resource}
            />
          ))}
          {settingsState.roots.length > 0 ? (
            settingsState.roots.map((root) => (
              <SettingsRoot
                key={root.rootDirectory}
                resources={root.resources}
                rootDirectory={root.rootDirectory}
              />
            ))
          ) : (
            <div className="py-4 text-sm text-muted-foreground">
              No Cloudflare Workers or Convex projects are connected.
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="vault-settings-remove-heading">
        <h2
          id="vault-settings-remove-heading"
          className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          Remove vault
        </h2>
        <div className="grid gap-3 border-t border-border py-4 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-center">
          <p className="max-w-xl text-xs leading-5 text-muted-foreground">
            {deleteAction.state === "disabled"
              ? deleteAction.reason
              : "Review repository and provider cleanup before anything is removed."}
          </p>
          <Button
            className="justify-self-start @3xl:justify-self-end"
            disabled={deleteAction.state === "disabled"}
            size="sm"
            type="button"
            variant="destructive"
            onClick={onOpenDeleteDialog}
          >
            Remove vault
          </Button>
        </div>
      </section>
      {developerToolsVisible ? <VaultWorkspaceDataInspector workspace={workspace} /> : null}
    </main>
  );
}
