# Cloudflare Tunnel TypeScript LSP Research

Date: 2026-04-04

## Question

Can Noter pass a real TypeScript language server through Cloudflare Tunnel so a
browser or phone surface gets better TypeScript IntelliSense than the current
Monaco-in-browser setup?

## Short Answer

Yes, with one important constraint: Cloudflare Tunnel is a viable transport for
browser-facing TypeScript IntelliSense only if we expose the language server
through an HTTP or WebSocket bridge.

That means the practical shape is:

1. browser Monaco client
2. WebSocket JSON-RPC transport
3. machine-local bridge service behind Cloudflare Tunnel
4. `typescript-language-server --stdio` or raw `tsserver`

This is likely the fastest path to real TypeScript project intelligence for
remote or mobile editing, but it will not beat a same-device local worker on raw
keystroke latency. It wins on correctness, workspace fidelity, and
"time-to-useful-semantics" for larger repos.

## Why This Matters In Noter

The current Noter editor path is intentionally lighter than a real TypeScript
project service:

1. `apps/noter/src/hooks/useProjectFiles.ts` only loads up to `200` source
   files, skips `node_modules`, and skips files over `100 KB`.
2. `apps/noter/src/components/MonacoEditor.tsx` feeds those files into Monaco as
   read-only `addExtraLib()` context specifically to avoid worker OOM and mass
   diagnostics churn.
3. `apps/noter/src/components/monaco/setupEditor.ts` applies only a narrow
   subset of `tsconfig` options.
4. `apps/noter/src/components/monaco/ata.ts` relies on browser-side automatic
   type acquisition and rate-limited fetches for package types.

That is a sensible browser baseline, but it is not equivalent to a warm local
TypeScript project service with full filesystem access, real `node_modules`,
project references, rename support, and full workspace symbol knowledge.

## Verified External Inputs

### Cloudflare transport

1. Cloudflare Tunnel uses outbound-only `cloudflared` connections to
   Cloudflare's edge over port `7844` using HTTP/2 or QUIC.
2. Quick Tunnels proxy a localhost web server to a random public
   `trycloudflare.com` URL and are intended for testing and development only.
3. Quick Tunnels have a `200` in-flight request cap and do not support
   Server-Sent Events.
4. Cloudflare's tunnel configuration docs explicitly treat WebSocket and TCP as
   long-lived connections that will drop on connector cutover, which implies
   WebSocket transport is supported but must reconnect cleanly.
5. Cloudflare can also publish arbitrary TCP services, but a browser cannot
   consume raw TCP directly, so that path is not the right browser IntelliSense
   shape.

Sources:

- [Cloudflare Tunnel overview](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
- [Cloudflare connectivity options](https://developers.cloudflare.com/cloudflare-one/networks/connectivity-options/)
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
- [Cloudflare tunnel configuration file reference](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)

### LSP and TypeScript server shape

1. LSP is JSON-RPC between an editor and a language server.
2. `tsserver` itself speaks a stdio JSON protocol and is well suited to IDE
   support, but it is not browser-native.
3. `typescript-language-server` is a thin LSP wrapper over TypeScript's language
   service and currently runs with `--stdio`.
4. The main browser integration path in the ecosystem is a WebSocket bridge such
   as `monaco-languageclient` plus `vscode-ws-jsonrpc`, which exists precisely
   to connect Monaco in the browser to an external language server process.

Sources:

- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [TypeScript `tsserver` wiki](https://github.com/microsoft/TypeScript/wiki/Standalone-Server-%28tsserver%29)
- [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server)
- [monaco-languageclient](https://github.com/TypeFox/monaco-languageclient)

## What This Means Practically

### 1. We should not tunnel raw `tsserver` directly to the browser

`tsserver` and `typescript-language-server` are stdio-first processes. A browser
client wants WebSocket or another browser-safe transport.

Conclusion:

1. the browser-facing boundary should be an HTTP or WebSocket endpoint on the
   machine-local control service
2. that bridge should own process lifecycle, JSON-RPC framing, reconnects, and
   auth

### 2. Cloudflare Tunnel can carry the right transport

Cloudflare already supports tunneling HTTP apps, and its docs explicitly call
out long-lived WebSocket handling. That is enough for browser-compatible LSP.

Conclusion:

1. a tunneled WebSocket LSP bridge is feasible
2. we do not need Cloudflare Access TCP or a device-side `cloudflared access`
   client for the browser use case
3. the existing machine-local HTTP control direction in `rfcs/078` is the right
   architectural home for this capability

### 3. "Faster than anything else" is only partly true

There are two different comparisons hiding inside this question.

For a desktop browser running on the same machine as the repo:

1. a local Monaco worker will always win on raw round-trip latency for cheap
   single-file operations because it avoids the Cloudflare edge hop entirely
2. tunneling every semantic request out to Cloudflare and back cannot be the
   absolute fastest keystroke path

For remote and mobile use:

1. a tunneled local TypeScript server is likely the fastest path to real
   workspace-aware IntelliSense because the remote client does not have the full
   repo, `node_modules`, watcher state, or a warm project graph
2. it should outperform the current browser-only Noter path on correctness and
   likely on perceived readiness for larger repos because the machine-local
   server can use the real filesystem instead of browser ATA plus the current
   file-count cap

So the accurate claim is:

1. this is likely the fastest path to real remote TypeScript IntelliSense
2. it is not the fastest possible path for same-device local editing

## Recommended Architecture

1. Extend the machine-local control service with a TypeScript LSP endpoint such
   as `/lsp/typescript`.
2. Authenticate that endpoint with the same short-lived Noter-issued
   machine-control tokens proposed for other tunneled local control traffic.
3. Spawn one warm TypeScript workspace service per active repo or branch.
4. Start with `typescript-language-server --stdio` behind a WebSocket bridge.
5. Use `monaco-languageclient` in the browser so Monaco can speak normal LSP
   over the WebSocket.
6. Rehydrate editor state after reconnect by replaying `initialize`, `didOpen`,
   and buffered `didChange` messages.
7. Keep the current Monaco worker as a local fallback or optimistic bootstrap
   path until the remote LSP session is ready.

## Risks And Constraints

1. Quick Tunnels are suitable for prototype work, not production rollout.
2. Long-lived WebSocket sessions will drop on tunnel connector restart or
   cutover, so reconnect behavior is mandatory.
3. The tunnel URL must not become the security boundary; auth still belongs to
   Noter.
4. Cross-origin browser WebSocket usage is possible, but a same-origin proxy
   path may still be cleaner for auth, cookies, and origin validation.
5. TypeScript server memory and file-watcher load will need per-workspace
   limits, especially if multiple vaults are live at once.
6. `typescript-language-server` is a wrapper over today's TypeScript server
   stack, so we should avoid over-building custom transport glue if the future
   native TypeScript LSP path matures.

## Recommendation

Prototype this.

The repo already wants tunneled machine-local HTTP control, and the current
Monaco path is intentionally constrained enough that a real TypeScript server
would be materially better for remote workspace intelligence.

The strongest recommendation is:

1. use Cloudflare Tunnel as transport
2. use WebSocket JSON-RPC as the browser boundary
3. keep auth in Noter
4. start with `typescript-language-server --stdio` behind the machine-local
   service instead of inventing a raw TypeScript protocol client in the browser

If the goal is "real TypeScript IntelliSense on a phone or remote browser from a
machine-local repo," this looks like the right next experiment.

## Suggested Prototype Scope

1. add one machine-local WebSocket bridge for a single workspace
2. connect one Monaco route with `monaco-languageclient`
3. support `hover`, `completion`, `definition`, and diagnostics first
4. measure completion and definition latency against the current Monaco path on
   a small repo and a large repo
5. only add rename, code actions, and workspace symbol search after the basic
   transport feels stable
