# Operate: production logs

Samebase does not wrap logs. Read them where they are.

## Deploys

Each deploy is a run of the repository's **Alchemy** workflow in GitHub Actions:

```sh
gh run list --workflow alchemy.yml
gh run view <run-id> --log-failed
```

A green run with `Plan: no changes` deployed nothing.

## Convex

From the app's checkout:

```sh
CONVEX_DEPLOY_KEY= npx convex logs --prod --history 50
```

Clearing `CONVEX_DEPLOY_KEY` matters: if an env file holds a deploy key, the CLI reads that
deployment and ignores `--prod`. The Samebase dashboard links each deployment's Convex dashboard.

## Cloudflare

For an app with a Worker:

```sh
npx wrangler tail <worker-name>
```
