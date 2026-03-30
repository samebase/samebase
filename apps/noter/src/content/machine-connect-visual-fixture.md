# Connect this machine

Run one of these on the machine that already has Codex installed.

## Published package

Use this once `@noter-md/sync` is published.

```bash
npx @noter-md/sync connect
```

## Direct hosted file

Use this today for prod, preview, or local deploy testing.

```bash
curl -fsSL https://noter.md/noter.js | node --input-type=module - connect
```
