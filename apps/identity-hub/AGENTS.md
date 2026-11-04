# AGENTS.md

A Convex app that mounts the identity-broker component: the sign-in hub of one team. See README.md.
Each component's own rules live in its repository.

- `convex/connectors.ts` lists the providers the hub offers. A provider that needs credentials also
  gets its variables declared in `convex/convex.config.ts`.
- `convex/resources.ts` lists the API providers. They use OAuth code and refresh grants, not login
  identities.
- `convex/broker.ts` defines the broker; `convex/http.ts` mounts it with the hub's own routes;
  `convex/identityBroker.ts` exports the admin functions for `npx convex run`; `convex/crons.ts`
  runs the cleanup.
- `convex/hubClients.ts` is `POST /hub-clients`: a GitHub Actions run gets a client of a third-party
  app with GitHub's OIDC token, with the limits and blocks of `convex/schema.ts`.
  `convex/moderation.ts` is `/moderation/*` for samebase.com's admin page, with
  `HUB_MODERATION_KEY`. Tests run against the real broker component (`convex/test.setup.ts`).
- `alchemy.run.ts` is the stack `samebase/samebase/apps/identity-hub` (adopted project, adopted
  production deployment, push); `scripts/check-keys.ts` checks the key set inside the `deploy`
  script the push runs and never creates it; `scripts/init-keys.ts` creates it once, by hand.
- Never use `npx convex import --replace-all` on this deployment, also not with `--component`: it
  deletes the rows of the other components.
- Never use the U+2014 em dash character. No `any`, no type assertions except `as const`.
- `pnpm install`, then `pnpm run check`. `convex/_generated` is committed; `npx convex dev --once`
  refreshes it.
