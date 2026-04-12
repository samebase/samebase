# UI-001: Landing copy hides markdown markers

## Purpose

Ensure the landing page copy renders as prose while blurred, reveals markdown
markers (for example `#`) on focus, and hides them again on blur.

## Preconditions

- `make anon` can run in the current checkout.
- A local Vite URL is reachable in browser or Playwright.

## Steps

1. Start the app: `make anon`.
2. Find the dev URL (example):
   `for p in $(seq 5173 5190); do curl -fsS "http://127.0.0.1:$p" >/dev/null && echo "http://127.0.0.1:$p" && break; done`
3. Open the URL in a browser or Playwright CLI session.
4. On the landing page, find the rendered headline above the bullet list.
5. Confirm there are no visible `#` characters in the heading or description
   list.
6. Click inside the landing copy (on the heading text).
7. Confirm `##` becomes visible at the start of the heading while focused.
8. Drag-select the last two bullet points.
9. Confirm the selected list items unfold into plain Markdown text (each line
   starts with `-`) while selected, and the heading `##` does not appear while
   the selection is in the bullet list.
10. Click whitespace outside the landing copy (for example above the card, not
    on the “Commit …” header text).
11. Confirm the selection collapses and the list refolds back to bullet dots.
12. Confirm `##` is hidden again.

## Expected Results

1. Markdown markers are hidden while blurred. While focused, selecting content
   reveals markdown markers, and blurring collapses the selection so markers are
   hidden again.
2. The landing copy remains readable and stable during focus/blur.

## Optional Evidence

- Screenshot before click, after click, after selection, and after blur (paths
  like `/tmp/noter-landing-before.png`).

## Cleanup

- Stop the dev server (Ctrl+C).
