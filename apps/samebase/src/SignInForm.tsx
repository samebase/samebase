import { LandingCopy } from "@/components/LandingCopy";
import { PublicLandingAuthControls } from "@/components/PublicLandingAuthControls";
import { LandingHeroMenger } from "@/components/logo/LandingHeroMenger";
import { PublicLandingLogo } from "@/components/logo/PublicLandingLogo";
import { LOGO_IDENTITY_VIEW_CONTRACTS } from "@/components/logo/logoStaticSvgContract";
import { useWorkspaceLayoutPresentation } from "@samebase/workspace-layout/runtime";
import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import {
  PUBLIC_LANDING_COPY_TEST_ID,
  PUBLIC_LANDING_SCROLL_SHELL_TEST_ID,
} from "@/lib/publicLanding";
import { replaceRootLogoRouteSearch, useRootRouteSearch } from "@/routeSearch/root";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

type SignInFormProps = {
  authPlacement: "inline" | "sidebar";
  landingPageMarkdown: string;
  logo: "classic" | "menger";
  topNotice: ReactNode;
};

const [LANDING_LOGO_STARTING_VIEW] = LOGO_IDENTITY_VIEW_CONTRACTS;
const MOBILE_SIDEBAR_LOGO_TILT_DEGREES = 24;

function LandingPageLogo({
  landingDevModeEnabled,
  rootRouteSearch,
}: {
  landingDevModeEnabled: boolean;
  rootRouteSearch: ReturnType<typeof useRootRouteSearch>;
}) {
  const navigate = useNavigate();
  const { isMobile, mobileMergeProgress, mobilePaneScrollProgress } =
    useWorkspaceLayoutPresentation();
  const presentationTiltNeutralProgress =
    mobileMergeProgress?.side === "right" ? mobileMergeProgress.progress : undefined;

  return (
    <PublicLandingLogo
      animateLeftFaceStripes
      autoRotate={landingDevModeEnabled}
      defaultView={LANDING_LOGO_STARTING_VIEW}
      enablePointerTilt
      enableViewSnapping={!landingDevModeEnabled}
      presentationTiltNeutralProgress={presentationTiltNeutralProgress}
      presentationTiltTarget={
        isMobile
          ? {
              horizontal: mobilePaneScrollProgress * MOBILE_SIDEBAR_LOGO_TILT_DEGREES,
              vertical: 0,
            }
          : undefined
      }
      replaceRouteSearch={(nextSearch) => {
        void navigate({
          hash: true,
          replace: true,
          resetScroll: false,
          search: (currentSearch) => replaceRootLogoRouteSearch(currentSearch, nextSearch),
          state: true,
          to: ".",
        });
      }}
      routeSearch={rootRouteSearch}
    />
  );
}

export function SignInForm({
  authPlacement,
  landingPageMarkdown,
  logo,
  topNotice,
}: SignInFormProps) {
  const rootRouteSearch = useRootRouteSearch();
  const landingDevModeEnabled = isLandingDevModeEnabled(rootRouteSearch);
  const [landingMarkdownDraft, setLandingMarkdownDraft] = useState(landingPageMarkdown);

  return (
    <div data-testid={PUBLIC_LANDING_SCROLL_SHELL_TEST_ID} className="flex min-h-0 flex-1 flex-col">
      <div className="container my-auto px-2">
        <div
          data-testid="public-landing-content"
          className={
            logo === "menger"
              ? "mx-auto my-auto flex max-w-[768px] flex-col gap-4"
              : "mx-auto my-auto flex max-w-[384px] flex-col gap-4"
          }
        >
          {topNotice}
          {logo === "menger" ? (
            <LandingHeroMenger placement="root" />
          ) : (
            <LandingPageLogo
              landingDevModeEnabled={landingDevModeEnabled}
              rootRouteSearch={rootRouteSearch}
            />
          )}
          <div
            className={logo === "menger" ? "text-center" : undefined}
            data-testid={PUBLIC_LANDING_COPY_TEST_ID}
          >
            <LandingCopy
              className="text-sm"
              editable={landingDevModeEnabled}
              markdown={landingMarkdownDraft}
              onChange={setLandingMarkdownDraft}
            />
          </div>
          {authPlacement === "inline" ? (
            <PublicLandingAuthControls oauthAuthFlow="current-route" />
          ) : null}
          <div className="flex flex-col gap-2 pt-2">
            <a
              className="text-center text-sm text-muted-foreground underline underline-offset-4"
              href="https://x.com/samebasecom"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://x.com/samebasecom
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
