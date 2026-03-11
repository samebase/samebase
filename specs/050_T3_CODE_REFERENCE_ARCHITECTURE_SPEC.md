# 050 T3 Code Reference Architecture Spec

## Status

- Reference
- Last updated: 2026-03-11

## Purpose

Capture how T3 Code actually works so Noter can borrow the right ideas without
mixing them into the Daytona Codex auth spec.

This is a reference study, not an implementation commitment.

## Executive Summary

T3 Code is not just a terminal wrapper around Codex CLI.

Its main chat UI talks to a backend service that starts `codex app-server` per
session and translates provider events into a normalized runtime model. The
terminal is a separate side drawer built with `xterm`, not the main Codex UI.

The strongest reusable idea for Noter is:

1. treat Codex as a provider runtime, not as a terminal session
2. keep terminal as an escape hatch, not the primary UX
3. separate prompt/chat UI from terminal UI

The main thing Noter should not copy directly is T3 Code's local-desktop
assumption. T3 Code is local-server-first. Noter should stay web-first.

## Verified Findings

### Codex integration

1. T3 Code requires Codex CLI to be installed and authenticated first.
2. T3 Code starts `codex app-server` per session.
3. The server spawns `codex app-server` with:
   - `cwd`
   - optional `CODEX_HOME`
   - stdio pipes
4. T3 Code calls `initialize`, then opens or resumes a Codex thread over the app
   server protocol.

### App architecture

1. The web client talks to the backend over WebSocket.
2. The transport is JSON-RPC-like request/response plus typed push channels.
3. The backend exposes provider methods like:
   - `providers.startSession`
   - `providers.sendTurn`
   - `providers.interruptTurn`
   - `providers.respondToRequest`
   - `providers.stopSession`
4. Codex is modeled as a provider. Claude Code is reserved but not yet
   implemented.

### UI split

1. The main prompt/composer is not a terminal.
2. The prompt/composer uses Lexical.
3. The terminal drawer uses `@xterm/xterm`.
4. The terminal backend uses `node-pty`.

### Local persistence

1. T3 Code persists state locally with sqlite.
2. The server also supports an auth token for WebSocket connections.
3. T3 Code is designed around a local companion server, even when the frontend
   is a web app.

## T3 Code Flow

### Main agent flow

1. User opens the app UI.
2. UI calls backend provider methods over WebSocket.
3. Backend starts `codex app-server`.
4. Backend normalizes Codex runtime events into app-level events.
5. UI renders messages, plans, approvals, runtime state, and diffs from that
   normalized stream.

### Terminal flow

1. User opens the terminal drawer.
2. UI creates a PTY-backed terminal session.
3. `xterm` renders terminal output.
4. The terminal is secondary tooling, not the main Codex interaction model.

## Important Clarification

When people say "T3 Code uses xterm", that is only true for the terminal pane.

It is not true for the main Codex chat surface.

The main Codex surface is:

1. app-specific React UI
2. Lexical for the prompt input
3. provider state driven by `codex app-server`

## Why This Matters For Noter

Noter is deciding between two different product directions:

1. better terminal around Codex CLI
2. T3-style provider runtime around `codex app-server`

These are not the same thing.

The Daytona volume auth spec is about keeping Codex credentials alive in the
sandbox. That is compatible with either direction.

## What Noter Should Reuse

### Strong matches

1. Treat Codex as a provider runtime backed by `codex app-server`.
2. Keep the main prompt/chat UI separate from terminal UI.
3. Normalize provider runtime events into a stable app contract.
4. Keep terminal as an escape hatch.
5. Pass explicit `cwd` and `CODEX_HOME` into the provider runtime.

### Partial matches

1. JSON-RPC-style transport is reasonable, but Noter does not need to copy the
   exact T3 protocol.
2. Their provider abstraction is good as a concept, but Noter should fit it into
   Convex and existing provider patterns.

## What Noter Should Not Reuse Directly

1. Local desktop server as the primary deployment model.
2. Local sqlite as the system of record.
3. Local shell/editor integration assumptions.
4. `node-pty` as the main backend terminal primitive when Daytona PTY already
   exists.

## Web-First Translation For Noter

If Noter wants the T3-style Codex experience but stays web-first, the clean
translation is:

1. Codex auth persists in Daytona volume at `CODEX_HOME`.
2. Noter launches a Daytona sandbox with that volume mounted.
3. Inside that sandbox, Noter starts `codex app-server`.
4. Noter proxies app-server events into a web-safe runtime surface.
5. Convex stores user-visible session/thread state and durable metadata.
6. The main Noter UI renders Codex output without exposing a raw terminal.
7. A terminal remains available as a secondary tool.

## Recommended Product Direction

For Noter, the clean sequence is:

1. ship Daytona volume-backed Codex auth persistence first
2. keep terminal login as the shortest path to a working system
3. separately design a web-first Codex provider runtime around
   `codex app-server`

That means:

1. do not merge the T3-style provider runtime into the auth persistence spec
2. do not confuse terminal UX work with `codex app-server` architecture work
3. do treat T3 Code as the reference for the second problem

## Sources

### Local fork

1. `~/dev/forks/t3code/.docs/codex-prerequisites.md`
2. `~/dev/forks/t3code/.docs/provider-architecture.md`
3. `~/dev/forks/t3code/apps/server/src/codexAppServerManager.ts`
4. `~/dev/forks/t3code/apps/server/src/wsServer.ts`
5. `~/dev/forks/t3code/apps/server/src/config.ts`
6. `~/dev/forks/t3code/apps/server/src/persistence/NodeSqliteClient.ts`
7. `~/dev/forks/t3code/apps/web/src/components/ThreadTerminalDrawer.tsx`
8. `~/dev/forks/t3code/apps/web/src/components/ComposerPromptEditor.tsx`
9. `~/dev/forks/t3code/apps/web/src/wsTransport.ts`
10. `~/dev/forks/t3code/apps/web/src/nativeApi.ts`
11. `~/dev/forks/t3code/packages/contracts/src/provider.ts`
12. `~/dev/forks/t3code/packages/contracts/src/providerRuntime.ts`

### Public repo

1. https://github.com/pingdotgg/t3code
2. https://t3.codes/
