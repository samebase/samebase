# 119 Polar Monthly Billing Spec

## Document Control

- Status: Accepted
- Owner: Samebase platform
- Last updated: 2026-08-02
- Active rollout plan: `rfcs/098_POLAR_MONTHLY_BILLING_LAUNCH_PLAN.md`
- Supersedes: `specs/033_POLAR_BILLING_SPEC.md` and `specs/034_POLAR_BILLING_PHASED_ROLLOUT_SPEC.md`

## Current Contract

### Plans

Samebase has two personal plans:

| Plan | Price        | Connected Cloudflare Workers | Connected Convex projects |
| ---- | ------------ | ---------------------------: | ------------------------: |
| Free | $0           |                            5 |                         5 |
| Pro  | $4 per month |                           40 |                        40 |

The two resource limits are independent. Connected resources are the authoritative resource
attachments owned by the user, not provider credentials or vault records.

Pro is monthly only. Samebase does not offer an annual plan, usage billing, a trial, FileView, an
add-on, a team plan, or seat billing as part of this contract.

### Subscription State

Polar is the source of truth for paid entitlement. A checkout return URL is not proof of payment.
Samebase changes entitlement only after it verifies Polar state through a signed webhook or a
trusted reconciliation operation.

- Cancellation keeps Pro active until the paid period ends.
- Payment recovery keeps Pro active while Polar still grants the entitlement.
- When Polar stops the entitlement, Samebase changes the user to Free.
- Repeated or out-of-order webhook deliveries must converge on current Polar customer state.
- Invalid or malformed provider data must not remove an existing entitlement.

### Resource Enforcement

Samebase must enforce each limit on the server for every new Worker or Convex project attachment.
The write must use the current authoritative count and reject the attachment when the user already
has the plan limit.

An account can be above the Free limit after Pro ends. Samebase keeps all existing resources usable
and does not disconnect or delete them. It blocks new attachments for that resource type until the
count is below the Free limit or Pro becomes active again.

### Customer Surfaces

The account page shows the current plan, subscription state when action is necessary, separate
Worker and Convex project usage, the next billing or end date when known, and one billing action:

- Free users can start the $4 monthly Pro checkout.
- Pro users can open the Polar customer portal.

The public pricing page shows the same Free and Pro contract. Polar owns payment methods, invoices,
receipts, and cancellation controls through its hosted checkout and customer portal.

### Environments

- Local development uses Polar Sandbox and Polar CLI webhook forwarding.
- Pull request previews do not make real Polar checkout or webhook calls. They test billing UI with
  controlled application state.
- Production uses the stable Samebase origin, the production Polar product, and a stable production
  webhook. Production configuration is the final rollout stage and needs operator approval.

## Non-Goals

- Real Polar checkout in pull request previews
- Automatic creation or cleanup of Polar preview resources
- Metering, credits, overage charges, or automatic resource removal
- A custom Samebase invoice or payment-method interface
- Future FileView or other add-on pricing

## Validation

The contract is complete only when tests prove:

- Free allows attachments through 5 and blocks the 6th for each resource type.
- Pro allows attachments through 40 and blocks the 41st for each resource type.
- Worker and Convex project counts do not affect each other.
- Existing resources stay usable after a downgrade above the Free limit.
- Checkout redirects do not grant Pro.
- Signed provider state grants, keeps, and removes Pro according to the subscription rules.
- Duplicate, out-of-order, invalid, and malformed webhook deliveries are safe.
- Local Polar Sandbox checkout, portal, cancellation, and entitlement changes work without a manual
  database edit.
