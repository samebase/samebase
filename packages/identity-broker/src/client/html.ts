/** The few pages the broker renders itself. Plain HTML, one stylesheet, no script. */

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLE = `
  :root { color-scheme: light dark; --fg: #111; --muted: #5c5c5c; --bg: #fff; --line: #e2e2e2; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #ededed; --muted: #a3a3a3; --bg: #111; --line: #2e2e2e; }
  }
  body { margin: 0; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg);
    background: var(--bg); }
  main { max-width: 26rem; margin: 12vh auto; padding: 0 1.25rem 3rem; }
  h1 { margin: 0 0 0.5rem; font-size: 1.375rem; line-height: 1.3; font-weight: 600;
    overflow-wrap: anywhere; }
  p { margin: 0.5rem 0; }
  ::selection { color: var(--bg); background: var(--fg); }
  a { color: inherit; text-underline-offset: 0.2em; text-decoration-thickness: 1px; }
  a:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
  .muted { color: var(--muted); }
  .label { display: inline-block; max-width: 100%; }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 0.5rem 1.25rem;
    margin: 1.5rem 0; padding: 1rem 0; border-block: 1px solid var(--line); }
  .facts dt { color: var(--muted); }
  .facts dd { margin: 0; overflow-wrap: anywhere; }
  .list { display: grid; gap: 0.5rem; margin: 1.5rem 0; }
  a.button { display: block; width: 100%; box-sizing: border-box; padding: 0.75rem 1rem;
    font: inherit; font-weight: 500; color: var(--fg); background: var(--bg);
    border: 1px solid var(--fg); text-align: center; text-decoration: none; cursor: pointer; }
  a.button:hover { background: var(--line); }
  a.button.primary { color: var(--bg); background: var(--fg); }
  a.button.primary:hover { background: var(--muted); border-color: var(--muted); }
  .cancel { display: block; padding: 0.75rem 1rem; text-align: center; }
  .note { margin-top: 1.5rem; font-size: 0.875rem; color: var(--muted); }
`;

export function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
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

/** What the granted scopes release, as one phrase: the consent names nothing else. */
function released(scopes: string[]) {
  const parts = [
    "a stable id",
    ...(scopes.includes("profile") ? ["your name and picture"] : []),
    ...(scopes.includes("email") ? ["your email address"] : []),
  ];
  return parts.length <= 2
    ? parts.join(" and ")
    : `${parts.slice(0, -1).join(", ")}, and ${parts.slice(-1).join("")}`;
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

/** The connector choice of a first-party app: the host's own apps need no consent. */
export function chooserPage(args: {
  appName: string;
  connectors: Array<{ name: string; label: string; href: string }>;
}): Response {
  const buttons = args.connectors
    .map(
      (connector) =>
        `<a class="button" href="${escape(connector.href)}">Continue with ${escape(connector.label)}</a>`,
    )
    .join("\n");
  return page(
    `Sign in to ${args.appName}`,
    `<h1>Sign in to ${escape(args.appName)}</h1><div class="list">${buttons}</div>`,
  );
}

/**
 * The decision that a third-party app's preview or development client asks for before the user
 * goes to its connector. Its name is self-asserted (RFC 7591 section 5), so the page names what the
 * hub checked: the host that gets the sign-in, which served the repository's verification file or
 * is the user's own computer, and the GitHub repository that registered it. Cancel ends the
 * sign-in on `cancelledPage`.
 */
export function consentPage(args: {
  /** The host of the client's return address, with its port. */
  host: string;
  /** A loopback return address: the sign-in ends on the user's own computer. */
  loopback: boolean;
  deployment: { kind: "preview"; stage: string } | { kind: "development" };
  /** `owner/name` of the GitHub repository at registration. */
  repository: string;
  connectorLabel: string;
  scopes: string[];
  continueHref: string;
  cancelHref: string;
  /** The host of the issuer, which says that it reviewed nothing. */
  issuerHost: string;
}): Response {
  let deploy: string;
  switch (args.deployment.kind) {
    case "preview":
      deploy = `Preview ${args.deployment.stage}`;
      break;
    case "development":
      deploy = args.loopback ? "Development server on this computer" : "Development server";
      break;
    default:
      return args.deployment satisfies never;
  }
  return page(
    `Sign in to ${args.host}`,
    `<h1>Sign in to ${hostMarkup(args.host)}</h1>
<dl class="facts">
<dt>Repository</dt><dd><a href="https://github.com/${escape(args.repository)}" rel="noreferrer">${escape(args.repository)}</a></dd>
<dt>Deploy</dt><dd>${escape(deploy)}</dd>
<dt>Receives</dt><dd>${escape(released(args.scopes))}</dd>
</dl>
<a class="button primary" href="${escape(args.continueHref)}">Continue with ${escape(args.connectorLabel)}</a>
<a class="cancel" href="${escape(args.cancelHref)}">Cancel</a>
<p class="note">${escape(args.issuerHost)} did not review this app. Continue only if you trust it.</p>`,
  );
}

/**
 * After Cancel on the consent page. It does not send the user to the host, which they may distrust;
 * the link back carries the `access_denied` answer for a user who wants to return.
 */
export function cancelledPage(args: { host: string; returnHref: string }): Response {
  return page(
    "Sign-in cancelled",
    `<h1>Sign-in cancelled</h1>
<p class="muted">Nothing was shared with ${hostMarkup(args.host)}. You can close this tab.</p>
<p class="note"><a href="${escape(args.returnHref)}" rel="noreferrer">Return to ${hostMarkup(args.host)}</a></p>`,
  );
}

export function errorPage(title: string, message: string, status = 400): Response {
  return page(title, `<h1>${escape(title)}</h1><p class="muted">${escape(message)}</p>`, status);
}
