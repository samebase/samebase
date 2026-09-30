# Templates design study

September 30, 2026. See the
[proposal](../../rfcs/2026-09-30-templates-and-components.md#recommendation) for the research and
recommended contract.

## Earlier screens

These screenshots record the first version. The current page uses cards with large app previews,
short descriptions, and direct setup actions. It has no component tab, detail panel, or study
labels. The images below are historical evidence, not the current UI or screenshot-test baselines.

| Screen                              | Desktop                              | Phone                              |
| ----------------------------------- | ------------------------------------ | ---------------------------------- |
| Template selection and contents     | [Templates](./templates-desktop.png) | [Templates](./templates-phone.png) |
| Shared integration and example apps | [PostHog](./components-desktop.png)  |                                    |
| Required services and setup review  | [Setup](./setup-desktop.png)         | [Setup](./setup-phone.png)         |

## Try the study

1. Run `pnpm run dev` in this worktree.
2. Open `/templates-preview?prod-ui` at the frontend URL printed by the command.
3. Check the three cards at desktop and phone widths. They use two columns in wide content panes and
   one column in narrow panes. Samebase should offer a source link without a setup action.
4. Select each image to open its larger preview. Close it with Escape and the close button. Focus
   should return to the image control. The caption identifies screenshots and UI samples.
5. Select **Preview setup** for Base or Mail. Enter a repository name and select **Review setup**.
6. Return to Templates. Keyboard focus should move to the Templates heading.

The study creates no provider resources. Mail component extraction and shared PostHog setup remain
research topics. Setup choices reset when the setup view closes. The route is available in local and
preview environments and is blocked in production.

## Card preview sources

- `base.svg` is a UI sample of the todo section in `templates/base/src/routes/index.tsx`. It uses
  example tasks and shows the workspace below the app's QR code. It is not a browser capture.
- `mail.svg` is a UI sample based on `src/components/mail/MailWorkspace.tsx` in `samebase/mail` at
  `1713e40ef644179d3e589457c966186e666f32da`. It uses example messages and reserved example domains.
  It is not a browser capture.
- `samebase.png` is a copy of the existing
  `repository-overview-v2-visual.spec.ts-snapshots/repository-overview-v2-desktop.png` baseline. The
  screenshot uses test data and contains no private inbox or account content.

The card assets live in `apps/samebase/src/components/templates-proposal/previews`. Captured Base
and Mail screens should replace the samples before this gallery ships. The samples need no runtime
app data and make no network calls.

## Checks completed on the first version

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

The current revision adds the visual card gallery and enlarged image views. See the PR for its
checks. Browser access was blocked by the automation security policy, so the current revision has no
new browser screenshots.

## Review

Two read-only agents researched the current repositories and external products. A third agent
reviewed the proposal and UI. All used this worktree without owning file changes. The main agent
integrated their findings and added private-source labels, focus handling, corrected document links,
and explicit requested-update wording. No provider writes were required for the study.

A further read-only asset search found the Samebase screenshot and confirmed that Base and Mail have
no saved app screenshots in their current repository trees. The main agent added the sample images
and gallery in the same worktree.
