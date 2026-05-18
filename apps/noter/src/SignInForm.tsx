import { LandingCopy } from "@/components/LandingCopy";
import { PublicLandingAuthControls } from "@/components/PublicLandingAuthControls";
import { PublicLandingLogo } from "@/components/logo/PublicLandingLogo";
import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import { landingPageMarkdown } from "@/lib/landingCopy";
import {
  PUBLIC_LANDING_COPY_TEST_ID,
  PUBLIC_LANDING_SCROLL_SHELL_TEST_ID,
} from "@/lib/publicLanding";
import { shouldRenderGoogleSignupClosedState } from "@/lib/publicLandingAuthState";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import { Link, useLocation } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

type SignInFormProps = {
  authPlacement?: "inline" | "sidebar";
  topNotice?: ReactNode;
};

export function SignInForm({
  authPlacement = "inline",
  topNotice,
}: SignInFormProps = {}) {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const rootRouteSearch = useRootRouteSearch();
  const landingDevModeEnabled = isLandingDevModeEnabled(rootRouteSearch);
  const showGoogleSignupClosedState = shouldRenderGoogleSignupClosedState(
    pathname,
    rootRouteSearch,
  );
  const [landingMarkdownDraft, setLandingMarkdownDraft] =
    useState(landingPageMarkdown);

  return (
    <div
      data-testid={PUBLIC_LANDING_SCROLL_SHELL_TEST_ID}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="container my-auto px-2">
        <div
          data-testid="public-landing-content"
          className="max-w-[384px] mx-auto flex flex-col my-auto gap-4 pb-8"
        >
          {topNotice}
          <PublicLandingLogo
            autoRotate={landingDevModeEnabled}
            enableViewSnapping={!landingDevModeEnabled}
            themeColorSearch={rootRouteSearch}
          />
          {showGoogleSignupClosedState ? (
            <GoogleSignupClosedNotice />
          ) : (
            <>
              <div data-testid={PUBLIC_LANDING_COPY_TEST_ID}>
                <LandingCopy
                  className="text-sm"
                  editable={landingDevModeEnabled}
                  markdown={landingMarkdownDraft}
                  onChange={setLandingMarkdownDraft}
                />
              </div>
              {authPlacement === "inline" ? (
                <PublicLandingAuthControls />
              ) : null}
            </>
          )}
          <div className="flex flex-col gap-2 pt-2">
            <a
              className="text-center text-sm text-muted-foreground underline underline-offset-4"
              href="https://x.com/notermd"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://x.com/notermd
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleSignupClosedNotice() {
  return (
    <div className="flex flex-col gap-1 text-center">
      <h2 className="text-xl font-semibold tracking-tight">
        I'm sorry, signups are still just for a handful of people I know
        personally.
      </h2>

      <p className="text-sm text-muted-foreground">
        Please{" "}
        <a
          href="https://x.com/notermd"
          target="_blank"
          rel="noopener noreferrer"
        >
          follow us on twitter
        </a>{" "}
        or join the waitlist below.
      </p>

      <Link to="/home">go back</Link>
    </div>
  );
}
