# Identity Broker explainer

The animation at the top of the
[`@samebase/identity-broker` README](../../packages/identity-broker/README.md). It is one diagram
that changes from the first frame to the loop, and its last frame is the first frame, so the GIF has
no cut.

It is written with [fframes](https://github.com/dmtrKovalenko/fframes), not with
[`apps/remotion-studio`](../remotion-studio): `src/lib.rs` returns one SVG for each frame, and the
GPU draws it. The same 801 frames of an earlier cut took 2.9 s here and 54.9 s through Remotion at
the repository's settings, on an Apple M4 Max.

## Render

It needs Rust and ffmpeg, and it renders on macOS because `Cargo.toml` selects Metal. The first
build takes about two minutes and later builds take seconds.

```console
cargo run --release -- inspect --pops
cargo run --release -- strip -n 12
cargo run --release -- preview
cargo run --release -- render --scale 2 -o out/identity-broker.mp4
```

`inspect --pops` reports only the sign-in dots, which cross a line in a few frames.

The master is 4K at 60 fps. Make the GIF from it, because a large source gives a smaller GIF:

```console
ffmpeg -y -i out/identity-broker.mp4 -filter_complex "[0:v]fps=20,scale=800:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" -loop 0 ../../packages/identity-broker/docs/how-it-works.gif
```

A GIF frame lasts a whole number of hundredths of a second, so 20 fps keeps exact timing, and the 60
fps master divides evenly into it. The GIF stays 800 px wide because GitHub and npm show it at about
that width, and 1200 px would double its size.

Commit the GIF as a normal Git file, not through Git LFS: GitHub and npm load it from
`raw.githubusercontent.com`, which returns only the LFS pointer for an LFS file. Do not commit the
MP4 files: they render from `src/lib.rs` in seconds.

Make the thumbnail of the Convex components directory from a frame of the end card:

```console
cargo run --release -- frame 26.5s -o out
ffmpeg -y -i out/26.5s.png -vf scale=1536:864:flags=lanczos ../../packages/identity-broker/docs/directory/thumbnail.png
```

## Where each output goes

- `how-it-works.gif` goes in the README, because GitHub and npm show images in a README and npm does
  not play video.
- `docs/directory/thumbnail.png` goes in the "Component Thumbnail" field of the
  [directory form](https://www.convex.dev/components/submit). That field takes `.webp`, `.png`, or
  `.jpg` up to 3 MB at 1536 x 864, so it cannot show a GIF.
- `out/identity-broker.mp4` goes to YouTube, because the "Video URL" field of the form takes a
  YouTube link, and the directory embeds it at the top of the listing.

## What the diagram claims

Google and GitHub make the story concrete, and the end card names no provider, because the broker is
not about one provider.

- Google and GitHub refuse a redirect URI they do not know, with `redirect_uri_mismatch`.
  [Google](https://support.google.com/cloud/answer/15549257) allows no wildcards, but
  [GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
  has optional wildcard matching, on for OAuth apps from before August 2026. So the diagram does not
  say "no wildcards", and its previews are `.convex.site` hosts, which no wildcard on an app's own
  domain can match. Convex Auth receives its callback on that host.
- Each provider sees one client and one URL: the hub's callback. `auth.yourteam.com` stands for the
  hub.
- Each deployment is an ordinary client of the hub with its own exact redirect URI. It registers at
  deploy time with the hub's deploy key, so this is not a wildcard in another place. See the
  [consumer docs](../../packages/identity-broker/docs/consumers.md).
- "Any provider" means any OpenID Connect provider, through an `OidcConnector` object, and any OAuth
  2.0 provider with RFC 8414 metadata, through an `OauthConnector` object.

When any of these changes, change the captions in `src/lib.rs`.

## Licenses

Inter and JetBrains Mono are under the SIL Open Font License, in `licenses/`. The rest of this
folder is Apache-2.0, in `LICENSE`.
