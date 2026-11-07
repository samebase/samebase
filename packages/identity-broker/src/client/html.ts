/** The few pages the broker renders itself. Plain HTML, one stylesheet, no script. */

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The button colors of a provider follow its sign-in branding: Google's are those of its own
// "Continue with Google" button, in light and dark.
const STYLE = `
  :root { color-scheme: light dark; --fg: #18181b; --muted: #71717a; --bg: #f4f4f5; --card: #fff;
    --line: #e4e4e7; --button: #fff; --button-line: #747775; --button-fg: #1f1f1f;
    --button-hover: #f2f2f2; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #fafafa; --muted: #a1a1aa; --bg: #09090b; --card: #18181b; --line: #27272a;
      --button: #131314; --button-line: #8e918f; --button-fg: #e3e3e3; --button-hover: #1f1f20; }
  }
  body { margin: 0; min-height: 100svh; display: grid; place-items: center; color: var(--fg);
    background: var(--bg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .frame { width: calc(100% - 2rem); max-width: 25rem; margin: 1.5rem 0; }
  main { box-sizing: border-box; padding: 2rem 1.75rem 1.5rem; background: var(--card);
    border: 1px solid var(--line); border-radius: 16px; }
  h1 { margin: 0; font-size: 1.25rem; line-height: 1.35; font-weight: 400;
    letter-spacing: -0.01em; overflow-wrap: anywhere; }
  h1 strong { font-weight: 600; }
  .host { font-weight: 600; text-decoration-color: var(--line); }
  .host:hover { text-decoration-color: currentColor; }
  /* Inset a little, so the links do not stand out past the card's round corners. */
  .below { display: flex; gap: 1rem; align-items: center; margin-top: 0.75rem; padding: 0 8px;
    font-size: 0.75rem; }
  .below a { padding: 0.25rem 0; color: var(--muted); text-decoration: none; }
  .below a:hover { color: var(--fg); }
  .attribution { margin-left: auto; }
  .attribution svg { width: 0.75em; height: 0.75em; margin-right: 0.15em; vertical-align: baseline; }
  p { margin: 0; }
  ::selection { color: var(--card); background: var(--fg); }
  a { color: inherit; text-underline-offset: 0.2em; text-decoration-thickness: 1px; }
  a:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
  .label { display: inline-block; max-width: 100%; }
  .sub { margin-top: 0.375rem; color: var(--muted); font-size: 0.875rem; overflow-wrap: anywhere; }
  .actions { display: grid; gap: 0.5rem; margin-top: 1.75rem; }
  a.button { display: flex; align-items: center; justify-content: center; gap: 0.625rem;
    box-sizing: border-box; min-height: 2.75rem; padding: 0 1rem; color: var(--button-fg);
    background: var(--button); border: 1px solid var(--button-line); border-radius: 999px;
    font-weight: 500; text-decoration: none; }
  a.button:hover { background: var(--button-hover); }
  a.button svg { width: 18px; height: 18px; flex: none; }
  .fine { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--line);
    color: var(--muted); font-size: 0.8125rem; }
`;

/** Under the card of every page: the broker is Samebase's, as on samebase.com. */
const ATTRIBUTION = `<a class="attribution" href="https://samebase.com" target="_blank" rel="noopener noreferrer">Managed with <b><svg viewBox="0 0 60 60" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h60v60H0z M20 20h20v20H20z" fill="currentColor" fill-rule="evenodd"/></svg>Samebase</b></a>`;

/** The privacy notice and terms of a hub's sign-in service, linked under its sign-in page. */
export type Legal = { privacy: string; terms: string };

function legalLinks(legal: Legal | null) {
  return legal === null
    ? ""
    : `<a href="${escape(legal.privacy)}" target="_blank" rel="noopener noreferrer">Privacy</a><a href="${escape(legal.terms)}" target="_blank" rel="noopener noreferrer">Terms</a>`;
}

export function page(title: string, body: string, status: number, legal: Legal | null): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body><div class="frame"><main>${body}</main><div class="below">${legalLinks(legal)}${ATTRIBUTION}</div></div></body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      // No page of the broker may be framed: the consent page asks for a decision (RFC 9700 4.16).
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
    },
  });
}

/** The marks of the providers that have one: Google's standard-color G, and GitHub's mark. */
const ICONS: Record<string, string> = {
  google: `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`,
  github: `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>`,
};

/** A connector button: the provider's mark, when it has one, and "Continue with <label>". */
function connectorButton(connector: { label: string; provider: string; href: string }) {
  return `<a class="button" href="${escape(connector.href)}">${ICONS[connector.provider] ?? ""}Continue with ${escape(connector.label)}</a>`;
}

/** What the granted scopes release, as one sentence: the consent names nothing else. */
function released(scopes: string[]) {
  const parts = [
    ...(scopes.includes("profile") ? ["name", "picture"] : []),
    ...(scopes.includes("email") ? ["email address"] : []),
  ];
  if (parts.length === 0) {
    return "The app gets only an id for your account.";
  }
  const list =
    parts.length <= 2
      ? parts.join(" and ")
      : `${parts.slice(0, -1).join(", ")}, and ${parts.slice(-1).join("")}`;
  return `The app gets your ${list}.`;
}

/**
 * A host that breaks after a dot. Each label is a box as wide as the line at most, so it breaks
 * inside, at a hyphen or anywhere, only when it is wider than the line by itself.
 */
function hostMarkup(host: string) {
  return host
    .split(".")
    .map((label, index, labels) => {
      const dot = index < labels.length - 1 ? "." : "";
      return `<span class="label">${escape(label)}${dot}</span>`;
    })
    .join("<wbr>");
}

/**
 * What the sign-in page adds when the policy asks for consent. An app's name is self-asserted
 * (RFC 7591 section 5), so the page names what the hub checked: the deploy, the GitHub repository
 * that registered the client, and what the app gets.
 */
export type Consent = {
  /** A loopback return address: the sign-in ends on the user's own computer. */
  loopback: boolean;
  deployment: { kind: "production" } | { kind: "preview"; stage: string } | { kind: "development" };
  /** `owner/name` of the GitHub repository at registration. */
  repository: string;
  scopes: string[];
  /** Who says that it reviewed nothing: the hub's name, or the issuer's host for a broker with none. */
  reviewer: string;
};

/**
 * The sign-in page: one "Continue with" button per offered connector, under the host that gets the
 * sign-in, which served the repository's verification file or is the user's own computer. With a
 * consent it also names the deploy, the repository, and what the app gets. It has no Cancel: the
 * browser's Back does that, and it never sends the user to the host, which a stranger's link may
 * have chosen (RFC 9700 section 4.11.2).
 */
export function signInPage(args: {
  /** The host of the client's return address, with its port. */
  host: string;
  /**
   * The origin of that address. The host links it in a new tab, so the user can look at the app;
   * nothing sends the user there by itself.
   */
  origin: string;
  consent: Consent | null;
  connectors: Array<{ label: string; provider: string; href: string }>;
  /** A hub's privacy notice and terms; null for a broker with no hub mode. */
  legal: Legal | null;
}): Response {
  const buttons = args.connectors.map(connectorButton).join("\n");
  const { consent, legal } = args;
  const heading = `<h1>Sign in to<br><a class="host" href="${escape(args.origin)}" target="_blank" rel="noopener noreferrer">${hostMarkup(args.host)}</a></h1>`;
  if (consent === null) {
    return page(
      `Sign in to ${args.host}`,
      `${heading}
<div class="actions">${buttons}</div>`,
      200,
      legal,
    );
  }
  // GitHub names the repository; it opens in a new tab, so the sign-in stays where it is.
  const repository = `<a href="https://github.com/${escape(consent.repository)}" target="_blank" rel="noopener noreferrer">${escape(consent.repository)}</a>`;
  let from: string;
  switch (consent.deployment.kind) {
    case "production":
      from = `Production of ${repository}`;
      break;
    case "preview":
      from = `Preview ${escape(consent.deployment.stage)} of ${repository}`;
      break;
    case "development":
      from = `Development server of ${repository}${consent.loopback ? " on this computer" : ""}`;
      break;
    default:
      return consent.deployment satisfies never;
  }
  return page(
    `Sign in to ${args.host}`,
    `${heading}
<p class="sub">${from}</p>
<div class="actions">${buttons}</div>
<p class="fine">${escape(released(consent.scopes))} ${escape(consent.reviewer)} has not reviewed this app.</p>`,
    200,
    legal,
  );
}

export function errorPage(title: string, message: string, status = 400): Response {
  return page(
    title,
    `<h1>${escape(title)}</h1><p class="sub">${escape(message)}</p>`,
    status,
    null,
  );
}
