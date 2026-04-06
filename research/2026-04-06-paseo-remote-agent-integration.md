# Paseo Remote-Agent Integration Research

Date: 2026-04-06

## Why This Document Exists

We explored whether [Paseo](https://paseo.sh/) is relevant to Noter's
connected-machine and phone-control direction, especially for the narrower
"control Codex from my phone" workflow.

This note captures the current product fit, deployment model, and licensing
constraints so later decisions do not depend on chat history alone.

## What Paseo Is

Paseo is a self-hosted daemon plus client stack for running coding-agent CLIs on
your own machine and controlling them from desktop, mobile, web, or a CLI.

The current root README positions it as:

- one interface for Claude Code, Codex, and OpenCode
- local execution on the operator's own machine
- voice input and cross-device control
- headless CLI or desktop entrypoints

The repo code currently exposes a slightly broader provider surface than the
headline copy: `claude`, `codex`, `copilot`, `opencode`, and `pi`.

## Evidence Reviewed

External sources:

- [Paseo homepage](https://paseo.sh/)
- [Paseo docs](https://paseo.sh/docs)
- [Paseo configuration docs](https://paseo.sh/docs/configuration)
- [Paseo security docs](https://paseo.sh/docs/security)
- [Paseo CLI docs](https://paseo.sh/docs/cli)
- [Paseo GitHub repo](https://github.com/getpaseo/paseo)
- [GNU AGPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html)
- [GNU AGPL v3 text](https://www.gnu.org/licenses/agpl-3.0.dbk)

Repo evidence gathered from a local clone at commit `7a2d9760`:

- root README and package map
- provider manifest
- release metadata
- GitHub workflow inventory

## Repo Findings

### Product Shape

The root README describes a local daemon that manages agent processes while
desktop, mobile, web, and CLI clients connect to it. The CLI examples show
provider selection, follow-up prompts, remote daemon addressing, and worktree
selection.

The monorepo currently contains these main packages:

- `packages/server`: daemon, process orchestration, WebSocket API, MCP server
- `packages/app`: Expo app for iOS, Android, and web
- `packages/cli`: `paseo` CLI
- `packages/desktop`: Electron desktop app
- `packages/relay`: remote connectivity package
- `packages/website`: marketing site and docs

### Maturity

As of this research:

- the repo is active and recently updated
- the latest release is `v0.1.47`
- releases are shipping quickly, which suggests fast iteration and API churn

### Documentation Quality

The root README and live docs appear current enough to describe the real product
direction.

Some package-level docs are stale. In particular, `packages/server/README.md`
still reads like an older "voice assistant" project and lists `MIT`, while the
root repo declares `AGPL-3.0-or-later`.

Conclusion: treat root docs, release metadata, and current code as the reliable
source of truth, not package-level historical readmes.

## Deployment Findings

### Linux

Linux appears to be a first-class target:

- releases include Linux artifacts
- the CLI/headless path is explicitly documented for remote machines
- the security docs describe the daemon running on a laptop, Mac Mini, VPS, or
  Docker container

### GitHub Codespaces And Dev Containers

This workflow is not described as a first-party named setup, but it appears
architecturally feasible.

Reasons:

- the daemon can run headlessly
- relay mode only needs outbound network connectivity
- runtime state can be relocated via `PASEO_HOME`
- the user can pair a remote daemon with a phone client through the normal
  pairing flow

Expected caveats in ephemeral environments:

- Codex or other provider CLIs must be installed inside the remote environment
- auth must also exist inside that environment
- daemon state and auth files need persistence if the environment is disposable
- sleep, rebuild, or garbage-collection of the environment will terminate the
  connection

## Fit For Noter

### Where Paseo Looks Strong

Paseo already addresses a narrow but meaningful slice of the problem Noter has
also been exploring:

- remote control of local or remote coding agents
- phone-friendly oversight of running agents
- QR-style pairing
- relay/direct connection modes
- worktree-aware agent execution
- provider abstraction over multiple agent CLIs

For the specific "run Codex on a machine I own and control it from my phone"
workflow, Paseo looks much closer to a complete solution than a sketch or demo.

### Where Paseo Is Not The Same Product

Paseo looks like infrastructure or an operator-facing control surface.

Noter is broader than remote agent transport. Noter has its own product shape,
state model, connected-machine concepts, and longer-term workflow identity.

That makes Paseo more relevant as:

- architectural reference material
- an optional external daemon integration target
- a temporary bootstrap for validating the workflow

and less relevant as:

- a full replacement for Noter
- the main product surface Noter should collapse into

### Product Identity Risk

If Noter permanently depends on Paseo for a core user-facing workflow, the
important question is whether users still feel like they are using Noter.

The safest framing is:

- Noter owns the user workflow, data model, and product identity
- Paseo, if used at all, is treated as transport or orchestration

The risky framing is:

- users are effectively using Paseo through a thin Noter wrapper

## Licensing Findings

### What License Paseo Uses

The root repo declares `AGPL-3.0-or-later`.

### Practical Meaning

AGPL is GPL-style copyleft with an extra rule for network software. The
important addition is that if someone modifies an AGPL program and lets users
interact with that modified version over a network, those users must be able to
get the corresponding source of that modified version.

### What Looks Safer For Noter

The safer architecture is:

- Paseo stays a separate external program or service
- Noter relies only on Paseo's public interface
- users install or run Paseo separately, ideally from upstream or from a public
  fork

This is much safer than:

- copying Paseo code into Noter
- linking internal Paseo modules into Noter
- shipping a tightly integrated modified fork as if it were part of the same
  proprietary program

### Public Forks Help, But They Do Not Solve Everything

Publishing any Paseo fork helps satisfy AGPL expectations for that fork.

It does not automatically answer the separate "combined work" question. If Noter
and Paseo stay as separate programs communicating through a normal external
boundary, the integration story is much cleaner than if the codebases are merged
or tightly embedded.

## Recommended Direction

If we want to learn from Paseo without blurring product identity or licensing
boundaries, the strongest order of operations is:

1. study and copy the ideas, not the code
2. keep any initial integration at a public CLI or API boundary
3. prefer user-supplied or separately deployed Paseo daemons over bundling
4. keep any Paseo fork public if we make one
5. decide later whether the proven workflow should be reimplemented inside Noter

## Bottom Line

Paseo is highly relevant to Noter's connected-machine research, especially for
phone control of Codex and similar agents.

The best near-term use is as a reference architecture or optional external
daemon integration, not as code to absorb into Noter.
