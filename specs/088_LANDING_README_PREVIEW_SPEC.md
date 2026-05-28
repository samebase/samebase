# Landing README Preview Spec

## Document Control

- Status: Accepted
- Owner: Noter landing/onboarding
- Last updated: 2026-05-28
- Related files:
  - `apps/noter/src/routes/landing-preview.tsx`
  - `apps/noter/src/components/LandingMarkdownPreviewPage.tsx`
  - `apps/noter/src/components/MarkdownLandingDocument.tsx`
  - `apps/noter/src/content/landing-preview.md`
  - `apps/noter/src/content/landing-preview.ro.md`
  - `apps/noter/public/landing-preview/`
  - `apps/noter/e2e/landing-markdown-preview-visual.spec.ts`

## Summary

`/landing-preview` is the admin-only preview surface for the README-shaped landing document. It lets
the operator review `notermd/app` README-style onboarding pages in Noter's `WorkspaceLayoutV2`
chrome before any content is promoted to the public landing route.

The preview is intentionally a constrained Markdown renderer, not a general GitHub clone. The
authoring baseline is content that renders clearly in the `notermd/app` GitHub README and uses only
the subset Noter currently supports.

## Accepted Contract

### Access And Layout

The product intent is admin-only access. The app does not yet have the permission primitive needed
to enforce admins separately from authenticated users, so the current temporary implementation must
stay behind the authenticated app route boundary. Operators can reach the preview through the URL
editor's route suggestions, but authenticated sidebar chrome must not add a separate
`/landing-preview` path link. Public unauthenticated navigation must not expose preview links.
Unauthenticated users should see the normal sign-in flow.

When admin permissions exist, `/landing-preview` must be narrowed to admins before any broader
internal rollout. Do not treat logged-in access as the final authorization model for this route.

The preview must render through the same `PublicLayoutShell` sidebar chrome as the public landing
page. That shell owns the `WorkspaceLayoutV2` frame and the right public sidebar, so the preview
should not create its own separate `WorkspaceLayoutV2` provider or landing-only page shell.

The English README is the default preview. Localized README previews may use the `lang` query
parameter, starting with `?lang=ro` for Romanian. While the current route is `/landing-preview`, the
sidebar query-param shortcuts should expose a compact `?lang=ro` link. The URL editor path
suggestion list should expose `/landing-preview` for authenticated operators only; sidebar path
lists and public unauthenticated navigation must not expose preview links.

### Supported Markdown Subset

The supported authoring subset is:

- headings
- paragraphs and inline emphasis
- links
- GitHub-flavored task lists
- unordered and ordered lists
- inline code and fenced code blocks
- horizontal rules
- raw `<br>` tags
- raw `<img>` tags for small logos and images
- raw `<details><summary>...</summary>...</details>` disclosure sections
- raw `<video controls src="..."></video>` embeds

Task-list checkboxes render as clickable local-only controls. Toggling them must not attempt to edit
the Markdown source or persist state until a later product flow explicitly adds persistence.

When the README needs behavior outside this subset, either simplify the README source first or
extend the renderer with a focused test. Do not switch the route to a broad remote renderer just to
cover one new construct.

### Media Mirroring

GitHub `user-attachments` URLs from private repositories are not stable public browser assets. They
may work through authenticated GitHub rendering, but the resolved video URLs are temporary.

For now, Codex manually mirrors README media into `apps/noter/public/landing-preview/` and rewrites
the preview copy to use local paths such as `/landing-preview/step-1-create-accounts.mp4`. Relative
README logo paths should also be mirrored under `apps/noter/public/landing-preview/logos/`.

Landing preview videos should be authored as inline raw `<video>` embeds rather than hidden inside
`<details>` disclosures. Non-video notes may still use `<details>` when the README needs collapsible
supporting context.

This manual mirror is acceptable until a non-LLM sync command exists. A future automation should
fetch `notermd/app@main`, copy referenced media to a stable Noter-owned public location, and rewrite
the preview Markdown deterministically.

### Sanitization

The renderer must sanitize raw HTML before rendering it. The allowlist should stay scoped to the
supported subset above, with video/image attributes limited to the current README needs. New HTML
tags require tests that show both the allowed behavior and rejected unsafe attributes.

### Validation

Changes to this route should update or add:

- renderer tests for newly supported Markdown or HTML constructs
- route coverage proving `/landing-preview` stays an explicit authenticated route
- visual coverage for the WorkspaceLayoutV2 preview surface

When mirrored media or README structure changes, update the visual snapshot so the PR shows what the
operator will inspect.
