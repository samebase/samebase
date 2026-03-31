# 072 Cloudflare Tunnel Local Preview And Control Research

## Document Control

- Status: Research note
- Owner: Cloudflare tunnel transport
- Last updated: 2026-03-31
- Related docs:
  - `specs/012_DEV_ENV_ORIGIN_SITE_URL_SYNC_SPEC.md`
  - `specs/054_DAYTONA_BROWSER_CONVEX_TRANSPORT_SPEC.md`
  - `rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md`

## Purpose

Capture the transport learnings from the Cloudflare tunnel research work so the
next mobile-control slice does not have to rediscover them.

This research started from local anon preview sharing, but the tunnel findings
also apply to a future machine-local Codex control service.

## Verified Findings

### 1. The repo already has a working same-origin proxy pattern

The app already knows how to keep a browser on one public origin while proxying
traffic to a private local backend.

That matters because a tunnel does not automatically require two public
hostnames.

Conclusion:

1. one public browser origin is the preferred starting shape
2. a second public backend hostname should be added only if the browser truly
   needs it

### 2. Local frontend ports are not stable enough to hardcode today

The Vite frontend can move off its preferred port when that port is occupied.
Any tunnel launcher that assumes a fixed browser port will eventually point at
the wrong process.

Conclusion:

1. tunnel lifecycle must either force strict-port behavior or discover the
   actual chosen port after startup
2. `noter-sync run` is a better long-running owner for that logic than ad hoc
   shell steps

### 3. Anonymous and local browser flows need explicit origin handling

In anonymous mode, the current dev flow does not automatically sync local Convex
`SITE_URL` from a public preview origin.

Conclusion:

1. if a tunneled browser flow needs OAuth or callback redirects, the tunnel
   wrapper must update the public origin explicitly
2. this is transport plumbing, not product auth

### 4. Cloudflare quick tunnels are the lowest-friction prototype path

Observed local state showed `cloudflared` was installed while named-tunnel login
state was not configured.

Conclusion:

1. quick tunnels are the fastest way to prove the first operator-facing flow
2. named tunnels can follow later if stable DNS or Cloudflare Access policy is
   needed

### 5. A tunnel is only transport

Cloudflare Tunnel makes a local service reachable from the public internet, but
it does not solve:

1. ownership checks
2. machine discovery in Noter
3. browser auth brokerage
4. command or data modeling

Conclusion:

1. the tunnel URL must not be treated as the security boundary
2. Noter still needs its own machine-control auth model on top of the tunnel

## Transport Guidance

For future mobile-control work, the repo should treat these decisions as the
default starting point:

1. prefer one public origin over separate public frontend and backend origins
2. keep private local backends private whenever the browser can stay on one
   public origin
3. use quick tunnels for the first prototype and first operator MVP
4. move to named tunnels only when stable DNS or access policy becomes a real
   product need
5. let the machine-scoped local runner own tunnel lifecycle rather than tying it
   to Vite middleware or hand-written shell instructions

## Relevance To Tunneled Local Codex Control

For the phone-control direction in
`rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md`, this research implies:

1. Cloudflare Tunnel is a viable transport layer for a machine-local HTTP
   control service
2. an ephemeral quick-tunnel URL is acceptable for the first MVP if Noter
   publishes the latest live URL on the machine record
3. Noter should continue to own discovery and auth brokerage instead of pushing
   those concerns down into the tunnel itself
