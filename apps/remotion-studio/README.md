# Samebase Remotion Studio

The motion design and video composition workbench for Samebase. It keeps compositions, source-time
edit manifests, editorial notes, and Git LFS source recordings beside the product and brand sources
they represent. Rendered output stays local.

Remotion Studio is an internal authoring surface, not a publishing service. Browser capture,
composition, final encoding, delivery upload, and product publication remain explicit stages.

## Open the studio

From the monorepo root:

```console
pnpm --filter @samebase/remotion-studio dev
```

Select a composition, play it, and scrub the timeline. Changes under `apps/remotion-studio/src/`
appear in Studio immediately.

## Compositions

- `LogoHype` explains the flat-to-isometric identity sequence, production shuffle, recursive depth,
  and Menger exploration using the shared Samebase logo model.
- `FounderDemo` contains the 1920×1240 founder introduction and product walkthrough preview.
- `FounderDemoYouTube` renders the same edit at the original 3840×2480 screen resolution.
- `TicTacToeRecording` contains the production edit used by the landing page.

Each production composition owns its component, timing model, and supporting edit data under
`src/compositions/<name>/`. Editorial reasoning lives under `notes/`.

## Capture, compose, and publish

1. Capture real browser footage with `packages/onboarding-video-tools/` when the video needs native
   Chrome, cursor, or macOS presentation.
2. Put source recordings in `apps/remotion-studio/public/media/`. MP4 files in this directory use
   Git LFS.
3. Record timestamps, pacing decisions, and review notes in `apps/remotion-studio/notes/`.
4. Build and inspect the composition in Remotion Studio.
5. Run `pnpm check:remotion-studio` and render a local master into `apps/remotion-studio/out/`.
6. Create the delivery encode and poster for the target surface.
7. Publish the accepted delivery file to its target platform.
8. When the Samebase app serves the video directly, record its immutable URL and observed metadata
   in `apps/samebase/shared/publicMediaManifest.ts`.

Do not put provider tokens or other secrets in this app.

## Founder demo

The founder demo uses these tracked inputs:

```text
apps/remotion-studio/public/media/founder-demo-screen.mp4
apps/remotion-studio/public/media/founder-demo-face.mp4
apps/remotion-studio/public/media/founder-demo-screen-24x.mp4
apps/remotion-studio/public/media/founder-demo.srt
```

Git keeps these MP4 files as pointers during normal clone and pull operations, so CI does not
download the recordings. Fetch them when Remotion needs the source files:

```console
git lfs pull --include="apps/remotion-studio/public/media" --exclude=""
```

Render the local master with:

```console
pnpm --filter @samebase/remotion-studio render:founder-demo
```

Render the original-resolution YouTube master with:

```console
pnpm --filter @samebase/remotion-studio render:founder-demo-youtube
```

## Tic-Tac-Toe landing video

The source recording belongs at:

```text
apps/remotion-studio/public/media/tic-tac-toe-4x4x4.mp4
```

The edit manifest is `src/compositions/tic-tac-toe/ticTacToeEdit.ts`, and its editorial reasoning is
in `notes/tic-tac-toe-edit.md`.

Render the local master with:

```console
pnpm --filter @samebase/remotion-studio render:tic-tac-toe
```

The published `landing/tic-tac-toe-codex-v1.mp4` asset retains its original source provenance from
the archived `samebase/remotion-video-workbench` commit that produced it. Future published videos
should identify the exact Samebase monorepo commit and Remotion composition ID that produced them.

## Repository boundaries

Commit:

- Remotion and React source files
- source-time edit manifests
- editorial notes and production decisions
- source recordings and render proxies under `public/media/` through Git LFS
- subtitle files under `public/media/`
- package and tool configuration

Do not commit:

- rendered masters, delivery encodes, posters, or contact sheets in `out/`
- `.env` files or credentials

## Commands

- `pnpm --filter @samebase/remotion-studio dev`: open Remotion Studio.
- `pnpm check:remotion-studio`: typecheck and lint from the repository root.
- `pnpm --filter @samebase/remotion-studio render:founder-demo`: render the founder demo.
- `pnpm --filter @samebase/remotion-studio render:founder-demo-youtube`: render the founder demo at
  the original 3840×2480 resolution.
- `pnpm --filter @samebase/remotion-studio render:logo-hype`: render the logo identity exploration.
- `pnpm --filter @samebase/remotion-studio render:tic-tac-toe`: render the production landing edit.

Review the current [Remotion license terms](https://www.remotion.dev/docs/license/pricing) as the
team grows.
