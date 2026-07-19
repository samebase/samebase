# Samebase Remotion Studio

The motion design and video composition workbench for Samebase. It keeps compositions, source-time
edit manifests, and editorial notes beside the product and brand sources they represent. Raw
recordings and rendered output stay local.

Remotion Studio is an internal authoring surface, not a publishing service. Browser capture,
composition, final encoding, R2 upload, and product publication remain explicit stages.

## Open the studio

From the monorepo root:

```console
pnpm --filter @samebase/remotion-studio dev
```

Select a composition, play it, and scrub the timeline. Changes under `apps/remotion-studio/src/`
appear in Studio immediately.

## Compositions

- `RemotionTour` demonstrates Remotion's frame-based editing model.
- `TicTacToeRecording` contains the production edit used by the landing page.

Each production composition owns its component, timing model, and supporting edit data under
`src/compositions/<name>/`. Editorial reasoning lives under `notes/`.

## Capture, compose, and publish

1. Capture real browser footage with `packages/onboarding-video-tools/` when the video needs native
   Chrome, cursor, or macOS presentation.
2. Put local source recordings in `apps/remotion-studio/public/media/`.
3. Record timestamps, pacing decisions, and review notes in `apps/remotion-studio/notes/`.
4. Build and inspect the composition in Remotion Studio.
5. Run the studio checks and render a local master into `apps/remotion-studio/out/`.
6. Create the delivery encode and poster for the target surface.
7. Upload accepted delivery files to the `samebase-public-media` R2 bucket.
8. Record the immutable URL and observed metadata in `apps/samebase/shared/publicMediaManifest.ts`.

Do not put R2 credentials, provider tokens, or other secrets in this app.

## Tic-Tac-Toe landing video

The ignored source recording belongs at:

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
- package and tool configuration

Do not commit:

- raw recordings in `public/media/`
- rendered masters, delivery encodes, posters, or contact sheets in `out/`
- `.env` files or credentials

## Commands

- `pnpm --filter @samebase/remotion-studio dev`: open Remotion Studio.
- `pnpm --filter @samebase/remotion-studio check`: typecheck and lint.
- `pnpm --filter @samebase/remotion-studio render`: render the teaching composition.
- `pnpm --filter @samebase/remotion-studio render:tic-tac-toe`: render the production landing edit.

Review the current [Remotion license terms](https://www.remotion.dev/docs/license/pricing) as the
team grows.
