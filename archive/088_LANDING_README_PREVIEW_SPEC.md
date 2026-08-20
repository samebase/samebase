# Superseded Landing README Preview Spec

## Document Control

- Status: Superseded
- Owner: Samebase landing/onboarding
- Last updated: 2026-08-20
- Superseded by: the custom React landing page in
  `apps/samebase/src/components/LandingPreviewPage.tsx` and its current tests

The content below describes the removed README renderer. Its file references are historical and can
no longer exist in the current tree.

- Related files:
  - `apps/samebase/src/routes/landing-preview.tsx`
  - `apps/samebase/src/components/LandingMarkdownPreviewPage.tsx`
  - `apps/samebase/src/components/MarkdownLandingDocument.tsx`
  - `apps/samebase/src/content/landing-preview.md`
  - `apps/samebase/src/content/landing-preview.ro.md`
  - `apps/samebase/public/landing-preview/`
  - `apps/samebase/e2e/landing-markdown-preview-visual.spec.ts`

## Summary

`/landing-preview` is the README-shaped overview surface (originally an admin-only preview; public
since the 2026-07-07 amendment). It renders `samebase/app` README-style onboarding pages in
Samebase's `WorkspaceLayoutV2` chrome.

The preview is intentionally a constrained Markdown renderer, not a general GitHub clone. The
authoring baseline is content that renders clearly in the `samebase/app` GitHub README and uses only
the subset Samebase currently supports.

## Accepted Contract

### Access And Layout

Amended 2026-07-07: the route outgrew the original admin-only preview intent and now serves as the
public overview page of the docs corpus. Route metadata classifies `/landing-preview` as
`access_public` with a hidden path suggestion (`apps/samebase/src/routeAccessMetadata.ts`), the page
is prerendered with the other public routes, and the docs sidebar links to it as "Overview". The
admin-only clauses below this point are superseded by that shipped state; the rendering and chrome
constraints in the rest of this spec still apply.

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

For now, Codex manually mirrors README assets into `apps/samebase/public/landing-preview/`. Relative
README logo paths should be mirrored under `apps/samebase/public/landing-preview/logos/`.

Landing preview videos should be authored as inline raw `<video>` embeds rather than hidden inside
`<details>` disclosures. Non-video notes may still use `<details>` when the README needs collapsible
supporting context.

This manual mirror is acceptable until a non-LLM sync command exists. A future automation should
fetch `samebase/app@main`, copy referenced media to a stable Samebase-owned public location, and
rewrite the preview Markdown deterministically.

### Sanitization

The renderer must sanitize raw HTML before rendering it. The allowlist should stay scoped to the
supported subset above, with video/image attributes limited to the current README needs. New HTML
tags require tests that show both the allowed behavior and rejected unsafe attributes.

### Validation

Changes to this route should update or add:

- renderer tests for newly supported Markdown or HTML constructs
- route coverage matching the amended access contract (`access_public`, hidden path suggestion)
- visual coverage for the WorkspaceLayoutV2 preview surface

When mirrored media or README structure changes, update the visual snapshot so the PR shows what the
operator will inspect.
