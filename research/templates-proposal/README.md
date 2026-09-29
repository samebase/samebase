# Templates design study

September 30, 2026. See the
[proposal](../../rfcs/2026-09-30-templates-and-components.md#recommendation) for the research and
recommended contract.

## Screens

These are screenshots of the interactive proposal in the existing Samebase shell. They are design
evidence, not accepted screenshot-test baselines.

| Screen                              | Desktop                              | Phone                              |
| ----------------------------------- | ------------------------------------ | ---------------------------------- |
| Template selection and contents     | [Templates](./templates-desktop.png) | [Templates](./templates-phone.png) |
| Shared integration and example apps | [PostHog](./components-desktop.png)  |                                    |
| Required services and setup review  | [Setup](./setup-desktop.png)         | [Setup](./setup-phone.png)         |

## Try the study

1. Run `pnpm run dev` in this worktree.
2. Open `/templates-preview?prod-ui` at the frontend URL printed by the command.
3. Select Base, Mail, and Samebase. Samebase should offer a source link without a setup action.
4. Select PostHog in Mail's proposed contents. Open its integration steps.
5. Select `samebase/mail` in the example list.
6. Select **Preview setup**. Enter a repository name and select **Review setup**.
7. Return to Templates. Keyboard focus should move to the Mail heading.

The study creates no provider resources. Catalog data shows proposed composition. Mail component
extraction and shared PostHog setup are future work. Setup choices reset when the setup view closes.
The route is available in local and preview environments and is blocked in production.

## Checks completed

- `pnpm --filter samebase exec tsgo --noEmit` passed.
- Focused Vite+ lint and format checks passed for the changed source and proposal.
- `pnpm exec vp test apps/samebase/src/routeAccessMetadata.test.ts apps/samebase/src/routing/availability.test.ts apps/samebase/prerender.config.test.ts`
  passed, 22 tests in 3 files.
- Manual Playwright CLI checks passed on the Cloudflare tunnel with a 1440 by 1000 desktop viewport.
  They covered all templates, component links, integration steps, setup review, fresh setup state,
  and keyboard focus after view changes.
- A new Chromium mobile context at 390 by 844 passed the touch setup flow. The page had no
  horizontal overflow. The repository-name input rendered at 16 pixels.

The checks cover the design study. They do not prove provider creation, component installation,
email delivery, or production deployment. Those flows are described in the proposal.

## Review

Two read-only agents researched the current repositories and external products. A third agent
reviewed the proposal and UI. All used this worktree without owning file changes. The main agent
integrated their findings and added private-source labels, focus handling, corrected document links,
and explicit requested-update wording. No provider writes were required for the study.
