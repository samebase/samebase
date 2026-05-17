# Package Imports Monorepo Research

Date: 2026-05-17

## Decision

Use package imports for app-internal source aliases. Keep private source aliases
in each package's `package.json#imports`, and reserve package `exports` for
cross-workspace APIs.

For Noter app code, use a broad package import:

```json
{
  "imports": {
    "#src/*": "./src/*"
  }
}
```

Use explicit source extensions in imports, such as
`#src/components/ui/button.tsx` and `#src/lib/utils.ts`. This keeps the mapping
small and standard even though `apps/noter/src/components`, `src/lib`, and
`src/hooks` contain mixed `.ts` and `.tsx` files.

## Findings

- Node package imports are private package-local mappings that start with `#`.
- `#app/*` and `#src/*` work in Node 22 and Node 24. Avoid `#/*`: it works in
  current Node 24, Bun, and Deno, but Node 22 rejects `#/...` specifiers.
- TypeScript resolves package imports by default under
  `moduleResolution: "bundler"`.
- Vite 8 and Vite+ build package-import fixtures without `resolve.alias` or
  TypeScript `paths`.
- Vite+ `vp check` passed against a package-import fixture after formatting.
- Bun 1.3 and Deno 2.7 both resolved package-import fixtures.
- shadcn 4.7 understands package imports and can generate `#...` imports.

## Monorepo Rule

Package imports resolve from the nearest package boundary. Each app or package
that wants private source aliases should define its own `imports` map. Shared
workspace libraries should expose public entrypoints with `exports` instead of
asking other packages to import through private `#...` aliases.

## Implementation Notes

- `apps/noter` and `apps/workspace-layout-v2-solid` use `#src/*` for
  app-internal source imports.
- Do not reintroduce TypeScript `paths` or Vite `resolve.alias` for source
  imports. The package `imports` map is the resolver contract.
- shadcn 4.7 supports package imports, but the Noter repo did not bump the local
  `shadcn` package in this cleanup because the current pnpm trust policy
  rejected that install. The config aliases already point at `#src/...` so the
  CLI can be advanced separately when the package policy allows it.

References:

- https://nodejs.org/api/packages.html#subpath-imports
- https://www.typescriptlang.org/tsconfig/resolvePackageJsonImports.html
- https://ui.shadcn.com/docs/package-imports
- https://ui.shadcn.com/docs/components-json
- https://bun.sh/docs/runtime/module-resolution
- https://docs.deno.com/runtime/fundamentals/node/
