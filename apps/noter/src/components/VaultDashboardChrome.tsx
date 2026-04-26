import { type ReactNode } from "react";
import { PublicLandingLogo } from "@/components/PublicLandingLogo";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/collapsible";
import { ChevronDownIcon } from "@/lib/radixIcons";
import { Loader2 } from "lucide-react";
import { clsx } from "clsx";

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
                <div className="flex min-w-0 flex-1 basis-[11rem] items-start gap-3">
                  <div className="flex h-5 w-11 shrink-0 items-center justify-center">
                    {providerRow.icon}
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="text-sm font-medium">
                      {providerRow.label}
                    </div>
                    <div className="break-words text-xs leading-5 text-muted-foreground">
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
    <div
      className={clsx(
        "relative corner-notch-1 border p-4",
        !isReady && "bg-muted/30 opacity-75",
      )}
    >
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
