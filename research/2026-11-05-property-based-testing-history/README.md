# What generated tests would have caught in Samebase's history

2026-11-05. Prompted by the question: "look at the commit history and give concrete examples of how PBT/MBT/oracles would've made a huge impact."

These aren't guesses. Each test below was run against the real code from the commit before the fix, extracted from git. Each one fails there with a small counterexample that fast-check finds and shrinks on its own. Each one passes after the fix. The repo has no fast-check today, and all 442 test files are example-based.

## Headline

**One model-based test of the commit engine, about 160 lines plus a 115-line fake GitHub, was run on nine versions of `main`.** It fails on every version from before March 5 through v2166 (October 26), with one exception that lasted 69 minutes. It finds each shipped data-loss bug in that code with a counterexample of 2 to 4 steps, and it passes on v2167 and on today's `main`.

The full guarantee first existed for **69 minutes**. d6e75127a (Mar 5, 19:03) passes the test. The cleanup d18b1c286 (Mar 5, 20:12) fails it on the simplest story there is. Getting back to the 19:03 behavior took three more fixes and **7.5 months**.

Two of the properties also fail on **today's `main`**:

1. A commit can write a line twice. This happens when a teammate already pushed the same added line.
2. The broker's `/token` treats `redirect_uri=` (sent empty) differently from leaving it out. RFC 6749 §3.2 says they must be the same.

## Results

| Bug (what a user saw) | Lived | Technique | Before the fix | After |
|---|---|---|---|---|
| Commit silently deleted a teammate's pushed lines | before Mar 5 – Oct 26, four fixes | model-based, fake GitHub | fails in 1–6 runs | 2,000 runs pass |
| Deleting a renamed file left the original on GitHub | before Mar 5 – Oct 7 (fixed for 69 min on Mar 5) | same model | fails | passes |
| A phone sidebar let go at twice its minimum width merged into the main pane | May 4 – Jul 4 | property (metamorphic) | fails in ≤12 runs | 10,000 runs pass |
| Edits to Windows-line-ending files could not be saved | Aug 6, 2025 – Oct 26, 2026 | round-trip oracle | fails on run 1–6 | 10,000 runs pass |
| Broker: `max_age=` became `0`, `state=` became `""` | Oct 28 – Oct 30 | spec sentence as property | fails on run 1 | `/authorize` passes |
| **Today:** `/token` breaks the same RFC rule | still on `main` | same property | **fails on run 1** | not fixed yet |
| **Today:** commit merge writes a line twice | still on `main` | oracle: `git merge-file` | **fails in 4 runs** | not fixed yet |

## 1. The commit engine: one model, four fixes

`createCommitWithMultipleFiles` writes the user's staged edits to GitHub. The test (`commitEngine.test.ts`) makes up a random story:

- The user edits, renames and deletes files, starting from the snapshot they loaded.
- Teammates push to GitHub directly, sometimes in the middle of the user's commit.
- The user commits.

Every line is a unique token (`a.B1`, `L3`, `U7`), so checking for lost work is set logic. After any commit that does not report a conflict:

- every line a teammate pushed, and every line the user typed, is on GitHub;
- deleted files are gone;
- renamed files exist only at their new path.

Refusing with a conflict always counts as fine.

The fake GitHub (`fakeGitHub.ts`) keeps real git blob SHAs, because the engine compares them. Like GitHub, it refuses a non-fast-forward `updateRef` with 422. The real engine runs at each commit. A small Node loader stubs out Convex and Octokit; the engine, the merge code and the `diff` library are the real ones.

What fast-check printed, shrunk, for each version of `main`:

| Version | Result | Shrunk counterexample |
|---|---|---|
| before d6e75127a (to Mar 5) | fails | teammate pushes to `a.md` → user edits `a.md` → commit: **the teammate's line is gone**. `updateRef` used `force: true` (3ad878ef7). |
| d6e75127a, Mar 5 19:03 | **passes** | Rebases inside the retry loop. Mid-commit pushes are handled too. |
| d18b1c286, Mar 5 20:12 ("cleanup: simplify…") | fails | The same 3-step story: **the teammate's line is gone**. Also: rename `b.md` → teammate pushes to `b.md` → commit: the line is gone from `b-renamed.md`. |
| 51432b848, Mar 6 | fails | rename `a.md` → delete it → commit: **GitHub still has `a.md`**. With pushes during commits: user edits `a.md` → commit while a teammate pushes → **the teammate's line is gone**. |
| c7a9fd65e, v2108, Oct 7 | fails only with mid-commit pushes | Rename and delete are fixed, and so is deleting a file a teammate changed. A push that lands during the commit still loses the teammate's line. 51432b848 rebased once before the retry loop, then built on whatever head the loop read next. |
| 3e3b443ae, v2167, Oct 26 | **passes** | Rebases against each attempt's parent again. |
| today's `main` (6a3e9e662) | **passes** | Per 2,000 stories: about 1,750 commits go through, about 850 on a stale base, about 430 with a push mid-commit. |

The passes aren't vacuous: those counts come from the passing versions. A version that refused everything would also pass, but the counters would show it.

How fast it gets there: the no-race bugs need 3 steps, and fast-check finds them in 1–6 random stories. The mid-commit bug needs a push to land in the second or so while the commit is talking to GitHub. The generator includes that step, and finds it within 2–36 stories.

Run it: `npm run commit-engine`. Add `RACE=0` to leave out mid-commit pushes, so the other bugs show up.

## 2. Phone sidebar merge threshold (pure function, 61 days)

Introduced in 98ec9a99b (v1217, May 4), fixed in a9d09423a (v1643, Jul 4). The merge decision depended on the width the drag *started* at, so a 240 px sidebar merged when let go at 192 px. 192 px is twice the 96 px minimum.

```ts
// Same release width must give the same decision, wherever the drag started.
fc.property(drag, (d) => merges(d.viewport, d.startA, d.release) === merges(d.viewport, d.startB, d.release))
// A sidebar let go at 2x its minimum never merges.
fc.property(drag, (d) => d.release < 2 * MIN || !merges(d.viewport, d.startA, d.release))
```

Shrunk counterexample: `{ viewport: 372, startA: 240, release: 192 }` merges. That is the exact bug, found with no hints. The functions come from `WorkspaceLayoutV2Geometry.ts` at `a9d09423a^`, with three import lines inlined. A sanity property ("dragging to the edge merges") passes on both versions, so the fixed version isn't passing by doing nothing.

## 3. CRLF files could not be saved (round-trip oracle, 14 months)

Since 549131f17 (Aug 6, 2025), the server built its document with `Text.of(content.split("\n"))`. CodeMirror counts `\r\n` as one line break, so the lengths differ and every save threw. Monaco was fixed in v2107 (3ce02b15d, Oct 7). The server and the prose editor were fixed in v2167 (3e3b443ae, Oct 26).

The oracle is the editor itself: any edit the editor makes must save, and the saved file must reopen showing what the user saw.

Shrunk counterexample: a file containing `"\r\n"`, and the user types one character. The result: `Applying change set to a document with the wrong length`. Today's `applyCollaborativeChanges` passes 10,000 runs, including a check that undoing an edit gives back the exact bytes.

The old server code is reproduced inline (`collaborative.ts` line 219 at `3e3b443ae^`). The default `fc.string()` would not have found this: it generates printable characters only, so the alphabet has to include `\r`.

## 4. RFC 6749 as a property (broker)

RFC 6749 §3.1 and §3.2: *"Parameters sent without a value MUST be treated as if they were omitted from the request."* That sentence is the property:

```ts
fc.property(validRequest, optionalParam, (p, k) => same(handle(withEmpty(p, k)), handle(without(p, k))))
```

- **Before 0.9.0 (bc8a2a9, Oct 30), `/authorize`.** `max_age=` became `0` (`Number("") === 0`), and `state=` and `nonce=` came through as `""`. This failed on run 1. The fix filters empty values in `readParameters`, and `/authorize` passes after it.
- **Today's `main`, `/token`.** This still fails on run 1. `/token` reads its form with `new URLSearchParams(await request.text())` (`packages/identity-broker/src/client/index.ts`), not with `readParameters`. So `redirect_uri=` gets `invalid_request`, while leaving it out succeeds. `readClientAuthentication` already applies the §3.2 rule, but only to `client_secret`. The impact is low, but it's a spec violation on a standards-facing endpoint.

## 5. Today: the commit merge writes a line twice (oracle: git)

`rebaseStagedContent` (`packages/git-editor/src/stagingRebase.ts`) rebases staged edits onto the latest GitHub content. It builds a patch from base to staged, then applies it with fuzz. When the teammate's version already contains the user's added line, the patch adds it again. `git merge-file` recognizes the same change on both sides and writes it once.

```
base      "a\nb\n"
user      "a\nb\nmine\n"
teammate  "top\na\nb\nmine\n"
git       "top\na\nb\nmine\n"
samebase  "top\na\nb\nmine\nmine\n"     <- committed to GitHub without a conflict
```

It shows up within 4 random cases. This happens whenever GitHub already has some of the user's staged insertions. For example, an agent or a teammate added the same line, or an earlier commit landed but its staging rows were not cleared. I have not traced how often that happens in practice.

Two smaller differences from git: lines land in a different order around repeated lines, and in files with mixed `\n` and `\r\n` endings, undo turns one ending into the other. No lines are lost in either case.

## Found in the history, not run here

The research agents reported these from the history. Each would need the convex-test harness or a browser to reproduce, so I have not run them:

- **Cloudflare token refresh** (Jul 20 – Sep 30, four fixes): parallel refreshes without a lease, a per-Worker `Promise.all`, and manual writes that returned expired OAuth tokens. It needs a model with single-use refresh tokens and `fc.scheduler`.
- **Actions-mode New App** (Oct 6 – 7): the quota check counted one connection, but the stack adds three, so real resources were created and never attached.
- **Polar seats** (about 7 hours on Aug 13): a retried "add seat" bought another seat.
- **Branch names with `/`** (Apr 9 – May 5): the Diff and Compare toggles decoded `%2F`, so `codex/foo` opened branch `codex`. A round-trip through the real router catches it.
- **Phone panes**: a merged pane popped back when another tab "repaired" the shared state (79 days), and the pane jumped back on navigation because of router scroll restoration (111 days, PR 1874).
- **Logo URL**: dragging back to the default pose kept old `elev`/`rot` values in the URL (36689c907 → a3147ade1, 15 days). 2222b0f75 later fixed a related bug where the saved view did not reset.

Codex checked every SHA, date and introduced/fixed claim in this report against git. The ones above are confirmed, with this scope: the Cloudflare dedupe in 9b466acd5 worked per action, and only ordinary OAuth credentials came back expired.

## What it costs

- fast-check as a dev dependency.
- The commit-engine model plus the fake GitHub is about 280 lines. It runs about 14,000 stories in under a second.
- The pure-function properties are 2 to 5 lines each.

The main lesson isn't any single property. A model test pins down a guarantee, so a "simplify" commit like d18b1c286 can't remove that guarantee without the test failing.

## Run it

```sh
cd research/2026-11-05-property-based-testing-history
npm install
./extract.sh            # old source trees from git into versions/ and old/ (set IDENTITY_BROKER_REPO if the broker clone is not ../identity-broker)
npm run commit-engine   # RACE=0 npm run commit-engine to leave out mid-commit pushes
npm run merge-threshold
npm run crlf
npm run broker
npm run merge-oracle
```

Nothing in this folder touches the repos. `extract.sh` only uses `git archive` and `git show`.
