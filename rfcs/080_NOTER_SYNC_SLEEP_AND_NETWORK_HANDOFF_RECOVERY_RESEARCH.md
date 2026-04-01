# 080 Noter Sync Sleep And Network Handoff Recovery Research

## Document Control

- Status: Research note
- Owner: connected machine runtime supervision
- Last updated: 2026-04-01
- Related docs:
  - `specs/075_CONNECTED_MACHINE_INSTALLER_LOCAL_WALKTHROUGH_SPEC.md`
  - `specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md`
  - `rfcs/072_CLOUDFLARE_TUNNEL_LOCAL_ANON_PREVIEW_RESEARCH.md`
  - `rfcs/073_CODEX_PLUGIN_CONNECTED_MACHINE_ONBOARDING_RESEARCH.md`
  - `rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md`
  - `PR #395`

## Purpose

Capture the current recovery gap for `noter-sync run` when a laptop sleeps or
changes networks so the next connected-machine slice can address it directly
without mixing that work into the separate Windows command-support PR.

This note is intentionally narrow. It does not propose a broad runtime rewrite.
It records one real operator report, the current code shape behind it, relevant
Cloudflare tunnel context, and the smallest reasonable follow-up direction.

## Reported Runtime Behavior

Observed on 2026-04-01 from the direct production command:

```bash
curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run
```

Observed terminal output:

```text
# noter sync connector running

- source: https://noter.md/noter.js
- machine: machine_hGHmmpu_m6MYcAaF
- local-control: http://127.0.0.1:55994
- live-control: starting
- status: publishing heartbeats until this process exits
cloudflared quick tunnel ready: https://anywhere-purse-cafe-caused.trycloudflare.com
fetch failed
fetch failed
fetch failed
```

Operator context:

1. the machine initially had working Wi-Fi
2. the laptop was closed and slept
3. the laptop was reopened on a different Wi-Fi network
4. the connector process kept running, but it did not appear to recover

## Verified Code Findings

### 1. Heartbeat publishing retries, but it does not supervise recovery

`runHeartbeatLoop()` in `packages/sync/noter.js` continuously retries the
heartbeat POST every 15 seconds. On non-auth failures it only logs the raw error
message and sleeps until the next tick.

That means the current loop does **not**:

1. refresh `noter-connect.json`
2. re-probe local control readiness
3. restart `cloudflared`
4. recreate the local control server

Conclusion:

1. repeated transport failures currently produce repeated warnings, not a
   recovery path

### 2. Local control readiness is only checked during startup

`runConnectorCommand()` starts the local control server, reads `/status`, runs
the auth readiness probe, and only then decides whether to publish a quick
tunnel.

Those checks happen once during startup. After startup, the long-running body is
just the heartbeat loop.

Conclusion:

1. if the local service or auth path becomes unhealthy after wake, the current
   process does not notice unless a later code path happens to touch it

### 3. The Cloudflare quick tunnel is started once and never restarted

`startCloudflaredQuickTunnel()` updates live-control state when `cloudflared`
publishes a quick-tunnel URL, errors, or exits. That status wiring is useful,
but nothing in the current runtime supervises the child after startup.

Conclusion:

1. if `cloudflared` exits after the machine wakes or after the network changes,
   the process can downgrade to `unavailable` and stay there until the operator
   restarts `noter-sync run`

### 4. The terminal error surface is too thin for field debugging

`fetchWithTimeout()` wraps timeouts, but it rethrows other fetch failures
unchanged. That matches the observed `fetch failed` output.

Conclusion:

1. the current logs do not identify which request failed
2. the current logs do not tell the operator whether the problem is heartbeat
   transport, config refresh, local control, or tunnel readiness

## What This Confirms Versus What It Suggests

Confirmed from repo code:

1. presence retries exist
2. tunnel startup is one-shot
3. local-control readiness probing is one-shot
4. repeated non-auth request failures do not trigger a recovery action

Reasonable inference from the report plus the code:

1. sleep plus Wi-Fi handoff can leave the connector process alive but degraded
2. the current runtime is missing a supervisor for the components most likely to
   need restart after a network transition

Not yet proven by this note:

1. whether the repeated `fetch failed` lines came from the heartbeat endpoint,
   another remote request, or an undici-specific post-sleep transport bug
2. whether `cloudflared` itself exited, stayed alive but disconnected, or
   recovered internally while the heartbeat path stayed broken

## Upstream Tunnel Context

Cloudflare's docs describe tunnel retry behavior with backoff and protocol
fallback, which means `cloudflared` is expected to attempt self-recovery on many
network failures.

That is helpful, but it is not a sufficient product guarantee for Noter.

There is also an open upstream `cloudflared` issue reporting failure to
re-establish after network disconnection or router reboot:

- Cloudflare Tunnel run parameters:
  `https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/`
- Cloudflare Tunnel troubleshooting:
  `https://developers.cloudflare.com/tunnel/troubleshooting/`
- `cloudflare/cloudflared#1381` (opened 2024-12-28)

Conclusion:

1. Noter should treat Cloudflare retry behavior as helpful transport behavior,
   not as the sole recovery plan for the connected-machine process

## Recommended Next Slice

The smallest follow-up that matches this research is:

1. keep this next PR research-only
2. add explicit runtime supervision in a later implementation PR

That implementation slice should likely:

1. log request failures with the specific operation and URL label, not just
   `fetch failed`
2. periodically re-run local control readiness checks after startup
3. restart `cloudflared` when it exits unexpectedly
4. decide whether repeated heartbeat transport failures should also trigger
   tunnel revalidation or restart
5. avoid broad architecture churn while `#395` continues to handle Windows
   direct-command support separately

## Out Of Scope For This Research PR

This note does **not** change:

1. the direct command text or platform-specific installer UX
2. the connected-machine auth model
3. the phone-control architecture from `rfcs/078`
4. the runtime implementation itself

Those should stay in separate follow-up PRs so the recovery work can be scoped
and reviewed on its own.
