# 112 Cloudflare Email Sending Spec

## Document Control

- Status: Accepted
- Owner: Samebase application email and deployment configuration
- Last updated: 2026-10-02
- Related:
  - `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`
  - `apps/samebase/convex/deploymentProfile.ts`
  - [Cloudflare Email Sending REST API](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/)
  - [Cloudflare Email Sending domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/)

## Current Contract

Samebase uses Cloudflare Email Sending for application-generated transactional email through the
shared `@samebase/convex-cloudflare-email-inbox` package. Its Convex component calls Cloudflare's
REST API and stores each message and its delivery history. Samebase does not add an email relay
Worker or another transactional-email provider.

Google Workspace continues to receive human email for `samebase.com`. Its root MX records remain
authoritative for inbound mail. Cloudflare Email Routing must not be enabled on the root domain
because doing so would replace the Google Workspace MX records. Cloudflare Email Sending may use the
same root domain because its outbound authentication and bounce records do not require changing the
root inbound MX records.

Application email uses:

- sender: `Samebase <notifications@samebase.com>`
- first recipient: `nicuchiciuc@gmail.com` for new-user notifications
- feedback recipient: `contact@samebase.com`
- provider API: `POST /accounts/{account_id}/email/sending/send`
- Convex environment variables:
  - `CLOUDFLARE_EMAIL_API_TOKEN`
  - `CLOUDFLARE_EMAIL_ACCOUNT_ID`

The API token has only `Account > Email Sending > Edit` for the Cloudflare account that owns the
onboarded sending domain. The account ID is configuration, not a secret.

## Deployment Contract

Samebase owns two account-owned API tokens created under Cloudflare's
`Manage Account > Account API Tokens`:

1. `samebase-email-production`, stored only in the Convex production deployment.
2. `samebase-email-nonproduction`, shared by the Convex development deployment and Convex preview
   defaults.

Both token values use the same `CLOUDFLARE_EMAIL_API_TOKEN` variable name. Code does not select a
token or maintain an email-specific environment discriminator. It uses the existing
`resolveDeploymentProfile()` result for presentation:

| Deployment profile  | Subject treatment                         | Delivery configuration      |
| ------------------- | ----------------------------------------- | --------------------------- |
| `production`        | no prefix                                 | production token            |
| `preview`           | `[Preview] `                              | shared non-production token |
| `convex_dev`        | `[Development] `                          | shared non-production token |
| `local_development` | `[Development] ` if explicitly configured | no token by default         |
| `local_worktree`    | `[Development] ` if explicitly configured | no token by default         |

The email token is not part of the worktree environment allowlist. Preview defaults apply to newly
created preview deployments; an existing preview must be recreated or configured directly after a
default changes.

## Sending Behavior

All application email uses one configured inbox, `notifications@samebase.com`, labeled
`Samebase notifications`. The shared package owns the Cloudflare request, response validation,
message storage, and delivery records. Samebase's Convex email module owns the fixed sender,
deployment subject prefix, and local skip policy. Internal action callers provide only the
recipient, base subject, and text body.

Samebase retains full message content and delivery history until a trusted application operator
explicitly deletes them. Account deletion does not automatically delete this operational email
history. The component is available only to Samebase's server functions and trusted operators.
Samebase adds no public inbox APIs. Sending-only use requires no R2 bucket. Mail uses the same
package and keeps its R2 inbound-message storage.

The first caller is the Convex Auth user-creation callback:

1. It schedules an email only when Convex Auth reports that no existing or linked user was reused.
2. It does not send for updates to an existing user.
3. It does not send when password-account seeding or the manual internal account action creates an
   operator account.
4. It schedules the action after the database transaction instead of waiting for Cloudflare, so an
   email-provider failure does not reject signup.
5. The notification includes the new user's name, email, user ID, and auth provider when available.

The MCP feedback action is the second caller:

1. It requires an approved account and the dedicated feedback-submit scope. The server adds this
   scope to the default request for clients, such as the published plugin, that cannot name scopes.
   A client without the scope must reconnect and approve the new grant.
2. It accepts only the exact user-approved report, with a 6,000-character maximum.
3. It sends only the report to `contact@samebase.com`.
4. It returns an error when Cloudflare rejects the request, reports a permanent bounce or suppressed
   recipient, cannot confirm the outcome, or local email sending is disabled. It does not retry
   uncertain outcomes automatically. A confirmed HTTP 429 queues a bounded automatic retry and
   returns a pending message, not a failure or a claim that mail was sent. The caller must not
   submit the same report again while it is pending.
5. It stores one per-user counter to enforce five submission attempts per 24 hours. The inbox stores
   the exact report and its delivery history under the shared retention contract.

The email action returns an Evolu `Result`. Successful results contain `accepted`, `queued`, or
`skipped`. Expected failures contain `bounced`, `suppressed`, `rejected`, or `unknown`. Acceptance
does not prove receipt in the recipient's mailbox. Unknown delivery is not a confirmed rejection.
Provider details remain in the component's delivery records, not the application result.

Each send runs one Evolu Task in a request-local Run. The Run is disposed before the request ends.
Configuration faults and unexpected exceptions still fail the calling action. Task defects are
re-thrown within the request instead of being reported through an uncaught microtask. Evolu does not
retry sends. This trial uses `@evolu/common@8.10.0` without changing the published email package
API.

A failed scheduled signup notification does not reject signup. A failed feedback send returns a tool
error without private provider details. Unknown feedback delivery tells the caller not to resubmit
until Samebase checks the delivery status. The shared component retries only confirmed HTTP 429
responses, at most three provider attempts. It honors Retry-After. HTTP 408, network failures,
invalid success receipts and HTTP 5xx remain unknown and do not retry.

Account deletion is the third caller. It waits for the provider result and records either `sent` or
`delivery_failed`. Failure does not stop final account deletion. The workflow does not retry the
email itself. A throttled message remains queued in the component; the workflow records
`delivery_failed` with an explicit pending-delivery note because acceptance is not yet confirmed.
Final deletion continues. Its message includes the deletion reference and manual upstream revocation
steps.

## Domain Setup Guidance

The reusable Samebase stack pattern is:

1. Keep the mailbox provider's MX records on the root domain.
2. Onboard the sending domain in Cloudflare Email Sending.
3. Publish every Cloudflare-generated bounce MX, SPF, and DKIM record exactly as shown.
4. Keep one SPF record per hostname. Google Workspace SPF remains on the root; Cloudflare's bounce
   SPF belongs on the Cloudflare-provided bounce hostname.
5. Publish one root DMARC policy after all legitimate senders have aligned SPF or DKIM.
6. Create separate production and non-production account-owned Email Sending API tokens.
7. Store credentials in each backend deployment, never in frontend or build-time public variables.
8. Label non-production messages from the application's existing deployment classification.

Before removing a domain from Cloudflare Email Sending, preserve or recreate the root DMARC record.
Cloudflare removes the DNS records it managed for the sending domain, including that DMARC record.

The visible sender can use the same domain as Google Workspace. Sending does not create a mailbox,
and receiving remains the responsibility of Google Workspace.

## Non-Goals

- Cloudflare Email Routing is not the inbound mailbox for `samebase.com`.
- Email Sending does not replace Google Workspace.
- Samebase does not add a Worker solely to relay Convex email requests.
- Samebase does not maintain separate email templates, providers, or code paths for production and
  non-production.
- This contract does not yet define marketing campaigns, inbound email processing, attachments,
  suppression management, or guaranteed-delivery workflows.

## Validation

- Samebase action tests verify production, development, and preview subject handling.
- Package tests verify Cloudflare transport and provider response validation. Samebase Convex action
  tests verify the configured inbox, sender, recipient, subject, text body, and stored delivery
  history without exposing credentials.
- Auth notification tests verify new-user, existing-user, and seeded-account decisions.
- MCP runtime tests verify the fixed feedback recipient, subject, exact report, invalid-report
  rejection, and per-user limit.
- Local and worktree tests verify that missing email configuration causes no external request.
- Account deletion tests verify that an email failure remains visible and allows final deletion.
- A manual production smoke test creates a fresh test account and confirms one message reaches
  `nicuchiciuc@gmail.com` with the production subject.
- A manual production feedback smoke test submits one approved test report and confirms the exact
  report reaches `contact@samebase.com` with the production subject.
- A manual preview smoke test invokes the internal email action or creates a genuinely new Google
  account, then confirms the `[Preview]` prefix and Cloudflare Email Sending activity log entry.
