# Privacy Policy

Last updated: May 4, 2026

Reviewed and updated by Codex (GPT-5) on May 4, 2026, based on the current Noter
source code.

This Privacy Policy describes how Noter handles information in the current app
code. It is intentionally narrow: it covers the data flows, integrations,
browser storage, and retention behavior that are implemented today, and avoids
claiming features or controls that are not in the product yet.

## What Noter Collects

- Account and sign-in data. When you sign in, Noter stores the account fields
  needed to identify you and operate login, including your name, email address,
  profile image, email verification time, approval state, and the auth/session
  records required by the current auth system.
- Waitlist data. If you join the waitlist, Noter stores your email address and
  the time you joined. If waitlist notifications are configured, that email
  address is also sent through Resend to notify the team.
- Connected provider credentials and related identifiers. If you connect GitHub,
  Convex, Cloudflare, or Codex, Noter stores the credentials and metadata needed
  to operate that integration, such as OAuth access tokens, refresh tokens, API
  keys, expiry times, usernames, team IDs, account IDs, and provider-specific
  identifiers.
- Repository and workspace metadata. Noter stores repository owner and name,
  repository IDs, Git trees, commit SHAs, branch metadata, infrastructure
  status, domain mappings, Codespaces metadata, legacy Daytona sandbox and
  snapshot metadata, and related operational fields.
- Workspace content. Noter stores staged file content, initial file content,
  file paths, deduplicated blobs, collaborative editing updates, and other state
  needed to sync and restore your work.
- AI, approval, and MCP OAuth records. If you use the AI features, Noter stores
  AI thread records, user prompts, assistant replies, streamed message state and
  deltas, model/provider metadata, per-thread context and draft messages,
  message metadata for proposals and results, production-read approval requests
  and audit records, and MCP OAuth client, authorization-request,
  authorization-code, grant, access-token, refresh-token, and audit records.
- Billing state. For paid plans, Noter stores billing provider, plan, status,
  renewal period end, and a Polar external customer ID. The current app code
  does not store raw payment card numbers.
- Product analytics and diagnostics. The current app code initializes PostHog in
  the browser. That integration can collect page-view, navigation, session,
  browser, device, referrer, URL, performance, and client-side error data needed
  for product analytics and diagnostics.

## Browser Storage and Cookies

- Local storage. The current app code uses localStorage for auth helper state
  and popup sign-in token handoff, for non-vault chat open/thread state, and for
  some file-view UI state.
- Convex-backed UI state. The current app code stores some authenticated
  workspace-shell UI preferences, including shared sidebar state, in Convex so
  they can persist across reloads.
- IndexedDB. The app caches some Convex query results in browser IndexedDB under
  the `convexQueryCache` database so screens can render faster. Those cached
  results can include workspace data.
- Analytics cookies and local storage. PostHog may store browser identifiers and
  related session state in cookies and localStorage to support analytics,
  diagnostics, and other client telemetry.
- Temporary in-memory landing state. The public landing page keeps the waitlist
  email draft in memory during the shell-to-app handoff.

Depending on the sign-in flow you use, third-party identity providers such as
Google may also set their own cookies or session state as part of
authentication.

## How Noter Uses Information

- To authenticate users, maintain sessions, and enforce access controls such as
  waitlist approval.
- To connect to external providers and perform the actions you ask Noter to
  perform, including reading repositories, staging edits, proposing commits,
  creating repositories, and provisioning infrastructure.
- To sync collaborative editing state and preserve your workspace, branch, and
  UI context.
- To generate AI responses, tool activity, and approval proposals using the
  configured model provider and the repository or file context for the active
  thread.
- To create and manage hosted resources, previews, Codespaces, and related
  operational infrastructure when you enable those features.
- To create checkout or customer-portal sessions with Polar and keep
  subscription status in sync.
- To understand product usage, monitor stability, and capture client-side errors
  through PostHog.
- To maintain security, audit, and troubleshooting records for sensitive
  operations such as production-read approvals and MCP OAuth access.

## What the Current App Code Does Not Include

The current app code does not include advertising SDKs or third-party marketing
trackers. It does include PostHog's browser SDK for product analytics and
client-side error capture, along with the browser storage and provider
integrations described on this page.

## When Noter Shares Information

- With Google when you use Google sign-in.
- With Anthropic when you use the in-app AI chat, because the current chat
  runtime sends prompts, system context, and selected repository or file context
  to Anthropic's Claude model to generate responses.
- With GitHub when you connect repositories, read repository data, create
  commits or repositories, manage deploy keys or webhooks, or use GitHub
  Codespaces.
- With Convex and Cloudflare when you connect those providers or ask Noter to
  provision or operate related infrastructure.
- With Polar when you start checkout or open the billing portal, and when
  subscription state is synchronized by webhook.
- With PostHog when the app sends product analytics, browser error, and related
  client telemetry.
- With Resend if waitlist email notifications are configured.
- With MCP clients that you explicitly authorize through Noter's MCP OAuth flow.

If you ask Noter to create hosted previews or production infrastructure,
deployment URLs and provider-side resource identifiers may be created and stored
as part of that workflow.

## Retention and Controls

- The current codebase does not implement one global auto-deletion schedule for
  all personal data.
- Account, workspace, billing, waitlist, and audit records generally remain
  until they are removed through product actions or operational cleanup.
- Some short-lived records, including OAuth state and certain token records, are
  created with expiration timestamps and are intended to expire automatically.
- You can disconnect connected providers, which removes the corresponding
  provider-connection record stored by Noter.
- You can delete vaults from the dashboard, and that deletion flow can also
  remove related GitHub, Codespaces, Convex, and hosting resources when those
  options are selected.
- A self-serve account deletion flow is not currently implemented in the app
  code.

## Changes to This Policy

Noter should update this page when code-level data behavior changes. If a future
version of the product changes analytics behavior, retention rules, providers,
or public data-use commitments, this policy should be updated before those
changes go live.
