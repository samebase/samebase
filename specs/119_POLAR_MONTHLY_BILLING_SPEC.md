# 119 Polar Monthly Billing Spec

## Document Control

- Status: Accepted
- Owner: Samebase platform
- Last updated: 2026-08-11
- Previous rollout plan: `rfcs/098_POLAR_MONTHLY_BILLING_LAUNCH_PLAN.md`
- Supersedes: `specs/033_POLAR_BILLING_SPEC.md` and `specs/034_POLAR_BILLING_PHASED_ROLLOUT_SPEC.md`

## Current Contract

### Plans

Every Samebase workspace is an organization backed by exactly one GitHub repository owner. The
GitHub owner type selects the Free connection limit and the number of included members.

| GitHub owner                         | Plan | Monthly base price | Pooled connections | Included members | Each additional member |
| ------------------------------------ | ---- | -----------------: | -----------------: | ---------------: | ---------------------: |
| Personal account (`user`)            | Free |                 $0 |                 15 |                1 |           $2 per month |
| Personal account (`user`)            | Pro  |                 $4 |                120 |                1 |           $2 per month |
| GitHub organization (`organization`) | Free |                 $0 |                  6 |                2 |           $2 per month |
| GitHub organization (`organization`) | Pro  |                 $4 |                120 |                2 |           $2 per month |

The monthly price is the plan base price plus `$2 * max(0, current memberships - included members)`.
Both `owner` and `member` roles count. A pending invitation does not create a membership and does
not count.

One confirmed connected GitHub repository, one attached Cloudflare Worker, or one attached Convex
project uses one connection. The connection pool has no provider-specific sublimit. GitHub App
installations, provider accounts, OAuth grants, credentials, and provider observations do not count.

Pro is monthly only. Samebase does not offer an annual plan, usage billing, a trial, FileView, or a
separate resource add-on as part of this contract.

### Polar Customer And Product Model

One Samebase organization maps to one Polar team Customer. The team Customer is the billing entity
and owns the subscription. A Samebase user can be the owner Member of several isolated team
Customers. Samebase does not add a billing account that groups several organizations.

Samebase creates checkout sessions with the reserved external Customer ID. This keeps the returned
checkout tied to the same external identity that Samebase uses to verify retries. It does not switch
to Polar's internal Customer ID at checkout creation.

The first current Samebase owner who starts a checkout or paid billing change becomes the
organization's designated billing payer. Samebase stores that user on the organization billing row
and creates that user as the Polar team Customer's owner Member. Only the designated payer can start
later billing changes or open that Customer's portal. The designated payer cannot be demoted,
removed, leave the organization, or delete their Samebase account until billing ownership is
transferred. Self-serve billing-owner transfer is not part of this rollout.

One organization has at most one current Polar subscription. Polar has four monthly products, one
for each combination of GitHub owner type and Samebase plan:

- A Free product contains only a graduated seat price. Polar does not accept a $0 fixed price.
- A Pro product contains a $4 fixed price and the same graduated seat price.
- A personal-owner product includes the first seat and charges $2 for each later seat.
- A GitHub-organization product includes the first two seats and charges $2 for each later seat.

Samebase calculates the target subscription seat quantity from the current membership count. A
matching Free product handles paid members on Free. A matching Pro product handles the Pro base
price and paid members. A plan change updates the current subscription to the matching product
instead of starting a second subscription.

An organization buys capacity before a new invitation can become a membership. When current
memberships fit within verified capacity, a seat purchase uses `current memberships + 1` as its
target. When the organization is already above verified capacity, the purchase targets the current
membership count and buys only the capacity needed to restore access. Samebase grants the capacity
only after canonical Polar reconciliation. The invited user can then accept the invitation.
Invitation acceptance checks the stored capacity and inserts the membership in one Convex
transaction. If capacity is not yet available, the invitation stays pending and acceptance returns a
billing-capacity error.

Seat additions invoice immediately. Seat reductions after membership removal use Polar proration. A
Pro-to-Free product change takes effect in the next billing period.

The organization billing row remains the local provider-state boundary. It stores provider state for
exactly one organization. Product IDs remain deployment configuration because Sandbox and production
use different Polar products. Product IDs are not secrets. The Polar access token and webhook secret
are secrets.

### Subscription And Member State

Polar is the source of truth for paid plan and seat capacity. A checkout return URL is not proof of
payment. Samebase changes paid entitlement only after it verifies Polar state through a signed
webhook or a trusted reconciliation operation.

- Cancellation keeps the paid plan and seats active until the paid period ends.
- Payment recovery keeps paid entitlement active while Polar still grants it.
- Repeated or out-of-order webhook deliveries must converge on current Polar Customer state.
- Invalid or malformed provider data must not remove an existing entitlement.
- A pending invitation does not consume capacity. A current membership always consumes one seat.
- Removing a member, leaving an organization, or deleting a non-payer member schedules a Polar seat
  reduction after the local membership deletion commits. A provider failure can temporarily
  overcharge the organization, but it cannot preserve removed access.

`subscription.updated` is the required wake-up for plan and seat changes. `customer.state_changed`
can remain as a broader reconciliation signal. Both events must lead to a full canonical
Subscription read. The handler keeps signature verification and must verify a team Customer, the
expected organization external ID, at most one current subscription, the expected product, and the
full Subscription seat quantity. It must not grant access from webhook payload fields.

### Connection Enforcement

Samebase enforces the pooled connection limit on the server for every operation that connects,
creates, or attaches a counted resource. The authoritative confirmed repository, Worker, and Convex
counts belong to the organization. A write is rejected when their sum is already at the plan limit.

An organization can be above its current limit after Pro ends. Samebase keeps existing resources
usable and does not disconnect or delete them. It blocks new counted resources until usage is below
the current limit or Pro becomes active again.

An organization becomes billing-limited when its current membership count is above its verified
member capacity. Normal organization work is blocked. Owners can still open billing and member
management so they can restore capacity or remove members. The limitation ends automatically when
verified capacity or the membership count makes the organization valid again.

### Customer Surfaces

The organization settings page shows the current plan, one pooled connection count, the current
membership count, included members, paid capacity, the designated payer state, and the next billing
or end date when known.

- Free organizations within the included member count can start the matching Pro checkout.
- Free organizations that need a paid member can start the matching Free seat checkout.
- The designated payer can buy one additional member seat.
- The designated payer can schedule Pro to change to the matching Free product in the next billing
  period. Settings shows the pending Free plan until Polar applies it.
- Organizations with a subscription can open the Polar Customer Portal. The session must use the
  correct Polar Customer and designated payer Member.

The public pricing page shows the same four-row contract. Polar owns payment methods, invoices,
receipts, and cancellation controls through its hosted checkout and Customer Portal.

### Environments

- Local development uses Polar Sandbox and Polar CLI webhook forwarding.
- Polar Customer Portal seat management and product switching are disabled. Samebase changes seat
  quantity and selects the matching owner-type product through its server actions.
- Pull request previews do not make real Polar checkout or webhook calls. They test billing UI with
  controlled application state.
- Production uses the stable Samebase origin, four production Polar products, and one stable
  production webhook. Production configuration needs operator approval.

### Beta Cutover

The previous Polar prototype used an individual Customer and one Pro product. Samebase has no paying
customers under that model. Before this rollout reaches production, the operator must verify that
production has no organization billing row with a Polar Customer, open checkout, active or past-due
subscription, or paid seat state. The operator must also configure all four production product IDs
before checkout becomes available.

If the production check finds any old Polar billing state, the rollout stops. That data needs an
explicit Customer, payer, product, and seat migration before this code can become active. The code
must not silently reuse an individual Customer as a team Customer.

### Operational Simplicity

- A failed webhook returns an error so Polar can retry it. Samebase does not run a local retry
  coordinator, watchdog, lease, or period-end downgrade job.
- A canonical Polar read is the only input that changes paid entitlement. A stored billing date does
  not remove entitlement by itself.
- An ambiguous checkout or more than one current subscription blocks billing changes until the
  operator repairs Polar state.
- Resource creation uses a bounded preflight check and a final transactional pooled-count check. A
  rare concurrent last-slot race can create a provider resource that Samebase does not attach. The
  operator removes that unused provider resource manually.
- Failures keep the existing entitlement and data unless Polar or the local transaction proves the
  requested change.

## Non-Goals

- A billing account that pays for several Samebase organizations in this rollout
- Several current Polar subscriptions for one Samebase organization
- Real Polar checkout in pull request previews
- Automatic creation or cleanup of Polar preview resources
- Metering, credits, overage charges, or automatic resource removal
- A custom Samebase invoice or payment-method interface
- Future FileView or other add-on pricing

## Validation

The contract is complete only when tests and Sandbox checks prove:

- Personal Free allows 15 pooled connections and blocks the 16th.
- GitHub-organization Free allows 6 pooled connections and blocks the 7th.
- Pro allows 120 pooled connections and blocks the 121st for either owner type.
- Repository, Worker, and Convex attachments consume the same pool.
- Existing resources stay usable after a downgrade above the Free limit.
- Personal workspaces include one member. GitHub organization workspaces include two members.
- A pending invitation does not count as a current membership.
- Invitation acceptance fails without verified capacity and succeeds after that capacity is
  reconciled from Polar.
- Concurrent invitation acceptances cannot both consume the last available seat.
- The first billing owner becomes the designated payer, and other owners cannot use that payer's
  checkout or portal access.
- A designated payer cannot be demoted, removed, leave, or delete their account.
- An organization above verified member capacity blocks normal work but keeps billing and member
  removal available.
- The matching Polar product charges $4 for Pro plus $2 for each member above the included count.
- Each Free Polar product has no fixed-price component. Each Pro product has one $4 fixed-price
  component.
- One Samebase user can be the owner Member of several isolated Polar team Customers.
- A Pro-to-Free change keeps the current seat quantity and records the matching Free product as the
  pending next-period plan.
- A later seat increase or reduction preserves the pending Free product change.
- Checkout redirects do not grant a plan or seat capacity.
- Signed provider state grants, keeps, and removes plan and seat capacity according to the
  subscription rules.
- Duplicate, out-of-order, invalid, and malformed webhook deliveries are safe.
- Local Polar Sandbox checkout, portal isolation, seat changes, cancellation, and entitlement
  changes work without a manual database edit.
