import { type ReactNode } from "react";
import { APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME } from "@/components/appSidebarNavigation";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDownIcon, PersonIcon } from "@/lib/radixIcons";
import { GOOGLE_AUTH_UI_ENABLED } from "@/lib/authMethodAvailability";
import {
  PUBLIC_LANDING_GITHUB_AUTH_SLOT_TEST_ID,
  PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID,
} from "@/lib/publicLanding";
import { clsx } from "clsx";
import { Github } from "lucide-react";
import type { AccountPresentation } from "../../../shared/accountPresentation";
import { Link } from "@tanstack/react-router";
import { SETTINGS_ROUTE } from "@/lib/settingsRoute";
import { SIGN_IN_WITH_OAUTH_BUTTON_CLASS_NAME } from "@/SignInWithOAuth";

const SIDEBAR_METADATA_TEXT_CLASS = "min-w-0 line-clamp-2 [overflow-wrap:anywhere]";
// pointer-fine, not a width variant: touch devices keep the stacked full-row
// icon regardless of pane width, and the desktop sidebar pane (96-288px) keeps
// the inline icon it always had.
const SIDEBAR_ROW_ICON_CLASS =
  "flex h-5 w-5 shrink-0 basis-full items-center justify-start pointer-fine:basis-auto pointer-fine:justify-center";
const SIDEBAR_ROW_CONTENT_CLASS =
  "flex min-w-0 shrink grow basis-[11rem] flex-wrap items-start gap-x-2 gap-y-1";
const SIDEBAR_ROW_TEXT_CLASS = "min-w-0 shrink grow basis-32 text-left";
const ACCOUNT_SECTION_TRIGGER_CLASS_NAME =
  "h-auto w-full items-start justify-between gap-2 whitespace-normal px-0 text-left text-sm font-medium hover:bg-transparent [&[data-state=open]>svg]:rotate-180";
const ACCOUNT_SECTION_TRIGGER_LABEL_CLASS_NAME =
  "min-w-0 flex-1 line-clamp-2 text-left [overflow-wrap:anywhere]";
export type RepositoryDashboardAccountSectionProps = {
  accountPresentation: AccountPresentation;
  dataTestId?: string;
  onOpenChange: (isOpen: boolean) => void;
  open: boolean;
};

export type RepositoryDashboardStaticAccountSectionProps = {
  accountPresentation: AccountPresentation;
  dataTestId?: string;
};

export type RepositoryDashboardStaticAccountStatusSectionProps = {
  accountPresentation: AccountPresentation;
  dataTestId?: string;
  statusLabel: string;
};

export function RepositoryDashboardAccountSectionFrame({
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
      className="repository-dashboard-sidebar-inset border-b border-border/50 py-3"
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
              data-repository-dashboard-account-section-label
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

export function RepositoryDashboardStaticAccountLoadingSection({
  dataTestId,
  label,
}: {
  dataTestId?: string;
  label: ReactNode;
}) {
  return (
    <div
      data-testid={dataTestId ?? "dashboard-sidebar-account-section"}
      className="repository-dashboard-sidebar-inset border-b border-border/50 py-3"
    >
      <div
        data-repository-dashboard-account-section-label
        className="min-w-0 line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]"
      >
        {label}
      </div>
      <div data-repository-dashboard-account-section-content className="hidden">
        <RepositoryDashboardStaticAccountPrehydrationPlaceholders />
      </div>
    </div>
  );
}

export function RepositoryDashboardStaticAccountPrehydrationPlaceholders() {
  return (
    <>
      <div data-app-auth-prehydration-signed-out className="hidden">
        <div
          data-app-auth-prehydration-signed-out-label
          className="min-w-0 line-clamp-2 border-b border-border/50 pb-3 text-center text-sm font-medium [overflow-wrap:anywhere]"
        >
          {null}
        </div>
        <div className="mt-3 flex flex-col items-center">
          <div className="flex flex-col gap-2">
            {GOOGLE_AUTH_UI_ENABLED ? (
              <Button
                aria-hidden="true"
                data-testid={PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID}
                className={clsx(SIGN_IN_WITH_OAUTH_BUTTON_CLASS_NAME, "disabled:opacity-100")}
                disabled
                tabIndex={-1}
                variant="outline"
                type="button"
              >
                <span className="min-w-0">Continue with Google</span>
              </Button>
            ) : null}
            <Button
              aria-hidden="true"
              data-testid={PUBLIC_LANDING_GITHUB_AUTH_SLOT_TEST_ID}
              className={clsx(SIGN_IN_WITH_OAUTH_BUTTON_CLASS_NAME, "disabled:opacity-100")}
              disabled
              tabIndex={-1}
              variant="default"
              type="button"
            >
              <Github className="mr-2 h-4 w-4 @max-[120px]:hidden" />
              <span className="min-w-0">Continue with GitHub</span>
            </Button>
          </div>
        </div>
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
            </div>
          </div>
          <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 self-start">
            <Link className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME} to={SETTINGS_ROUTE}>
              Account settings
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
export function RepositoryDashboardAccountSection({
  accountPresentation,
  dataTestId,
  onOpenChange,
  open,
}: RepositoryDashboardAccountSectionProps) {
  return (
    <RepositoryDashboardAccountSectionFrame
      dataTestId={dataTestId}
      label={accountPresentation.label}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex flex-wrap items-start gap-3">
        {accountPresentation.kind === "email" ? (
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
            </div>
          </div>
        ) : null}
        <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 self-start">
          <Link className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME} to={SETTINGS_ROUTE}>
            Account settings
          </Link>
        </div>
      </div>
    </RepositoryDashboardAccountSectionFrame>
  );
}

export function RepositoryDashboardStaticAccountSection({
  accountPresentation,
  dataTestId,
}: RepositoryDashboardStaticAccountSectionProps) {
  return (
    <div
      data-testid={dataTestId ?? "dashboard-sidebar-account-section"}
      className="repository-dashboard-sidebar-inset border-b border-border/50 py-3"
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
          </div>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 self-start">
          <Link className={APP_SIDEBAR_NAVIGATION_LINK_CLASS_NAME} to={SETTINGS_ROUTE}>
            Account settings
          </Link>
        </div>
      </div>
    </div>
  );
}

export function RepositoryDashboardStaticAccountStatusSection({
  accountPresentation,
  dataTestId,
  statusLabel,
}: RepositoryDashboardStaticAccountStatusSectionProps) {
  return (
    <div
      data-testid={dataTestId ?? "dashboard-sidebar-account-section"}
      className="repository-dashboard-sidebar-inset border-b border-border/50 py-3"
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
            <div className="text-xs leading-5 text-muted-foreground" role="status">
              {statusLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RepositoryDashboardSidebarContent({ children }: { children: ReactNode }) {
  return (
    <div className="repository-dashboard-sidebar-content flex min-h-full min-w-0 flex-col">
      {children}
    </div>
  );
}
