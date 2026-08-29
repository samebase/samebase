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
7. Keep the right pane structurally stable while its context-specific links change.

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
- The right pane must keep a stable order for account, context, navigation, and public links. A
  route can change the contents of the context section, but it must not turn the pane into a
  different product surface.

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

## Live product audit

The 2026-08-29 audit used the production account that can access four GitHub owners. It covered the
global vault inventory, one organization, one vault, providers, new app, repository connection,
members, organization settings, account settings, landing, pricing, and the mobile pane states.

### What already works

- The global vault inventory is a useful engineering surface. Organization groups, folders, check
  status, provider counts, and pull request counts support quick scanning.
- The organization vault list is quiet and direct. Its empty space is not a problem that needs cards
  or filler.
- The mobile pane selector makes the main view and right pane easy to reach.
- The route editor, pane resizing, saved widths, and one shared pane state support the product
  model. They are not the cause of the organization navigation problem.
- Account, member, and billing pages use direct headings and controls. They need hierarchy and
  responsive checks, not a new visual style.

### Navigation diagnosis

The right pane now contains five different scopes:

1. account identity and account settings
2. a global all-vaults route
3. the organization selector and organization routes
4. administrator routes
5. public, legal, social, and build links

`All vaults` and `No organization selected` have different meanings. `All vaults` is a route link.
`No organization selected` is the current value of a separate organization selector. The current
global inventory is useful, but it is also provisional. A single list across many organizations may
stop being practical as the product grows.

Every item in the organization section is a route destination. This includes `New app` and
`Connect repository`. Samebase relies on routes as durable product state, including query parameters
for modal state. An action-oriented page is not less valid as a navigation destination.

The right pane problem is therefore an information hierarchy problem. It does not require a new pane
profile, a second persistence model, or different public and signed-in shells.

### Right-pane prototype direction

Use this zone order for the next visual prototype:

1. account
2. organization selector
3. organization route links when an organization is selected
4. the current global vault route as a secondary escape
5. operator or administrator tools when available
6. public and build links

Keep the organization selector and `All vaults` route separate in this prototype. Their behavior is
different. Placing the organization block first avoids making the global aggregate the permanent
center of the product. If the global inventory later becomes infeasible, this layout can remove the
secondary route without changing the organization structure.

For an organization, keep the existing route destinations together:

- Vaults
- New app
- Connect repository
- Providers
- Members
- Organization settings

The placement is a prototype, not an accepted product contract. Keep route and query-parameter
behavior intact while testing the hierarchy.

Keep the slash-prefixed public links and build identifier at the bottom. Apply consistent spacing
and grouping, but do not replace them with generic icon chrome. The route-like presentation is part
of the product character.

The first prototype must cover these states before implementation:

- all vaults with four organizations
- one organization
- one vault in that organization
- account settings
- a narrow mobile right pane
- an organization that has no vaults

### Landing page diagnosis

The landing page contains strong material, but its order makes a new visitor work too hard. The
opening assumes knowledge of Convex and Cloudflare. The page then presents a founder video, a stack
argument, an agent prompt, two product traits, four claims, monorepo support, provider usage costs,
four similar FAQ questions, a second video, long receipts, and a final call to action.

The problem is not only the hero. The complete narrative needs one sequence:

1. State the user outcome without provider knowledge.
2. Show what Samebase creates and connects.
3. Show the working product.
4. Explain ownership, isolation, and the provider stack.
5. Show Samebase pricing and separate it from provider usage.
6. Give one next action and links to detailed receipts.

Remove `BETA` and provider logos from the opening claim. Provider names can appear in the stack
explanation. Keep one video in the main story and link to the full onboarding video. Combine the
repeated `Why do I need Samebase?` FAQ items. Keep the dated evidence, but move long evidence into
the receipts pages instead of making it part of the main reading path.

The agent-prompt idea can remain a strong proof and acquisition mechanism. It must support the
product explanation, not replace it.

### Pricing diagnosis

The desktop pricing table contains the required facts, but it asks the reader to compare owner type
and plan in one matrix. The product decision is simpler than the table:

- Free costs $0. A personal owner gets 12 connections. An organization gets 6 connections.
- Pro costs $4 per month for any owner and provides 120 connections.
- Pro includes two members. Each additional seat costs $2 per month.

Present this decision first. Keep the exact ownership limits below it.

Desktop viewport compression exposed that the table depends on horizontal scrolling. This did not
prove that the mobile pane merge is broken. Replace the wide comparison with a vertical structure,
then verify both a narrow desktop pane and the real mobile pane behavior. Do not create a separate
mobile pricing route.

### Creation, connection, and provider pages

The initial audit did not inspect enough real success, pending, error, and recovery states to
justify a redesign of these routes. Do not change them from this note alone. A later pass must first
trace the current route states and provider transitions, then identify a specific user-visible
failure.

### Mobbin evidence

The references support interaction patterns, not a visual restyle:

- The
  [OpenAI Platform organization switch flow](https://mobbin.com/flows/9c66c1d5-05e0-4726-8d9a-8681b7ac31a8)
  keeps the main navigation stable and changes the organization from one compact control.
- The [TheyDo workspace switch flow](https://mobbin.com/flows/327b1961-a5ec-4d82-9347-498ef01650c1)
  uses the same pattern and keeps workspace creation inside the switcher.
- The [Webflow workspace screen](https://mobbin.com/screens/e6ef30e7-d8d2-450f-b039-1fd1ccc0bdd3)
  separates workspace navigation from the account menu.
- The
  [GitHub account settings screen](https://mobbin.com/screens/898e0f92-482b-498a-ac7f-337ee639abb8)
  and
  [PlanetScale account settings screen](https://mobbin.com/screens/5652063d-d3c8-4a29-b30a-985b8b5cb76a)
  make personal and organization settings separate choices.
- The [Replit integrations screen](https://mobbin.com/screens/718e8393-29d9-474c-8a40-c798cc577ea9)
  puts provider description, status, and action in a scan-friendly list.
- The
  [Cloudflare infrastructure section](https://mobbin.com/sites/sections/3f43d4a8-c70c-4f82-a216-52bd0a30a932)
  uses one diagram to explain a complex runtime system.
- The
  [Cloudflare pricing section](https://mobbin.com/sites/sections/4c85f5d2-31fc-4cc9-957b-9cd9ed872086)
  states the Free and Paid decision before the detailed limits.

These examples do not have Samebase's pane behavior or route model. Use only the repeated hierarchy
patterns.

## Proposed work sequence

1. Prototype the right-pane contract on global, organization, and vault routes. Test desktop and
   mobile without changing pane persistence.
2. Restructure the complete landing narrative and pricing presentation as one public-product pass.
3. Improve new app, repository connection, and provider recovery as one operational-flow pass.
4. Review members, organization settings, and account settings after the navigation contract is
   stable.

Do not combine this sequence with a `Vault` vocabulary migration, database migration, notch
experiment, or file-view redesign.

## Success criteria

- A new visitor can explain what Samebase does without prior knowledge of Convex or Cloudflare.
- Pricing and the ownership model are easy to find.
- A signed-in user can tell whether the current route is global, organization-owned, or vault-owned.
- The organization switch does not hide the difference between account and organization actions.
- The landing page and app continue to use one fast shell and one pane state model.
- Mobile navigation remains as capable as the desktop shell.
- Visual changes still look native beside the Codex in-app browser.

## Open decisions

- Where the agent prompt belongs in the complete landing narrative
- How the complete landing-page narrative should change
- Whether the proposed right-pane contract should proceed to an interactive prototype
- Whether notched corners can become a reliable shared component standard
- Whether "Vault" remains the user-facing domain name
