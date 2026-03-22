# React Router, Remix, and File-Based Routing Research

Date: 2026-03-22

## Executive summary

React Router v7 framework mode is effectively where Remix lives now. Historically, React Router was the routing library and Remix was the full-stack framework built on top of it. The two converged enough that the latest Remix framework direction moved into React Router v7.

For a developer coming from Next.js pages, the cleanest mental model is:

- Next.js pages: page-centric routing with special data functions attached to pages
- Old Remix: route-centric full-stack modules with loaders and actions
- Current React Router framework mode: the Remix model under the React Router name

The most important conceptual shift is from a page-centric model to a route-tree-centric model.

## What changed between Remix and React Router

Historically:

- React Router handled routing
- Remix added the framework layer: loaders, actions, nested data loading, mutations, route error boundaries, server-first conventions

Now, React Router includes a full framework mode that carries those Remix ideas forward. In practice, many older Remix concepts still apply almost directly, but the modern place to learn them is React Router framework mode.

In one sentence: Remix was a route-centric full-stack framework built on React Router, and that model now lives inside React Router v7.

## The mental model coming from Next.js pages

With Next.js pages, the common way to think is:

1. URL maps to a page file
2. Data is fetched with something like `getServerSideProps` or `getStaticProps`
3. Mutations often go through API routes
4. Layout patterns may be shared, but historically they were less central than in nested route systems

With React Router framework mode, the model is:

1. URL maps to a route tree
2. Each route can own UI, data loading, and mutations
3. Parent and child routes nest through `Outlet`
4. Layout nesting is the central abstraction
5. Mutations are often modeled as route `action`s

That route-tree-first design is the biggest conceptual difference.

## The core route module idea

A route module typically groups together:

- the UI component
- a `loader` for reads
- an `action` for writes and form submissions
- an `ErrorBoundary`
- metadata / link helpers when needed

That means a route becomes the unit of:

- rendering
- data loading
- writes
- error handling
- revalidation

This is why people often describe React Router framework mode as basically Remix under the React Router name.

## Mapping Next.js pages concepts to React Router framework concepts

Rough translation:

- `pages/posts/[id].tsx` → route module for `posts/:id`
- `getServerSideProps` → `loader`
- API route POST handler → `action`
- page shell/layout wrapper → parent route + `Outlet`
- client navigation → `Link` / `NavLink`

The key difference is that React Router pulls reads and writes closer to the route itself instead of encouraging a hard split between page code and API route code.

## Why Remix became appealing in the first place

The original appeal of Remix was not just routing. It emphasized:

- leaning on the browser and HTTP
- real forms and progressive enhancement
- route-local mutations
- nested layouts and nested data ownership
- explicit request/response semantics

Those same ideas are now foundational to React Router framework mode.

## React Router modes now

React Router now spans multiple usage styles:

- declarative mode
- data mode
- framework mode

That means React Router is no longer just the small client-side router many people remember. It can still be used minimally, but it also supports the full framework path.

## Practical differences vs Next.js pages

### 1. Layout nesting is first-class

Parent routes render shared UI and child routes render inside `Outlet`. This is the normal architecture, not an extra pattern.

### 2. Data is route-local

Each route owns its own `loader`, so parent and child concerns stay separated.

### 3. Mutations are route-local

Instead of splitting UI into one file and writes into an API route, forms often submit directly to a route `action`.

### 4. The web platform is central

Requests, responses, redirects, status codes, forms, and headers are part of the normal programming model.

## A realistic framework-style example

Imagine an admin dashboard with:

- authentication in a parent route
- nested invoice routes
- a list page with search
- route actions for status updates
- `useFetcher()` for background mutations
- a resource route for a generated invoice file

A representative file tree in config-first framework mode might look like:

```txt
app/
  root.tsx
  routes.ts
  lib/
    auth.server.ts
    db.server.ts
  routes/
    login.tsx
    dashboard-layout.tsx
    dashboard-index.tsx
    invoices.tsx
    invoice-details.tsx
    invoice-pdf.ts
```

Typical responsibilities:

- `root.tsx`: document shell
- `dashboard-layout.tsx`: protected layout route with shared sidebar/nav
- `dashboard-index.tsx`: nested overview page
- `invoices.tsx`: list route with `loader`, search form, `action`, `useFetcher`
- `invoice-details.tsx`: nested detail route with route-level error boundary
- `invoice-pdf.ts`: resource route returning a `Response`

This shows the main React Router pattern clearly: a route is the unit of UI, data, mutation, and errors.

## Does React Router framework support file-based routing?

Yes.

By default, the framework story is config-first with `app/routes.ts`, but the official stack also supports file-based routing with `@react-router/fs-routes` and `flatRoutes()`.

A minimal `routes.ts` can look like:

```ts
import { type RouteConfig } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";

export default flatRoutes() satisfies RouteConfig;
```

So the practical answer is:

- yes, file-based routing exists
- no, it is not the only routing model
- the framework still thinks in terms of route modules and a route tree

You can also mix explicit route config with generated file routes.

## What file-based route trees look like

A realistic file-based tree might look like:

```txt
app/
  root.tsx
  routes.ts
  routes/
    _index.tsx
    login.tsx
    invoices.tsx
    invoices._index.tsx
    invoices.$invoiceId.tsx
    invoices.$invoiceId.edit.tsx
    invoices.$invoiceId.pdf.ts
    settings.tsx
    settings.profile.tsx
    settings.billing.tsx
    _auth.tsx
    _auth.login.tsx
    _auth.register.tsx
```

Meaning:

- `_index.tsx` → index route for the parent
- `settings.profile.tsx` → `/settings/profile`
- `invoices.$invoiceId.tsx` → `/invoices/:invoiceId`
- `invoices.tsx` → parent layout route
- `_auth.tsx` → pathless layout route

This gives deep URLs, but the naming convention is flatter than the deep folder structure common in Next.js.

## Can it be deep like Next.js on disk?

Not by default in the exact same style.

The official built-in file-route convention is flat and uses dot-delimited filenames. Deep route hierarchies are still supported in URL space, but the files are typically expressed like:

```txt
app/
  routes/
    dashboard.tsx
    dashboard._index.tsx
    dashboard.users.tsx
    dashboard.users.$userId.tsx
    dashboard.users.$userId.permissions.tsx
```

That maps to deep URLs such as:

- `/dashboard`
- `/dashboard/users`
- `/dashboard/users/:userId`
- `/dashboard/users/:userId/permissions`

So:

- deep URLs: yes
- deep nested folders exactly like Next.js app/pages routing: not the default built-in convention

If someone strongly prefers the old nested-folder style, alternate or legacy conventions may still be possible, but that is not the primary modern shape.

## Why the convention changed

The main reason appears to be a shift toward a route-tree-first model instead of a filesystem-shape-first model.

In older nested-folder conventions, the filesystem carried a lot of routing meaning. In the newer direction, React Router emphasizes explicit route config plus route modules, and file-based routing is one adapter on top of that.

This brings several advantages:

### 1. Unified framework model

It helps unify old Remix and modern React Router around one route-module and route-config system.

### 2. Multiple conventions can coexist

Because the route tree is the primary abstraction, the framework can support explicit config, flat file routes, and adapters for older conventions more easily.

### 3. The filesystem no longer has to mirror URLs exactly

That gives more flexibility for organizing code without forcing every architectural decision through nested folders.

### 4. Layout and data semantics matter more than directory shape

The framework is optimized around parent/child route relationships, loaders, actions, and revalidation rather than around making the disk layout visually match the URL layout.

## Blunt practical comparison

Next.js optimizes for:

- filesystem mirrors URL
- page-centric ergonomics
- highly intuitive directory browsing

React Router framework optimizes for:

- route semantics
- nested layouts and data boundaries
- explicit route modules
- flexibility between hand-written config and generated file routes

Tradeoff:

- pro: more flexible and framework-oriented
- con: less visually intuitive if you strongly prefer the Next.js “open folders, see routes” feel

## Recommended takeaway for a Next.js pages developer

If you are coming from Next.js pages, the most useful way to learn this ecosystem is:

1. Learn React Router v7 framework mode, not “Remix” as a separate modern target
2. Internalize `loader`, `action`, `Outlet`, nested layouts, and route-owned data
3. Treat file-based routing as optional sugar on top of the route-module model
4. Do not assume filesystem shape is the core abstraction in the same way it is in Next.js

## One-line conclusion

React Router framework mode is the modern home of Remix ideas, and its move toward flat file routes reflects a broader decision to prioritize route-tree semantics and framework flexibility over strict filesystem-as-URL mirroring.
