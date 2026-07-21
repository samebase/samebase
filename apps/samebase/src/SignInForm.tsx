import { LandingCopy } from "@/components/LandingCopy";
import { PublicLandingAuthControls } from "@/components/PublicLandingAuthControls";
import { PublicLandingLogo } from "@/components/logo/PublicLandingLogo";
import { LOGO_IDENTITY_VIEW_CONTRACTS } from "@/components/logo/logoStaticSvgContract";
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

export function SignInForm({ authPlacement, landingPageMarkdown, topNotice }: SignInFormProps) {
  const navigate = useNavigate();
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
          <PublicLandingLogo
            animateLeftFaceStripes
            autoRotate={landingDevModeEnabled}
            defaultView={LANDING_LOGO_STARTING_VIEW}
            enablePointerTilt
            enableViewSnapping={!landingDevModeEnabled}
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
          <div data-testid={PUBLIC_LANDING_COPY_TEST_ID}>
            <LandingCopy
              className="text-sm"
              editable={landingDevModeEnabled}
              markdown={landingMarkdownDraft}
              onChange={setLandingMarkdownDraft}
            />
          </div>
          {authPlacement === "inline" ? <PublicLandingAuthControls /> : null}
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
