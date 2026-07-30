import { LandingCopy } from "@/components/LandingCopy";
import { PublicLandingAuthControls } from "@/components/PublicLandingAuthControls";
import { PublicLandingLogo } from "@/components/logo/PublicLandingLogo";
import { LOGO_IDENTITY_VIEW_CONTRACTS } from "@/components/logo/logoStaticSvgContract";
import {
  useWorkspaceLayoutV2Selector,
  useWorkspacePaneState,
} from "@/components/workspace-layout-v2/WorkspacePaneRuntime";
import {
  WORKSPACE_LAYOUT_V2_MOBILE_MERGE_INTENT_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2Geometry";
import { clampNumber } from "@/lib/clampNumber";
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
  const { isMobile, mobileSurface, rightMobileWidthPx } = useWorkspacePaneState();
  const mobilePaneScrollProgress = useWorkspaceLayoutV2Selector(
    (state) => state.mobile.paneScrollProgress,
  );
  const mobileGrip = useWorkspaceLayoutV2Selector((state) => state.mobile.grip);
  const mobileMergeCommitWidthPx =
    WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX +
    WORKSPACE_LAYOUT_V2_MOBILE_MERGE_INTENT_WIDTH_PX;
  let presentationTiltNeutralProgress: number | undefined;
  if (isMobile && mobileGrip.kind === "dragging" && mobileGrip.side === "right") {
    presentationTiltNeutralProgress =
      mobileGrip.startSideWidthPx > mobileMergeCommitWidthPx
        ? clampNumber(
            (mobileGrip.startSideWidthPx - rightMobileWidthPx) /
              (mobileGrip.startSideWidthPx - mobileMergeCommitWidthPx),
            0,
            1,
          )
        : rightMobileWidthPx <= mobileMergeCommitWidthPx
          ? 1
          : undefined;
  } else if (isMobile && mobileSurface.kind === "merged" && mobileSurface.side === "right") {
    presentationTiltNeutralProgress = 1;
  }

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

export function SignInForm({ authPlacement, landingPageMarkdown, topNotice }: SignInFormProps) {
  const rootRouteSearch = useRootRouteSearch();
  const landingDevModeEnabled = isLandingDevModeEnabled(rootRouteSearch);
  const [landingMarkdownDraft, setLandingMarkdownDraft] = useState(landingPageMarkdown);

  return (
    <div data-testid={PUBLIC_LANDING_SCROLL_SHELL_TEST_ID} className="flex min-h-0 flex-1 flex-col">
      <div className="container my-auto px-2">
        <div
          data-testid="public-landing-content"
          className="max-w-[384px] mx-auto flex flex-col my-auto gap-4"
        >
          {topNotice}
          <LandingPageLogo
            landingDevModeEnabled={landingDevModeEnabled}
            rootRouteSearch={rootRouteSearch}
          />
          <div data-testid={PUBLIC_LANDING_COPY_TEST_ID}>
            <LandingCopy
              className="text-sm"
              editable={landingDevModeEnabled}
              markdown={landingMarkdownDraft}
              onChange={setLandingMarkdownDraft}
            />
          </div>
          {authPlacement === "inline" ? (
            <PublicLandingAuthControls googleAuthFlow="current-route" />
          ) : null}
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <a
              className="text-sm text-muted-foreground underline underline-offset-4"
              href="https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/What_is_a_progressive_web_app"
              rel="noopener noreferrer"
              target="_blank"
            >
              What is a PWA?
            </a>
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
