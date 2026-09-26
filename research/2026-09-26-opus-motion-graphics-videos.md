# Opus 5.5 motion graphics videos, 2026-09-26

## Result

The viral "Opus 5.5 made this" videos are code, not generated pixels. Claude writes every scene as
HTML, Canvas, SVG, or React. A headless browser paints each frame at an exact time, and ffmpeg joins
the frames with the audio track. The render tools are Remotion, HyperFrames, or a small custom
Puppeteer script.

Everyone has the same model. The quality difference comes from five inputs:

1. A named visual reference. Without one, the model falls back to centered text, a gradient
   background, and fade-ins.
2. Real brand and product assets: logo, fonts, colors, and real product screens.
3. A fixed timing spine: the music beat grid or the voiceover. Cuts and hits land on beats.
4. A camera move and a texture layer on every shot.
5. A render, look, fix loop. The agent renders contact sheets of its own frames, reads them, and
   fixes what looks wrong.

"One prompt" is a marketing claim. The strongest examples used a 5-minute voice prompt and a 12-hour
agent run, two full generations, or "a few rounds of tweaking".

Samebase already has the two engines it needs: Remotion 4 in `apps/remotion-studio` for the timeline
and render, and the TypeGPU ray-marched Menger sponge from the landing hero for the fractal. The
recommended concept breaks the viewer's reading of the mark four times: flat logo, then 3D cube,
then an impossible flat reshape, then one small piece of a huge Menger sponge. The video needs one
account (ElevenLabs Starter), a short script, and the same verification loop.

## Videos examined

| Post                                                                                | What it is                               | Look                                                                                                                   | How it was made                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [NotinReality](https://x.com/other__reality/status/2102514581684052169), 2.3M views | 156 s music video over an existing song  | Painted watercolor, Clawd mascot, stage sets, karaoke bar, paper grain                                                 | p5.js and p5.brush in one page, Puppeteer paints frames, ffmpeg encodes. Two generations. Source: [JohnHeibel/PDoomVideo](https://github.com/JohnHeibel/PDoomVideo).                                    |
| [donald](https://x.com/donaldjewkes/status/2102801274173587569), 2M views           | Remake of the same song                  | K-pop anime, risograph halftone, date stamps, subtitles                                                                | [Full prompt](https://x.com/donaldjewkes/status/2102801469976248500): Seedance 2.5 character and set shots through fal, ElevenLabs sound design, then JavaScript animation drawn over the hidden shots. |
| [mexicat](https://x.com/_mexicat/status/2103108369569726802), 272K views            | Same song, "a different style direction" | Kinetic editorial type, black with one orange accent, mono plus grotesk plus italic serif, HUD grids, one 3D paperclip | "After a few rounds of tweaking."                                                                                                                                                                       |
| [Kit Langton](https://x.com/kitlangton/status/2103884479710523586), opencode 2      | 47 s product launch                      | Dark terminal, mono captions with a block cursor, orange keywords, product UI rebuilt in code, stats card, logo card   | "One-shot."                                                                                                                                                                                             |
| [Worker Previews](https://x.com/yomnashousha/status/2102392544718196868)            | 49 s developer tool launch               | Cream background, terminal and browser windows, pill captions, provisioning diagram, orange accent                     | Not stated.                                                                                                                                                                                             |
| [Shotbase](https://x.com/Miguel07Code/status/2102441708395041170)                   | 58 s product launch                      | Apple style: keycap, frosted glass, UI zooms, real screenshots                                                         | Opus 5.5 with HyperFrames, "less than 20 mins".                                                                                                                                                         |
| [Rexan Wong](https://x.com/rexan_wong/status/2103707054108299437), 198K views       | Workflow thread                          | Not applicable                                                                                                         | Reference from whatships.com, Remotion or HyperFrames, 21st.dev components, brand and screenshots, three storyboard variants, one still per scene, then director notes.                                 |
| [Claude Opus 5.5 launch](https://x.com/claudeai/status/2102435511222890900)         | 20 s brand film                          | Macro footage, serif type                                                                                              | Filmed and composited. It is a common style reference, not an example of the code method.                                                                                                               |

Wider sample: [opusvideo/awesome-claude-video](https://github.com/opusvideo/awesome-claude-video)
lists about 40 Opus 5.5 videos with prompts, and [whatships.com](https://whatships.com) lists launch
videos and [video tools](https://whatships.com/tools/). X search needs a signed-in session, so these
two lists replaced a live X search.

## How the pipeline works

The public PDoomVideo repository shows the full method. Its
[ANIMATION_GUIDE.md](https://github.com/JohnHeibel/PDoomVideo/blob/main/ANIMATION_GUIDE.md) and
[render.mjs](https://github.com/JohnHeibel/PDoomVideo/blob/main/render.mjs) are the most useful
files.

1. **Time is the only input.** Each shot is a function of song time that paints the whole frame. No
   `Math.random()` and no state between frames. A seeded hash gives stable randomness. Frames can
   render in parallel and out of order, and a one-line change re-renders only that shot.
2. **Headless browser renderer.** Chrome paints a 1920x1080 page at 24 or 30 fps. ffmpeg encodes the
   frames with the audio (`libx264`, `crf 17`, `yuv420p`, `+faststart`).
3. **Audio first.** The track sets the beat grid (88 BPM, beat 0.682 s in PDoom). Hits and cuts land
   on beat times. Lyric or voiceover timings drive the text.
4. **Contact sheet loop.** A `--sheet=t1,t2,...` command renders several times into one image. The
   agent opens it and checks the first and last frame of each shot, motion in 0.1 s steps around
   each hit, the transitions, and the caption safe zone. Full-size stills check detail.
5. **Parallel chapters.** The lead agent writes `STORYBOARD.md` (time, lyric, shot, transition out)
   and `ANIMATION_GUIDE.md` (drawing API, style rules, safe zones, performance budget). Subagents
   each own one chapter file and edit only that file.

## Rules that separate good from average

- Name a reference video. Naming a style works better than describing one.
- One idea per shot. Shots last 1.4 to 4 s and something happens in every shot.
- Move the camera in every shot: push, pan, whip, tilt, or a shake on the beat.
- Motivate transitions: the action carries the cut (zoom into an element, a shape becomes the next
  scene).
- Change states with anticipation and overshoot. Never snap.
- Add texture over everything: paper grain, halftone, vignette, glow, or 12 fps line "boil". Clean
  vectors without texture read as template output.
- Use text as the attention carrier. Big kinetic words at the hook, subtitle size elsewhere. Keep
  the background quiet behind big text.
- Keep a tight palette: one base and one accent, with a palette arc across chapters.
- Show real product UI. Invented boxes and fake buttons make the whole video read as cheap.
- After the first render, give notes in camera words: "slow every zoom to 0.7x", "hard cut here",
  "push in on the button". Vague notes produce random changes.

## Fit for Samebase

The current identity is the Menger sponge. The `LogoHype` composition and the voxel shuffle
vocabulary in `apps/remotion-studio/notes/logo-motion-directions.md` show the previous logo. Do not
use them for a new video.

Assets that already exist:

- The compact mark is a dark `#394447` square with a centered opening of one third
  ([compactIdentitySvgAsset.ts](../apps/samebase/src/components/compactIdentitySvgAsset.ts)). That
  is the face of a Menger sponge at depth 1, so a dive can start from the exact logo.
- The landing hero draws the Menger sponge with a TypeGPU ray marcher
  ([MengerTypeGpuScene.tsx](../apps/samebase/src/components/logo/MengerTypeGpuScene.tsx),
  [research](2026-09-02-typegpu-redraw-menger.md)). It draws one full-screen triangle and computes
  the sponge per pixel from a distance function. Depth 8 describes 25,600,000,000 cells with no
  extra geometry.
- `apps/remotion-studio`: Remotion 4.0.489 and the render scripts
  ([README](../apps/remotion-studio/README.md)).
- The dogfooding claim, as the landing FAQ states it: Samebase runs on the same base that it gives
  users. The public template [samebase/base](https://github.com/samebase/base) is published from the
  Samebase monorepo as the base improves. New apps get the current versions. Existing apps do not
  change unless their owners update them.

Render check, 2026-09-26: headless Chrome on this Mac returns a hardware WebGPU adapter (`apple`,
`metal-3`) with `--enable-unsafe-webgpu --use-angle=metal`, and a software adapter (`swiftshader`)
with the flags in `apps/samebase/playwright.webgpu.config.ts`. The video can render on the real GPU.
Remotion with TypeGPU is not yet tested.

Tool decisions:

- **Remotion for the timeline, TypeGPU for the fractal.** Each Remotion frame passes its time to the
  shader as a uniform and waits for the GPU work before the frame capture. HyperFrames would add a
  second render stack for no gain.
- **No `shaders` package from [shaders.com](https://shaders.com/presets).** Its presets are a good
  look reference, and it runs on TypeGPU 0.12. But its license allows only personal, non-commercial
  use for free; a public promo video needs Pro ($199 a year) or Lifetime ($399). It has no Menger
  fractal, so the core of the video is our own shader anyway. The post effects that the video needs
  (film grain, halation, chromatic aberration, dither) are small TypeGPU passes.
- **ElevenLabs for music.** Eleven Music sets the exact track length, takes a composition plan with
  named sections and durations, returns stems, and allows commercial use on all paid plans. Starter
  ($6 a month, 30,000 credits, about 900 credits per generated minute) is enough for many takes of a
  one-minute track. The API key goes in `apps/remotion-studio/.env.local`, which `.env*` in
  `apps/remotion-studio/.gitignore` keeps out of Git.
- **No fal, Seedance, or 21st.dev.** The video has no characters and no product UI.
- **Missing piece: a contact sheet command.** Remotion Studio previews one frame at a time. The
  agent needs one command that renders a list of times into one image, as PDoomVideo does.

## Operator ideas

The operator shared these ideas from the logo work on 2026-09-26. They are inputs, not decisions:

- **A simple shape that can be moulded.** The mark is a square with an opening. It can change color,
  proportion, and shape.
- **Another angle shows 3D.** The first logo looked like the mark from the front and showed a
  checker pattern in isometric view. It was not used because it was hard to show in 3D and looked
  bad when small.
- **A flat reshape.** Give each isometric side its own color, treat the image as flat, cut it, and
  add a fourth direction. This should read as an optical illusion that breaks the viewer's
  expectation. See the [mark reshape](2026-09-26-mark-reshape.md).
- **The fractal as a presence, not a tunnel.** Most fractal videos fly through tunnels. The Menger
  sponge can be a huge thing at the edge of the frame, seen from outside, where only a part of it
  fills a large part of the screen.
- **The mental model.** The fractal holds all of your projects inside one bigger project, so that
  you can manage them in one place.

## Recommended concept: four broken assumptions

The film makes the viewer settle on a reading of the mark, then breaks it, four times. Each break
widens the frame.

1. **"It is a flat logo."** The mark on an empty field. It is moulded on the beat: color,
   proportion, a small squash.
2. **"No, it is a cube."** The camera turns, and the mark is the front face of a lit 3D cube with
   real perspective.
3. **"No, it is flat."** The camera settles at the isometric angle. The sides become flat colors, a
   cut opens, and a fourth side grows. A cube cannot do this.
4. **"No, it is tiny."** The camera pulls back. The reshaped mark is one small piece on the surface
   of a huge Menger sponge, of which only an edge fits in the frame. Every piece has the same base,
   and all of them are part of one structure.
5. **Resolve.** Back to the flat mark, the wordmark, the tagline, and the agent prompt.

The mark stays the main character. The fractal appears only in the last break, as scale. The music
follows the breaks: the meter changes from 3/4 to 4/4 at the cut, and a near silence comes before
the scale reveal.

### Draft script

Each break carries one product claim. Every line comes from the landing page, the FAQ, or
`llms.txt`, so the receipts already cover it.

| Break           | Picture                                                                                                            | Words                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1. Flat logo    | The mark changes color and proportion on the beat.                                                                 | None.                                                                                          |
| 2. Cube         | The mark is the face of a cube. Its three visible sides are GitHub, Convex, and Cloudflare, each in its own color. | "GitHub. Convex. Cloudflare." Then "We set them up. You own them."                             |
| 3. Flat reshape | The box turns out to be a flat image. The provider colors merge into the mark, and the sides multiply.             | "It looks like a box. It isn't." Then "Delete your Samebase account. Your app doesn't notice." |
| 4. Scale        | The pull-back shows one small piece of a huge Menger sponge, seen from outside.                                    | "Every app on the same base. Samebase too." Then "One place to see, check, and fix them."      |
| 5. End          | The flat mark and the wordmark.                                                                                    | "Same base. Your accounts. No magic." Then samebase.com and the agent prompt.                  |

Sources: "Apps created through Samebase live in the user's own GitHub, Convex, and Cloudflare
accounts" and "Samebase runs on the same base it gives users" (`llms.txt`); "Delete your Samebase
account. Your app doesn't notice.", the FAQ answer "one place to see them, check their setup, and
fix problems", and "Same base. Your accounts. No magic." (landing page). The break 3 picture carries
the anti-lock-in claim: the box that seemed to hold the app was never there.

Scale cues for a huge object seen from outside: slow movement, haze that grows with distance, detail
at many scales at the same time, and a small object in the foreground for comparison. The current
mark at normal size, in front of the giant sponge, can be that small object. The sponge can seem
alive: the landing hero already opens holes locally near the pointer, and the film can let such
openings move slowly across the giant surface.

The earlier fractal dive proposal is replaced. Two parts of it remain useful. The rendering method
works for the outside view too. And the music can still use self-similar ideas.

Draft words stay open. Any line about the base must stay accurate: new apps get the current base,
and existing apps update only when their owners choose.

## Production status

1. **Render test: done** on branch
   [claude/menger-dive-spike](https://github.com/samebase/samebase/tree/claude/menger-dive-spike).
   - Remotion renders the TypeGPU Menger sponge on the Metal GPU at about 170 ms per 1920x1080 frame
     with 4x4 antialiasing.
   - The same frame renders to identical bytes twice.
   - A 3x zoom loop has no visible seam.
   - Remotion already enables WebGPU, and `gl: "angle"` selects the Metal adapter.
   - TypeGPU runs through the `unplugin-typegpu` webpack plug-in. It is imported as the named
     `webpackPlugin` export in `overrideWebpackConfig`.
   - A contact sheet command renders a list of times into one image.
2. **Look tests: done** on the same branch. `MarkIllusionTest` renders the flat mark, a lit cube, an
   isometric hold, and a flat reshape to 4 and 5 sides. The change from 3D to flat changes 3 of
   2,073,600 pixels by at most 1/255, at about 30 ms per frame. `MengerScaleStill` renders a depth 7
   sponge from outside with haze.
3. **Style directions.** Four were compared as style frames with music sketches: riso zine, ink and
   paper, editorial type, and monolith. The operator chose riso zine first and ink and paper second,
   and ruled out six-pointed stars and hexagrams because of their religious meaning. The reshape
   therefore uses 4 and 5 sides with uneven widths.
4. **Films: two finished drafts, each with a v2 polish pass.**
   - Riso zine, 42 s, `SamebaseRisoFilm`, on branch
     [claude/samebase-riso-film](https://github.com/samebase/samebase/tree/claude/samebase-riso-film):
     a printed zine where a net folds into the cube, the cube snaps flat on the drop, uneven sides
     open, and a huge halftone sponge prints in, with a probe reveal borrowed from the landing hero.
     16:9 and 4:5 cuts, and an 8 s loop. The halftone dots were made coarser so that they survive
     re-encoding on X.
   - Ink and paper, 38.5 s, `SamebaseInkFilm`, on branch
     [claude/samebase-ink-film](https://github.com/samebase/samebase/tree/claude/samebase-ink-film):
     a pen draws the mark, the painted cube peels off like a sticker, the mark walks over a hill,
     and a giant sponge in the clouds opens its channels where the mark walks. 16:9 and 4:5 cuts.
   - Both tracks came from Eleven Music with a composition plan, and a beat analysis placed the
     hits. No one has checked the music by ear yet. Music generation used about 4,400 credits in
     total.
   - A full render takes about 1 to 1.5 minutes per film on the Metal GPU. Masters and web copies
     are in each worktree's gitignored `apps/remotion-studio/out/`.

Open input for the operator: listen to both films, choose one, and approve the words on screen.
