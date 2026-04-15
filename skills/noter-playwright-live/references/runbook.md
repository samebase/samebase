# Runbook

## Project Detection

1. If `apps/noter/package.json` exists: treat as Noter monorepo.
2. Else if root `package.json` has `dev:frontend` and `dev:backend`: treat as
   Noter-stack generated app.

## Startup Commands

### Noter monorepo

```bash
pnpm anon
```

Expected result:

- Convex local deployment prepared
- frontend + backend dev processes running
- frontend likely on first free Vite port (`5173+`)

### Noter starter/generated app

```bash
pnpm install
pnpm run dev
```

## URL Resolution

Use this probe:

```bash
for p in $(seq 5173 5190); do
  if curl -fsS "http://127.0.0.1:$p" >/dev/null; then
    echo "http://127.0.0.1:$p"
    break
  fi
done
```

## Dashboard/Create-App Flow (Noter monorepo)

1. Open home page.
2. Sign in with seeded dev password account (from
   `apps/noter/convex/devAuth.ts`).
3. Fill `New app name`.
4. Click `New app`.
5. Verify:

- vault card appears
- repo name visible
- infra status line present

## Evidence Pattern

Always capture:

1. Pre-action snapshot
2. Post-action snapshot
3. Final screenshot at `/tmp/noter-<flow>-<timestamp>.png`
