# 103 Noter PR Preview Cleanup Spec

## Status

Accepted.

## Problem

Noter production uses Cloudflare Workers Builds. Each non-production PR build
runs the Noter build script with `WORKERS_CI_BRANCH` set to the PR branch, and
that script creates a Convex preview deployment with
`convex deploy --preview-create <branch>`.

After the PR is squash-merged, normal local cleanup deletes the worktree and git
branches, but it does not remove the remote preview resources created for
`noter.md` itself:

1. a Cloudflare Worker version with a preview URL
2. a Convex preview deployment for the same branch

These resources are not temporary Noter-managed vault infrastructure and must
not be handled by vault deletion.

## Decision

This workflow stays as a Codex/operator runbook for now, not a standalone
destructive script. The risky part is selecting the exact remote resources, so
the `clean` workflow should let Codex inspect the live Cloudflare and Convex
state before deleting anything.

The durable automation is limited to identifying future Cloudflare preview
uploads with branch-scoped metadata. Cleanup steps live in
`docs/noter-pr-preview-cleanup.md`.

## Behavior

The `clean` workflow includes a Noter PR preview cleanup step before deleting
the remote branch.

Codex must:

1. confirm the branch's GitHub PR is merged
2. compute the branch's Noter PR preview metadata
3. enumerate Cloudflare Worker versions and active deployments
4. enumerate Convex project deployments
5. delete only resources that exactly match the merged branch
6. stop without deleting anything when a candidate is ambiguous

## Cloudflare Cleanup

Future Workers preview uploads must attach branch-scoped metadata:

1. `--tag noter-pr-preview:<branch-hash>`
2. `--message "noter.md PR preview for <branch>"`
3. `--preview-alias <sanitized-branch>-<branch-hash>` when the alias fits
   Cloudflare's DNS label limit

Cleanup lists Worker versions for `CLOUDFLARE_WORKER_NAME`, selects only
versions whose `workers/tag` matches the branch tag, refuses versions that
appear in active Worker deployments, and deletes selected versions through the
Cloudflare Worker Versions API.

Cloudflare cleanup requires:

1. `DEV_SEED_CLOUDFLARE_API_KEY`
2. `DEV_SEED_CLOUDFLARE_ACCOUNT_ID`
3. `CLOUDFLARE_WORKER_NAME`

## Convex Cleanup

Cleanup resolves the `noter` Convex project under `DEV_SEED_CONVEX_TEAM_ID`,
lists project deployments, selects preview deployments whose reference or
metadata refers to the branch or `preview/<branch>`, and deletes selected
deployments through the Convex Management API.

Convex cleanup requires:

1. `DEV_SEED_CONVEX_MANAGEMENT_API_KEY`
2. `DEV_SEED_CONVEX_TEAM_ID`

## Safety Rules

1. Never delete the production Cloudflare Worker.
2. Never delete active Cloudflare Worker deployments.
3. Never delete untagged Cloudflare Worker versions by guessing from URL shape.
4. Never delete Convex deployments unless the deployment is reported as
   `preview` and branch metadata matches the target branch.
5. Missing provider credentials skip that provider with a note; they are not a
   reason to guess from another source.
