# 119 Polar Monthly Billing Spec

## Document Control

- Status: Accepted
- Owner: Samebase platform
- Last updated: 2026-08-12
- Previous rollout plan: `rfcs/098_POLAR_MONTHLY_BILLING_LAUNCH_PLAN.md`
- Supersedes: `specs/033_POLAR_BILLING_SPEC.md` and `specs/034_POLAR_BILLING_PHASED_ROLLOUT_SPEC.md`

## Current Contract

### Plans

Every Samebase workspace is an organization backed by one GitHub repository owner.

| GitHub owner                         | Plan | Monthly base price | Pooled connections | Included members |
| ------------------------------------ | ---- | -----------------: | -----------------: | ---------------: |
| Personal account (`user`)            | Free |                 $0 |                 15 |                1 |
| GitHub organization (`organization`) | Free |                 $0 |                  6 |                2 |
| Either owner type                    | Pro  |                 $4 |                120 |                2 |

Additional members require Pro. Pro includes two active members. Each additional active member costs
$2 per month. The Pro monthly price is `$4 + $2 * max(0, active memberships - 2)`.

Both `owner` and `member` roles count when the referenced Samebase user is active. A deleting or
deleted user and a pending invitation do not count.

One confirmed connected GitHub repository, one attached Cloudflare Worker, or one attached Convex
project uses one connection. The connection pool has no provider-specific sublimit. GitHub App
installations, provider accounts, OAuth grants, credentials, and provider observations do not count.

Pro is monthly only. Samebase does not offer an annual plan, usage billing, a trial, FileView, or a
separate resource add-on as part of this contract.

### Polar Customer And Subscription Model

One Samebase organization maps to one Polar team Customer. The team Customer is the billing entity
and owns one subscription instance. A Samebase user can own several isolated team Customers and can
therefore pay for several organizations. Samebase does not add a billing account that groups
organizations.

Free has no current Polar subscription. A current active or past-due Polar subscription always means
Samebase Pro. Samebase uses one shared monthly Pro product for both GitHub owner types:

- The product has a $4 monthly fixed price.
- The product includes two seats.
- Each seat above two costs $2 per month.
- The subscription seat quantity is always at least two.

The first current Samebase owner who starts Pro checkout becomes the organization's designated
billing payer. Samebase stores that user on the organization billing row and creates that user as
the Polar team Customer's owner Member. Only the designated payer can start later billing changes or
open that Customer's portal. The designated payer cannot be demoted, removed, or leave the
organization until billing ownership is transferred. Self-serve billing-owner transfer is not part
of this rollout. Account deletion has no separate billing rule. It already requires the user to have
no organization memberships.

Samebase creates checkout with the reserved external Customer ID. This keeps the checkout tied to
the external identity that Samebase uses to verify retries. It does not switch to Polar's internal
Customer ID at checkout creation.

The initial Pro checkout target is `max(active memberships, 2)`. A Free organization cannot buy a
separate member seat. It must activate Pro first. After Pro is active, an additional-seat purchase
uses `active memberships + 1` when current memberships fit verified capacity. If the organization is
already above capacity, the purchase targets the active membership count and buys only the capacity
needed to restore access.

Seat additions invoice immediately. Seat reductions after membership removal use Polar proration. A
seat reduction never goes below two.

Changing Pro to Free schedules subscription cancellation at the end of the paid period. It does not
switch to another product. Pro and its verified seat capacity stay active until that period ends. If
the organization has too many members for Free at that time, normal organization work is blocked
until an owner removes members or starts Pro again. Polar keeps the canceled subscription as
history, but Samebase treats it as no current subscription.

### Product Catalog

Product IDs are non-secret tracked configuration. The Polar access token and webhook secret remain
secret deployment environment variables.

Samebase keeps a typed, versioned Pro product catalog in code. Sandbox and production have separate
catalogs. Each entry records a product ID, a positive version, and whether checkout can select it.
Exactly one entry per environment can be selected for checkout. Old product versions remain in the
catalog only while an existing subscription can still reference them. Every recognized entry maps to
Pro.

Before a product becomes available for checkout, the operator opens its exact ID in the matching
Polar environment. The operator verifies its name, monthly interval, archive and visibility state,
$4 fixed price, two included seats, and $2 later-seat price against this specification.

### Subscription And Member State

Polar is the source of truth for Pro and paid seat capacity. A checkout return URL is not proof of
payment. Samebase changes entitlement only after it verifies Polar state through a signed webhook or
a trusted reconciliation operation.

- No current subscription means Free.
- A recognized active subscription means Pro.
- A recognized past-due subscription keeps Pro while Polar still grants it.
- A scheduled cancellation keeps Pro and seats until the paid period ends.
- Repeated or out-of-order webhooks must converge on current Polar Customer state.
- Invalid provider data must not remove an existing entitlement.
- A pending invitation does not consume capacity.
- A current membership for an active user consumes one seat.
- Removing a member or leaving an organization schedules a Polar seat reduction after the local
  membership deletion commits.
- Concurrent membership changes converge on the latest active-member count. A member addition cannot
  leave fewer paid seats than active members, and a stale removal cannot leave an extra paid seat.
- A seat reduction is skipped after cancellation is scheduled. The subscription is already ending,
  and the local membership removal still removes access immediately.

An invitation can become a membership only after capacity exists. Invitation acceptance checks the
stored capacity and inserts the membership in one Convex transaction. If capacity is not available,
the invitation stays pending.

`subscription.updated` is the required wake-up for subscription and seat changes.
`customer.state_changed` can remain as a broader reconciliation signal. Both events lead to a full
canonical Subscription read. The handler verifies the team Customer, organization external ID, at
most one current subscription, recognized Pro product, and complete seat quantity. It does not grant
access from webhook payload fields.

### Connection Enforcement

Samebase enforces the pooled connection limit on the server for every operation that connects,
creates, or attaches a counted resource. The authoritative repository, Worker, and Convex counts
belong to the organization. A write is rejected when their sum is already at the plan limit.

An organization can be above its Free connection limit after Pro ends. Samebase keeps existing
resources usable and does not disconnect or delete them. It blocks new counted resources until usage
is below the current limit or Pro becomes active again.

An organization becomes billing-limited when its active membership count is above verified member
capacity. Normal organization work is blocked. Billing and member management stay available so an
owner can restore capacity or remove members.

### Customer Surfaces

Organization settings shows the current plan, pooled connection count, active membership count,
included members, paid member capacity, designated payer state, and next billing or access-end date
when known.

- Free shows one `Upgrade to Pro, $4/month` action.
- Free does not show an additional-seat action.
- Pro shows an additional-seat action only when all verified seats are in use.
- The designated payer can schedule Pro cancellation at the period end.
- A scheduled cancellation shows Free as the next plan and shows the access-end date.
- The designated payer can open the Polar Customer Portal.

The public pricing page shows the same three-row contract. Polar owns checkout, payment methods,
invoices, receipts, cancellation, and reactivation.

### Environments

- Local development uses Polar Sandbox and Polar CLI webhook forwarding.
- Polar Customer Portal seat management and product switching are disabled. Samebase changes seat
  quantity through server actions.
- Pull request previews do not make real Polar checkout or webhook calls.
- Production uses the stable Samebase origin, one current production Pro product, retained
  historical Pro entries when needed, and one stable production webhook.
- Production configuration needs operator approval.

### Beta Cutover

The previous Polar prototypes used an individual Customer and later four owner-and-plan products.
Samebase has no paying customers under those models.

Before this rollout reaches production, the operator must verify that production has no organization
billing row with a Polar Customer, open checkout, current subscription, or paid seat state. The
operator must record the one current production Pro product ID before checkout becomes available.

If the production check finds old billing state, the rollout stops. That data needs an explicit
Customer, payer, product, and seat migration. The code must not treat an old individual Customer or
an old Free product as the current team Customer and shared Pro product.

Before the narrowed schema deploys, the pre-beta reset must also remove any stored
`polarPendingPlan` field.

### Operational Simplicity

- A failed webhook returns an error so Polar can retry it. Samebase does not run a local retry
  coordinator, watchdog, lease, or period-end job.
- A canonical Polar read is the only input that changes paid entitlement.
- An ambiguous checkout or more than one current subscription blocks billing changes until the
  operator repairs Polar state.
- Resource creation uses a bounded preflight check and a final transactional pooled-count check.
- A rare concurrent last-slot race can create a provider resource that Samebase does not attach. The
  operator removes that unused provider resource manually.
- Failures keep the existing entitlement and data unless Polar or the local transaction proves the
  requested change.

## Non-Goals

- A billing account that pays for several Samebase organizations
- Several current Polar subscriptions for one Samebase organization
- A Free Polar subscription
- Owner-specific Polar products
- Real Polar checkout in pull request previews
- Automatic creation or cleanup of Polar preview resources
- Metering, credits, overage charges, or automatic resource removal
- A custom Samebase invoice or payment-method interface
- Future FileView or other add-on pricing

## Validation

The contract is complete only when tests and Sandbox checks prove:

- Personal Free allows 15 pooled connections and blocks the 16th.
- GitHub organization Free allows 6 pooled connections and blocks the 7th.
- Pro allows 120 pooled connections and blocks the 121st for either owner type.
- Repository, Worker, and Convex attachments consume the same pool.
- Personal Free includes one member. GitHub organization Free includes two members.
- Pro includes two members for both owner types.
- Free cannot buy a separate member seat.
- Both owner types start checkout with the same Pro product and at least two seats.
- The product charges $4 plus $2 for each member above two.
- Checkout selects the only current Pro catalog version.
- Reconciliation accepts current and retained historical Pro versions and rejects unknown products.
- A pending invitation does not count as a current membership.
- Invitation acceptance fails without verified capacity and succeeds after capacity is reconciled.
- Concurrent invitation acceptances cannot both consume the last available seat.
- A member accepted during a seat reduction does not leave capacity below membership count.
- Concurrent member removals do not leave a stale extra paid seat.
- A seat reduction never lowers Pro below two seats.
- Cancellation sets `cancelAtPeriodEnd` without changing the product.
- Scheduled cancellation keeps Pro until the paid period ends.
- Subscription end changes Samebase to Free without a local period-end job.
- Checkout redirects do not grant Pro or seat capacity.
- Duplicate, out-of-order, invalid, and malformed webhook deliveries are safe.
- One Samebase user can own several isolated Polar team Customers.
- A designated payer cannot be demoted, removed, or leave.
- Local Polar Sandbox checkout, portal isolation, seat changes, cancellation, reactivation, and
  entitlement end work without a manual database edit.
