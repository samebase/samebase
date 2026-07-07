# Operate: production logs

Samebase deliberately does not wrap log reading. The providers' own tools are better, and your agent
already has them; Samebase's job is handing over the coordinates. Get them from the app list
(dashboard, or the `get_user_vaults` MCP tool): each app carries its Convex `deploymentName`,
`teamSlug`, `projectSlug`, and its Cloudflare `workerName` with a `projectDashboardUrl`.

## Convex (backend) logs

From the app's repository checkout:

```
CONVEX_DEPLOY_KEY= npx convex logs --prod --history 50
```

The CLI resolves the production deployment from the repo's Convex configuration. The
`CONVEX_DEPLOY_KEY=` prefix matters: if an env file carries a deploy key, the CLI silently targets
that key's deployment and ignores `--prod`, so clear it for read commands. Outside a checkout, open
the deployment dashboard instead — the `deploymentDashboardUrl` from `get_user_vaults` links
directly to the deployment's logs and data.

## Cloudflare (delivery) logs

Live-tail the Worker from any machine with wrangler and a Cloudflare login:

```
npx wrangler tail <workerName>
```

Or open the Worker's dashboard (`projectDashboardUrl` from `get_user_vaults`) for request metrics,
build history, and log streams. Workers Builds deploy logs — the CI runs that ship each push — live
under the same Worker's "Deployments" and "Builds" views.

## When something looks broken

Check `get_user_vaults` first: a degraded state names its own remedy in `nextAction` (for example
`wire_convex_build_access` when deploy keys are missing). If state is `ready` but behavior is wrong,
the logs above are the next stop — Samebase has no privileged view beyond them.
