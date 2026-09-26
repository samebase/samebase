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

| Time         | Beat                  | Picture                                                                                                                                                                                                                                                                                              | Words                                            | Out              |
| ------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------- |
| 0 to 4       | Intro bars 1 to 2     | Empty paper, slow push in. A pen draws the square on the beats, then the opening. On 2.0 a slate wash blooms out from the center. On 3.5 the mark shivers awake.                                                                                                                                     | None                                             | Continuous       |
| 4 to 8       | Intro bars 3 to 4     | The mark is moulded on each beat, with anticipation and overshoot: a hop, a new wash floods in (teal, then ochre), wide, tall, a big opening, a small opening. On 7.5 it crouches.                                                                                                                   | None                                             | The jump         |
| 8 to 12      | Build bars 1 to 2     | On 8.0 it jumps and turns in the air. It is the front of a cube: the cube turns into the isometric view, with perspective that eases out. Pencil builds the new edges, then washes flood the new faces.                                                                                              | GitHub. Convex. Cloudflare. (one per bar)        | Continuous       |
| 12 to 15.5   | Build bars 3 to 4     | The cube settles with an overshoot. Hatching draws on the shadow face, a pencil circle around it. Slow push in. On 15.0 the near corner of the right face lifts a little.                                                                                                                            | (labels stay)                                    | The peel         |
| 15.5 to 19.5 | Comic hit and walk    | On the hit the right face peels off like a sticker: bare paper under it. It was flat. On 16.0 the sticker flips back and the picture gets a fourth side, on 17.0 a fifth (uneven widths, like bent paper). On 18.0 the sides fold up like a fan into one clay mark. On 19.0 it grows two small legs. | None                                             | Hop right, pan   |
| 19.5 to 24   | Walk and near silence | The camera pans right with the walking mark. The world paints itself in, wash by wash: sky, sun, far hills, a grass ridge. In the near silence the mark reaches the crest, stops, and looks up at a cloud bank.                                                                                      | None                                             | Clouds part      |
| 24 to 33     | Swell                 | On 24.0 the clouds part: a huge Menger sponge stands at the edge of the world, top in the clouds, base in mist. Slow pull back. The mark walks along the ridge at its foot, and near it the surface opens deeper channels that spread up the giant.                                                  | Every app on the same base. Samebase too.        | A cloud wipes by |
| 33 to 38.5   | Ending                | Paper again. The mark hops in. The line writes itself on the beats, underlined. On 36.0 samebase.com and a last hop. Hold.                                                                                                                                                                           | Same base. Your accounts. No magic. samebase.com | End              |

## Rules for this film

- No six-pointed or regular eight-pointed stars. The flat picture has 4 and then 5 sides with uneven
  widths. No diagonal Menger cross-sections. The camera never flies into the sponge.
- No counts that read as app counts, and no dates.
- Only the product lines above.
- Every frame is a pure function of time. Randomness comes from seeded hashes of the boil index (12
  per second).
