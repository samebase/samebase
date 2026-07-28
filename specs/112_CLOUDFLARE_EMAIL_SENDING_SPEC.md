# 112 Cloudflare Email Sending Spec

## Document Control

- Status: Accepted
- Owner: Samebase application email and deployment configuration
- Last updated: 2026-07-28
- Related:
  - `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`
  - `apps/samebase/convex/deploymentProfile.ts`
  - [Cloudflare Email Sending REST API](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/)
  - [Cloudflare Email Sending domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/)

## Current Contract

Samebase uses Cloudflare Email Sending for application-generated transactional email. Convex calls
Cloudflare's REST API directly from internal actions. Samebase does not add an email relay Worker or
another transactional-email provider.

Google Workspace continues to receive human email for `samebase.com`. Its root MX records remain
authoritative for inbound mail. Cloudflare Email Routing must not be enabled on the root domain
because doing so would replace the Google Workspace MX records. Cloudflare Email Sending may use the
same root domain because its outbound authentication and bounce records do not require changing the
root inbound MX records.

Application email uses:

- sender: `Samebase <notifications@samebase.com>`
- first recipient: `nicuchiciuc@gmail.com` for new-user notifications
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

All application email goes through one internal Convex action that owns the Cloudflare request,
fixed sender, deployment subject prefix, response validation, and provider error handling. Callers
provide only the recipient, base subject, and text body.

The first caller is the Convex Auth user-creation callback:

1. It schedules an email only when Convex Auth reports that no existing or linked user was reused.
2. It does not send for updates to an existing user.
3. It does not send when password-account seeding or the manual internal account action creates an
   operator account.
4. It schedules the action after the database transaction instead of waiting for Cloudflare, so an
   email-provider failure does not reject signup.
5. The notification includes the new user's name, email, user ID, and auth provider when available.

Cloudflare errors fail the scheduled action and remain visible in Convex function logs. The first
admin-notification use case does not add a database outbox or automatic retry model. User-facing
email flows that require delivery guarantees must define those guarantees when they are added.

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

- Unit tests verify production, development, and preview subject handling.
- Convex action tests verify the Cloudflare URL, bearer token, sender, recipient, text body, and
  response validation without exposing credentials.
- Auth notification tests verify new-user, existing-user, and seeded-account decisions.
- Local and worktree tests verify that missing email configuration causes no external request.
- A manual production smoke test creates a fresh test account and confirms one message reaches
  `nicuchiciuc@gmail.com` with the production subject.
- A manual preview smoke test invokes the internal email action or creates a genuinely new Google
  account, then confirms the `[Preview]` prefix and Cloudflare Email Sending activity log entry.
