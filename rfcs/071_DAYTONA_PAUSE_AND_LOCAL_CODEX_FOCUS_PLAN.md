# Daytona Pause And Local Codex Focus Plan

## Summary

Pause Daytona-driven product surfaces and background snapshot churn while Noter
focuses on connecting to the local-machine Codex flow.

## Context

- Current production noise is dominated by Daytona snapshot retries and related
  failure banners.
- That churn is distracting from the immediate product goal.
- The current `CodexProviderRow` is also Daytona-backed, which points the user
  toward the wrong integration surface for the current phase.

## Decision

For this phase, treat Daytona as paused rather than as an active product area.

Implementation scope:

- stop auto-enqueuing new Daytona snapshot builds from repository sync updates
- stop scheduled snapshot retries from re-arming themselves
- return a clear pause message from Daytona-backed actions instead of attempting
  work
- hide Daytona UI surfaces from dashboard and file view
- hide the Daytona-backed Codex connection row until local-machine Codex is the
  active path

## Non-Goals

- deleting existing Daytona code or schema
- removing historical Daytona snapshot records
- designing the local-machine Codex connection flow in this patch

## Follow-Up Focus

After this pause lands, the active product track should be:

- define how Noter discovers and connects to the local machine Codex
- replace Daytona-backed Codex auth/setup with a local-machine connection model
- reintroduce UI only after the local path is concrete and working
