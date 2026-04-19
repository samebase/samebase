import { PublicLandingLogo } from "@/components/PublicLandingLogo";
import {
  PUBLIC_LANDING_COPY_TEST_ID,
  PUBLIC_LANDING_SCROLL_SHELL_TEST_ID,
} from "@/lib/publicLanding";
import { type ReactNode } from "react";

type PublicLandingShellProps = {
  authControls?: ReactNode;
  closedState?: ReactNode;
  copy: ReactNode;
  enableViewSnapping?: boolean;
  footer: ReactNode;
  showGoogleSignupClosedState?: boolean;
  topNotice?: ReactNode;
  autoRotate?: boolean;
};

/**
 * Keep the public landing route on one shared DOM shape so build-time
 * prerender, client hydration, and the routed app all stay visually aligned.
 */
export function PublicLandingShell({
  authControls,
  closedState,
  copy,
  enableViewSnapping = true,
  footer,
  showGoogleSignupClosedState = false,
  topNotice,
  autoRotate = false,
}: PublicLandingShellProps) {
  return (
    <div
      data-testid={PUBLIC_LANDING_SCROLL_SHELL_TEST_ID}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="container my-auto">
        <div
          data-testid="public-landing-content"
          className="max-w-[384px] mx-auto flex flex-col my-auto gap-4 pb-8"
        >
          {topNotice}
          <PublicLandingLogo
            autoRotate={autoRotate}
            enableViewSnapping={enableViewSnapping}
            revealSceneOnInteractionOnly={!autoRotate}
          />
          {showGoogleSignupClosedState ? (
            closedState
          ) : (
            <>
              <div data-testid={PUBLIC_LANDING_COPY_TEST_ID}>{copy}</div>
              {authControls ? (
                <div className="flex flex-col gap-2">{authControls}</div>
              ) : null}
            </>
          )}
          {footer}
        </div>
      </div>
    </div>
  );
}
