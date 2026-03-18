# 001 Codex Thread Storage Research

## Document Control

- Status: Research
- Owner: Noter platform
- Last updated: 2026-03-18
- Related specs:
  - `specs/031_GIT_BACKED_CHAT_HISTORY_SPEC.md`
  - `specs/020_CONVEX_AGENT_ADOPTION_SPEC.md`
  - `specs/055_DAYTONA_CODEX_SHARED_HOME_SPEC.md`

## Summary

For noter, the best default shape is:

- `Cloudflare R2` for canonical raw Codex thread/session blobs
- `Convex` for metadata, indexing, summaries, and application queries
- `GitHub` for version-controlled manifests or projections, not the raw blobs

If the product later needs Git-native hydration of those blobs, add external Git
LFS on top of R2. Do not start by storing raw rollout files directly in Git.

## Why This Research Exists

This repo already has `specs/031_GIT_BACKED_CHAT_HISTORY_SPEC.md`, which
describes a Git-like logical history model for editable in-product chat state.

That spec does not answer a separate storage question:

- where raw Codex rollout/session artifacts should live
- how GitHub should participate in versioning
- whether Cloudflare should be the canonical blob layer
- how Convex should index or query those artifacts

This research answers that storage split.

## Requirements

1. Raw thread artifacts need a durable canonical store.
2. The design should align with noter's existing GitHub + Convex + Cloudflare
   stack direction.
3. GitHub should still provide auditable, version-controlled references.
4. Convex should remain the source of truth for product queries and UI.
5. The design must scale beyond normal Git repository limits.
6. Sensitive prompt/tool data must not be accidentally mixed into user source
   repositories.

## What Was Verified

Local Codex persists machine-oriented session artifacts on disk, including:

- session index/history metadata
- SQLite thread state
- per-session `rollout-*.jsonl` event logs

Those rollout files contain more than user-visible chat text. They can include
session metadata, tool calls, commentary, and other operational details. They
should be treated as internal artifacts, not as normal source files.

The current Codex CLI surface exposes local resume workflows, but no built-in
GitHub-backed thread store or import/export workflow was found.

## Options Evaluated

### 1. Plain Git in GitHub

Store raw rollout files directly in a repository.

Pros:

- simplest mental model
- built-in version history
- no custom retrieval logic

Cons:

- poor fit for append-heavy or frequently changing large artifacts
- GitHub warns above 50 MiB and blocks files above 100 MiB
- repository size grows permanently with every revision
- raw rollout logs are not useful code-review material

Verdict:

Reject as the default design.

### 2. GitHub-hosted Git LFS

Store raw artifacts in Git LFS while committing pointer files in GitHub.

Pros:

- versioned pointers in Git
- better than plain Git for large artifacts
- familiar developer workflow

Cons:

- storage economics live on GitHub, not Cloudflare
- every changed LFS object version counts as full storage again
- still not a great fit for frequently rewritten session logs

Verdict:

Viable, but misaligned with noter's stack and cost shape.

### 3. External Git LFS backed by Cloudflare R2

Keep Git LFS pointers in GitHub and serve the blob payloads from an external LFS
service backed by R2.

Pros:

- keeps Git-native pointer semantics
- keeps canonical storage on Cloudflare
- preserves a path to `git checkout` hydration

Cons:

- heavier operational surface than the problem requires initially
- requires LFS server behavior, auth, and client configuration
- harder to reason about than immutable manifests

Verdict:

Strong secondary option if Git-native hydration becomes important.

### 4. Git-tracked manifests + raw blobs in R2 + metadata in Convex

Store raw thread artifacts in R2, store product metadata and summaries in
Convex, and commit only small manifest/projection files to GitHub.

Pros:

- clean separation of blob storage, app indexing, and version-control ledger
- aligns directly with GitHub + Convex + Cloudflare
- easy to make raw artifacts immutable and content-addressed
- avoids polluting normal source repos with operational session blobs

Cons:

- checkout does not automatically hydrate raw blobs
- requires a manifest format and thin retrieval tooling

Verdict:

Best default design.

## Recommended Architecture

### Canonical Storage

Use `Cloudflare R2` as the canonical home for raw Codex thread/session blobs.

Candidate key shape:

- `codex-threads/<workspaceOrVaultId>/<threadId>/<artifactId>.jsonl`
- or date-partitioned keys if operational browsing matters more than vault scope

Blobs should be immutable after finalization when possible.

### Product Metadata

Use `Convex` for:

- thread/session metadata
- summaries and redacted previews
- search indexing
- repo/vault/user linkage
- permissions and UI queries

This keeps product reads and writes in the existing application backend instead
of coupling UI behavior to Git or R2 listings.

### GitHub Projection

GitHub should store only small version-controlled references, for example:

- manifest JSON
- Markdown summaries
- links to related vault/repo/task state

Important noter-specific recommendation:

- default to a dedicated private control repo or system-managed branch for these
  projections
- do not mix raw Codex session artifacts into user code repositories by default

That keeps developer repos focused on source code and avoids leaking sensitive
operational context into normal review flows.

## Relationship To Spec 031

`specs/031_GIT_BACKED_CHAT_HISTORY_SPEC.md` and this research are compatible.

- Spec 031 is about the logical history model for editable app chat state.
- This research is about storage placement for raw Codex session artifacts and
  GitHub/R2/Convex responsibilities.

One possible future shape:

1. Raw imported or captured Codex artifacts land in `R2`.
2. Convex indexes and summarizes them for product use.
3. The app may derive or materialize an internal Git-like chat history model as
   described in spec 031.

That means noter does not need to choose between "Git-like chat model" and
"R2-backed raw artifact storage". They solve different layers of the problem.

## Manifest Guidance

If noter starts with the manifest approach, a manifest can stay small:

```json
{
  "threadId": "019cfe24-5a88-7152-887b-033e78d45ab0",
  "artifactId": "rollout-v1",
  "sha256": "<blob-sha256>",
  "sizeBytes": 166996,
  "storage": {
    "provider": "r2",
    "bucket": "<bucket>",
    "key": "codex-threads/<vaultId>/<threadId>/rollout-v1.jsonl"
  },
  "summary": {
    "title": "Git-backed Codex thread storage research"
  }
}
```

GitHub versions the manifest. R2 holds the real payload. Convex holds the
queryable state.

## When To Add External LFS

Add external Git LFS on top of R2 only if noter needs one of these:

1. direct Git-native hydration of artifacts during checkout/clone flows
2. Git tooling compatibility as a product feature rather than an implementation
   detail
3. a stronger requirement that the versioned ledger itself be LFS-pointer-based
   rather than manifest-based

Until then, manifests are simpler and easier to reason about.

## Open Questions

1. Should manifests live in a dedicated noter control repo, or on a dedicated
   internal branch within an existing management repo?
2. Should noter store one finalized manifest per session, or checkpoint
   manifests while a session is active?
3. What redaction pipeline is required before any GitHub projection is written?
4. Should summaries be committed to GitHub by default, or only generated inside
   Convex/UI?
5. How much of raw artifact retention belongs in R2 lifecycle policy vs app
   logic?

## Proposed Follow-up

If this direction is accepted, the next step should be a spec that defines:

- R2 bucket/key layout
- Convex schema and indexes
- manifest schema
- control-repo or control-branch strategy
- redaction rules
- retention policy
- optional external-LFS upgrade path

## Sources

- [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)
- [About large files on GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
- [About Git Large File Storage](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage)
- [About billing for Git Large File Storage](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-git-large-file-storage/about-billing-for-git-large-file-storage)
- [Managing Git LFS objects in archives of your repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-git-lfs-objects-in-archives-of-your-repository)
- [Configuring Git LFS to use a third party server](https://docs.github.com/en/enterprise-server%403.15/admin/managing-accounts-and-repositories/managing-repositories-in-your-enterprise/configuring-git-large-file-storage-for-your-enterprise)
- [Cloudflare Workers storage options](https://developers.cloudflare.com/workers/platform/storage-options/)
- [Cloudflare R2 get started](https://developers.cloudflare.com/r2/get-started/)
- [Cloudflare R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [Cloudflare R2 consistency model](https://developers.cloudflare.com/r2/reference/consistency/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare KV limits](https://developers.cloudflare.com/kv/platform/limits/)
- [Cloudflare KV write behavior](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Convex file storage](https://docs.convex.dev/file-storage)
