# GitHub Chrome Extension TypeScript IntelliSense Research

Date: 2026-04-04

Related:

- `research/2026-04-04-cloudflare-tunnel-typescript-lsp.md`

## Question

Can Noter put real TypeScript IntelliSense into a Chrome extension so that,
while browsing `github.com`, an operator who already has the branch locally can
see actual workspace-aware intelligence?

## Short Answer

Yes, but not as a pure in-browser extension.

A Chrome extension can absolutely provide the GitHub integration layer and UI,
but "real" TypeScript IntelliSense still needs a companion runtime that has the
actual repo checkout, `node_modules`, and a warm TypeScript server.

For the specific case where the operator already has the branch on the same
machine as Chrome, the fastest architecture is:

1. GitHub Chrome extension
2. local companion service or native-messaging host
3. `typescript-language-server --stdio` or `tsserver`

Not:

1. GitHub page
2. Cloudflare Tunnel
3. remote machine-local service

Cloudflare Tunnel is useful when the branch lives on another machine. For a
local Chrome extension talking to a local checkout, the tunnel would add latency
with no upside.

If the operator has multiple machines and only one of them has the project, the
extension should choose transport based on where the branch is actually
available:

1. localhost when this machine has the branch
2. remote machine-local service through Noter discovery and Cloudflare Tunnel
   when another connected machine has the branch

## Verified External Inputs

### Chrome extension capabilities

1. Content scripts can run on matching pages such as `https://github.com/*`, but
   they run in isolated worlds.
2. The Side Panel API can host a persistent extension UI alongside the current
   web page, and side panels have access to Chrome APIs because they are
   extension pages.
3. Chrome supports message passing between content scripts, extension pages, and
   the extension service worker.
4. Native messaging lets an extension keep a long-lived port to a local native
   process over stdio.
5. Extension pages and service workers can make cross-origin requests with host
   permissions, but content scripts remain subject to the page's origin rules.
6. If a design keeps a WebSocket in the extension service worker, Chrome treats
   recent WebSocket activity as a keepalive signal; otherwise the service worker
   can be suspended.

Sources:

- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Chrome message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Chrome cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Chrome match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)
- [Chrome real-time updates in extensions](https://developer.chrome.com/docs/extensions/develop/concepts/real-time)

### GitHub surfaces

1. GitHub's repository UI exposes branch browsing and file-tree navigation on
   the web.
2. GitHub PRs have a `Files changed` surface for diff review.
3. GitHub's in-browser file editor uses CodeMirror.
4. GitHub already computes a lightweight changed-function summary for supported
   languages including TypeScript in PR review, which shows that GitHub pages do
   expose enough route context for an extension to attach useful code-aware UI.

Sources:

- [Viewing branches in your repository](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/viewing-branches-in-your-repository)
- [Filtering files in a pull request](https://docs.github.com/github/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/filtering-files-in-a-pull-request)
- [Editing files](https://docs.github.com/articles/editing-files-in-another-user-s-repository)
- [Finding changed methods and functions in a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/finding-changed-methods-and-functions-in-a-pull-request?apiVersion=2022-11-28)

### TypeScript and browser LSP shape

1. `tsserver` speaks stdio and expects real project files.
2. `typescript-language-server` is an LSP wrapper over TypeScript's language
   service and also runs over stdio.
3. Browser Monaco integrations commonly use a WebSocket bridge for external
   language servers.

Sources:

- [TypeScript `tsserver` wiki](https://github.com/microsoft/TypeScript/wiki/Standalone-Server-%28tsserver%29)
- [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server)
- [monaco-languageclient](https://github.com/TypeFox/monaco-languageclient)

## What This Means Practically

### 1. A pure extension is not enough for real workspace IntelliSense

A Chrome extension can inspect the GitHub page, parse repo and branch context,
and render UI, but it does not magically gain access to the operator's checked
out repo or a Node-hosted TypeScript service.

Conclusion:

1. real branch-aware IntelliSense requires a local companion
2. that companion can be a localhost HTTP or WebSocket service, or a native
   messaging host

### 2. Same-machine GitHub IntelliSense should avoid Cloudflare Tunnel

This is the key difference from the earlier tunnel note.

If Chrome and the checked-out branch are on the same machine, using a Cloudflare
Tunnel would route local editor traffic out to the edge and back.

Conclusion:

1. for local Chrome plus local checkout, use localhost or native messaging
2. reserve Cloudflare Tunnel for the case where the repo lives on another
   machine that the extension is trying to reach

### 3. The extension should prefer a side panel over direct DOM takeover

A content script can annotate the GitHub page, but GitHub DOM integration will
always be somewhat fragile.

The Side Panel API is a better primary surface because:

1. it stays outside GitHub's layout and CSS churn
2. it can host a richer Monaco client if needed
3. it has normal extension-page access to Chrome APIs

Conclusion:

1. use a lightweight content script for page detection, selection, and inline
   affordances
2. put the heavy UI and LSP session in the side panel

### 4. Read-only GitHub pages and editable IntelliSense are different problems

There are really two features hiding inside the request:

1. code intelligence while viewing blobs or PR diffs
2. code completion while editing

On repository blob pages and PR diffs, the extension can realistically provide:

1. hover info
2. go-to-definition jumps
3. find references or symbol links
4. diagnostics badges or quick facts

But inline code completion is much harder on a read-only GitHub diff surface.

Conclusion:

1. for read-only pages, prioritize hover, definition, and symbol lookup
2. for completion, open an extension-owned editable surface in the side panel or
   attach to GitHub's CodeMirror editor only when the user is actually editing

### 5. Native messaging is viable, but a localhost Noter service is probably the better first move

Native messaging is powerful and secure, but it requires per-OS host
installation and registration.

If Noter already has or plans a local machine service, the extension can likely
reuse that path with much less platform-specific packaging.

Conclusion:

1. the smallest first prototype is probably extension -> localhost Noter service
2. native messaging is a strong fallback if localhost browser access becomes too
   awkward or too permission-heavy

### 6. Service-worker-owned WebSockets are possible, but not the cleanest first shape

Chrome documents that recent WebSocket activity can keep an extension service
worker alive. That makes a service-worker transport possible, but it introduces
keepalive lifecycle concerns.

Conclusion:

1. a side-panel page owning the live LSP socket is simpler than a service worker
   owning it
2. the service worker can stay focused on tab routing, permissions, and
   lifecycle coordination

### 7. Two-machine use changes routing, not the product surface

This is the important requirement if the operator wants to browse GitHub from
either machine but only one machine actually has the checkout.

The extension UI can stay the same on both machines. What changes is the backend
selection step.

Conclusion:

1. the extension should first check whether the current machine has the repo and
   branch locally
2. if not, it should ask Noter which connected machine currently has that repo
   and branch available for TypeScript intelligence
3. if another machine is the owner, the extension should reuse the same side
   panel UI but connect to that machine's LSP bridge through the Noter-mediated
   remote path
4. this means the product should think in terms of `best available workspace`
   rather than `current machine only`

## Recommended Architecture

1. Chrome extension activates only on `github.com`.
2. A content script extracts repo, branch, commit, PR, and file-path context
   from the current page.
3. The extension opens a GitHub-specific side panel.
4. The side panel asks the local Noter service whether the current repo and
   branch exist locally and are ready for TypeScript intelligence.
5. If the branch exists locally, the side panel connects to a local TypeScript
   LSP bridge.
6. If the branch does not exist locally, the side panel asks Noter which
   connected machine can serve that repo and branch.
7. If another machine is available, the side panel connects to that machine's
   TypeScript bridge through the remote machine-control path.
8. The side panel renders:
   - symbol hover
   - definition and reference links
   - diagnostics
   - optional editable scratch surface for completion and rename
9. Inline page affordances stay minimal:
   - enable button
   - status chip
   - jump-to-side-panel actions on selected symbols

The transport preference order should be:

1. local companion on this machine
2. remote connected machine with the branch
3. clear "branch unavailable" state if neither exists

## Risks And Constraints

1. GitHub DOM churn will break fine-grained inline integrations more often than
   side-panel integrations.
2. Broad host permissions on `github.com` can create user-trust friction, so the
   extension should request the narrowest permissions it can.
3. A branch name on GitHub is not enough by itself; the extension needs a
   reliable repo mapping plus machine discovery to know whether the branch is
   local or should be served remotely.
4. Local or remote branch state can diverge from the GitHub branch that the page
   is showing, especially on PR pages or stale checkouts.
5. If the feature tries to mutate GitHub's own editor deeply, it becomes more
   brittle than an extension-owned editor surface.
6. Native messaging improves locality but increases install complexity.
7. Multi-machine routing needs freshness rules so the extension does not attach
   to a machine that has the repo name but not the right branch head.

## Recommendation

Prototype this, but do it as a Chrome extension plus local companion, not as a
browser-only script and not as a Cloudflare-Tunnel-first path.

The strongest recommendation is:

1. Chrome extension on `github.com`
2. side panel as the main UI
3. content script only for page detection and light affordances
4. topology-aware transport selection
5. localhost Noter service as the first transport when this machine has the
   branch
6. remote connected machine via Noter discovery and Cloudflare Tunnel when a
   different machine has the branch
7. real TypeScript service behind either bridge

If the goal is "when I am on GitHub and I already have this branch locally, show
me actual TypeScript intelligence," this looks feasible.

If the goal becomes "let me use the same GitHub extension from either of my
machines even when only one machine has the project," this still looks feasible.
It just requires machine selection and freshness checks as part of the lookup
step.

## Suggested Prototype Scope

1. support repository blob pages first, not PR diffs
2. detect `{owner}/{repo}`, branch, and file path from the current GitHub page
3. confirm whether the branch is available locally and, if not, whether another
   connected machine can serve it
4. show hover and go-to-definition in a side panel first
5. add an explicit machine-status indicator so the operator can see whether the
   session is local or remote
6. add an "Open editable mirror" panel for completions before trying to inject
   completions into GitHub's own UI
7. only after blob pages feel solid, expand to PR `Files changed` pages
