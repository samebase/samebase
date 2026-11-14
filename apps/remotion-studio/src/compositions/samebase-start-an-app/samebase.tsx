import { loadFont as loadArimo } from "@remotion/google-fonts/Arimo";
import { loadFont as loadCousine } from "@remotion/google-fonts/Cousine";
import { loadFont as loadGoogleSans } from "@remotion/google-fonts/GoogleSans";
import type { CSSProperties, ReactNode } from "react";
import { Img, staticFile } from "remotion";

import {
  ArrowLeft,
  ArrowRight,
  Building,
  Check,
  ChevronDown,
  CircleCheck,
  ConvexLogo,
  ExternalLink,
  FolderPlus,
  GithubIcon,
  Loader,
  MoreHorizontal,
  PanelLeft,
  RotateCw,
  User,
} from "./icons";
import { abs, ORG_LINKS, type OrgLink, SIDEBAR_X, sidebarLinkY } from "./layout";
import { spin } from "./time";

/*
Samebase's pages, drawn at 1200 x 750 from the real components:
- Providers: apps/samebase/src/organization/providers/ProviderConnectionsPage.tsx
- New App: apps/samebase/src/repository/setup/NewAppPage.tsx
- Repository overview: apps/samebase/src/repository/dashboard/RepositoryOverviewPage.tsx,
  RepositoryEnvironmentTree.tsx, RepositoryPullRequestsSection.tsx, RepositorySetupStackStatus.tsx
- Shell: apps/samebase/src/components/AppRightSidebar.tsx, the route bar in the visual fixtures
Sizes are the Tailwind classes of those components. Colors are the tokens of
apps/samebase/src/index.css. The font is Liberation Sans there; Arimo has the same metrics.
*/

// Liberation Sans has only regular and bold, so font-medium draws regular and font-semibold bold.
export const SANS = loadArimo("normal", { weights: ["400", "700"], subsets: ["latin"] }).fontFamily;
export const MONO = loadCousine("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
/** The starter's own font (samebase/base src/style.css imports Google Sans 500). */
const STARTER_SANS = loadGoogleSans("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
}).fontFamily;

export const C = {
  fg: "#0c0a09",
  muted: "#78716c",
  border: "#e7e5e4",
  primary: "#394447",
  primaryFg: "#fafaf9",
  mutedBg: "#f5f5f4",
  emerald700: "#047857",
  emerald600: "#059669",
  green600: "#16a34a",
  amber700: "#b45309",
  amber600: "#d97706",
  destructive: "#ef4444",
  blue600: "#2563eb",
} as const;

const page: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "#ffffff",
  color: C.fg,
  fontFamily: SANS,
  fontSize: 14,
  lineHeight: "20px",
  overflow: "hidden",
};

const underline = (color: string): CSSProperties => ({
  textDecorationLine: "underline",
  textDecorationColor: color,
  textUnderlineOffset: 4,
});

/** The app's route bar: back, forward, reload and the path, as the visual fixtures show it. */
function RouteBar({ path }: { path: string }) {
  return (
    <div
      style={{
        ...abs(0, 0, 1200, 28),
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        background: "#fff",
      }}
    >
      <ArrowLeft size={16} color="#a8a29e" style={{ position: "absolute", left: 10 }} />
      <ArrowRight size={16} color="#d6d3d1" style={{ position: "absolute", left: 42 }} />
      <RotateCw size={16} color="#57534e" style={{ position: "absolute", left: 74 }} />
      <span
        style={{ position: "absolute", left: 104, fontFamily: MONO, fontSize: 16, color: C.fg }}
      >
        {path}
      </span>
    </div>
  );
}

function SidebarLink({
  children,
  current = false,
  pressed = false,
  y,
}: {
  children: ReactNode;
  current?: boolean;
  pressed?: boolean;
  y: number;
}) {
  return (
    <span
      style={{
        ...abs(SIDEBAR_X + 13, y - 12),
        fontSize: 16,
        lineHeight: "24px",
        padding: current ? "0 6px" : 0,
        marginLeft: current ? -6 : 0,
        background: current ? C.primary : pressed ? C.mutedBg : "transparent",
        color: current ? "#fff" : C.fg,
        ...underline(current ? "#fff" : C.fg),
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** The standard right sidebar of an organization page (AppRightSidebar.tsx). */
function RightSidebar({ current, pressed }: { current: OrgLink | null; pressed: OrgLink | null }) {
  return (
    <div style={{ ...abs(SIDEBAR_X, 28, 288, 722), borderLeft: `1px solid ${C.border}` }}>
      <div style={{ ...abs(16, 14), display: "flex", alignItems: "center", gap: 10 }}>
        <User size={16} color={C.fg} />
        <span style={{ fontSize: 14 }}>Ava Chen</span>
      </div>
      <span style={{ ...abs(150, 60), fontSize: 16, lineHeight: "24px", ...underline(C.fg) }}>
        Account settings
      </span>
      <div style={{ ...abs(0, 101, 288, 0), borderTop: `1px solid ${C.border}` }} />
      <span style={{ ...abs(13, 113), fontSize: 16, lineHeight: "24px", ...underline(C.fg) }}>
        All repositories
      </span>
      <span style={{ ...abs(13, 149), fontSize: 16, lineHeight: "24px", ...underline(C.fg) }}>
        Organizations
      </span>
      <div style={{ ...abs(0, 186, 288, 0), borderTop: `1px solid ${C.border}` }} />
      <span style={{ ...abs(13, 202), fontSize: 14 }}>acme</span>
      <div style={{ ...abs(0, 238, 288, 0), borderTop: `1px solid ${C.border}` }} />
      <div style={{ position: "absolute", left: -SIDEBAR_X, top: -28 }}>
        {ORG_LINKS.map((link) => (
          <SidebarLink
            key={link}
            current={link === current}
            pressed={link === pressed}
            y={sidebarLinkY(link)}
          >
            {link}
          </SidebarLink>
        ))}
      </div>
      <div style={{ ...abs(0, 532, 288, 0), borderTop: `1px solid ${C.border}` }} />
      <div style={{ ...abs(9, 560), display: "flex", gap: 12, fontSize: 16, lineHeight: "24px" }}>
        <span style={underline(C.fg)}>/x.com</span>
        <span style={{ color: "#ff0000", ...underline("#ff0000") }}>/YouTube</span>
      </div>
      {["/terms", "/privacy", "/pricing", "/landing"].map((label, i) => (
        <span
          key={label}
          style={{
            ...abs(9, 596 + i * 36),
            fontSize: 16,
            lineHeight: "24px",
            color: C.muted,
            ...underline(C.muted),
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/** The shell of an organization page: the route bar, the page and the right sidebar. */
export function OrgShell({
  path,
  current,
  pressed = null,
  children,
}: {
  path: string;
  current: OrgLink | null;
  pressed?: OrgLink | null;
  children: ReactNode;
}) {
  return (
    <div style={page}>
      <RouteBar path={path} />
      <PanelLeft size={16} color={C.fg} style={{ position: "absolute", left: 888, top: 37 }} />
      {children}
      <RightSidebar current={current} pressed={pressed} />
    </div>
  );
}

/* Providers ------------------------------------------------------------------------------------ */

const PROVIDERS_X = 72;
const COL_X = PROVIDERS_X + 32;
const ROW_RIGHT = PROVIDERS_X + 768;
const CONVEX_ROW_Y = 560;

/** The Convex OAuth button of the Convex row, for the pointer. */
export const CONVEX_OAUTH = { x: ROW_RIGHT - 108 - 8 - 58, y: CONVEX_ROW_Y + 18 } as const;

export type ApiCheckState = "checking" | "ok";

function ApiChecks({
  y,
  checks,
  t,
}: {
  y: number;
  checks: readonly (readonly [target: string, state: ApiCheckState])[];
  t: number;
}) {
  return (
    <div style={abs(COL_X, y, ROW_RIGHT - COL_X - 76)}>
      <div>API checks</div>
      <div style={{ marginTop: 4 }}>
        {checks.map(([target, state], i) => (
          <div
            key={target}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 29,
              borderTop: i === 0 ? "none" : `1px solid rgba(231,229,228,0.5)`,
            }}
          >
            <code style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>GET {target}</code>
            {state === "ok" ? (
              <CircleCheck size={14} color={C.emerald700} />
            ) : (
              <Loader size={14} color={C.muted} angle={spin(t)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProviderRowHead({
  y,
  icon,
  label,
  menu,
}: {
  y: number;
  icon: ReactNode;
  label: string;
  menu: boolean;
}) {
  return (
    <>
      <div
        style={{
          ...abs(PROVIDERS_X, y, 20, 20),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <div style={abs(COL_X, y)}>{label}</div>
      {menu ? (
        <MoreHorizontal
          size={16}
          color={C.fg}
          style={{ position: "absolute", left: ROW_RIGHT - 24, top: y + 8 }}
        />
      ) : null}
    </>
  );
}

function TargetStatus({ y, name, detail }: { y: number; name: string; detail: ReactNode }) {
  return (
    <div style={abs(COL_X, y)}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 16, lineHeight: "20px" }}
      >
        <span style={{ fontWeight: 700, ...underline(C.fg) }}>{name}</span>
        <ExternalLink size={14} color={C.fg} />
      </div>
      <div style={{ marginTop: 2, fontSize: 12, lineHeight: "16px", color: C.muted }}>{detail}</div>
    </div>
  );
}

const PERMISSIONS = [
  "administration.write",
  "checks.read",
  "contents.write",
  "members.read",
  "metadata.read",
  "pull_requests.write",
  "statuses.read",
  "workflows.write",
] as const;

/** The Providers page: GitHub connected; Convex before and after its OAuth connection. */
export function ProvidersPage({
  convex,
  oauthPressed,
  t,
}: {
  convex: "none" | readonly ApiCheckState[];
  oauthPressed: boolean;
  t: number;
}) {
  const gh = 108;
  return (
    <>
      <div style={{ ...abs(PROVIDERS_X, 52), fontSize: 24, lineHeight: "32px", fontWeight: 700 }}>
        Providers
      </div>

      <ProviderRowHead y={gh} icon={<GithubIcon size={16} color={C.fg} />} label="GitHub" menu />
      <TargetStatus y={gh + 24} name="acme" detail="Organization · GitHub App" />
      <div style={abs(COL_X, gh + 78)}>
        <div>Permissions</div>
        <ul style={{ margin: 0, paddingLeft: 20, listStyle: "disc" }}>
          {PERMISSIONS.map((p) => (
            <li
              key={p}
              style={{ fontFamily: MONO, fontSize: 12, lineHeight: "20px", color: C.muted }}
            >
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div style={abs(COL_X, gh + 274)}>
        <div>Repository access</div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>all</div>
      </div>
      <ApiChecks
        y={gh + 330}
        t={t}
        checks={[
          ["/installation/repositories", "ok"],
          ["/app/installations/{installation_id}", "ok"],
        ]}
      />
      <div
        style={{
          ...abs(PROVIDERS_X, CONVEX_ROW_Y - 20, 768, 0),
          borderTop: `1px solid rgba(231,229,228,0.5)`,
        }}
      />

      <ProviderRowHead
        y={CONVEX_ROW_Y}
        icon={<ConvexLogo size={16} />}
        label="Convex"
        menu={convex !== "none"}
      />
      {convex === "none" ? (
        <>
          <div style={abs(COL_X, CONVEX_ROW_Y + 24)}>No team configured.</div>
          <div
            style={{
              ...abs(CONVEX_OAUTH.x - 58, CONVEX_ROW_Y, 116, 36),
              background: oauthPressed ? "#2b3335" : C.primary,
              color: C.primaryFg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: oauthPressed ? "translateY(1px)" : "none",
            }}
          >
            Convex OAuth
          </div>
          <div
            style={{
              ...abs(ROW_RIGHT - 108, CONVEX_ROW_Y, 108, 36),
              color: C.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Use API key
          </div>
        </>
      ) : (
        <>
          <TargetStatus
            y={CONVEX_ROW_Y + 24}
            name="acme-platform"
            detail={
              <>
                Team · OAuth · Connected by <span style={{ color: C.fg }}>Ava Chen</span>
              </>
            }
          />
          <ApiChecks
            y={CONVEX_ROW_Y + 78}
            t={t}
            checks={[
              ["/token_details", convex[0] ?? "checking"],
              ["/teams/{team_id}/projects", convex[1] ?? "checking"],
              ["/teams/{team_id}/list_deployments", convex[2] ?? "checking"],
            ]}
          />
        </>
      )}
    </>
  );
}

/** The OAuth popup that Convex OAuth opens at Convex, drawn as a small window over the page. */
export function OAuthPopup({ opacity, lift }: { opacity: number; lift: number }) {
  return (
    <div
      style={{
        ...abs(400, 360 + lift, 420, 370),
        opacity,
        background: "#fff",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 0 0 0.5px rgba(0,0,0,0.25), 0 24px 60px rgba(0,0,0,0.28)",
        zIndex: 40,
      }}
    >
      <div
        style={{
          height: 30,
          background: "#ececec",
          borderBottom: "1px solid #d6d6d6",
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          gap: 6,
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c }} />
        ))}
        <span
          style={{
            flex: 1,
            textAlign: "center",
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 12,
            color: "#4b4b4b",
            marginRight: 40,
          }}
        >
          dashboard.convex.dev
        </span>
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 48 }}
      >
        <ConvexLogo size={64} />
        <div style={{ marginTop: 40, width: 300, display: "grid", gap: 12 }}>
          <div style={{ height: 12, width: "80%", background: "#eeeeee" }} />
          <div style={{ height: 12, width: "60%", background: "#eeeeee" }} />
          <div style={{ height: 40, marginTop: 24, background: "#e9e9e9" }} />
        </div>
      </div>
    </div>
  );
}

/* New App ---------------------------------------------------------------------------------------- */

const FORM_X = 72;
const FORM_W = 448;
/** The repository name field and the New App button, for the pointer. */
export const NEW_APP_INPUT = { x: FORM_X + 200, y: 228 } as const;
export const NEW_APP_BUTTON = { x: FORM_X + FORM_W / 2, y: 352 } as const;

export type NameStatus = "none" | "checking" | "available";

/** The New App page with Convex connected, typing a repository name and creating the app. */
export function NewAppPage({
  name,
  caret,
  status,
  creating,
  pressed,
  t,
}: {
  name: string;
  caret: boolean;
  status: NameStatus;
  creating: boolean;
  pressed: boolean;
  t: number;
}) {
  const enabled = status === "available" && !creating;
  return (
    <div style={abs(FORM_X, 52, FORM_W)}>
      <div style={{ fontSize: 24, lineHeight: "32px", fontWeight: 700 }}>New App</div>
      <div
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          lineHeight: "16px",
          color: C.muted,
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ConvexLogo size={16} />
        </span>
        Connected to team acme-platform.
      </div>
      <div style={{ marginTop: 16, fontSize: 12, lineHeight: "20px", color: C.muted }}>
        Samebase saves the organization&apos;s Convex token as the repository secret
        CONVEX_ACCESS_TOKEN. GitHub Actions run Alchemy and deploy the app to Convex.
      </div>
      <div
        style={{
          marginTop: 16,
          height: 36,
          border: `1px solid ${caret ? "#a8a29e" : C.border}`,
          boxShadow: caret ? "0 0 0 3px rgba(168,162,158,0.35)" : "none",
          display: "flex",
          alignItems: "center",
          paddingLeft: 36,
          position: "relative",
        }}
      >
        <GithubIcon size={16} color={C.muted} style={{ position: "absolute", left: 12 }} />
        {name ? (
          <span style={{ color: C.fg }}>{name}</span>
        ) : (
          <span style={{ color: C.muted }}>GitHub repository name</span>
        )}
        {caret ? (
          <span
            style={{
              width: 1.5,
              height: 18,
              background: C.fg,
              marginLeft: name ? 1 : -150,
              opacity: Math.floor(t * 2) % 2 === 0 || name.length > 0 ? 1 : 0,
            }}
          />
        ) : null}
      </div>
      <div style={{ marginTop: 8, minHeight: 16, fontSize: 12, lineHeight: "16px" }}>
        {status === "checking" ? (
          <span style={{ display: "flex", gap: 6, color: C.muted, alignItems: "center" }}>
            <Loader size={14} color={C.muted} angle={spin(t)} />
            Checking GitHub repository...
          </span>
        ) : status === "available" ? (
          <span style={{ display: "flex", gap: 6, color: C.green600, alignItems: "center" }}>
            <Check size={14} color={C.green600} />
            GitHub repository name is available.
          </span>
        ) : null}
      </div>
      <div style={{ marginTop: 16, minHeight: 20 }} />
      <div
        style={{
          marginTop: 16,
          height: 36,
          background: pressed ? "#2b3335" : C.primary,
          opacity: enabled || creating ? (creating ? 0.5 : 1) : 0.5,
          color: C.primaryFg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          transform: pressed ? "translateY(1px)" : "none",
        }}
      >
        {creating ? <Loader size={16} color={C.primaryFg} angle={spin(t)} /> : null}
        {creating ? "Creating app..." : "New App"}
      </div>
    </div>
  );
}

/* Repository overview ----------------------------------------------------------------------------- */

// The left pane and the right sidebar are both open, so the main pane is 672 px wide and its
// container (under @3xl) keeps the px-4 padding.
const MAIN_X = 240;
const CONTENT_X = 256;
const CONTENT_R = 896;

export type OverviewPhase = "setting-up" | "first-run" | "live" | "preview";

/** Link and button positions on the overview, for the pointer. */
export const OVERVIEW = {
  actionsLink: { x: CONTENT_X + 334, y: 160 },
  address: { x: CONTENT_X + 100, y: 242 },
  prChevron: { x: CONTENT_R - 8, y: 534 },
} as const;

function ChecksTrigger({ state, t }: { state: "pending" | "passed"; t: number }) {
  const color = state === "passed" ? C.emerald600 : C.amber700;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color,
        textDecorationLine: "underline",
        textDecorationColor: "rgba(120,113,108,0.4)",
        textUnderlineOffset: 4,
      }}
    >
      {state === "passed" ? (
        <CircleCheck size={16} color={color} />
      ) : (
        <Loader size={16} color={color} angle={spin(t)} />
      )}
      {state === "passed" ? "3/3 passed" : "3/3 pending"}
    </span>
  );
}

function LeftPane({ phase, t }: { phase: OverviewPhase; t: number }) {
  return (
    <div style={{ ...abs(0, 28, MAIN_X, 722), borderRight: `1px solid ${C.border}` }}>
      <div style={{ ...abs(12, 2) }}>Repositories</div>
      <div style={{ ...abs(12, 48), display: "flex", alignItems: "center", gap: 8 }}>
        <Building size={16} color={C.muted} />
        <span>acme</span>
      </div>
      <ChevronDown size={16} color={C.fg} style={{ position: "absolute", left: 188, top: 50 }} />
      <FolderPlus size={16} color={C.fg} style={{ position: "absolute", left: 215, top: 50 }} />
      <div style={{ ...abs(20, 78, 0, 82), borderLeft: `1px solid ${C.border}` }} />
      <span
        style={{
          ...abs(28, 88),
          padding: "1px 6px",
          background: C.primary,
          color: "#fff",
        }}
      >
        pantry
      </span>
      <div
        style={{
          ...abs(34, 116),
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: C.muted,
        }}
      >
        {phase === "setting-up" ? (
          <>
            <Loader size={12} color={C.amber600} angle={spin(t)} />
            Setting up
          </>
        ) : phase === "first-run" ? (
          <>
            <span style={{ width: 8, height: 8, background: C.amber600 }} />
            3/3 pending
          </>
        ) : (
          <>
            <span style={{ width: 8, height: 8, background: "#10b981" }} />
            3/3 passed
            {phase === "preview" ? <span style={{ marginLeft: -2 }}>· 1 PR</span> : null}
          </>
        )}
      </div>
    </div>
  );
}

function StackCard({
  y,
  host,
  commit,
  deployment,
  pressedAddress = false,
}: {
  y: number;
  host: string;
  commit: string;
  deployment: string;
  pressedAddress?: boolean;
}) {
  return (
    <div style={{ ...abs(CONTENT_X, y, CONTENT_R - CONTENT_X), border: `1px solid ${C.border}` }}>
      <div style={{ position: "relative", padding: "12px 4px 4px 12px", height: 80 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: 32,
            color: pressedAddress ? C.fg : C.muted,
          }}
        >
          <span style={underline(C.border)}>{host}</span>
          <ExternalLink size={12} color="currentColor" />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 32,
            fontSize: 12,
            color: C.muted,
          }}
        >
          <span style={{ fontFamily: MONO }}>{commit}</span>
          <span>just now</span>
        </div>
        <div
          style={{
            position: "absolute",
            right: 4,
            top: 12,
            width: 32,
            height: 32,
            opacity: 0.7,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ConvexLogo size={16} />
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "0 12px" }}>
        <div style={{ display: "flex", alignItems: "center", height: 44, gap: 10 }}>
          <span style={{ width: 20, display: "flex", justifyContent: "center" }}>
            <ConvexLogo size={16} />
          </span>
          <span style={underline(C.border)}>{deployment}</span>
          <ExternalLink size={12} color={C.muted} style={{ marginLeft: -6 }} />
          <MoreHorizontal size={16} color={C.fg} style={{ marginLeft: 8 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", height: 40, color: C.muted }}>
          Google sign-in: on
        </div>
      </div>
    </div>
  );
}

const COMMIT = "a1f9c3e";
const COMMIT_TITLE = "Initialize app from Samebase starter build v2210";
export const PROD_HOST = "tidy-otter-438.convex.site";
export const PREVIEW_HOST = "brave-lynx-207.convex.site";

/** The repository overview of acme/pantry, from setup to a live app with a pull request. */
export function OverviewPage({
  phase,
  expanded = false,
  pressed = null,
  t,
}: {
  phase: OverviewPhase;
  expanded?: boolean;
  pressed?: "actions" | "address" | "chevron" | null;
  t: number;
}) {
  const branchY = phase === "first-run" ? 202 : 150;
  const live = phase === "live" || phase === "preview";
  const prY = phase === "first-run" ? 306 : 430;
  return (
    <div style={page}>
      <RouteBar path="/repo/acme/pantry" />
      <LeftPane phase={phase} t={t} />
      <PanelLeft
        size={16}
        color={C.fg}
        style={{ position: "absolute", left: MAIN_X + 8, top: 37 }}
      />
      <PanelLeft size={16} color={C.fg} style={{ position: "absolute", left: 888, top: 37 }} />
      <RightSidebar current={null} pressed={null} />
      <div
        style={{ ...abs(MAIN_X, 118, SIDEBAR_X - MAIN_X, 0), borderTop: `1px solid ${C.border}` }}
      />
      <div
        style={{
          ...abs(CONTENT_X, 78),
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 16,
          lineHeight: "24px",
        }}
      >
        <GithubIcon size={16} color={C.fg} />
        <span style={underline(C.fg)}>
          <span style={{ color: C.muted }}>acme/</span>
          <span style={{ fontWeight: 700 }}>pantry</span>
        </span>
      </div>
      <div
        style={{
          ...abs(CONTENT_R - 92, 72, 92, 32),
          border: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: phase === "setting-up" ? 0.5 : 1,
        }}
      >
        Disconnect
      </div>

      {phase === "setting-up" ? (
        <div style={{ ...abs(CONTENT_X, 158), display: "flex", alignItems: "center", gap: 12 }}>
          <Loader size={16} color={C.muted} angle={spin(t)} />
          <span>Setting up</span>
        </div>
      ) : (
        <>
          {phase === "first-run" ? (
            <div style={{ ...abs(CONTENT_X, 150), color: C.muted }}>
              No successful deployment recorded yet. Check{" "}
              <span
                style={{
                  color: C.fg,
                  ...underline(C.fg),
                  background: pressed === "actions" ? C.mutedBg : "transparent",
                }}
              >
                GitHub Actions
              </span>
              .
            </div>
          ) : null}
          <div
            style={{
              ...abs(CONTENT_X, branchY, CONTENT_R - CONTENT_X, 32),
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 12, color: C.muted, display: "flex", gap: 10 }}>
              <span>main</span>
              <span>{live ? "2m ago" : "just now"}</span>
            </span>
            <ChecksTrigger state={live ? "passed" : "pending"} t={t} />
          </div>
          <div style={{ ...abs(CONTENT_X, branchY + 32), ...underline(C.border) }}>
            <span style={{ fontFamily: MONO, color: C.muted }}>{COMMIT}</span> {COMMIT_TITLE}
          </div>
          {live ? (
            <StackCard
              y={branchY + 64}
              host={PROD_HOST}
              commit={COMMIT}
              deployment="tidy-otter-438"
              pressedAddress={pressed === "address"}
            />
          ) : null}
          <div
            style={{
              ...abs(CONTENT_X, prY),
              fontSize: 12,
              lineHeight: "16px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: C.muted,
            }}
          >
            {phase === "preview" ? "1 open pull request" : "No open pull requests"}
          </div>
          <div
            style={{
              ...abs(CONTENT_X, prY + 28, CONTENT_R - CONTENT_X, 0),
              borderTop: `1px solid ${C.border}`,
            }}
          />
          {phase === "preview" ? (
            <>
              <div
                style={{
                  ...abs(CONTENT_X, prY + 36, CONTENT_R - CONTENT_X, 32),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 12, color: C.muted, display: "flex", gap: 10 }}>
                  <span>expiry-dates</span>
                  <span>just now</span>
                </span>
                <ChecksTrigger state="passed" t={t} />
              </div>
              <div style={{ ...abs(CONTENT_X, prY + 68), ...underline(C.border) }}>
                <span style={{ color: C.muted }}>#1</span> Add expiry dates
              </div>
              <div
                style={{
                  ...abs(CONTENT_X, prY + 88, 300, 32),
                  display: "flex",
                  alignItems: "center",
                  fontSize: 12,
                  gap: 4,
                  ...underline(C.border),
                }}
              >
                <span style={{ color: C.emerald600 }}>+48</span>
                <span style={{ color: C.destructive }}>−3</span>
                <span style={{ color: C.muted }}>2 files</span>
              </div>
              <div
                style={{
                  ...abs(OVERVIEW.prChevron.x - 16, OVERVIEW.prChevron.y - 16, 32, 32),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: pressed === "chevron" ? C.fg : C.muted,
                }}
              >
                <ChevronDown
                  size={16}
                  color="currentColor"
                  style={{ transform: expanded ? "rotate(180deg)" : "none" }}
                />
              </div>
              {expanded ? (
                <StackCard
                  y={prY + 132}
                  host={PREVIEW_HOST}
                  commit="b7e2d10"
                  deployment="brave-lynx-207"
                />
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

/* The live app ------------------------------------------------------------------------------------ */

/**
The starter's home page (samebase/base src/routes/index.tsx) signed out: the QR code of its own
URL, "Todo list", the hub's "Sign in" and "Continue as guest". The QR code is the starter's own
qrcode.react output for the example URL, rendered once into public/media.
*/
export function LiveAppPage({ hoverSignIn }: { hoverSignIn: boolean }) {
  const x = 328;
  const w = 544;
  return (
    <div style={{ ...page, fontFamily: STARTER_SANS }}>
      <div style={{ ...abs(312, 8), display: "flex", gap: 4, fontSize: 14, fontWeight: 500 }}>
        <span style={{ padding: "8px 10px", ...underline("#171717") }}>Home</span>
        <span style={{ padding: "8px 10px" }}>About</span>
      </div>
      <Img
        src={staticFile("media/samebase-start-an-app/live-qr.svg")}
        style={abs(408, 60, 384, 384)}
      />
      <div style={{ ...abs(x, 468), fontSize: 18, lineHeight: "28px" }}>Todo list</div>
      <div
        style={{
          ...abs(x, 508, w, 36),
          background: hoverSignIn ? "rgba(23,23,23,0.85)" : "#171717",
          color: "#fafafa",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 500,
        }}
      >
        Sign in
      </div>
      <div
        style={{
          ...abs(x, 556, w, 40),
          border: "1px solid #e5e5e5",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 500,
        }}
      >
        Continue as guest
      </div>
    </div>
  );
}

export const LIVE_SIGN_IN = { x: 600, y: 526 } as const;
