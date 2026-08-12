# 124 Simple Organization Deletion Spec

## Status

Accepted. This document is the source of truth for the first organization deletion release.

## Product Contract

Organization deletion is a staff operation. Samebase does not show a self-service organization
deletion control in this release.

Staff run one internal mutation with the organization ID and the exact GitHub owner login. The login
is the deletion confirmation.

The mutation accepts deletion only when all these conditions are true:

- The organization has exactly one membership, and that member is an active owner.
- The organization has no Samebase vaults. The owner must delete each vault first and keep all
  provider resource deletion options off.
- Billing is `free` and `inactive`.
- Billing has no Polar Customer ID and no pending or open checkout.
- No provisioning data remains.
- Every retained vault deletion run succeeded.

Staff resolve a failed condition and run the same mutation again. There is no organization deletion
state, queue, retry service, or status page.

## Local Data

The mutation deletes these Samebase records in one Convex transaction:

- The organization, its sole membership, and its billing row.
- Invitations, provider credentials, and provider OAuth callback state.
- GitHub App setup state linked to the organization.
- Organization folder and tree preferences.
- Successful vault deletion runs and their events.

If any read or write fails, Convex rolls back the transaction. The mutation does not report success
after a partial local deletion.

## External Resources

The mutation does not call GitHub, Convex, Cloudflare, or Polar. It does not uninstall the GitHub
App or delete repositories, projects, deployments, Workers, or domains.

Paid organizations and organizations with unresolved provider work stay manual until real customer
use requires a larger product flow.

## Account Deletion

Account deletion requires zero organization memberships. A member leaves each shared organization
first. Staff delete a sole-owner organization after its vaults are removed. Account deletion never
removes a membership.

## Required Validation

- A wrong organization login, a shared organization, a vault, unsafe billing, or unfinished work
  rejects deletion without changing data.
- A valid deletion removes all listed Samebase records in one mutation.
- Account deletion with any membership creates no deletion run and gives the user a clear next step.
