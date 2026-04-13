# Playwright CLI Quick Reference

Use `@playwright/cli` for direct browser driving.

## Noter Repo Default

When `scripts/playwright-branch-browser.ts` exists, prefer the branch wrapper so
each branch keeps a deterministic session/profile and reopening the session adds
a fresh tab instead of unloading a dirty page.

```bash
SESSION="$(node ./scripts/playwright-branch-browser.ts session)"
node ./scripts/playwright-branch-browser.ts open "$URL"
node ./scripts/playwright-branch-browser.ts cli snapshot
node ./scripts/playwright-branch-browser.ts cli screenshot --filename=/tmp/noter-step.png
```

## Session + Navigation

```bash
npx --yes @playwright/cli -s=<session> open <url>
npx --yes @playwright/cli -s=<session> goto <url>
npx --yes @playwright/cli -s=<session> snapshot
```

## Interaction

```bash
npx --yes @playwright/cli -s=<session> click <ref>
npx --yes @playwright/cli -s=<session> fill <ref> "<text>"
npx --yes @playwright/cli -s=<session> type "<text>"
npx --yes @playwright/cli -s=<session> press Enter
```

## Diagnostics

```bash
npx --yes @playwright/cli -s=<session> console
npx --yes @playwright/cli -s=<session> network
npx --yes @playwright/cli -s=<session> screenshot --filename=/tmp/noter-step.png
```

## Cleanup

```bash
npx --yes @playwright/cli list
npx --yes @playwright/cli -s=<session> close
npx --yes @playwright/cli close-all
```
