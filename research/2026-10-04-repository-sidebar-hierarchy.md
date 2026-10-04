# Repository Sidebar Hierarchy Research

## Status

- Date: 2026-10-04
- Scope: the organization, folder, and repository tree in the left sidebar
- Question: how do other products make a nested sidebar readable in a narrow pane?
- Recommendation: indent each level a little and draw an always-visible guide line

## Problem

The current tree puts the organization icon at 12 px and the organization name at 36 px. A
repository that is not in a folder starts at 12 px. A folder repository starts at 24 px. Children
sit to the left of the parent name, so the eye reads them as siblings. Folders use a leading
chevron, organizations use a trailing chevron, so the two parent levels do not share one disclosure
shape.

## Recommendation

Keep the current row content. Wrap the children of each organization in a block with a 1 px left
border that hangs from the center of the organization icon. Wrap the repositories of each folder in
a second block whose border hangs from the center of the folder chevron. Give every repository row
the same small left padding and let the wrapper own the indent.

Measured on the fixture at a 240 px sidebar:

| Row                  | Current label x | Proposed label x | Guide line x |
| -------------------- | --------------- | ---------------- | ------------ |
| Organization         | 36 px           | 36 px            | none         |
| Direct repository    | 12 px           | 27 px            | 20 px        |
| Folder               | 24 px           | 46 px            | 20 px        |
| Repository in folder | 24 px           | 48 px            | 35 px        |

The narrow container rules scale the offsets down at 200 px and 120 px, so the line keeps hanging
from the icon center.

Cost: at the 130 px phone pane a repository inside a folder loses about 17 px of text width, so a
long name wraps one word earlier. Hiding the organization type icon in narrow panes would return 24
px. No surveyed product documents a tree that works below about 120 px; the verified answer at that
width is a collapse to icons.

## Survey

Only verified facts are listed. "unverified" means no fetched page states it.

| Product or system       | Indent per level                  | Guide line                       | Chevron             | Source                                                                                                                                                                                  |
| ----------------------- | --------------------------------- | -------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub file tree        | 8 px, 12 px on coarse pointers    | hover only, always without hover | left, 16 px column  | [Primer TreeView CSS](https://raw.githubusercontent.com/primer/react/main/packages/react/src/TreeView/TreeView.module.css)                                                              |
| GitHub Desktop          | none, flat rows under owner       | none                             | none                | [repositories-list.tsx](https://raw.githubusercontent.com/desktop/desktop/development/app/src/ui/repositories-list/repositories-list.tsx)                                               |
| VS Code Explorer        | 8 px default, 4 to 40             | hover by default, can be always  | left, 16 px twistie | [listService.ts](https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/platform/list/browser/listService.ts)                                                                   |
| shadcn Sidebar          | about 25 px (`mx-3.5` + `px-2.5`) | always, `border-sidebar-border`  | unverified          | [sidebar.tsx](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/sidebar.tsx)                                                                          |
| Cloudflare Kumo Sidebar | 28 px (`pl-7`)                    | always, 1 px at 19 px            | right, 40% opacity  | [sidebar.tsx](https://github.com/cloudflare/kumo/blob/main/packages/kumo/src/components/sidebar/sidebar.tsx)                                                                            |
| Fluent UI Tree          | 24 px                             | none                             | left, 24 px         | [TreeItemLayout styles](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-tree/library/src/components/TreeItemLayout/useTreeItemLayoutStyles.styles.ts) |
| Carbon TreeView         | 16 px, 24 px with icons           | none                             | left, 24 px         | [treeview scss](https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/styles/scss/components/treeview/_treeview.scss)                                             |
| Convex dashboard        | no tree, header breadcrumb        | n/a                              | n/a                 | [ProjectSelector.tsx](https://github.com/get-convex/convex-backend/blob/main/npm-packages/dashboard/src/components/header/ProjectSelector/ProjectSelector.tsx)                          |
| Supabase Studio         | no tree, header dropdowns         | n/a                              | n/a                 | [LayoutHeader.tsx](https://github.com/supabase/supabase/blob/master/apps/studio/components/layouts/Navigation/LayoutHeader/LayoutHeader.tsx)                                            |
| Netlify                 | no tree                           | n/a                              | n/a                 | [blog](https://www.netlify.com/blog/contextual-improvements-to-netlify-navigation.md)                                                                                                   |
| Railway                 | no tree, dropdown by team         | n/a                              | n/a                 | [changelog](https://railway.com/changelog/2022-12-09-project-nav)                                                                                                                       |
| Windows tree control    | `TVM_SETINDENT`, about 5 px min   | optional `TVS_HASLINES`          | left                | [tree-view-controls](https://learn.microsoft.com/en-us/windows/win32/controls/tree-view-controls)                                                                                       |

Linear, Notion, Slack, Figma, JetBrains, Finder, Atlassian, Polaris, and Material document nesting
or collapse but do not publish indent or guide line values.

## Patterns

Counts cover the six systems with verified indent and line data: Primer, VS Code, shadcn, Kumo,
Fluent, Carbon.

1. Four of six draw a guide line. shadcn and Kumo draw it always. Primer and VS Code draw it on
   hover only, which does not work on touch.
2. Indent and line visibility go together. The always-on systems indent 25 to 28 px. The 8 px
   systems hide the line until hover.
3. Four of five tree controls put the chevron left of the label. Kumo puts it right and faded.
4. Children are visibly smaller in one of six (shadcn, 28 px rows under 32 px rows). No verified
   source uppercases parents.
5. All four checked dashboards (Convex, Supabase, Railway, Netlify) show organization and project in
   a header breadcrumb or dropdown, not in a sidebar tree. GitHub Desktop uses flat owner headers
   with unindented rows.
6. Depth caps: Apple HIG says no more than two levels in a sidebar. Samebase shows three when a
   folder is in use.
7. WAI-ARIA APG says a disclosure pattern suits site navigation better than a tree role
   ([APG](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)).

## Follow-ups

- Put the organization chevron on the left, or remove it, so both parent levels share one shape.
- Decide whether narrow panes hide the organization type icon to recover 24 px.
