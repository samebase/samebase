import type { ReactNode } from "react";

import { ActionsRunPage, COMMENT_Y, PullRequestPage, RUN_SECONDS } from "./github";
import {
  CONVEX_OAUTH,
  LIVE_SIGN_IN,
  LiveAppPage,
  NEW_APP_BUTTON,
  NEW_APP_INPUT,
  NewAppPage,
  OAuthPopup,
  OrgShell,
  OverviewPage,
  OVERVIEW,
  PROD_HOST,
  ProvidersPage,
  type ApiCheckState,
  type NameStatus,
} from "./samebase";
import { SIDEBAR_LINK_X, sidebarLinkY } from "./layout";
import { type Camera, cue, ease, glide, held, shoot, typed } from "./time";

/** What a step draws at `t`: the app's page, the pointer, the camera and the window's address. */
export type StepFrame = {
  page: ReactNode;
  cursor: { x: number; y: number; press: boolean; opacity: number };
  camera: Camera;
  domain: string;
  /** How many seconds of real time one second of the video shows, while time is compressed. */
  speed: number | null;
};

export type Step = {
  id: string;
  name: string;
  heading: string;
  body: string;
  dur: number;
  /**
  How the step comes in. "continue": it starts on the page, camera and pointer where the step
  before it ended, so it cuts with no fade. "dip": it starts on another page, so the old page fades
  out completely before the new one draws (html-demo's lagging view: never a double exposure).
  */
  enter: "continue" | "dip";
  view: (t: number) => StepFrame;
};

const SAMEBASE = "samebase.com";

/** The repository overview's main pane, framed from its header down. */
const OVERVIEW_TOP: Camera = { cx: 576, cy: 250, z: 1.76 };

/** The Convex row of Providers, with its buttons at the row's right edge. */
const CONVEX_ROW: Camera = { cx: 456, cy: 600, z: 1.5 };

/**
The connected Convex row, closer: from its logo to the check icons, so the 12 px mono API paths
read at about 23 px in 1080p.
*/
const CONVEX_CHECKS: Camera = { cx: 415, cy: 600, z: 1.72 };

/* 1. Connect ---------------------------------------------------------------------------------------- */

const C_CLICK = 1.55;
const C_POPUP_IN = 1.7;
const C_POPUP_OUT = 3.0;
const C_RELOAD = 3.1;
const C_CHECKS = [3.6, 3.85, 4.1] as const;

function connect(t: number): StepFrame {
  const connected = t >= C_RELOAD;
  const checks: readonly ApiCheckState[] = C_CHECKS.map((at) => (t >= at ? "ok" : "checking"));
  const popup = t >= C_POPUP_IN && t < C_POPUP_OUT + 0.2;
  const popupIn = ease(t, C_POPUP_IN, C_POPUP_IN + 0.25);
  const popupOut = 1 - ease(t, C_POPUP_OUT, C_POPUP_OUT + 0.18);
  const c = glide(
    t,
    [
      [0, 0, 560, 430],
      [0.45, 1.15, CONVEX_OAUTH.x, CONVEX_OAUTH.y],
      [1.9, 2.6, 640, 560],
      [3.3, 4.0, 700, 655],
    ],
    [C_CLICK],
  );
  return {
    page: (
      <OrgShell path="/org/acme/providers" current="Providers">
        <ProvidersPage convex={connected ? checks : "none"} oauthPressed={held(t, C_CLICK)} t={t} />
        {popup ? (
          <OAuthPopup opacity={Math.min(popupIn, popupOut)} lift={(1 - popupIn) * 12} />
        ) : null}
      </OrgShell>
    ),
    cursor: { ...c, opacity: 1 },
    camera: shoot(t, [
      [0, 0, { cx: 470, cy: 390, z: 1.3 }],
      [0.25, 1.5, CONVEX_ROW],
      [C_RELOAD + 0.05, C_RELOAD + 1.0, CONVEX_CHECKS],
    ]),
    domain: SAMEBASE,
    speed: null,
  };
}

/* 2. New App ------------------------------------------------------------------------------------------ */

const N_NAV = 1.15;
const N_PAGE = 1.3;
const N_FOCUS = 2.2;
const N_TYPE_FROM = 2.4;
const N_TYPE_TO = 2.9;
const N_CHECKING = 3.25;
const N_AVAILABLE = 3.75;
const N_CREATE = 4.3;
const N_CREATING = 4.4;
const N_OVERVIEW = 5.0;

function newApp(t: number): StepFrame {
  const c = glide(
    t,
    [
      [0, 0, 700, 655],
      [0.45, 1.0, SIDEBAR_LINK_X + 28, sidebarLinkY("New app")],
      [1.45, 2.05, NEW_APP_INPUT.x, NEW_APP_INPUT.y],
      [3.55, 4.1, NEW_APP_BUTTON.x + 30, NEW_APP_BUTTON.y],
      [5.1, 5.7, 760, 330],
    ],
    [N_NAV, N_FOCUS, N_CREATE],
  );
  const status: NameStatus = cue(
    t,
    [
      [N_CHECKING, "checking"],
      [N_AVAILABLE, "available"],
    ],
    "none",
  );
  const page =
    t < N_PAGE ? (
      <OrgShell
        path="/org/acme/providers"
        current="Providers"
        pressed={held(t, N_NAV) ? "New app" : null}
      >
        <ProvidersPage convex={["ok", "ok", "ok"]} oauthPressed={false} t={t} />
      </OrgShell>
    ) : t < N_OVERVIEW ? (
      <OrgShell path="/org/acme/new-app" current="New app">
        <NewAppPage
          name={typed("pantry", t, N_TYPE_FROM, N_TYPE_TO)}
          caret={t >= N_FOCUS + 0.08 && t < N_CREATE}
          status={status}
          creating={t >= N_CREATING}
          pressed={held(t, N_CREATE)}
          t={t}
        />
      </OrgShell>
    ) : (
      <OverviewPage phase="setting-up" t={t} />
    );
  return {
    page,
    cursor: { ...c, opacity: 1 },
    // The step starts on Connect's last frame: same page, camera and pointer.
    camera: shoot(t, [
      [0, 0, CONVEX_CHECKS],
      [0.4, 1.2, { cx: 930, cy: 330, z: 1.5 }],
      [1.35, 2.3, { cx: 330, cy: 220, z: 2.05 }],
      [N_OVERVIEW, N_OVERVIEW + 0.01, OVERVIEW_TOP],
    ]),
    domain: SAMEBASE,
    speed: null,
  };
}

/* 3. Deploy -------------------------------------------------------------------------------------------- */

const D_CLICK = 1.15;
const D_RUN = 1.3;
const D_DONE = 5.85;
const D_SPEED = RUN_SECONDS / (D_DONE - D_RUN);

function deploy(t: number): StepFrame {
  const c = glide(
    t,
    [
      [0, 0, 760, 330],
      [0.45, 1.0, OVERVIEW.actionsLink.x, OVERVIEW.actionsLink.y],
      [1.4, 2.0, 1060, 640],
    ],
    [D_CLICK],
  );
  const onGithub = t >= D_RUN;
  const elapsed = Math.min(RUN_SECONDS, Math.max(0, (t - D_RUN) * D_SPEED));
  return {
    page: onGithub ? (
      <ActionsRunPage elapsed={elapsed} t={t} />
    ) : (
      <OverviewPage phase="first-run" pressed={held(t, D_CLICK) ? "actions" : null} t={t} />
    ),
    cursor: { ...c, opacity: 1 - ease(t, 1.6, 2.0) },
    // Close enough that the step names read at about 22 px in 1080p: first the run's title, the
    // job's clock and the early steps; then down the list as the run gets there, ending on the
    // job's header and all fourteen steps.
    camera: onGithub
      ? shoot(t, [
          [0, 0, { cx: 418, cy: 380, z: 1.46 }],
          [D_RUN + 1.2, D_DONE - 0.4, { cx: 418, cy: 430, z: 1.46 }],
        ])
      : OVERVIEW_TOP,
    domain: "github.com",
    speed: onGithub && t < D_DONE ? D_SPEED : null,
  };
}

/* 4. Live ------------------------------------------------------------------------------------------------ */

const L_CLICK = 2.15;
const L_SITE = 2.3;

function live(t: number): StepFrame {
  const c = glide(
    t,
    [
      [0, 0, 860, 470],
      [1.3, 1.95, OVERVIEW.address.x, OVERVIEW.address.y],
      [2.9, 3.6, LIVE_SIGN_IN.x + 60, LIVE_SIGN_IN.y + 4],
    ],
    [L_CLICK],
  );
  const onSite = t >= L_SITE;
  return {
    page: onSite ? (
      <LiveAppPage hoverSignIn={t >= 3.55} />
    ) : (
      <OverviewPage phase="live" pressed={held(t, L_CLICK) ? "address" : null} t={t} />
    ),
    cursor: { ...c, opacity: ease(t, 0.6, 1.0) },
    // The starter's real page, framed on what a visitor acts on: "Todo list", "Sign in" and
    // "Continue as guest", with the lower part of its QR code above them.
    camera: onSite
      ? shoot(t, [
          [0, 0, { cx: 600, cy: 440, z: 1.62 }],
          [L_SITE + 0.2, 4.6, { cx: 600, cy: 500, z: 1.95 }],
        ])
      : shoot(t, [
          [0, 0, OVERVIEW_TOP],
          [0.45, 2.0, { cx: 576, cy: 268, z: 1.8 }],
        ]),
    domain: onSite ? PROD_HOST : SAMEBASE,
    speed: null,
  };
}

/* 5. Preview ---------------------------------------------------------------------------------------------- */

const P_COMMENT = 1.4;
const P_SAMEBASE = 3.6;
const P_CLICK = 4.75;
const P_EXPAND = 4.85;

function preview(t: number): StepFrame {
  const onSamebase = t >= P_SAMEBASE;
  const c = glide(
    t,
    [
      [0, 0, 700, 690],
      [P_SAMEBASE + 0.3, P_SAMEBASE + 0.95, OVERVIEW.prChevron.x, OVERVIEW.prChevron.y],
      [5.2, 5.9, 760, 715],
    ],
    [P_CLICK],
  );
  return {
    page: onSamebase ? (
      <OverviewPage
        phase="preview"
        expanded={t >= P_EXPAND}
        pressed={held(t, P_CLICK) ? "chevron" : null}
        t={t}
      />
    ) : (
      <PullRequestPage
        comment={ease(t, P_COMMENT, P_COMMENT + 0.35)}
        checksDone={t >= P_COMMENT}
        t={t}
      />
    ),
    cursor: { ...c, opacity: onSamebase ? ease(t, P_SAMEBASE, P_SAMEBASE + 0.3) : 0 },
    camera: onSamebase
      ? shoot(t, [
          [0, 0, { cx: 576, cy: 480, z: 1.76 }],
          [P_EXPAND, P_EXPAND + 1.0, { cx: 576, cy: 560, z: 1.76 }],
        ])
      : shoot(t, [
          [0, 0, { cx: 418, cy: 330, z: 1.45 }],
          [P_COMMENT + 0.3, P_COMMENT + 1.5, { cx: 400, cy: COMMENT_Y + 110, z: 1.85 }],
        ]),
    domain: onSamebase ? SAMEBASE : "github.com",
    speed: null,
  };
}

/*
The captions are the landing page's five steps, word for word (LANDING_STEPS in
apps/samebase/src/components/LandingPreviewPage.tsx).
*/
export const STEPS = [
  {
    id: "connect",
    name: "Connect",
    heading: "Connect GitHub and Convex.",
    body: "One OAuth token, no expiry, nothing to paste.",
    dur: 6.0,
    enter: "dip",
    view: connect,
  },
  {
    id: "new-app",
    name: "New App",
    heading: "Create an app.",
    body: "Samebase creates the repository and writes CONVEX_ACCESS_TOKEN into it.",
    dur: 5.8,
    enter: "continue",
    view: newApp,
  },
  {
    id: "deploy",
    name: "Deploy",
    heading: "The first push deploys.",
    body: "Alchemy creates the Convex project and the site. About 90 seconds.",
    dur: 7.0,
    enter: "continue",
    view: deploy,
  },
  {
    id: "live",
    name: "Live",
    heading: "Samebase reads the state.",
    body: "URL, deployed commit, checks, and pull requests, from alchemy-state-store.",
    dur: 5.8,
    enter: "dip",
    view: live,
  },
  {
    id: "preview",
    name: "Preview",
    heading: "Every pull request deploys too.",
    body: "Its own deployment and data, deleted when the pull request closes.",
    dur: 6.8,
    enter: "dip",
    view: preview,
  },
] as const satisfies readonly Step[];

export const STEPS_SECONDS = STEPS.reduce((sum, step) => sum + step.dur, 0);
