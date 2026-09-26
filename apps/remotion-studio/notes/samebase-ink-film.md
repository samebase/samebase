# Samebase ink film storyboard

`SamebaseInkFilm`: 1920x1080, 24 fps, 38.5 s. A picture book in watercolor and ink. A small painted
mark wakes up on the page, pretends to be a cube, turns out to be a flat sticker, walks out into a
painted world, and meets a giant that has the same base.

## Music

`public/media/samebase-ink-film.mp3` (not committed) is an ElevenLabs `music_v2_5` composition plan
with five chunks: intro 8 s (pizzicato, celesta, clarinet, brushed drums), build 8 s, comic surprise
and tiptoe walk 6 s, awe 12 s (strings, horns, low brass, timpani), ending 6 s. The measured
structure is the source of truth:

```console
node src/scripts/analyzeMusicBeats.ts public/media/samebase-ink-film.mp3 8,16,22,34
```

- 120.00 BPM. Beats fall on multiples of 0.5 s (12 frames). Bars start on even seconds.
- Quiet plucked intro 0 to 15.5 s. The strongest onset of the track is the comic hit at 15.5 s.
- Bouncy walk 15.5 to 20.5 s. Near silence 20.5 to 23.5 s. The swell starts on 24.0 s.
- The last chord hits on 36.0 s and rings out to about 37.5 s.

## Look

Ink and watercolor on warm cold-press paper, after the approved style frames A and B. Washes are
flat transparent glazes with mottling, darker dried edges, and pigment that settles in the paper
tooth. Ink lines are wobbly, tapered, and slightly bled. Shadow sides get hatching. Hand lettering
in Caveat Brush with per-glyph jitter.

- Paper and tooth stay fixed to the frame. Washes belong to their objects.
- Line boil: every ink line, the lettering, and the character washes are re-seeded 12 times per
  second (every second frame at 24 fps). Background washes hold.
- The giant Menger sponge is ray-marched on the GPU and painted in the same way: warm top and sunlit
  side, slate shadow side with hatching, an indigo glaze in deep channels, ink edges, haze, and mist
  at the base. It is always seen from outside.

## Shots

| Time         | Beat                  | Picture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Words                                                      | Out                                   |
| ------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------- |
| 0 to 4       | Intro bars 1 to 2     | Empty paper, slow push in. On 0.0 the pen lands with an ink splash and draws the whole square in 0.3 s, then the opening. A slate wash blooms out and flicks droplets. On 0.5 the mark blinks, on 1.0 it hops, on 1.5 it looks left and right, on 2.0 it shakes off the wet paint like a puppy, on 2.5 teal floods in, then wide and tall.                                                                                                                                                                                                                                                 | None                                                       | Continuous                            |
| 4 to 8       | Intro bars 3 to 4     | The mark is moulded on each beat, with anticipation and overshoot: a hop and a blink, a gasp (big opening), ochre floods in, wide, tall, a blink, a small hop. On 7.5 it crouches.                                                                                                                                                                                                                                                                                                                                                                                                         | None                                                       | The jump                              |
| 8 to 12      | Build bars 1 to 2     | On 8.0 it jumps and turns in the air, and slate floods over it. It is the front of a cube: the cube turns into the isometric view, with perspective that eases out. Pencil builds the new edges, then washes flood the new faces.                                                                                                                                                                                                                                                                                                                                                          | GitHub. Convex. Cloudflare. (one per bar, beside its face) | Continuous                            |
| 12 to 15.5   | Build bars 3 to 4     | The cube settles with an overshoot. Hatching draws on the shadow face, a pencil circle around it. Slow push in. From 15.0 the right tip of the picture lifts and flutters.                                                                                                                                                                                                                                                                                                                                                                                                                 | (labels stay)                                              | The peel                              |
| 15.5 to 19.5 | Comic hit and walk    | On the hit the whole cube peels off the paper like a sticker, with a camera kick: a white paper back with the paint showing faintly through, a curl highlight at the crease, a soft shadow under the lifted part, and under it only paper and a pencil ghost. It was flat. On 16.0 it snaps back and a cut at 30 degrees opens a fourth side (clay), on 17.0 a fifth (rose), with uneven widths and a crease on each side, like bent paper. On 18.0 the sides fold away like a fan and the clay side turns into the upright mark. On 19.0 it grows two small legs, looks around, and hops. | None                                                       | Zoom out                              |
| 19.5 to 24   | Walk and near silence | The camera pulls out from the page while the mark walks. The world paints itself in, wash by wash: the ridge spreads from under its feet, then the sky, the sun, the far hills, the grass, and a cumulus. In the near silence the mark reaches the crest, stops, blinks, and looks up.                                                                                                                                                                                                                                                                                                     | None                                                       | Clouds part                           |
| 24 to 33     | Swell                 | On 24.0 the cumulus splits in two masses that slide apart, and the mark hops back with a gasp: a huge Menger sponge stands at the edge of the world, top in the clouds, base in mist. Slow pull back while the camera trucks left: hill, mist, far hills, clouds, and giant move at different speeds, and the eye of the sponge camera drifts, so its near edge slides against its far faces. The mark walks down the ridge at its foot, and along its path the giant opens a finer level of channels. On 31.2 the opening rises up the whole giant and a flock lifts off its face.        | Every app on the same base. Samebase too.                  | The camera tilts up, a cloud wipes by |
| 33 to 38.5   | Ending                | Paper again. The mark hops in and lands on 34.0. The line writes itself on the beats, underlined in clay. On 36.0 samebase.com and a last hop. It blinks. Hold.                                                                                                                                                                                                                                                                                                                                                                                                                            | Same base. Your accounts. No magic. samebase.com           | End                                   |

## Rules for this film

- No six-pointed or regular eight-pointed stars. The flat picture has 4 and then 5 sides with uneven
  widths. No diagonal Menger cross-sections. The camera never flies into the sponge.
- No counts that read as app counts, and no dates.
- Only the product lines above.
- Every frame is a pure function of time. Randomness comes from seeded hashes of the boil index (12
  per second).

## How it renders

- `inkScene.ts` paints three Canvas 2D layers per frame in screen space, so line widths stay the
  same at every zoom: `back` (white ground, multiplied washes behind the giant), `front` (washes in
  front of it), and `ink` (ink, pencil, and lettering).
- `inkRenderer.ts` ray-marches the sponge into a G-buffer at twice the frame size (face, depth,
  shade, and how awake the surface is), then composes everything on the paper in one WebGPU pass:
  dried edges, granulation in the tooth, sponge washes and hatching, ink edges from face changes and
  depth jumps, mist, haze, bled ink, and a vignette.
- The sponge rests at three levels. Along the probe path, and later everywhere, the fourth level
  opens. Channels narrower than about 7 px stay closed, so no level reads as noise.
- The sponge camera is a pinhole: the plane through its near vertical edge keeps the axonometric
  layout of style frame B, deeper parts recede, and the eye drifts sideways during the shot. Ink
  edges use the second difference of depth, so flat faces in perspective stay clean.
- Clouds are painted on their own sheet, and their lower edge dries into a soft scalloped wash edge.
- All lettering stays inside a 6 percent title-safe margin.
- A full render takes about 60 s on an Apple silicon Mac (about 0.4 s per frame, 8 tabs).

## Delivery

```console
npx remotion render SamebaseInkFilm out/samebase-ink-film.mp4
ffmpeg -i out/samebase-ink-film.mp4 -c:v libx264 -preset slow -b:v 4300k -pass 1 -an -f mp4 /dev/null
ffmpeg -i out/samebase-ink-film.mp4 -c:v libx264 -preset slow -b:v 4300k -pass 2 \
  -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart out/samebase-ink-film-web.mp4
```

The master (CRF 16) is about 43 MB and the web copy about 22 MB.

## The 4:5 cut

`SamebaseInkFilmPortrait` (1080 x 1350) paints the same frame with a portrait layout for the
lettering (cube labels under the cube, a stacked end card) and shows an 864 px wide window of it,
scaled by 1.25. The window stays centered on the page, follows the walking mark, and holds still
once the words arrive, so the words stay on the open sky while the mark walks toward the giant.

```console
npx remotion render SamebaseInkFilmPortrait out/samebase-ink-film-4x5.mp4
```
