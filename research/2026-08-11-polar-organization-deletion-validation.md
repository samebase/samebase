# Polar Organization Deletion Validation

## Document Control

- Date: 2026-08-12
- Status: Official source review complete. Polar Sandbox execution is pending.
- Scope: Polar cleanup for deletion of one Samebase organization
- Product contract: `specs/124_ORGANIZATION_DELETION_SPEC.md`

## Decision

One Samebase organization maps to one Polar team Customer after the organization billing rollout.
Organization deletion must stop future charges and remove the Customer identity that Samebase owns.
It must not delete the Polar seller Organization.

The accepted order is:

1. Set the Samebase organization deletion gate before any Polar call.
2. Wait while an `open` or `confirmed` checkout exists for the exact external Customer identity or
   resolved Polar Customer ID.
3. Store the exact internal Polar Customer ID in the active deletion run.
4. Revoke every nonterminal subscription immediately. Continue through all pages and repeat the read
   until none remain.
5. Delete the Customer with `anonymize=true`.
6. Verify that the Customer ID, external Customer identity, nonterminal subscriptions, and unsettled
   checkouts are absent.
7. Only then remove the local billing row and continue Samebase data cleanup.

Each provider action is bounded and read-led. A timeout or an unknown response changes the run to
`needs_attention`. Staff retry the same run, which reads Polar state before it repeats a destructive
request.

## Official Polar Evidence

| Source                                                                                                                              | Relevant provider behavior                                                                                                                                                                                                                          | Samebase rule                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [List Checkout Sessions](https://polar.sh/docs/api-reference/checkouts/list-checkout-sessions)                                      | The list accepts `customer_id`, `external_customer_id`, and status filters. The documented states include `open`, `expired`, `confirmed`, `succeeded`, and `failed`.                                                                                | Read both Customer identities and block on `open` or `confirmed`.                                                                 |
| [Get Checkout Session](https://polar.sh/docs/api-reference/checkouts/get-checkout-session)                                          | `confirmed` means that the buyer clicked Pay. It is separate from `succeeded`.                                                                                                                                                                      | Do not use `confirmed` as payment success or safe deletion.                                                                       |
| [Update Checkout Session](https://polar.sh/docs/api-reference/checkouts/update-checkout-session)                                    | The documented update fields do not include status, cancel, or expire. Polar does not document a checkout deletion action.                                                                                                                          | Wait for provider settlement or expiry. Do not invent a cancel request.                                                           |
| [List Subscriptions](https://polar.sh/docs/api-reference/subscriptions/list-subscriptions)                                          | The list is paginated and can filter by Customer and subscription status.                                                                                                                                                                           | Process all pages in bounded reads and re-read after revocation.                                                                  |
| [Managing subscriptions](https://polar.sh/docs/features/subscriptions/manage)                                                       | Cancel at period end keeps the subscription active until the period ends. Immediate revoke ends it now and revokes benefits. A paused subscription can resume and charge again. `unpaid`, `incomplete_expired`, and `canceled` are terminal states. | Revoke `incomplete`, `trialing`, `active`, `past_due`, and `paused` subscriptions. Do not rely on a period-end cancellation flag. |
| [Revoke Subscription](https://polar.sh/docs/api-reference/subscriptions/revoke-subscription)                                        | The delete operation revokes a subscription immediately.                                                                                                                                                                                            | Use immediate revoke before Customer deletion.                                                                                    |
| [Delete Customer](https://polar.sh/docs/api-reference/customers/delete-customer)                                                    | Customer deletion immediately cancels active subscriptions, revokes benefits, and clears the external ID. `anonymize=true` also anonymizes supported personal data. Polar retains information needed for historical orders and subscriptions.       | Use anonymized Customer deletion as the final destructive provider action. Do not promise removal of Polar transaction history.   |
| [Implementing Seat-Based Pricing](https://polar.sh/docs/guides/seat-based-pricing)                                                  | A seat-based purchase changes the Customer to `type: "team"`. Members and CustomerSeats separate the payer from benefit users. Revoking a seat does not reduce the paid subscription quantity.                                                      | Delete the team Customer billing relation. Do not treat individual seat revocation as charge cleanup.                             |
| [List Members](https://polar.sh/docs/api-reference/members/list-members)                                                            | Members can be listed by Customer ID or external Customer ID. Roles include `owner`, `billing_manager`, and `member`.                                                                                                                               | Record the team Member result in Sandbox validation. Member existence alone is not a charge relation.                             |
| [Webhook Events](https://polar.sh/docs/integrate/webhooks/events)                                                                   | Polar documents `customer.deleted`, `subscription.revoked`, and benefit-revocation events. Its period-end and immediate cancellation sequences can send several subscription events.                                                                | Webhook handlers must reject state restoration for a deleting or missing Samebase organization.                                   |
| [Webhook Delivery](https://polar.sh/docs/integrate/webhooks/delivery)                                                               | Polar retries failed webhook delivery with exponential backoff. These retries can deliver an older event after a later API operation.                                                                                                               | Treat webhooks as delayed signals, not as authority to bypass the deletion gate.                                                  |
| [Sandbox Environment](https://polar.sh/docs/integrate/sandbox) and [API Overview](https://polar.sh/docs/api-reference/introduction) | Sandbox data and tokens are isolated from production. The Sandbox API base URL is `https://sandbox-api.polar.sh/v1`.                                                                                                                                | Run the acceptance matrix only with a dedicated Sandbox Customer and a Sandbox token.                                             |

## Unresolved Provider Behavior

Official Polar documentation does not answer these points:

- It does not define an API action that cancels or expires a checkout. It does not give a fixed
  maximum time for the `confirmed` state.
- Customer deletion documents subscription, benefit, external-ID, and personal-data effects. It does
  not state how deleted team Customer Members and CustomerSeats appear in later list calls.
- The revoke and Customer delete pages do not promise that a repeated delete returns the same
  success response. Samebase must treat a not-found result as a prompt to verify current state, not
  as proof by itself.
- Customer deletion does not promise a refund. Refunds are not part of organization deletion.

These gaps do not permit a less strict lifecycle. Samebase keeps the checkout fence and requires
post-delete reads. A historical Member or CustomerSeat can remain only if the Customer identity,
subscription, checkout, and future-charge relations are absent.

## Polar Sandbox Acceptance Matrix

Use one dedicated Customer external ID with a task-specific prefix. Record only non-secret Polar
object IDs in private test evidence. Do not put access tokens, checkout URLs, email addresses, or
payment details in this file.

| Case                          | Setup and action                                                                                             | Pass condition                                                                                                                                       | Status  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| No Polar Customer             | Create a Samebase billing row with no external Customer ID. Start organization deletion.                     | The process skips Polar cleanup and starts local cleanup.                                                                                            | Pending |
| Customer without subscription | Create a team Customer with the reserved external ID. Delete with `anonymize=true`.                          | Reads by internal and external Customer identity do not return an active Customer.                                                                   | Pending |
| Open checkout                 | Create but do not complete a checkout for the exact external ID. Start cleanup.                              | Cleanup stays in its bounded running wait and does not delete the Customer or local billing row.                                                     | Pending |
| Confirmed checkout            | Submit Pay and observe `confirmed` before its terminal state. Start cleanup during that state.               | Cleanup waits and does not treat `confirmed` as success.                                                                                             | Pending |
| Active team subscription      | Buy a seat product, create at least one Member and CustomerSeat, and confirm a benefit grant. Run cleanup.   | All nonterminal subscriptions are revoked before anonymized Customer deletion. No future renewal can occur.                                          | Pending |
| Period-end cancellation       | Set the active subscription to cancel at period end, then run cleanup.                                       | Cleanup still revokes it immediately before Customer deletion.                                                                                       | Pending |
| Paused subscription           | Pause a subscription that can resume, then run cleanup.                                                      | Cleanup revokes it and leaves no resumable billing relation.                                                                                         | Pending |
| Team Member and CustomerSeat  | List Members and seats before and after Customer deletion.                                                   | The retained provider presentation is recorded. Any retained row has no active Customer, benefit, checkout, subscription, or future-charge relation. | Pending |
| Benefit cleanup               | Record granted benefits before cleanup and read provider state after cleanup.                                | Customer deletion or subscription revocation removes active benefit grants.                                                                          | Pending |
| Repeated revoke and delete    | Stop a request after each destructive provider response, then retry the same run.                            | The retry reads state, completes without a false failure, and does not create a second Customer.                                                     | Pending |
| Delayed webhooks              | Redeliver pre-delete checkout, subscription, Customer, seat, and benefit events after local deletion starts. | No event restores local billing state or schedules seat work for the deleting or missing organization.                                               | Pending |

Until these Sandbox cases have evidence, the implementation can ship to review but cannot claim
provider acceptance is complete.
