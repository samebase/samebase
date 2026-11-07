# AGENTS.md

A Convex app that mounts the identity-broker component: the sign-in hub of one team. See README.md.
Each component's own rules live in its repository.

- `convex/connectors.ts` lists the providers the hub offers. A provider that needs credentials also
  gets its variables declared in `convex/convex.config.ts`.
- `convex/resources.ts` lists the API providers. They use OAuth code and refresh grants, not login
  identities.
- `convex/broker.ts` defines the broker with its hub config (the name, the terms, the privacy
  notice, the moderation key, and the policy of RFC 137: the connectors, the API resources, and the
  pause of `APPS_PAUSED`); `convex/http.ts` mounts it, which also mounts `POST /hub-clients` and
  `/moderation/*`; `convex/identityBroker.ts` exports the admin functions for `npx convex run`;
  `convex/crons.ts` runs the cleanup. Every table and rule is in the broker package (RFC 135): the
  hub has no schema. `convex/http.test.ts` checks this wiring (`convex/test.setup.ts`); the rules'
  tests are in the package.
- `alchemy.run.ts` is the stack `samebase/samebase/apps/identity-hub` (adopted project, adopted
  production deployment, push); `scripts/check-keys.ts` checks the key set inside the `deploy`
  script the push runs and never creates it; `scripts/init-keys.ts` creates it once, by hand.
- Never use `npx convex import --replace-all` on this deployment, also not with `--component`: it
  deletes the rows of the other components.
- Never use the U+2014 em dash character. No `any`, no type assertions except `as const`.
- `pnpm install`, then `pnpm run check`. `convex/_generated` is committed; `npx convex dev --once`
  refreshes it.
