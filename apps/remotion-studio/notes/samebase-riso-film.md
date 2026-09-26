# Samebase riso film storyboard

`SamebaseRisoFilm`: 1920x1080, 30 fps, 42 s. A printed zine whose paper folds and unfolds. The film
breaks the viewer's reading of the mark four times, and each break widens the frame.

## Music

`public/media/samebase-riso-film.mp3` (not committed) is an ElevenLabs `music_v2_5` composition plan
with five chunks: intro 8 s, build 8 s, drop 10 s, break 3 s, finale 13 s. The model moved the
break, so the measured structure is the source of truth:

```console
node src/scripts/analyzeMusicBeats.ts public/media/samebase-riso-film.mp3 8,16,28.5,32
```

- 120.00 BPM. Beats fall on multiples of 0.5 s (15 frames). Bars start on even seconds.
- Intro 0 to 8 s, build 8 to 16 s, drop 16 to 28.5 s, near silence 28.5 to 32 s, finale 32 to 40.5
  s, tail to 41.3 s.

## Look

Three ink plates on warm paper: pink `#FF48B0` (15 degree screen), blue `#3255A4` (75 degrees), and
slate `#394447` (45 degrees). Each plate has its own misregistration, which re-jitters 12 times per
second, roller banding, pinholes, and ink density noise. The inks multiply where they overlap. Zine
ephemera: registration marks, crop marks, mono labels, page numbers, and the center fold. Huge type
overprints the image. The printed page is the camera plane, so halftone dots stay on the paper when
the camera moves.

## Shots

| Time       | Beat                  | Picture                                                                                                                                                                                                      | Words                                                  | Out                    |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------- |
| 0 to 4     | Intro bars 1 to 2     | Page 01. The three plates of the slate mark fly in out of register and snap into register on beat 1. Each beat moulds the mark: pink, blue, wide, tall, big opening, small opening, squash.                  | None                                                   | Continuous             |
| 4 to 8     | Intro bars 3 to 4     | SAME and BASE slam in from the frame edges on bar downbeats and overprint the mark. On beat 6.0 dashed cut lines draw the cube net around the mark, with tint flaps and FOLD labels.                         | SAME, BASE                                             | The cut-out lifts      |
| 8 to 12    | Build bars 1 to 2     | The net lifts off the page with a shadow. The object tilts to a three-quarter view. Flaps fold back one per beat, with anticipation and overshoot, until the cube closes.                                    | None                                                   | Continuous             |
| 12 to 16   | Build bars 3 to 4     | Lit 3D cube in perspective. It turns to the isometric corner view. The three visible faces take pink, blue, and slate. The perspective eases out and the cube holds for the last beat.                       | GitHub. Convex. Cloudflare. (one word per beat)        | Continuous             |
| 16 to 22   | Drop bars 1 to 3      | On the drop the light goes away: three flat inks. A cut opens and a fourth side grows (uneven widths). On 18.0 a fifth side. The flat shape turns in 2D, which a cube cannot do. Side counter.               | Delete your Samebase account. Your app doesn't notice. | Continuous             |
| 22 to 28.5 | Drop bars 4 to 6      | The sides breathe on the beat and trade inks. On 26.0 the shape closes back to three sides and reads as a cube again.                                                                                        | (the line stays)                                       | Music stops            |
| 28.5 to 32 | Near silence          | The cube holds. The camera pulls back in the isometric view. A huge structure prints in around the cube, plate by plate. The cube is one corner cell of it.                                                  | None                                                   | Dolly zoom on the hit  |
| 32 to 38   | Finale bars 1 to 3    | On 32.0 a dolly zoom turns the flat isometric view into deep perspective. A huge halftone Menger sponge, seen from outside, only partly in frame, in haze. A probe drifts over it and opens deeper channels. | Every app on the same base. Samebase too.              | Page turn at the spine |
| 38 to 42   | Finale bar 4 and tail | The page turns at the center fold. End card: flat mark, the line word by word on the beats, samebase.com. On 40.5 the plates snap into register for the last print.                                          | Same base. Your accounts. No magic. samebase.com       | End                    |

## Rules for this film

- No six-pointed or regular eight-pointed stars. The reshape uses 4 and 5 sides with uneven widths.
  No diagonal Menger cross-sections.
- The cube net is the 1-4-1 net (a staircase shape), not the cross net.
- No counts that read as app counts, and no date stamps.
- Only the product lines above. Small labels (FIG., FOLD, SIDES) are zine ephemera.
- Every frame is a pure function of time. Randomness comes from seeded hashes of the print index (12
  prints per second).
