# Privacy Policy

Last updated: August 12, 2026

This Privacy Policy explains how Samebase handles information when you use samebase.com, the
Samebase web app, the Samebase remote MCP server, or a published Samebase agent plugin.

## Scope and Contact

The Samebase team operates Samebase and is responsible for the processing described in this Policy.
When data protection law uses the term controller, it means the operator of Samebase for the
processing described here.

For privacy questions or requests, email contact@samebase.com.

GitHub, Convex, Cloudflare, Google, Polar, PostHog, jsDelivr, and the agent client that you use have
their own privacy terms for the information that they process.

## Information Samebase Handles

- Account and sign-in data. Samebase stores the account fields needed to identify you and operate
  sign-in. These fields can include your name, email address, profile image, email verification
  time, sign-in methods, approval state, and authentication or session records.
- Signup notifications. When a new account is created, Samebase sends an internal notification to
  authorized Samebase staff. It can include the account name, email address, internal user ID, and
  sign-in method. Samebase uses Cloudflare Email Sending for this notification.
- Communications. Samebase processes the information that you provide when you contact Samebase.
- Organization data. Samebase stores organization memberships, roles, and invitations. It uses
  public GitHub profile information for invitations.
- Connected provider credentials and identifiers. If you connect GitHub, Convex, or Cloudflare,
  Samebase stores the credentials and metadata needed to operate the connection. This information
  can include OAuth access and refresh tokens, API keys, expiry times, usernames, team IDs, account
  IDs, and provider-specific identifiers.
- Repository and workspace data. Samebase stores repository owner and name, repository IDs, Git
  trees and object hashes, branch data, file paths, staged and initial file content, deduplicated
  blobs, collaborative editing updates, infrastructure status, domain mappings, and related
  operational data.
- MCP and agent-client data. Samebase processes the tool requests and results needed to perform the
  requested action. Samebase stores OAuth client registrations, authorization requests and codes,
  grants, hashed access-token and refresh-token records, browser-handoff token hashes, and security
  or audit events.
- Billing data. If you use a paid plan, Samebase stores the billing provider, plan, status, renewal
  period end, and a Polar external customer ID. Polar can receive your name, email address, plan
  choice, customer ID, and checkout or portal return URLs. Samebase does not store raw payment card
  numbers in the current app database.
- Operational and request logs. Samebase and its service providers keep logs for security,
  troubleshooting, performance, and usage analysis. Logs can include IP addresses, request metadata,
  internal user IDs, account roles, MCP method or tool names, repository or provider resource
  identifiers, file paths, and error details. Samebase does not intend to put raw credentials,
  complete prompts, or file content in these logs.
- Browser analytics and diagnostics. When PostHog is enabled, it can receive page URLs, navigation,
  interaction data, browser and device data, referrer data, IP address, performance data, an
  internal user ID, client-side errors, and session recordings. Input values and editor surfaces are
  masked by default, but visible page content and fields that are explicitly marked for capture can
  appear in a recording.
- Backend usage diagnostics. When the production Convex log integration is enabled, PostHog Logs can
  receive Convex function-execution data and compact Samebase usage markers. The markers can include
  an internal user ID, account role, access level, MCP method, and MCP tool name.

## Agent Plugins and MCP

The published Samebase agent plugins contain static configuration and instructions. They configure a
compatible agent client to connect to the Samebase remote MCP server. Installing a plugin does not
create a Samebase account or authorize access by itself.

After you authorize an MCP client, the client sends structured tool names, arguments, and selected
resources to Samebase. Samebase does not request or reconstruct your complete client conversation.
The client receives tool results that can include:

- your account name, email address, internal account ID, role, access status, and granted OAuth
  scopes
- repository names, branch names, file paths, object hashes, file counts, and related metadata
- Samebase vault, attachment, and operation identifiers
- Cloudflare account, Worker, build-trigger, and connection data
- Convex team, project, deployment-location, and connection data
- provisioning, deletion, and provider status, error messages, and action confirmations

The browser-handoff tool can return a short-lived, one-time Samebase sign-in URL. The URL contains a
sensitive bearer value. It expires after five minutes and should be opened promptly.

Your agent provider can process and retain prompts, tool arguments, and Samebase tool results under
its own privacy terms. Deleting your Samebase account does not delete copies that remain in an agent
client's task or conversation history.

Samebase does not make separate OpenAI or Anthropic model API calls for these MCP operations.
Samebase does not use your repository or workspace content to train its own AI models.

## Browser Storage and Cookies

- Local storage can contain Convex Auth access and refresh tokens, sign-in helper state, file-view
  or workspace-shell preferences, and an account-deletion completion capability.
- Per-tab session storage and browser history state briefly hold a browser-handoff token. The app
  removes the token from the URL before the app loads and clears the stored value after use.
- Browser IndexedDB caches some Convex query results under the `convexQueryCache` database. Cached
  results can include workspace data.
- PostHog can use cookies and local storage for browser identifiers and session state. Sign-in
  providers such as Google and GitHub can also set their own cookies or session state.

## How Samebase Uses Information

- To create accounts, authenticate users, maintain sessions, and enforce access controls.
- To connect to providers and perform the actions that you request, including reading repositories,
  staging edits, proposing commits, creating repositories, provisioning infrastructure, and creating
  or rotating deployment credentials.
- To sync collaborative editing state and preserve workspace, branch, and interface context.
- To create and operate hosted resources, previews, domains, and related infrastructure.
- To process checkout or customer-portal requests and keep subscription status in sync.
- To provide MCP access, return requested tool results, and maintain OAuth security and audit
  records.
- To protect Samebase, prevent abuse, investigate errors, provide support, measure service use, and
  improve reliability.
- To meet legal obligations and enforce Samebase terms.

## Legal Bases

Where applicable law requires a legal basis, Samebase relies on:

- the steps that you request and the contract to provide Samebase for account, workspace, provider,
  MCP, and billing operations
- legitimate interests in service security, fraud prevention, reliability, support, and limited
  product analysis where those interests do not override your rights
- consent for optional processing where Samebase asks you to make a privacy choice
- legal obligations when Samebase must keep, use, or disclose information under law

This Policy is a notice. Samebase does not treat your acceptance of this Policy as consent where the
law requires a separate choice.

## When Samebase Shares Information

- Convex provides the core Samebase database, file storage, authentication, functions, and
  workflows. Convex processes information whenever you use Samebase.
- Cloudflare hosts and delivers the web app, routes network requests, proxies browser telemetry,
  sends transactional email, and keeps operational request logs. Cloudflare processes information
  whenever you use Samebase.
- Google provides Samebase's staff mailbox. Google or GitHub processes account and sign-in
  information when you use its sign-in method.
- GitHub, Convex, and Cloudflare process provider-account data when you connect an account or ask
  Samebase to perform an action in that account.
- Polar processes billing and checkout information when you use a paid-plan action.
- PostHog processes browser analytics, diagnostics, and, when enabled, backend or MCP usage logs.
  Production browser telemetry first goes through a Samebase Cloudflare-hosted event proxy.
- jsDelivr receives imported npm package names in request URLs when the TypeScript editor downloads
  package type definitions. Samebase does not intentionally send the source file body to jsDelivr.
- An MCP client receives the tool results that you authorize and request.
- Organization members can see profile and role information about other members.
- Authorized Samebase staff can receive account, support, security, and operational information when
  needed to operate the service.
- Samebase can disclose information when law requires it or when it is necessary to protect users,
  Samebase, or other people.

Samebase does not sell personal information or share it for cross-context behavioral advertising.
The current app does not include advertising SDKs or third-party marketing trackers.

## Retention and Deletion

Samebase does not have one automatic deletion period for all data. Account, workspace, billing, and
audit data generally remains while your account is active and while it is needed to provide the
service, protect security, resolve disputes, or meet legal obligations.

The current MCP expiry periods are:

- authorization requests and authorization codes stop working after 10 minutes
- access tokens stop working after 1 hour
- refresh tokens stop working after 30 days
- provisional client registrations stop working after 7 days
- browser-handoff links stop working after 5 minutes, and their database rows are scheduled for
  deletion

Expiry stops a record from being used. It does not always delete the database row. Other expired MCP
records can remain until account deletion or operational cleanup.

You can disconnect a provider. This deletes Samebase's saved connection record, but it does not
always revoke the credential at the provider. Use the provider's account settings when upstream
revocation is required.

You can delete a vault from the dashboard. Samebase can also remove related GitHub, Convex, and
Cloudflare resources when the deletion options and resource ownership allow it.

You can delete your account from Settings. Samebase disables the account immediately and schedules
permanent deletion to start seven days later. During those seven days, email contact@samebase.com to
restore the account or request an earlier start. Permanent deletion removes your profile and access,
along with personal settings, memberships, authorizations, and provider connections that you added.
Samebase keeps limited records needed to confirm the deletion and preserve shared organization
history.

Account deletion does not cancel an organization subscription or delete shared organization data.
Shared organization data remains available to other members.

Account deletion does not delete external repositories, projects, deployments, Workers, domains, or
other provider resources. Convex OAuth credentials stored by Samebase are deleted, but existing
Convex production and preview deploy keys remain usable until you revoke Samebase in Convex
Authorized Applications.

Provider backups, application logs, billing records, PostHog data, and agent-client history can
remain under those providers' retention rules after active Samebase account data is deleted.
Samebase handles an identified PostHog deletion manually when required.

## International Processing

Samebase and its service providers can process information outside your country. Samebase configures
browser telemetry to use PostHog's European endpoint. Cloudflare can route requests globally. Other
processing locations depend on the provider, connected account, and resource location that you use.

The applicable provider terms describe the transfer mechanisms for those services. Email
contact@samebase.com to request more information about a specific transfer.

## Security

Samebase uses HTTPS, access controls, OAuth scopes, and short-lived authorization records. Samebase
stores MCP authorization codes, access tokens, refresh tokens, and browser-handoff token values as
hashes. Input and editor masking reduces the content recorded by session replay. No security method
can remove all risk.

Treat browser-handoff URLs and provider credentials as sensitive. Do not send credentials or other
highly sensitive data unless a Samebase feature requires them and you are authorized to use them.

## Your Rights and Choices

Depending on the law where you live, you can request access, correction, export, restriction,
objection, or deletion of your personal data. Where processing depends on consent, you can withdraw
that consent. You can also complain to the data protection authority that applies to you.

Use Samebase account, provider, vault, and account-deletion controls where available. For any other
request, email contact@samebase.com. Samebase can ask for information needed to verify your identity
before it completes a request.

Samebase does not use automated decision-making that produces legal or similarly significant
effects.

## Children

Samebase is not intended for children under 13. Samebase does not knowingly collect personal data
from children under 13. If the law where you live requires parental or guardian permission at a
higher age, you must have that permission. Email contact@samebase.com if you believe a child has
provided personal data without the required permission.

## Changes to This Policy

Samebase can update this Policy when the product or its data handling changes. The updated version
will appear on this page with a new date. Samebase will give additional notice when applicable law
requires it.

## Contact

For privacy questions or requests, email contact@samebase.com.
