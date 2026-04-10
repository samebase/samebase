# DNS and Domain Strategy Specification (Pilot 1)

## Document Control

- Status: Proposed
- Owner: Noter platform
- Date: 2026-02-13
- Related specs:
- `/Users/nicu/dev/my/noter/specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
- `/Users/nicu/dev/my/noter/specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`

## Summary

This spec defines DNS and domain management for noter-managed vault apps with a
pilot-first rollout that prioritizes simplification and low migration risk.

Decisions:

1. `noter.md` remains Cloudflare-managed in pilot.
2. `apps.noter.md` is delegated to Netlify DNS.
3. Noter-managed vault production URLs use custom domains under `apps.noter.md`.
4. Preview deploys use Netlify default preview URLs in pilot.
5. Main app domain migration is deferred until pilot acceptance criteria are
   met.

## Goals

1. Reduce operational complexity for generated apps.
2. Keep production domain behavior predictable and automatable.
3. Avoid risky cutover of the main app domain during pilot.
4. Preserve the ability to move the main app to Netlify later.

## Non-Goals

1. Migrating apex `noter.md` DNS authority in this phase.
2. Custom preview domains per branch in this phase.
3. Per-user DNS providers in this phase.

## Current State

1. Vault infra is already Netlify-centric in provisioning.
2. Provisioning currently creates Netlify sites with `configure_dns=false`.
3. `vaultDomains` supports `netlify_default` and `netlify_custom`.
4. Branch custom domain automation is currently deferred.

## Scope

In scope:

1. Delegated subdomain DNS strategy for managed vault apps.
2. Production hostname policy under delegated zone.
3. Backend automation requirements for custom production domain assignment.
4. Preview URL policy using Netlify defaults.

Out of scope:

1. Apex domain authority transfer.
2. Branch custom domain certificates and DNS automation.
3. Any Cloudflare WAF/ruleset redesign.

## Architecture Decisions

### DNS Topology

1. Cloudflare remains authoritative for `noter.md`.
2. `apps.noter.md` is delegated via NS records to Netlify DNS.
3. Netlify manages records under delegated zone for managed vault apps.

### Hostname Policy

1. Production hostnames use single-label format before `apps.noter.md`.
2. Format: `{owner}-{repo}-{suffix}.apps.noter.md`.
3. `suffix` is required for collision resistance and stable uniqueness.
4. Hostname generation must sanitize invalid DNS characters and enforce label
   length constraints.

### Preview Policy

1. Preview deploys do not receive custom DNS in pilot.
2. Preview URLs come from Netlify branch/deploy-preview URLs.
3. `vaultDomains` should still track preview URLs as `kind=branch_preview`,
   `source=netlify_default`.

## Public API / Interface / Type Changes

Planned additions:

1. New public action: `vaultActions.refreshVaultDomains({ vaultId })`.
2. New internal sync action for pulling branch preview URLs from Netlify deploy
   data.
3. Optional vault fields for domain sync observability:

- `infraLastDomainSyncAt?: number`
- `infraDomainSyncError?: string`

No breaking changes:

1. Existing `vault.getVaultInfrastructure` response remains compatible.
2. Existing provisioning trigger behavior remains unchanged.

## Provisioning Behavior Requirements

1. After site provisioning, Noter attempts to attach the generated custom
   production domain in Netlify.
2. On success:

- store custom URL as `netlifyProductionUrl`.
- upsert `vaultDomains` main row with `source=netlify_custom`.

3. On failure:

- keep fallback to Netlify default URL.
- set infra status to `partial` when base site is healthy but domain binding
  failed.
- keep retry path available.

## Security and Reliability

1. Use idempotent domain upsert semantics.
2. Enforce ownership checks on any manual domain refresh action.
3. Restrict domain automation to `isNoterManaged=true`.
4. Maintain audit-friendly logs for domain attach/sync failures.

## Rollout Plan

1. Phase 1: Create and validate delegated zone `apps.noter.md`.
2. Phase 2: Enable custom production domains for newly created noter-managed
   vaults.
3. Phase 3: Backfill existing noter-managed vaults via retry/sync action.
4. Phase 4: Evaluate moving main `noter` app hosting and optionally DNS
   authority.

## Acceptance Criteria

1. New noter-managed vault gets a production URL under `apps.noter.md`.
2. Preview deploy URLs are visible and synced in domain records.
3. Domain provisioning is retryable and idempotent.
4. Failed custom-domain attach does not break base app availability.
5. Existing connected (non-noter-managed) repos remain unaffected.

## Test Cases and Scenarios

1. Happy path:

- Provision vault.
- Custom production domain attaches.
- Main domain row saved as `netlify_custom`.

2. Fallback path:

- Force custom-domain attach failure.
- Verify default Netlify URL remains usable.
- Verify infra state and error reflect partial outcome.

3. Idempotency:

- Run provisioning/sync multiple times.
- Verify no duplicate or conflicting domain rows.

4. Preview sync:

- Create branch preview deploy.
- Verify `branch_preview` domain row is updated for that branch.

5. Authorization:

- Non-owner cannot trigger domain refresh.
- Non-managed vault cannot use managed-domain automation.

## Assumptions and Defaults

1. Pilot keeps Cloudflare for apex zone to reduce migration risk.
2. Delegated zone is `apps.noter.md`.
3. Single-label hostnames are preferred for simpler wildcard/cert handling.
4. Preview DNS customization is deferred.
5. Later migration of `noter.md` to Netlify is explicitly possible but not part
   of this pilot.

## References

- Netlify custom domains and external DNS:
  - https://docs.netlify.com/domains-https/custom-domains/configure-external-dns/
- Netlify DNS delegation:
  - https://docs.netlify.com/domains-https/netlify-dns/delegate-to-netlify/
- Cloudflare proxied DNS records:
  - https://developers.cloudflare.com/dns/manage-dns-records/reference/proxied-dns-records/
