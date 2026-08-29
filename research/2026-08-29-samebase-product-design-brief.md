# Samebase product design brief

## Status

- Status: research brief, not an accepted product spec
- Date: 2026-08-29
- Source: operator product-design discussion and current repository contracts
- Purpose: preserve the product intent and constraints that must guide a future design audit

This brief does not approve a redesign, route change, data migration, or vocabulary migration. Code
and accepted specs remain the source of truth.

Related material:

- [Landing positioning idea capture](./2026-06-28-landing-positioning-ideas.md)
- [Landing copy interview](./2026-07-02-landing-copy-interview.md)
- [Organization context and route model](../specs/121_ORGANIZATION_CONTEXT_AND_ROUTE_MODEL.md)
- [Workspace mobile merge state persistence](../specs/097_WORKSPACE_MOBILE_MERGE_STATE_PERSISTENCE_SPEC.md)
- [Rectangular visual language proposal](../rfcs/058_RECTANGULAR_VISUAL_LANGUAGE_SPEC.md)

## Product character

Samebase is an engineering tool that its operator uses every day. It is not a conventional SaaS
dashboard with a marketing site attached to it.

The public landing page and the signed-in app intentionally use the same single-page application.
This proves that the product shell is fast enough for the public entry point and avoids a second
site with separate behavior. Public and signed-in routes share the pane system.

Routes are part of the product interface. The URL viewer and editor let a user move through the app
when Samebase runs as a progressive web app or inside the Codex browser. Route clarity is therefore
a design requirement, not an implementation detail.

## Design priorities

1. Make the product useful and comfortable during daily engineering work.
2. Keep cold load, navigation, and pane restoration fast and stable.
3. Preserve the strong mobile sidebar experience.
4. Explain the product in plain language before relying on provider names or logos.
5. Keep the interface quiet. Do not add decorative chrome, filler copy, or generic SaaS styling.
6. Make global, organization, and vault context clear at every route.

## Visual language to preserve

- Samebase uses square geometry, thin borders, and little visual ornament.
- The square system relates to the Sierpinski carpet logo.
- The shell fits closely into the Codex in-app browser. Its borders and geometry can make Samebase
  appear native to that environment.
- Standard system fonts protect the first load. Do not replace them without a measured loading and
  rendering result.
- Do not add rounded cards, shadows, gradients, or decorative borders as a default response to an
  information hierarchy problem.
- Slash-prefixed links and direct route language can support the tool-like character. Apply that
  language consistently or remove it. Do not leave it as an isolated footer treatment.

Notched corners remain an open visual experiment. Earlier SVG clipping did not produce reliable
pixel alignment. A later four-corner element approach gave more control but could not clip child
content cleanly. A future notch proposal must solve those rendering constraints across shared
components before it changes the product standard.

## Interaction contracts to preserve

- The pane system has one saved state model. Convex, local storage, and prehydration cooperate to
  restore it.
- Public routes must not receive a separate sidebar profile only to create a different landing-page
  composition.
- Pane widths and mobile merge state are intentional user preferences. A design pass must not
  replace them with route-specific defaults.
- Back, Forward, reload, direct links, and progressive web app navigation must continue to use the
  route as the source of context.
- Mobile usability is a product strength. Desktop simplification must not weaken touch, focus,
  resizing, or pane selection behavior.

## Highest-value design questions

### Explain Samebase without provider knowledge

The opening view must tell a new visitor what Samebase does even if the visitor does not know Convex
or Cloudflare Workers. Provider names are supporting evidence, not the explanation.

The proposed agent-prompt hero is a useful and daring idea. It is not approved in isolation. Judge
it as part of the complete landing page, including the product explanation, proof, pricing, and next
action.

Review every landing section. The work must not stop after the hero.

### Make pricing easy to find and understand

Pricing information exists, but the current table is not easy to see. The design must make the cost
model readable without hiding it behind dense copy or requiring the visitor to infer costs from
provider logos.

### Clarify organization navigation

Organization support added a difficult hierarchy to the right pane. The pane currently combines
account identity, the organization switch, organization navigation, and global links. A user can
have difficulty seeing which controls are global and which controls belong to the selected
organization.

The design audit must test these contexts:

- all vaults
- one organization
- several organizations
- one vault inside an organization
- account settings
- an organization with no vaults
- lost organization or vault access

The solution must preserve route-owned organization context. It must not introduce a hidden saved
active organization.

### Show the product hierarchy

The interface must distinguish these levels without adding decorative layers:

1. Samebase account
2. organization
3. vault and its GitHub repository
4. connected Convex and Cloudflare resources

The current file view is an operator surface and is not part of the near-term user offering. It can
receive maintenance work, but it must not take priority over the landing page, organization
navigation, creation, connection, provider, member, and settings flows.

### Decide vocabulary separately

"Vault" came from the repository workspace model and often maps to one GitHub repository. Renaming
it to "Repository" may affect routes, database tables, backend names, documentation, and user
expectations. Treat this as a separate domain and migration decision. A visual audit must not start
that rename.

## Audit method

A useful design pass starts with the live product, not a general style checklist.

1. Map every public and signed-in route in scope.
2. Capture wide desktop, narrow desktop, and mobile states.
3. Record the user task, context, current problem, preserved invariant, and proposed change for each
   finding.
4. Compare complete workflows, not isolated screenshots.
5. Select the few changes with the highest effect on comprehension or daily use.
6. Prototype one connected area before implementation.
7. Verify the selected direction against real routes and mobile pane behavior.

The first audit should cover:

- all landing-page sections
- pricing and public supporting pages
- global vault inventory
- organization switch and organization navigation
- new app and connect repository
- provider connection and recovery
- members and organization settings
- account settings
- the shared shell at desktop and mobile widths

## How Mobbin can help

Mobbin can supply reference evidence for a design decision. Its web-app, mobile-app, and website
library includes individual screens, complete flows, and website sections. Its
[MCP tools](https://docs.mobbin.com/mcp/features) can search these sources from an agent session.

Use it for narrow questions such as:

- How do technical products separate account, workspace, and project context?
- How do products show a global project list beside workspace-specific navigation?
- How do repository or deployment tools present provider connection, recovery, and permission
  states?
- How do products make create and import actions distinct?
- How do compact mobile shells expose two navigation panes?
- How do developer-tool landing pages explain infrastructure, pricing, and trust without assuming
  provider knowledge?

For each question, collect several complete flows and record the repeated interaction pattern. Do
not copy one product's visual style. Samebase's pane behavior, route model, geometry, and
performance constraints remain the filter.

Mobbin cannot decide Samebase's product hierarchy, validate its domain model, or replace testing
with users. It is a reference library, not the design process.

## Success criteria

- A new visitor can explain what Samebase does without prior knowledge of Convex or Cloudflare.
- Pricing and the ownership model are easy to find.
- A signed-in user can tell whether the current route is global, organization-owned, or vault-owned.
- The organization switch does not hide the difference between account and organization actions.
- The landing page and app continue to use one fast shell and one pane state model.
- Mobile navigation remains as capable as the desktop shell.
- Visual changes still look native beside the Codex in-app browser.

## Open decisions

- Whether the agent prompt becomes the landing hero
- How the complete landing-page narrative should change
- How the right pane should separate global and organization navigation
- Whether notched corners can become a reliable shared component standard
- Whether "Vault" remains the user-facing domain name
