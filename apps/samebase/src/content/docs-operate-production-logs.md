# Operate: production logs

Samebase deliberately does not wrap log reading. The providers' own tools are better, and your agent
already has them; Samebase's job is handing over the coordinates. Get them from the app list
(dashboard, or the `get_user_repositories` MCP tool): each app carries its Convex `teamId` and
`projectId`, plus its Cloudflare `accountId` and `workerName`. The dashboard loads current provider
observations separately and adds direct provider links when those reads succeed.

## Convex (backend) logs

From the app's repository checkout:

```
CONVEX_DEPLOY_KEY= npx convex logs --prod --history 50
```

The CLI resolves the production deployment from the repository's Convex configuration. The
`CONVEX_DEPLOY_KEY=` prefix matters: if an env file carries a deploy key, the CLI silently targets
that key's deployment and ignores `--prod`, so clear it for read commands. Outside a checkout,
follow the direct link in the Samebase dashboard after its live Convex observation succeeds.

## Cloudflare (delivery) logs

Live-tail the Worker from any machine with wrangler and a Cloudflare login:

```
npx wrangler tail <workerName>
```

Or open the Worker from the Samebase dashboard after its live Cloudflare observation succeeds. Its
Cloudflare dashboard contains request metrics, build history, and log streams. Workers Builds deploy
logs, the CI runs that ship each push, live under the same Worker's "Deployments" and "Builds"
views.

## When something looks broken

Open the Samebase dashboard and let its live provider reads finish. It distinguishes loading,
missing, failed, and available resources and offers only the explicit repair supported for that
state. If the resources are available but behavior is wrong, the logs above are the next stop.
Samebase has no privileged view beyond them.
