# Noter Operator Workflows Overlay Draft

## Purpose

This overlay is intentionally local to this repo and operator. It should not be copied into a
portable TypeScript or generated-app skill pack.

## Startup And Worktrees

- In a worktree, run `pnpm anon:once` once after checkout.
- In a worktree, use `pnpm anon` before dev, lint, test, and commit workflows.
- Treat `pnpm anon` as an operator workflow that can touch anonymous Convex or provider state. For
  read-only experiments, use a verification path that does not require it or record why the
  provider-state bootstrap was allowed.
- In the primary local checkout, use `pnpm dev`.
- Confirm worktree root and branch before dev, test, commit, or cleanup work.
- Fetch origin and rebase onto the latest `origin/main` before implementation on an existing branch
  or worktree.

## GitHub And PRs

- Use CLI tools for Git and GitHub workflows.
- Keep meaningful non-main work in a GitHub PR unless the user explicitly says not to open one.
- Default proactive PRs to ready/non-draft unless work is still in progress or the user asks for a
  draft.
- Prefix PR titles with the current projected landing build label and refresh it when the base
  advances.
- Include `First Message` and `Requested Codex Runtime` when a PR originates from research or
  automation work.
- Treat actionable review-bot comments as required fixes while shipping.
- Do not merge before CI is green.

## Convex And External State

- For production Convex reads from worktrees, derive `CONVEX_DEPLOYMENT` from the primary checkout
  and clear `CONVEX_DEPLOY_KEY` in the command environment.
- Stop and rerun if the Convex CLI says it is ignoring `--prod` because of `CONVEX_DEPLOY_KEY`.
- Use exact temporary resource prefixes such as `tmp-<worktree-id>-<intent>` when the workflow
  requires Noter-managed test resources.
- Cleanup must prove provider resource identity and skip resources whose exact preview ownership is
  not provable.

## Responses

- Keep responses concise and include a final `Summary` section.
- Mention relevant PR numbers as clickable Markdown links.
- Include a clickable localhost URL when a relevant preview is running, and include the active
  Cloudflare tunnel URL for that app when one exists.
- For Cloudflare URLs whose label would equal the URL, prefix the label with `link ` so ProseMark
  renders it correctly.

## Research Notes

Derived from `AGENTS.md`, `docs/agent-workflows.md`, and the agent-context experiment series.
