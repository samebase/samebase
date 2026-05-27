# Cloudflare Transform Rule SPA Shell Research

## Problem

The production Worker static-assets fallback currently serves the same prerendered `/` landing HTML
for every SPA navigation. Exact `/` looks stable, but direct loads for non-root routes and root URLs
with query strings first paint the landing shell and then jump when the client router takes over.

Examples:

- `/terms`
- `/home`
- `/vault/...`
- `/?dev`

## Cheapest Correct Edge Option

Use a Cloudflare URL Rewrite Rule in the zone-level `http_request_transform` phase.

Keep two built HTML assets:

- `/index.html` for the exact `/` landing shell
- `/spa-shell.html` for the neutral SPA shell

Then rewrite HTML navigations that are not exact `/` to `/spa-shell.html` internally. This preserves
the browser URL, avoids Worker invocations, and keeps static asset delivery on Cloudflare Workers
Static Assets.

## Rule Shape

The intended stable rule reference is `noter_spa_shell`.

Expression:

```text
(http.host eq "noter.md" and (http.request.method eq "GET" or http.request.method eq "HEAD") and any(lower(http.request.headers["accept"][*])[*] contains "text/html") and ((http.request.uri.path eq "/" and http.request.uri.query ne "") or http.request.uri.path ne "/"))
```

Action:

```json
{
  "action": "rewrite",
  "action_parameters": {
    "uri": {
      "path": {
        "value": "/spa-shell.html"
      },
      "query": {
        "value": ""
      }
    }
  }
}
```

The query clear is intentional for the asset lookup. The visitor URL remains unchanged because this
is an internal rewrite, not a redirect.

## Cloudflare API Surface

Cloudflare's Rulesets API supports this directly:

- `GET /zones/{zone_id}/rulesets/phases/{ruleset_phase}/entrypoint`
- `PUT /zones/{zone_id}/rulesets/phases/{ruleset_phase}/entrypoint`
- `GET /zones/{zone_id}/rulesets`
- `POST /zones/{zone_id}/rulesets`
- `PATCH /zones/{zone_id}/rulesets/{ruleset_id}/rules/{rule_id}`

The current generated Cloudflare API subset in Noter only includes Workers and Builds endpoints. To
make this repo-owned later, extend `apps/noter/scripts/generate-cloudflare-api.ts` to include
`/zones/{zone_id}/rulesets`, regenerate the OpenAPI types and validators, and add a sync function
that upserts the `noter_spa_shell` rule by `ref`.

Important API constraint: ruleset `PUT` replaces the whole rule list. A safe sync must read existing
rules, replace only the `noter_spa_shell` entry, preserve unrelated rules, then write the full list.

## Tradeoffs

- Cheaper than a Worker because Transform Rules do not create Worker invocations.
- More correct than `404.html` fallback because direct SPA routes can still return `200`.
- More correct than `_redirects` because it can distinguish root URLs with query strings.
- Less self-contained than `wrangler.jsonc` because zone rules live in Cloudflare ruleset state
  until Noter grows an API-backed sync.

## Sources

- https://developers.cloudflare.com/rules/transform/url-rewrite/create-api/
- https://developers.cloudflare.com/rules/transform/url-rewrite/reference/parameters/
- https://developers.cloudflare.com/ruleset-engine/rulesets-api/update/
- https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/http.request.uri.path.extension/
