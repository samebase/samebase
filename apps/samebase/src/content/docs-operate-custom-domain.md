# Operate: custom domain

Samebase does not manage domains for you. The Worker is in your Cloudflare account, so Cloudflare's
own domain tooling applies directly. Coordinates come from the app list (dashboard, or the
`get_user_vaults` MCP tool): the app's `workerName` and its `projectDashboardUrl`.

## Attach a domain to the Worker

If the domain's DNS is on Cloudflare (recommended because it is the same account):

1. Open the Worker (`projectDashboardUrl`) → Settings → Domains & Routes → Add → Custom domain.
2. Enter the hostname (for example `app.example.com`). Cloudflare creates the DNS record and the
   certificate; propagation is usually minutes.

Command-line equivalent, from the app repository: add the hostname under `routes` with
`custom_domain: true` in `wrangler.jsonc`, then let the next production deploy ship it (generated
apps deploy through their `pnpm run deploy` script, which passes the Worker name explicitly. Pushes
to the default branch trigger it; preview deploys do not apply domain routes).

## What stays unchanged

The `workers.dev` URL keeps working alongside the custom domain. Attaching a Worker domain does not
change the app's Convex deployment endpoints or require any Convex configuration. The frontend keeps
using the deployment URLs already configured in the app regardless of which hostname serves it.

## If the domain is not on Cloudflare yet

Transfer the zone into the same Cloudflare account first (Cloudflare → Add a domain, then update
nameservers at the registrar). Everything above then applies. Buying the domain through Cloudflare
Registrar also lands it in the right account with at-cost pricing.
