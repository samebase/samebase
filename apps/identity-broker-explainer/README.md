# Identity Broker explainer

The animation at the top of the
[`@samebase/identity-broker` README](../../packages/identity-broker/README.md). It is one diagram
that changes from the first frame to the loop, and its last frame is the first frame, so the GIF has
no cut.

It is written with [fframes](https://github.com/dmtrKovalenko/fframes), not with
[`apps/remotion-studio`](../remotion-studio): `src/lib.rs` returns one SVG for each frame, and the
GPU draws it. The same 801 frames took 2.9 s here and 54.9 s through Remotion at the repository's
settings, on an Apple M4 Max.

## Render

It needs Rust and ffmpeg, and it renders on macOS because `Cargo.toml` selects Metal. The first
build takes about two minutes and later builds take seconds.

```console
cargo run --release -- inspect --pops
cargo run --release -- strip -n 12
cargo run --release -- preview
cargo run --release -- render -o out/identity-broker.mp4
```

`inspect --pops` reports only the sign-in dots, which cross a line in a few frames.

Make the GIF from the master:

```console
ffmpeg -y -i out/identity-broker.mp4 -filter_complex "[0:v]fps=20,scale=800:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" -loop 0 ../../packages/identity-broker/docs/how-it-works.gif
```

A GIF frame lasts a whole number of hundredths of a second, so 20 fps keeps exact timing. Do not
commit the GIF through Git LFS: GitHub and npm load it from `raw.githubusercontent.com`, which would
return the LFS pointer.

Make the thumbnail of the Convex components directory from a frame of the end card:

```console
cargo run --release -- frame 24.5s -o out
ffmpeg -y -i out/24.5s.png -vf scale=1536:864:flags=lanczos ../../packages/identity-broker/docs/directory/thumbnail.png
```

## Where each output goes

- `how-it-works.gif` goes in the README, because GitHub and npm show images in a README and npm does
  not play video.
- `docs/directory/thumbnail.png` goes in the "Component Thumbnail" field of the
  [directory form](https://www.convex.dev/components/submit). That field takes `.webp`, `.png`, or
  `.jpg` up to 3 MB at 1536 x 864, so it cannot show a GIF.
- `out/identity-broker.mp4` is for a video host. The form has a "Video URL" field.

## What the diagram claims

- Google refuses a redirect URI that is not registered exactly, with `redirect_uri_mismatch`, and a
  registered URI cannot hold a wildcard. A client can hold many URIs, so the refused `pr-*` URL is
  not drawn as a client.
- Google sees one client and one URL: the hub's callback. `auth.yourteam.com` stands for that hub.
- Each deployment is an ordinary client of the hub with its own exact redirect URI. It registers at
  deploy time with the hub's deploy key, so this is not a wildcard in another place.

The first is [Google's rule](https://support.google.com/cloud/answer/15549257). The others are how
the [broker](../../packages/identity-broker/docs/consumers.md) works. When any of them changes,
change the captions in `src/lib.rs`.

## Licenses

Inter and JetBrains Mono are under the SIL Open Font License, in `licenses/`. The rest of this
folder is Apache-2.0, in `LICENSE`.
