# noter.guest create-app manual test

Date: 2026-06-25 Europe/Chisinau

## Scope

Run the real Samebase create-app flow with the `noter.guest@gmail.com` test accounts after the
Cloudflare GitHub recovery copy shipped in `v1575`.

The run used only `tmp-*` resources and intentionally kept the successful resources around as
evidence for follow-up debugging.

## Resources

- Samebase vault: `noter-guest/tmp-99f1-manual-003`
- GitHub repository: `noter-guest/tmp-99f1-manual-003`
- Convex project: `noter-guest/tmp-99f1-manual-003`
- Convex production deployment: `stoic-badger-120`
- Cloudflare Worker: `tmp-99f1-manual-003`
- Public URL: `https://tmp-99f1-manual-003.noter-guest.workers.dev`

## Result

The flow completed after recovering the Cloudflare GitHub App connection. The public Worker URL
eventually returned `HTTP 200` and served the generated app HTML.

Observed validation:

```sh
curl -I https://tmp-99f1-manual-003.noter-guest.workers.dev
# HTTP/2 200

curl -sS https://tmp-99f1-manual-003.noter-guest.workers.dev | wc -c
# 4336
```

## Working recovery path

The recovery copy in Samebase was useful and led to the correct flow:

1. Open the Cloudflare Workers and Pages GitHub App from the Samebase recovery message.
2. Uninstall the GitHub App for `noter-guest`.
3. Open Cloudflare Workers & Pages -> Create application.
4. Click Connect GitHub from Cloudflare.
5. Install and authorize Cloudflare Workers and Pages for `noter-guest`.
6. Confirm Cloudflare's repository picker can see `tmp-99f1-manual-003`.
7. Return to Samebase and click Retry Cloudflare.

The important detail is that GitHub-side app configuration alone was not enough. Cloudflare needed
the GitHub App installation to originate from Cloudflare's own Workers & Pages connection flow so
Cloudflare could establish its account-side GitHub connection.

## Pain points

- Before recovery, Samebase failed at Cloudflare with the intended message:
  `Cloudflare cannot access this GitHub repo.`
- After Samebase retry succeeded, the public Worker URL briefly returned Cloudflare `404` with
  `error code: 1042` before it began serving `HTTP 200`.
- Samebase continued to show the GitHub commit as `No checks`.
- Cloudflare Build history showed one row for `main` with `Manually deployed`, not a GitHub
  check-run-backed build. This explains the missing checks in Samebase, but it is still a product
  gap because the dashboard reads as incomplete after a successful create-app flow.
- Direct route loads intermittently rendered only the app chrome and logged React minified error
  `#418`. The `/providers` route showed this most clearly during the run; `/home` later filled in
  after waiting, but the blank/chrome-only state is a real manual-test pain point.

## Follow-ups

- Decide whether Samebase should display a distinct state for Cloudflare API/manual deployments
  instead of waiting for GitHub checks that will not exist for this path.
- Investigate the intermittent React hydration/chrome-only route rendering before relying on
  `/providers` as a recovery-instruction surface.
- Keep the `tmp-99f1-manual-003` resources until the above follow-ups no longer need live evidence.
  Clean them in a deliberate `tmp-*` provider sweep later.
