import { type ReactNode } from "react";
import { PublicLandingLogo } from "@/components/PublicLandingLogo";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/collapsible";
import { ChevronDownIcon, PersonIcon } from "@/lib/radixIcons";
import { Loader2 } from "lucide-react";
import { clsx } from "clsx";

const SIDEBAR_METADATA_TEXT_CLASS =
  "min-w-0 line-clamp-2 [overflow-wrap:anywhere]";
const SIDEBAR_ROW_ICON_CLASS =
  "flex h-5 w-5 shrink-0 items-center justify-center";
const SIDEBAR_ROW_CONTENT_CLASS =
  "flex min-w-0 shrink grow basis-[11rem] flex-wrap items-start gap-x-2 gap-y-1";
const SIDEBAR_ROW_TEXT_CLASS = "min-w-0 shrink grow basis-24 text-left";

export type VaultDashboardProviderActionViewModel = {
  disabled?: boolean;
  isPending?: boolean;
  key: string;
  label: string;
  onClick?: () => void;
  pendingLabel?: string;
};

export type VaultDashboardProviderRowViewModel = {
  actions: readonly VaultDashboardProviderActionViewModel[];
  icon: ReactNode;
  key: string;
  label: string;
  status: string;
};

export type VaultDashboardAccountSectionProps = {
  displayName: string;
  email: string;
  isSignOutPending: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSignOut: () => void;
  open: boolean;
  providerLabel: string | null;
  signOutDisabled?: boolean;
};

/**
 * The account controls use the same section and row geometry as providers so
 * the right rail reads as one accordion stack.
 */
export function VaultDashboardAccountSection({
  displayName,
  email,
  isSignOutPending,
  onOpenChange,
  onSignOut,
  open,
  providerLabel,
  signOutDisabled,
}: VaultDashboardAccountSectionProps) {
  return (
    <div className="border-b border-border/50 p-3">
      <Collapsible
        className="space-y-3"
        open={open}
        onOpenChange={onOpenChange}
      >
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto w-full justify-between px-0 text-sm font-medium hover:bg-transparent [&[data-state=open]>svg]:rotate-180"
          >
            <span className="min-w-0 truncate text-left">{displayName}</span>
            <ChevronDownIcon className="h-4 w-4 shrink-0 transition-transform" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-wrap items-start gap-3">
            <div
              data-testid="dashboard-sidebar-account-row"
              className={SIDEBAR_ROW_CONTENT_CLASS}
            >
              <div
                data-testid="dashboard-sidebar-account-icon"
                className={SIDEBAR_ROW_ICON_CLASS}
              >
                <PersonIcon className="h-4 w-4" />
              </div>
              <div
                data-testid="dashboard-sidebar-account-text"
                className={SIDEBAR_ROW_TEXT_CLASS}
              >
                <div
                  className={clsx(
                    SIDEBAR_METADATA_TEXT_CLASS,
                    "text-sm font-medium",
                  )}
                  title={email}
                >
                  {email}
                </div>
                {providerLabel ? (
                  <div
                    className={clsx(
                      SIDEBAR_METADATA_TEXT_CLASS,
                      "text-xs leading-5 text-muted-foreground",
                    )}
                    title={`Signed in with ${providerLabel}`}
                  >
                    Signed in with {providerLabel}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 self-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSignOut}
                className="h-auto max-w-full whitespace-normal py-2 text-left"
                disabled={signOutDisabled || isSignOutPending}
              >
                {isSignOutPending ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Signing out...
                  </>
                ) : (
                  "Sign out"
                )}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function VaultDashboardProvidersSection({
  footer,
  onOpenChange,
  open,
  providerRows,
}: {
  footer?: ReactNode;
  onOpenChange: (isOpen: boolean) => void;
  open: boolean;
  providerRows: readonly VaultDashboardProviderRowViewModel[];
}) {
  return (
    <div className="border-b border-border/50 p-3">
      <Collapsible
        className="space-y-3"
        open={open}
        onOpenChange={onOpenChange}
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto w-full justify-between px-0 text-sm font-medium hover:bg-transparent [&[data-state=open]>svg]:rotate-180"
          >
            <span>Providers</span>
            <ChevronDownIcon className="h-4 w-4 transition-transform" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            data-testid="dashboard-shell-sidebar-panel"
            className="space-y-3"
          >
            {providerRows.map((providerRow) => (
              <div
                key={providerRow.key}
                className="flex flex-wrap items-start gap-3"
              >
                <div
                  data-provider-key={providerRow.key}
                  data-testid="dashboard-sidebar-provider-row"
                  className={SIDEBAR_ROW_CONTENT_CLASS}
                >
                  <div
                    data-testid="dashboard-sidebar-provider-icon"
                    className={SIDEBAR_ROW_ICON_CLASS}
                  >
                    {providerRow.icon}
                  </div>
                  <div
                    data-testid="dashboard-sidebar-provider-text"
                    className={SIDEBAR_ROW_TEXT_CLASS}
                  >
                    <div className="text-sm font-medium">
                      {providerRow.label}
                    </div>
                    <div
                      className={clsx(
                        SIDEBAR_METADATA_TEXT_CLASS,
                        "text-xs leading-5 text-muted-foreground",
                      )}
                      title={providerRow.status}
                    >
                      {providerRow.status}
                    </div>
                  </div>
                </div>
                {providerRow.actions.length > 0 ? (
                  <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 self-start">
                    {providerRow.actions.map((action) => (
                      <Button
                        key={action.key}
                        variant="outline"
                        size="sm"
                        onClick={action.onClick}
                        className="h-auto max-w-full whitespace-normal py-2 text-left"
                        disabled={action.disabled}
                      >
                        {action.isPending ? (
                          <>
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            {action.pendingLabel ?? action.label}
                          </>
                        ) : (
                          action.label
                        )}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {footer}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function VaultDashboardEmptyState() {
  return (
    <div className="container mx-auto max-w-2xl py-6">
      <div className="text-center">
        <div className="mx-auto w-full max-w-[8rem]">
          <PublicLandingLogo />
        </div>
      </div>
    </div>
  );
}

export function VaultDashboardRepositoryList({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function VaultDashboardSidebarContent({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="flex min-h-full min-w-0 flex-col">{children}</div>;
}

export function VaultDashboardRepositoryCard({
  branchSection,
  daytonaBanner,
  developerToolsSection,
  footerActions,
  isReady,
  repositoryName,
  repositoryOwner,
  repositoryStatus,
  titleClassName,
  titleHref,
  titleSuffix,
  titleTarget,
  titleTitle,
  topRightAction,
}: {
  branchSection?: ReactNode;
  daytonaBanner?: ReactNode;
  developerToolsSection?: {
    content: ReactNode;
    onOpenChange: (isOpen: boolean) => void;
    open: boolean;
  };
  footerActions?: ReactNode;
  isReady: boolean;
  repositoryName: string;
  repositoryOwner: string;
  repositoryStatus?: ReactNode;
  titleClassName?: string;
  titleHref: string;
  titleSuffix?: ReactNode;
  titleTarget?: string;
  titleTitle?: string;
  topRightAction?: ReactNode;
}) {
  return (
    <div className={clsx("relative p-4", !isReady && "bg-muted/30 opacity-75")}>
      {topRightAction}

      <div className="space-y-3">
        <div className="flex flex-col items-start pr-10">
          <a
            href={titleHref}
            target={titleTarget}
            rel={titleTarget === "_blank" ? "noopener noreferrer" : undefined}
            className={clsx("flex min-w-0 items-start", titleClassName)}
            title={titleTitle}
          >
            <h3 className="min-w-0 font-semibold">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate">
                  <span className="font-normal text-muted-foreground">
                    {repositoryOwner}/
                  </span>
                  <span>{repositoryName}</span>
                </span>
                {titleSuffix}
              </span>
            </h3>
          </a>
          {repositoryStatus ? (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {repositoryStatus}
            </div>
          ) : null}
        </div>

        {branchSection}
        {daytonaBanner}

        {developerToolsSection ? (
          <Collapsible
            className="space-y-1.5"
            open={developerToolsSection.open}
            onOpenChange={developerToolsSection.onOpenChange}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto gap-1 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground [&[data-state=open]>svg]:rotate-180"
              >
                Developer tools
                <ChevronDownIcon className="h-3.5 w-3.5 transition-transform" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent
              forceMount
              className="space-y-1.5 data-[state=closed]:hidden"
            >
              {developerToolsSection.content}
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {footerActions}
      </div>
    </div>
  );
}
