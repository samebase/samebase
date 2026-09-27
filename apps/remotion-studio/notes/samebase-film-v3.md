# Samebase film v3 storyboard

`SamebaseFilmV3`: 1920x1080, 30 fps, 42 s. The object is a solid Menger cube from the first frame.
Only the view changes: a drag orbit as on the landing hero, a hover that opens deeper channels, a
turn into a fourth direction, and a pull back to a huge sponge. The earlier drafts built the cube
from paper and warped a flat image. This film never does either.

## Why this order

An illusion needs a firm belief first. Frame 0 reads as the flat mark, because the solid is seen
head on with an orthographic camera. The drag then proves that it is a solid: real perspective, a
soft shadow on the floor, occlusion and self shadow inside the tunnels, and deeper channels that
open under the cursor. Only after that belief does the fourth direction break it.

## Look

- The object uses the landing hero colors per face direction: the mark face `#394447`, the side
  faces `#00B8DB`, and the top faces `#FFFFFF`. A camera-fixed key light from the upper left adds
  real shading, a soft shadow, and ambient occlusion on top of these tones. At frame 0 the front
  face is exactly `#394447`.
- The fields are vivid riso inks: pink `#FF48B0` and blue `#3255A4`. The object stands on an
  invisible floor that receives its shadow, so the shadow falls across the printed type.
- Type is Inter Tight 800, large and flat. Only the approved lines appear.
- A light film grain covers the frame. It never replaces the 3D shading.

## Shots

| Time       | Music       | Picture                                                                                                                                                                      | Words                                                  |
| ---------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 0 to 2     | Hook        | Pink field. SAME and BASE fill the frame in blue. The mark sits in front of them, head on and orthographic. A cursor enters and presses on the downbeat at 2.0.              | SAME, BASE                                             |
| 2 to 9     | Hook        | The cursor drags. The camera orbits with a dolly into real perspective. Light, shadow, and occlusion appear because they were always there. The words slide off in parallax. | None                                                   |
| 9 to 12.5  | Hover       | The cursor glides over the faces. Deeper channels open under it and close behind it, as on the landing hero.                                                                 | None                                                   |
| 12.5 to 14 | Held breath | The cursor leaves. The camera eases to the exact isometric view and back to orthographic. One word per beat beside its face.                                                 | GitHub. Convex. Cloudflare.                            |
| 14 to 16   | Held breath | Stillness. Nothing moves.                                                                                                                                                    | (the words hold)                                       |
| 16 to 24   | Lift        | The fourth direction (see the beat prototypes). It opens on the downbeat at 16.0, holds, and closes. The camera then keeps orbiting as if nothing happened.                  | Delete your Samebase account. Your app doesn't notice. |
| 24 to 32   | Scale       | Match cut on the downbeat: the cube is the corner cell of a huge Menger sponge. The camera pulls back and drifts outside it, in haze. The cursor wakes its surface.          | Every app on the same base. Samebase too.              |
| 32 to 42   | Resolve     | End card on a blue field: the mark, the line word by word, then samebase.com. The last hit rings out.                                                                        | Same base. Your accounts. No magic. samebase.com       |

## Fourth direction: two prototypes

- A, card fan: the isometric frame is three rigid rhombi. A fourth rhombus slides out from behind
  one face, and the four faces fan from 120 degree spacing to 90 degree spacing, like a hand of
  cards. Each card is a rigid rotation of its rendered face, so the opening stays at one third and
  no texture stretches.
- B, real fourth axis: the level 1 Menger cube is the three-dimensional frame of cubes with
  one-third beams. The tesseract frame with the same beams collapses to exactly this cube when its
  fourth extent is zero. The film grows the fourth extent, projects from 4D with perspective, turns
  the tesseract in the xw plane until it is inside out, and collapses it back.

## Rules

- No six-pointed stars, no regular eight-pointed stars, no diagonal Menger cross-sections, no flight
  through tunnels, no numbers that read as an app count, and no dates.
- Every frame is a pure function of time.
