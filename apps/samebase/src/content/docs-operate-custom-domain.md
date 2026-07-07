# Operate: custom domain

Samebase does not manage domains for you — the Worker is in your Cloudflare account, so Cloudflare's
own domain tooling applies directly. Coordinates come from the app list (dashboard, or the
`get_user_vaults` MCP tool): the app's `workerName` and its `projectDashboardUrl`.

## Attach a domain to the Worker

If the domain's DNS is on Cloudflare (recommended — it is the same account):

1. Open the Worker (`projectDashboardUrl`) → Settings → Domains & Routes → Add → Custom domain.
2. Enter the hostname (for example `app.example.com`). Cloudflare creates the DNS record and the
   certificate; propagation is usually minutes.

Command-line equivalent, from the app repository: add the hostname under `routes` with
`custom_domain: true` in `wrangler.jsonc`, then deploy (the next push does it — Workers Builds run
`wrangler deploy`).

## What stays unchanged

The `workers.dev` URL keeps working alongside the custom domain. The Convex backend URL (`cloudUrl`
/ `siteUrl` from `get_user_vaults`) does not change and needs no domain work — the frontend reaches
it by URL regardless of which hostname served the page.

## If the domain is not on Cloudflare yet

Transfer the zone into the same Cloudflare account first (Cloudflare → Add a domain, then update
nameservers at the registrar). Everything above then applies. Buying the domain through Cloudflare
Registrar also lands it in the right account with at-cost pricing.
