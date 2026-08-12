# 124 Simple Organization Deletion Spec

## Status

Accepted. This document is the source of truth for the first organization deletion release.

## Product Contract

Organization deletion is an owner operation in Organization settings.

The owner enters the exact GitHub owner login as the deletion confirmation. The client then calls
one authenticated mutation.

The mutation accepts deletion only when all these conditions are true:

- The organization has exactly one membership, and that member is the active owner who requests
  deletion.
- The organization has no Samebase vaults. The owner must delete each vault first and keep all
  provider resource deletion options off.
- Billing is `free` and `inactive`.
- Billing has no Polar Customer ID and no pending or open checkout.
- No provisioning data remains.
- Every retained vault deletion run succeeded.

The owner resolves a failed condition and tries the mutation again. There is no organization
deletion state, queue, retry service, or status page.

An organization always has at least one active owner while it exists. The mutation deletes the last
membership and the organization in the same transaction. The last owner cannot leave the
organization without deleting it.

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
first. A sole owner removes every vault and deletes the organization. Account deletion never removes
a membership.

## Required Validation

- A wrong organization login, a shared organization, a vault, unsafe billing, or unfinished work
  rejects deletion without changing data.
- A member who is not the owner cannot delete the organization.
- A valid deletion removes all listed Samebase records in one mutation.
- No successful operation commits an organization without an active owner.
- Account deletion with any membership creates no deletion run and gives the user a clear next step.
