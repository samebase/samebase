import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PublicLandingLogo } from "@/components/logo/PublicLandingLogo";
import { APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME } from "@/components/appSidebarNavigation";
import { type LogoRouteSearch } from "@/routeSearch/logo";
import { DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY } from "@/lib/rotatedLogoViewState";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDownIcon, ChevronUpIcon, PersonIcon } from "@/lib/radixIcons";
import { Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { findVaultDashboardVerticalScrollport } from "./vaultDashboardScrollport";
import type { AccountPresentation } from "../../../shared/accountPresentation";
import { Link } from "@tanstack/react-router";
import { SETTINGS_ROUTE } from "@/lib/settingsRoute";

const SIDEBAR_METADATA_TEXT_CLASS = "min-w-0 line-clamp-2 [overflow-wrap:anywhere]";
const SIDEBAR_ROW_ICON_CLASS =
  "flex h-5 w-5 shrink-0 basis-full items-center justify-start md:basis-auto md:justify-center";
const SIDEBAR_ROW_CONTENT_CLASS =
  "flex min-w-0 shrink grow basis-[11rem] flex-wrap items-start gap-x-2 gap-y-1";
const SIDEBAR_ROW_TEXT_CLASS = "min-w-0 shrink grow basis-32 text-left";
const ACCOUNT_SECTION_TRIGGER_CLASS_NAME =
  "h-auto w-full items-start justify-between gap-2 whitespace-normal px-0 text-left text-sm font-medium hover:bg-transparent [&[data-state=open]>svg]:rotate-180";
const ACCOUNT_SECTION_TRIGGER_LABEL_CLASS_NAME =
  "min-w-0 flex-1 line-clamp-2 text-left [overflow-wrap:anywhere]";
const DEVELOPER_TOOLS_TRIGGER_CLASS_NAME =
  "h-auto gap-1 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground [&[data-state=open]>svg]:rotate-180";
const DEVELOPER_TOOLS_PLACEHOLDER_TRIGGER_CLASS_NAME =
  "invisible pointer-events-none h-auto gap-1 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground [&[data-state=open]>svg]:rotate-180";
const VAULT_DASHBOARD_BRANCH_LIST_END_SELECTOR = "[data-vault-dashboard-branch-list-end]";
const VAULT_DASHBOARD_BRANCH_ROW_SELECTOR = "[data-vault-dashboard-branch-row]";
const VAULT_DASHBOARD_REPOSITORY_HEADER_SELECTOR = "[data-vault-dashboard-repository-header]";

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
  accountPresentation: AccountPresentation;
  dataTestId?: string;
  onOpenChange: (isOpen: boolean) => void;
  onSettings: () => void;
  open: boolean;
  providerLabel: string | null;
};

export type VaultDashboardStaticAccountSectionProps = {
  accountPresentation: AccountPresentation;
  dataTestId?: string;
  onSettings: () => void;
  providerLabel: string | null;
};

export function VaultDashboardAccountSectionFrame({
  children,
  dataTestId = "dashboard-sidebar-account-section",
  label,
  onOpenChange,
  open,
}: {
  children: ReactNode;
  dataTestId?: string;
  label: ReactNode;
  onOpenChange: (isOpen: boolean) => void;
  open: boolean;
}) {
  return (
    <div
      data-testid={dataTestId}
      className="vault-dashboard-sidebar-inset border-b border-border/50 py-3"
    >
      <Collapsible className="space-y-3" open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild nativeButton>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={ACCOUNT_SECTION_TRIGGER_CLASS_NAME}
          >
            <span
              data-vault-dashboard-account-section-label
              className={ACCOUNT_SECTION_TRIGGER_LABEL_CLASS_NAME}
            >
              {label}
            </span>
            <ChevronDownIcon className="mt-0.5 h-4 w-4 shrink-0 transition-transform" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function VaultDashboardStaticAccountLoadingSection({
  dataTestId,
  label,
}: {
  dataTestId?: string;
  label: ReactNode;
}) {
  return (
    <div
      data-testid={dataTestId ?? "dashboard-sidebar-account-section"}
      className="vault-dashboard-sidebar-inset border-b border-border/50 py-3"
    >
      <div
        data-vault-dashboard-account-section-label
        className="min-w-0 line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]"
      >
        {label}
      </div>
      <div data-vault-dashboard-account-section-content className="hidden">
        <VaultDashboardStaticAccountPrehydrationPlaceholders />
      </div>
    </div>
  );
}

export function VaultDashboardStaticAccountPrehydrationPlaceholders() {
  return (
    <>
      <div data-app-auth-prehydration-signed-out className="hidden">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={ACCOUNT_SECTION_TRIGGER_CLASS_NAME}
        >
          <span
            data-app-auth-prehydration-signed-out-label
            className={ACCOUNT_SECTION_TRIGGER_LABEL_CLASS_NAME}
          />
          <ChevronDownIcon className="mt-0.5 h-4 w-4 shrink-0 transition-transform" />
        </Button>
      </div>
      <div data-app-auth-prehydration-signed-in className="hidden">
        <div className="flex flex-wrap items-start gap-3">
          <div data-testid="dashboard-sidebar-account-row" className={SIDEBAR_ROW_CONTENT_CLASS}>
            <div data-testid="dashboard-sidebar-account-icon" className={SIDEBAR_ROW_ICON_CLASS}>
              <PersonIcon className="h-4 w-4" />
            </div>
            <div data-testid="dashboard-sidebar-account-text" className={SIDEBAR_ROW_TEXT_CLASS}>
              <div
                data-app-auth-prehydration-account-label
                className={clsx(SIDEBAR_METADATA_TEXT_CLASS, "text-sm font-medium")}
              />
              <div
                data-app-auth-prehydration-provider
                className={clsx(
                  SIDEBAR_METADATA_TEXT_CLASS,
                  "hidden text-xs leading-5 text-muted-foreground",
                )}
              />
            </div>
          </div>
          <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 self-start">
            <Link className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME} to={SETTINGS_ROUTE}>
              /settings
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The account controls use the same section and row geometry as providers so
 * the right rail reads as one accordion stack.
 */
export function VaultDashboardAccountSection({
  accountPresentation,
  dataTestId,
  onOpenChange,
  onSettings,
  open,
  providerLabel,
}: VaultDashboardAccountSectionProps) {
  return (
    <VaultDashboardAccountSectionFrame
      dataTestId={dataTestId}
      label={accountPresentation.label}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex flex-wrap items-start gap-3">
        {accountPresentation.kind === "email" || providerLabel ? (
          <div data-testid="dashboard-sidebar-account-row" className={SIDEBAR_ROW_CONTENT_CLASS}>
            <div data-testid="dashboard-sidebar-account-icon" className={SIDEBAR_ROW_ICON_CLASS}>
              <PersonIcon className="h-4 w-4" />
            </div>
            <div data-testid="dashboard-sidebar-account-text" className={SIDEBAR_ROW_TEXT_CLASS}>
              {accountPresentation.kind === "email" ? (
                <div
                  className={clsx(SIDEBAR_METADATA_TEXT_CLASS, "text-sm font-medium")}
                  title={accountPresentation.label}
                >
                  {accountPresentation.label}
                </div>
              ) : null}
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
        ) : null}
        <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 self-start">
          <Link
            className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
            to={SETTINGS_ROUTE}
            onClick={onSettings}
          >
            /settings
          </Link>
        </div>
      </div>
    </VaultDashboardAccountSectionFrame>
  );
}

export function VaultDashboardStaticAccountSection({
  accountPresentation,
  dataTestId,
  onSettings,
  providerLabel,
}: VaultDashboardStaticAccountSectionProps) {
  return (
    <div
      data-testid={dataTestId ?? "dashboard-sidebar-account-section"}
      className="vault-dashboard-sidebar-inset border-b border-border/50 py-3"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div data-testid="dashboard-sidebar-account-row" className={SIDEBAR_ROW_CONTENT_CLASS}>
          <div data-testid="dashboard-sidebar-account-icon" className={SIDEBAR_ROW_ICON_CLASS}>
            <PersonIcon className="h-4 w-4" />
          </div>
          <div data-testid="dashboard-sidebar-account-text" className={SIDEBAR_ROW_TEXT_CLASS}>
            <div
              className={clsx(SIDEBAR_METADATA_TEXT_CLASS, "text-sm font-medium")}
              title={accountPresentation.label}
            >
              {accountPresentation.label}
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
          <Link
            className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME}
            to={SETTINGS_ROUTE}
            onClick={onSettings}
          >
            /settings
          </Link>
        </div>
      </div>
    </div>
  );
}

export function VaultDashboardProviderRows({
  footer,
  providerRows,
}: {
  footer?: ReactNode;
  providerRows: readonly VaultDashboardProviderRowViewModel[];
}) {
  return (
    <div data-testid="provider-connections-panel" className="space-y-3">
      {providerRows.map((providerRow) => (
        <div key={providerRow.key} className="flex flex-wrap items-start gap-3">
          <div
            data-provider-key={providerRow.key}
            data-testid="provider-connection-row"
            className={SIDEBAR_ROW_CONTENT_CLASS}
          >
            <div data-testid="provider-connection-icon" className={SIDEBAR_ROW_ICON_CLASS}>
              {providerRow.icon}
            </div>
            <div data-testid="provider-connection-text" className={SIDEBAR_ROW_TEXT_CLASS}>
              <div className="text-sm font-medium">{providerRow.label}</div>
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
  );
}

export function VaultDashboardEmptyState({
  logoRouteSearch,
  replaceRouteSearch,
}: {
  logoRouteSearch: LogoRouteSearch;
  replaceRouteSearch?: (nextSearch: LogoRouteSearch) => void;
}) {
  return (
    <div data-testid="vault-dashboard-empty-state" className="container mx-auto max-w-2xl py-6">
      <div className="text-center">
        <div className="mx-auto w-full max-w-[8rem]">
          <PublicLandingLogo
            animateLeftFaceStripes
            replaceRouteSearch={replaceRouteSearch}
            routeSearch={logoRouteSearch}
            viewStatePersistence="device"
            viewStateKey={DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY}
          />
        </div>
      </div>
    </div>
  );
}

export function VaultDashboardRepositoryList({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/**
 * Chooses the content that should remain visible at max scroll: the final
 * branch row below the sticky header, or the whole card when there are no
 * branch rows.
 */
function resolveVaultDashboardScrollEndTarget(target: HTMLElement): {
  element: HTMLElement;
  topPx: number;
} {
  const branchListEnd = target.querySelector<HTMLElement>(VAULT_DASHBOARD_BRANCH_LIST_END_SELECTOR);
  const branchRows = target.querySelectorAll<HTMLElement>(VAULT_DASHBOARD_BRANCH_ROW_SELECTOR);
  const header = target.querySelector<HTMLElement>(VAULT_DASHBOARD_REPOSITORY_HEADER_SELECTOR);
  if (branchListEnd && header) {
    return {
      element: branchListEnd,
      topPx: header.offsetHeight,
    };
  }
  if (branchRows.length > 0 && header) {
    const lastBranchRow = branchRows[branchRows.length - 1];
    return {
      element: lastBranchRow,
      topPx: header.offsetHeight,
    };
  }
  return {
    element: target,
    topPx: 0,
  };
}

/**
 * Adds just enough trailing height for the immediately preceding repository
 * card to reach the scrollport top. It depends on production dashboard markers
 * for branch rows and the sticky header, then keeps the height fresh by
 * observing the target card, its list container, the scrollport, child changes,
 * and window resizes.
 */
export function VaultDashboardScrollTargetEndPadding() {
  const elementRef = useRef<HTMLDivElement>(null);
  const [heightPx, setHeightPx] = useState(0);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    const syncHeight = () => {
      const target = element.previousElementSibling;
      const scrollport = findVaultDashboardVerticalScrollport(element);
      if (!(target instanceof HTMLElement) || !scrollport) {
        setHeightPx(0);
        return;
      }

      const scrollEndTarget = resolveVaultDashboardScrollEndTarget(target);
      const targetRect = scrollEndTarget.element.getBoundingClientRect();
      const scrollportRect = scrollport.getBoundingClientRect();
      const maxScrollTopPx = Math.max(scrollport.scrollHeight - scrollport.clientHeight, 0);
      const targetTopAtScrollStartPx = targetRect.top - scrollportRect.top + scrollport.scrollTop;
      const targetTopAtScrollEndPx = targetTopAtScrollStartPx - maxScrollTopPx;

      // Branch rows are the final meaningful content: keep the vault header
      // sticky and let earlier rows scroll underneath it.
      const nextHeightPx = Math.max(
        element.offsetHeight + targetTopAtScrollEndPx - scrollEndTarget.topPx,
        0,
      );
      setHeightPx((currentHeightPx) =>
        Math.abs(currentHeightPx - nextHeightPx) < 0.5 ? currentHeightPx : nextHeightPx,
      );
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncHeight);

    const observeCurrentTarget = () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
        const target = element.previousElementSibling;
        const scrollport = findVaultDashboardVerticalScrollport(element);
        if (target instanceof HTMLElement) {
          resizeObserver.observe(target);
          // Rows above the final vault can expand while the final card keeps
          // the same size, so watch the list container as well.
          const listContainer = target.parentElement;
          if (listContainer) {
            resizeObserver.observe(listContainer);
          }
        }
        if (scrollport) {
          resizeObserver.observe(scrollport);
        }
      }
      syncHeight();
    };

    observeCurrentTarget();

    const parentElement = element.parentElement;
    let mutationObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined" && parentElement) {
      mutationObserver = new MutationObserver(observeCurrentTarget);
      mutationObserver.observe(parentElement, { childList: true });
    }
    window.addEventListener("resize", observeCurrentTarget);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
      window.removeEventListener("resize", observeCurrentTarget);
    };
  }, []);

  return (
    <div
      ref={elementRef}
      aria-hidden="true"
      className="shrink-0"
      style={{ height: `${heightPx}px` }}
    />
  );
}

export function VaultDashboardSidebarContent({ children }: { children: ReactNode }) {
  return (
    <div className="vault-dashboard-sidebar-content flex min-h-full min-w-0 flex-col">
      {children}
    </div>
  );
}

export function VaultDashboardRepositoryCard({
  branchSection,
  developerToolsSection,
  footerActions,
  headerControls,
  isReady,
  repositoryName,
  repositoryLinks,
  repositoryLinksOpen,
  repositoryStatus,
  onRepositoryLinksOpenChange,
  setupSection,
  titleSuffix,
  topRightAction,
}: {
  branchSection?: ReactNode;
  developerToolsSection?: {
    content: ReactNode;
    onOpenChange: (isOpen: boolean) => void;
    open: boolean;
    visible: boolean;
  };
  footerActions?: ReactNode;
  headerControls?: ReactNode;
  isReady: boolean;
  repositoryName: string;
  repositoryLinks?: ReactNode;
  repositoryLinksOpen: boolean;
  repositoryStatus?: ReactNode;
  onRepositoryLinksOpenChange: (isOpen: boolean) => void;
  setupSection?: ReactNode;
  titleSuffix?: ReactNode;
  topRightAction?: ReactNode;
}) {
  const hasBodyContent = Boolean(
    branchSection || developerToolsSection || footerActions || setupSection,
  );
  const hasRepositoryLinks = Boolean(repositoryLinks);
  const hasTopRightAction = Boolean(topRightAction);
  const repositoryLinksLabel = repositoryLinksOpen ? "Hide resource links" : "Show resource links";
  // Keep long branch lists anchored to their repository without taking over
  // unrelated card content.
  const shouldStickHeader = Boolean(branchSection);
  const titleContent = (
    <h3 className="min-w-0 text-base font-semibold leading-6">
      <span className="flex min-w-0 items-start gap-2">
        <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">
          <span>{repositoryName}</span>
        </span>
        {titleSuffix}
      </span>
    </h3>
  );
  const headerContent = (
    <div
      className={clsx(
        "flex flex-col items-start",
        hasRepositoryLinks && hasTopRightAction ? "pr-24" : "pr-10",
      )}
    >
      <div className="-mx-2 -my-1 inline-flex min-h-9 max-w-full items-start px-2 py-1 text-base leading-6">
        {titleContent}
      </div>
      {hasRepositoryLinks ? (
        <CollapsibleContent className="w-full min-w-0">{repositoryLinks}</CollapsibleContent>
      ) : null}
      {repositoryStatus ? (
        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {repositoryStatus}
        </div>
      ) : null}
      {headerControls ? (
        <div className="mt-2 flex w-full max-w-full flex-wrap items-center gap-2">
          {headerControls}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={clsx("relative p-4", !isReady && "bg-muted/30 opacity-75")}>
      <div>
        <div
          data-vault-dashboard-repository-header=""
          data-testid="vault-dashboard-repository-header"
          className={clsx(
            "relative -mx-4 -mt-4 px-4 pt-4",
            hasBodyContent && "pb-3",
            shouldStickHeader && "sticky top-0 z-10 bg-background",
          )}
        >
          {topRightAction}

          {hasRepositoryLinks ? (
            <Collapsible open={repositoryLinksOpen} onOpenChange={onRepositoryLinksOpenChange}>
              <CollapsibleTrigger asChild nativeButton>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={repositoryLinksLabel}
                  title={repositoryLinksLabel}
                  className={clsx(
                    "absolute top-4 z-20",
                    hasTopRightAction ? "right-14" : "right-4",
                  )}
                >
                  {repositoryLinksOpen ? (
                    <ChevronUpIcon className="h-4 w-4" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              {headerContent}
            </Collapsible>
          ) : (
            headerContent
          )}
        </div>

        <div className="space-y-3">
          {setupSection}

          {branchSection}

          {developerToolsSection ? (
            developerToolsSection.visible ? (
              <Collapsible
                className="space-y-1.5"
                open={developerToolsSection.open}
                onOpenChange={developerToolsSection.onOpenChange}
              >
                <CollapsibleTrigger asChild nativeButton>
                  <Button variant="ghost" size="sm" className={DEVELOPER_TOOLS_TRIGGER_CLASS_NAME}>
                    Developer tools
                    <ChevronDownIcon className="h-3.5 w-3.5 transition-transform" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent forceMount className="space-y-1.5 data-[state=closed]:hidden">
                  {developerToolsSection.content}
                </CollapsibleContent>
              </Collapsible>
            ) : (
              // Reserve the closed trigger box so toggling ?dev does not reflow
              // the visible dashboard card layout.
              <Collapsible className="space-y-1.5" open={false} aria-hidden={true}>
                <CollapsibleTrigger asChild nativeButton>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={DEVELOPER_TOOLS_PLACEHOLDER_TRIGGER_CLASS_NAME}
                    disabled
                    tabIndex={-1}
                  >
                    Developer tools
                    <ChevronDownIcon className="h-3.5 w-3.5 transition-transform" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent forceMount className="space-y-1.5 data-[state=closed]:hidden" />
              </Collapsible>
            )
          ) : null}

          {footerActions}
        </div>
      </div>
    </div>
  );
}
