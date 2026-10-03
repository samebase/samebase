# Operate: production logs

Samebase deliberately does not wrap log reading. The providers' own tools are better, and your agent
already has them; Samebase's job is pointing at the right resources. The `repository_getStatus` MCP
tool returns each app's Worker name with the logs link of its latest production build, and each
Convex project's production deployment name with its Convex dashboard link. The Samebase dashboard
loads the same provider reads and adds direct provider links when those reads succeed.

## Convex (backend) logs

From the app's repository checkout:

```
CONVEX_DEPLOY_KEY= npx convex logs --prod --history 50
```

The CLI resolves the production deployment from the repository's Convex configuration. The
`CONVEX_DEPLOY_KEY=` prefix matters: if an env file carries a deploy key, the CLI silently targets
that key's deployment and ignores `--prod`, so clear it for read commands. Outside a checkout, open
the production deployment's dashboard link from `repository_getStatus` or from the Samebase
dashboard.

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
