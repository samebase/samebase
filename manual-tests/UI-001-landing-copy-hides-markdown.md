# UI-001: Landing copy hides markdown markers

## Purpose

Ensure the landing page copy renders as prose while blurred, reveals markdown
markers (for example `#`) on focus, and hides them again on blur.

## Preconditions

- Repo at `/Users/nicu/.codex/worktrees/d65a/noter`.
- Dev server running via `make anon` from the repo root.
- A local URL discovered for the Vite dev server.

## Steps

1. Start the app: `make anon`.
2. Find the dev URL (example):
   `for p in $(seq 5173 5190); do curl -fsS "http://127.0.0.1:$p" >/dev/null && echo "http://127.0.0.1:$p" && break; done`
3. Open the URL in a browser or Playwright CLI session.
4. On the landing page, find the heading “Noter is a collaborative markdown
   workspace on top of GitHub”.
5. Confirm there are no visible `#` characters in the heading or description
   list.
6. Click inside the landing copy (on the heading text).
7. Confirm `##` becomes visible at the start of the heading while focused.
8. Click outside the landing copy (blank area below or above the card).
9. Confirm `##` is hidden again.

## Expected Results

1. Markdown markers are hidden while blurred, visible while focused, and hidden
   again after blur.
2. The landing copy remains readable and stable during focus/blur.

## Optional Evidence

- Screenshot before click, after click, and after blur (paths like
  `/tmp/noter-landing-before.png`).

## Cleanup

- Stop the dev server (Ctrl+C).
