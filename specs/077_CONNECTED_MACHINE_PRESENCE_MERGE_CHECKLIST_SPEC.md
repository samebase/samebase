# 077 Connected Machine Presence Merge Checklist Spec

## Document Control

- Status: Accepted
- Owner: connected machine onboarding + presence
- Last updated: 2026-03-31
- Related docs:
  - `specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md`
  - `specs/075_CONNECTED_MACHINE_INSTALLER_LOCAL_WALKTHROUGH_SPEC.md`
  - PR `#386`

## Summary

This file is the working merge checklist for the connected-machine registration
and presence slice currently shipping in `#386`.

Use it as the source of truth for what is still blocking squash merge. When a
follow-up lands, mark the checkbox here in the same patch instead of relying on
chat memory or scattered PR comments.

## Merge Rule

Do not squash-merge this slice until:

1. every `P1` and `P2` item below is checked off
2. required CI checks are green
3. no new equivalent blocker is introduced while addressing the current list

## Already Addressed

- [x] Restrict `~/.noter/config.json` to owner-only permissions when persisting
      `machineCredential`
- [x] Use backend `ConnectedMachineView` on the machine page instead of a
      duplicated local frontend shape
- [x] Make the machine-registration state switch exhaustive on the machine page

## Open `P1` Blockers

- [ ] Recompute connected-machine staleness without relying on Convex query
      reruns

  - Current risk: a connector that dies without an explicit offline heartbeat
    can remain shown as online in already-open browser tabs.
  - Primary area: `apps/noter/convex/connectedMachines.ts`

- [ ] Restrict the runtime Convex site URL to HTTPS outside loopback

  - Current risk: a misconfigured `convexSiteUrl` can send the bearer machine
    credential over plaintext HTTP.
  - Primary area: `packages/sync/noter.js`

- [ ] Add abuse control or gating before unauthenticated bootstrap requests can
      create registration rows

  - Current risk: anonymous callers can create unlimited
    `machineRegistrationRequests`.
  - Primary area: `apps/noter/convex/connectedMachineHttp.ts`

- [ ] Remove the type assertion in the heartbeat capability parsing path
  - Current risk: this violates repo safety rules and weakens parser guarantees.
  - Primary area: `apps/noter/convex/connectedMachineHttp.ts`

## Open `P2` Blockers

- [ ] Preserve approved browser handoff state after the original TTL passes

  - Current risk: an already-approved request can later look expired even though
    credential issuance succeeded.
  - Primary area: `apps/noter/convex/connectedMachines.ts`

- [ ] Refresh browser-side registration expiry without depending on a follow-on
      table write

  - Current risk: an open `/machines/connect?requestId=...` tab can keep showing
    `pending` after expiry until another write happens.
  - Primary area: `apps/noter/convex/connectedMachines.ts`

- [ ] Reject stale approvals that would rotate the machine credential backward

  - Current risk: approving an older request can replace the stored credential
    with a now-stale hash while the local config already holds a newer secret.
  - Primary area: `apps/noter/convex/connectedMachines.ts`

- [ ] Keep `noter-sync run` alive across transient heartbeat publish failures

  - Current risk: one brief network or 5xx failure can terminate the connector
    loop and incorrectly mark the machine offline.
  - Primary area: `packages/sync/noter.js`

- [ ] Resolve `convexSiteUrl` once before entering the heartbeat loop

  - Current risk: a temporary outage of the hosted app or `/noter-connect.json`
    path can kill the connector even when Convex itself is healthy.
  - Primary area: `packages/sync/noter.js`

- [ ] Hydrate the selected thread back into the research page after using the
      browser view

  - Current risk: the research page can reopen the wrong/default thread after
    the user picks one in `/research/codex-app-server/browser`.
  - Primary area: `apps/noter/src/components/CodexAppServerResearchPage.tsx`

- [ ] Scrub developer-specific filesystem paths from the research visual fixture
  - Current risk: fixture text and screenshot artifacts leak local machine/user
    details into the repo.
  - Primary area:
    `apps/noter/src/components/CodexAppServerResearchVisualFixture.tsx`

## Open `P3` / Nice-To-Resolve Before Merge

- [ ] Recheck whether the reviewed command/help text and walkthrough still match
      the final shipped flow after the blocker fixes above land
  - Primary areas:
    `specs/075_CONNECTED_MACHINE_INSTALLER_LOCAL_WALKTHROUGH_SPEC.md` and the PR
    description

## Verification Checklist For Closing This File

- [ ] PR `#386` has no remaining unresolved non-outdated `P1`/`P2` review
      threads
- [ ] manual local test still passes:
  - `connect` opens browser handoff
  - browser approval succeeds
  - `run` keeps heartbeats alive
  - machine goes offline after stopping `run`
- [ ] final CI is green
