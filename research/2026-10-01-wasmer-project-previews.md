# Wasmer project previews: experiment results

Experiment dates: September 30 and October 1, 2026. Recorded on October 18, 2026.

Status: research evidence. This note does not select a provider or define a product feature.

## Result

A small TanStack Start app built and ran inside Wasmer in the browser. An edit to its source file
changed the app after a full build and preview reload. This establishes a possible basis for an
editor preview. It does not establish a complete Samebase development environment.

The base template also built in a Node-hosted Wasmer guest. The main Samebase source build remained
incomplete. These tests used different source trees and must be read separately.

| Test                                     | Observed result                                                                                                                                      | Limit                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Small TanStack app, browser Wasmer       | Client and server builds completed. A source edit changed the heading and made the counter add 2 instead of 1.                                       | Installed dependencies came from the host. Each edit used a full build and page reload.                             |
| Base template, Node-hosted Wasmer        | Client and server builds completed. The home page, about page, and SPA shell prerendered. The guest returned HTTP 200.                               | Build dependencies and runtime adapters changed. This was not the unchanged launcher command.                       |
| Main Samebase app, Node-hosted Wasmer    | Host-built bundles ran in the guest. The server queried a hosted Convex development deployment. SSR, FAQ expansion, Pricing, and Back checks passed. | Sign-in and authenticated work were not tested. This preview did not compile the source in Wasmer.                  |
| Main Samebase source, Node-hosted Wasmer | The client build completed in 6 minutes 31 seconds. The SSR build started.                                                                           | The host stopped the combined build after 580.471 seconds. SSR was still incomplete. The cause was not established. |
| Anonymous Convex backend inside Wasmer   | The CLI reached local backend platform selection.                                                                                                    | It exited with code 1 and `Unsupported platform wasi and architecture unknown for local deployment.`                |

The main Vite development server started with file polling after `fs.watch` returned `ENOSYS`. Its
page request reached 150 logged source transforms, then ended with `UND_ERR_HEADERS_TIMEOUT` after
five minutes. That result did not verify a usable development server or source edit refresh.

## Browser edit evidence

The test editor wrote the complete `src/routes/index.tsx` file into the Wasmer filesystem. It
changed the heading to `Edited from the browser` and the counter expression from `count + 1` to
`count + 2`. After the build, the preview showed the new heading. One click changed the counter from
0 to 2 in the local browser runtime test.

| Execution                   | Initial build | Build after edit |
| --------------------------- | ------------: | ---------------: |
| Node-hosted Wasmer          |       36.99 s |          35.13 s |
| Browser Wasmer, local page  |        34.4 s |           33.0 s |
| Browser Wasmer, public page |        39.1 s |           37.4 s |

The first public-page startup took 111.7 seconds, including source and runtime downloads. These
measurements are individual runs, not a performance benchmark. The base-template test recorded 58.94
seconds for the client and 57.00 seconds for the server, with 133.908 seconds for its full host
test.

In the browser test, the host served the editor, SDK, and prepared source snapshot. Wasmer in the
browser ran the app compiler and HTTP server. The snapshot excluded app build output. The preview
used a separate origin and a service worker. Closing the runtime page ended its server.

The page set `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` so the runtime could use `SharedArrayBuffer`.

## Tested setup and changes

The working setup used Wasmer SDK 0.19.0 and `syrusakbary/edgejs-quickjs-wasi@=0.1.5`. The guest
reported `wasi unknown v24.13.2`. The small app used TanStack Start 1.168.34, Router 1.170.18, React
19.2.6, Vite 8.2.0, and the React plugin 6.0.5.

The experiment used the Vite core builder in place of the outer Vite+ command. Rolldown 1.2.3 used
its WASI binding with `asyncWorkPoolSize: 0`. The loader skipped its exit listener. Both emnapi
packages used 2.0.0-alpha.4. Lightning CSS used its Wasm package, version 1.33.0. Minification was
disabled. The host stopped compiler processes after the completion marker because guest shutdown was
not reliable.

The base and main-app tests also needed Tailwind Oxide WASI bindings, source-line scanning, and CSS
resolver changes. The base prerender test needed a fixed port and an IPv4 listener. These results do
not verify the unchanged `pnpm run dev` flow.

The Convex backend probe used CLI 1.46.0 and backend release `precompiled-2026-09-28-5c7cb5b`. Its
wrapper returned 0 because it saved the failed guest result. That wrapper code was not evidence of a
successful backend start.

## Possible connection to the editor

At the tested source revision, Samebase already saved edited file content and versions in
[`repositoryStagedFiles`](https://github.com/samebase/samebase/blob/79234efeff00f070afebb94d18cc459f197284a2/apps/samebase/convex/collaborative.ts#L246).
The authorized
[`listStagedFiles` query](https://github.com/samebase/samebase/blob/79234efeff00f070afebb94d18cc459f197284a2/apps/samebase/convex/fileStaging.ts#L514)
returned saved files for a branch. The
[`FileView` subscription](https://github.com/samebase/samebase/blob/79234efeff00f070afebb94d18cc459f197284a2/apps/samebase/src/repository/editor/FileView.tsx#L878)
already used that query.

A preview could load a complete project snapshot, apply saved files to Wasmer, build, then reload an
iframe. Renames, deletes, reverted edits, binary assets, and dependency changes also need a defined
update path. This connection was not implemented in the experiment.

The project app could use its own hosted Convex development deployment. Edits to Convex functions
would need an authorized deployment step. Only the Node-hosted main-app guest tested outbound Convex
access. The small browser app had no Convex backend.

## Remaining questions

- Can the full main Samebase source build finish inside Wasmer with acceptable time and memory?
- Can dependency installation and updates work inside the browser runtime?
- Can file changes update the preview without a full build and reload?
- Can browser-hosted server code reach the project backend through the required network path?
- Can the editor supply a complete project snapshot and keep its files in sync?

These tests did not run Wasmer inside Convex or Cloudflare Workers. They did not compare provider
cost, isolation, lifecycle, or operational support with Daytona.

## Evidence and source archive

The prototype source and selected logs are preserved in the separate closed archive PR linked below.
The source depends on prepared directories and packages. It is historical experiment code, not a
complete reproduction package. No runtime tests were repeated when this note was prepared. Temporary
tunnel URLs from the experiment are not a current preview service.

The base source was
[`samebase/base@e243dafa`](https://github.com/samebase/base/commit/e243dafa95b0aecc7e462722858c906ea3d858cf).
The main app source was
[`samebase/samebase@79234efe`](https://github.com/samebase/samebase/commit/79234efeff00f070afebb94d18cc459f197284a2).

- [Prototype source and evidence archive, PR #1731](https://github.com/samebase/samebase/pull/1731)
- [Wasmer browser SDK](https://github.com/wasmerio/wasmer-sdk/blob/main/js/README.md#browser)
- [Wasmer HTTP preview bridge](https://github.com/wasmerio/wasmer-sdk/blob/main/js/README.md#run-a-web-server-in-an-iframe)
- [Tested Convex backend release](https://github.com/get-convex/convex-backend/releases/tag/precompiled-2026-09-28-5c7cb5b)

## Summary

Browser Wasmer can compile and serve the small TanStack app after a source edit. A complete Samebase
source build, backend integration, and an editor preview feature still need work.
