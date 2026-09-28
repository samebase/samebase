# Samebase film v3 storyboard

`SamebaseFilmV3`: 1920x1080, 30 fps, 42 s. The object is a solid Menger cube from the first frame.
Only the view changes: a drag orbit as on the landing hero, a hover that opens deeper channels, a
fourth direction, and a pull back to a huge sponge. The earlier drafts built the cube from paper and
warped a flat image. This film never does either.

## Why this order

An illusion needs a firm belief first. Frame 0 reads as the flat mark, because the solid is seen
head on with an orthographic camera. The drag then proves that it is a solid: real perspective, a
soft shadow on the floor, occlusion and self shadow inside the tunnels, and deeper channels that
open under the cursor. Only after that belief does the fourth direction break it.

## Look

- The object uses the landing hero tones per face direction: the mark face `#394447`, the side faces
  `#00B8DB`, and the top faces `#FFFFFF`. A camera-fixed key light from the upper left adds real
  shading, a soft shadow, and ambient occlusion on top of these tones. A face that looks at the
  camera gets exactly its tone, so frame 0 is exactly the `#394447` mark.
- The fields are riso inks: pink `#FF48B0` and blue `#3255A4`. The object stands on an invisible
  floor that receives its shadow, so the shadow falls across the type on the field.
- Type is Inter Tight 800, large and flat, in a deep navy `#171B4F` on pink and white on blue, so
  every word stays readable at phone size. Only the approved lines appear. Each word rises into
  place from its baseline.
- A light grain covers the frame. It never replaces the 3D shading.

## Music and sound

`public/media/samebase-film-v3.mp3` (not committed) is an ElevenLabs `music_v2_5` composition plan
from `src/scripts/generateFilmV3Audio.ts`: hook, hover, held breath, lift, scale, and resolve at 120
BPM. The model moved the sections, so the measured track is the source of truth:

- The groove plays from 0 to 14 s. It falls away from 14 s and is near silent from 15 to 17.2 s.
- The lift lands at 17.52 s, with the strongest onset of the track.
- The music is full until 38 s and rings out to silence at 41.5 s.

The sound effects (`samebase-film-v3-drag`, `-reveal`, `-lift`, `-close`) come from the same script.
`SamebaseFilmV3.tsx` places each one so that its peak lands on its picture hit.

## Shots

| Time         | Picture                                                                                                                                                                                                          | Words                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 0 to 2       | Pink field. SAME and BASE fill the frame in blue. The mark sits in front of them, head on and orthographic. A cursor enters and presses on the downbeat at 2.0.                                                  | SAME, BASE                                       |
| 2 to 9.5     | Three drags. The camera orbits with a dolly into real perspective. Light, shadow, and occlusion were always there. The words slide off in parallax.                                                              | None                                             |
| 9.5 to 12.5  | Hover: the cursor draws a slow figure eight over the faces. Deeper channels open under it and close behind it, as on the landing hero.                                                                           | None                                             |
| 12.5 to 14.5 | The cursor leaves. The camera eases to the exact isometric view and back to orthographic.                                                                                                                        | None                                             |
| 14.5 to 17.5 | Stillness in the near silence. One word per beat under the cube.                                                                                                                                                 | GitHub. Convex. Cloudflare.                      |
| 17.5 to 21   | The fourth direction on the lift: four faces (below). They open, hold with a slow turn in the picture plane, and close back into the cube at 21.0 on the close sound.                                            | Delete your Samebase account.                    |
| 21 to 25.5   | The camera keeps orbiting as if nothing happened. From 24.6 s a cell slides into the left face opening.                                                                                                          | Your app doesn't notice.                         |
| 25.5 to 32.5 | Match cut in the middle of the move: the cube is the corner cell of a depth 5 Menger sponge whose cube-size cells make the same move. The camera pulls back to a wide low view outside the sponge, in blue haze. | Every app on the same base. Samebase too.        |
| 32.5 to 42   | End card: the solid turns in and settles head on as the flat mark when samebase.com lands at 36.75. The music rings out.                                                                                         | Same base. Your accounts. No magic. samebase.com |

## Fourth direction: the two prototypes

`FilmV3Beat-fan` and `FilmV3Beat-tesseract` replay the film from 13 s to 23 s with each option.

- A, four faces (in the film, v3.1): during the beat only the faces exist. The orthographic
  isometric frame is split along the three lines from the center into the top, left, and right
  regions, each with the depth seen through its opening. Each face is an affine map of its region,
  so edges stay straight and openings stay one third. A copy of the right face in a new blue lies
  exactly under the right face and slides out from under it. The visible faces always tile the full
  turn: every direction from the center belongs to exactly one face, and neighbors share their rays.
  The new face keeps at least 120 degrees until it is almost uncovered, so it never shows as a
  needle, and the right face edge always ends where the new face outline ends, so the outline has no
  notch and no stray point. A thin soft shadow marks the right face edge on the new face. The end
  state is four equal 90 degree faces: a diamond of four marks around one corner. An uneven end
  state (90, 75, 135, 60) read as a bent corner with a long spike and was less clear. At rest the
  faces equal the 3D frame, so the swaps in and out have no cut. The floor shadow of the cube fades
  while the faces are open.
- A, card fan (v3, replaced): rigid rotated cards that overlapped each other and left small points
  around the outline.
- B, real fourth axis: the level 1 Menger cube is the frame of cubes with one-third beams around its
  edges. The tesseract frame with the same beams collapses to exactly this cube when its fourth
  extent is zero. The clip grows a shell along w, projects from 4D with perspective, turns it 180
  degrees in the xw plane until it is inside out, and collapses it back.

A is in the film. With one-third beams, each tesseract cell is nearly solid, so the outer cell hides
the inner cube and the frustum cells from most views, and mid-turn the solid reads as a bent box.

## The shuffle (v3.3)

The landing shuffle moves a cell along a face axis into the free slot next to it, in 1.8 s with a
cubic ease in and out, with 0.52 s between parallel moves, and every cell repeats the same move
inside itself at the same time. `checkShufflePlan` fails closed at load if a move leaves an empty
slot, enters a filled slot, shares a slot with a move in flight, runs with more than three moves in
flight, or if the plan does not end in the Menger layout.

- Orbit (6.35 to 14.4 s): after the second drag the cursor hovers and the landing reveal opens
  channels near it; at the end of the hover the reveal covers the whole cube, three levels deep.
  From 8.45 s the shuffled sponge draws the cube. Three edge cells slide into the openings of the
  front, left, and top faces, one stagger apart, and slide back, at all three levels at once. At
  13.2 s the landing sponge takes over again, every channel closes, and the camera settles to the
  exact isometric view, so the four faces start from the v3.1 frame.
- Scale (24.5 to 32.5 s): the cube slides a cell into its left face opening. The cut to the giant
  comes at 25.5 s in the middle of that move, with the same camera, so the eye follows the moving
  cell across the cut. On the giant only the cells of the cube size shuffle, and the move returns by
  28.4 s, so the outline stays whole. The camera then pulls back from a three quarter view with lit
  faces, as in v3.1.

The shuffled sponge (mode 2) follows the one cell that holds the point, and it also descends into
the nearest cell when a march comes within two hit thresholds of its face, so the openings in that
cell are found before the march stops. Normals and occlusion read only the cells around the point.
The film and the 4:5 cut render with `--concurrency=4 --timeout=180000`: with 12 tabs the giant
frames exceed the GPU time limit and the device is lost.

## Rules

- No six-pointed stars, no regular eight-pointed stars, no diagonal Menger cross-sections, no flight
  through tunnels, no numbers that read as an app count, and no dates.
- Every frame is a pure function of time.

## Cuts

- `SamebaseFilmV3`: the 16:9 film.
- `SamebaseFilmV3Portrait`: a 1080x1350 feed cut. The type is authored per format in `readTexts`,
  long lines break in two, and the end card puts the mark above the words.
- `FilmV3Beat-fan` and `FilmV3Beat-tesseract`: the two 10 s beat prototypes.

The floor shadow fades out below 9 degrees of camera elevation: the floor has the field color, so
near a level camera its shadow collapses into a thin line with nothing under it. The giant shot
starts with every level open near the corner cell, so the match cut shows the cube as one mark among
identical marks, and the woken region then grows across the surface.

## Delivery

The master (CRF 16) is about 130 MB because of the grain. The grain changes every second frame. The
web copy is a two-pass encode with grain tuning at 4300 kbit/s, for about 23.5 MB:

```console
pnpm exec remotion render SamebaseFilmV3 out/samebase-film-v3.mp4
ffmpeg -i out/samebase-film-v3.mp4 -c:v libx264 -preset slower -tune grain -b:v 4300k -pass 1 -an -f mp4 /dev/null
ffmpeg -i out/samebase-film-v3.mp4 -c:v libx264 -preset slower -tune grain -b:v 4300k -pass 2 \
  -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart out/samebase-film-v3-web.mp4
```

The tesseract clip renders with `--concurrency=3 --timeout=180000`: its 32 beams cost about 1.5 s
per frame, and 12 parallel tabs exceed the default frame timeout.
