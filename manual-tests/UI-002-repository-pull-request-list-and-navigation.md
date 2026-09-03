# UI-002: Repository pull request observation and exact branch navigation

## Purpose

Verify a selected repository shows current pull requests from live provider reads, attributes
preview resources only from provider evidence, and opens a same-repository pull request at its exact
head branch.

## Preconditions

- `pnpm dev` can run in the current checkout.
- A connected repository has an authenticated GitHub connection and at least seven open pull
  requests.
- One same-repository pull request has a Cloudflare Worker build whose trigger, repository, root,
  commit, and pull request evidence match a durable Worker attachment.
- For full preview coverage, that Worker build targets a Convex preview from the durable Convex
  project attachment in the same repository.
- Optional fork coverage: one open pull request originates from a fork.

## Steps

1. Start the app with `pnpm dev`.
2. Open the repository dashboard and select the connected repository.
3. Confirm the primary list contains open pull requests, not the repository branch catalog.
4. Confirm each row links to the GitHub pull request and shows its number, title, exact head and
   base branches, labels, draft state, checks, and changed-file totals when GitHub provides them.
5. Confirm Cloudflare rows appear only when a build is attributable to the pull request through the
   durable Worker attachment and live provider evidence.
6. Confirm a Convex preview link appears only when the live Worker build identifies an exact preview
   deployment from the durable Convex project attachment in that same repository.
7. On a same-repository pull request, select `View changes` and confirm FileView opens with that
   pull request's head branch in the URL.
8. Reload FileView and confirm it remains on that exact branch after hydrating only that branch's
   exact tree cache.
9. Return to the dashboard and change a label or draft filter. Confirm the preference remains after
   reload and the list still represents a fresh provider observation.
10. If a fork pull request is available, confirm it does not offer Samebase `View changes` and does
    not infer a Convex preview from a matching branch name.
11. Confirm the first request loads six pull requests. Scroll to the end and confirm the next page
    loads automatically without a `Load more` control or a second GitHub link.
12. Temporarily make one provider unavailable. Confirm the dashboard distinguishes unavailable or
    failed observation state from an observed absence, while retaining any still-usable cached
    observation as stale. Confirm stale pull requests and deploy resources have no separate retry
    controls and that reloading the document recreates the requests.

## Expected Results

1. Convex supplies the repository and direct provider attachments. GitHub, Cloudflare, and Convex
   supply current pull request and resource state through authenticated live reads.
2. An empty resource area means the provider observation found no attributable resource. Provider
   failure is shown as unavailable or failed instead of being presented as absence.
3. Same-repository pull requests open an exact branch generation on demand. Fork pull requests never
   borrow same-repository branch or preview identity.

## Optional Evidence

- Screenshot of the pull request list with one attributed Worker build and Convex preview.
- Screenshot of exact-branch FileView after reload.
- Screenshot of the explicit stale or unavailable provider state.

## Cleanup

- Restore the provider connection if Step 11 changed it.
- Stop the local dev server (Ctrl+C).
