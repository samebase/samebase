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
recommended Samebase video is a fractal dive into the Menger sponge, with music that rises without
end. It needs one account (ElevenLabs Starter), a short script, and the same verification loop.

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

## Recommended direction: the fractal dive

The idea: a small thing becomes so large and so detailed that it is almost too much. The Menger
sponge is the exact picture of the Samebase claim, because every part of it is the whole again. The
words carry the literal claim. The fractal carries the feeling.

The sponge is self-similar at a scale of 3. A camera that zooms 3x toward a self-similar point sees
the same frame again, so the dive can loop without a seam and go deeper for as long as the music
lasts. The distance function stops at the pixel size, as the landing renderer does, so each frame
costs about the same at any depth.

The music uses the same idea. A Shepard-Risset glissando sounds like it rises forever, but its pitch
stays in one range. A Risset rhythm sounds like it speeds up forever, but its tempo stays in one
range. One 3x zoom cycle equals one octave of the rise. The rise and rhythm layers are synthesized
in code from the frame clock, so they stay in exact sync. An Eleven Music bed with the same key and
section lengths gives the texture and the low end.

Film, about 50 s, 1920x1080, 30 fps:

1. **Seed, 0 to 6 s.** Silence, then one low tone. The flat compact mark on an empty field.
2. **Depth, 6 to 20 s.** The camera turns and the flat mark becomes the front face of the 3D sponge.
   Each bar adds one depth level: 20, 400, 8,000, 160,000 cells. Each level adds one musical layer.
3. **Dive, 20 to 42 s.** The camera enters one opening and does not stop. Light falls through the
   tunnels. The rise and the rhythm accelerate. Grain, halation, and color intensify toward the
   peak.
4. **Cut, 42 to 50 s.** A hard cut to silence and the flat mark again. Then the wordmark, the
   tagline, and samebase.com.

Draft words, for the operator to approve (few lines, large type, placed at the calm points before
each musical lift):

- "Every app starts from the same base."
- "Samebase is built on it too."
- "What we learn goes back into the base."
- "Every new app starts from a better one."
- "The correct way to build web apps."

The fourth line must stay accurate: new apps get the current base, and existing apps update only
when their owners choose.

## Production plan

1. **Spike, no account needed.** A Remotion composition renders the TypeGPU Menger sponge on the
   Metal GPU at a given frame. Output: a 5 s seamless zoom test, a contact sheet command, the time
   per frame, and proof that the same frame renders identically twice.
2. **Music.** Generate three Eleven Music beds from one composition plan with exact section lengths.
   Synthesize the Shepard-Risset layers in a Node TypeScript script. Mix with ffmpeg and pick one.
3. **Storyboard.** Write three variants of the shot table in `apps/remotion-studio/notes/`. Render
   one still per shot and review them as one contact sheet before any motion.
4. **Build and review.** Build the film, check contact sheets around every hit and cut, then take
   director notes in camera words.
5. **Master.** Render to `apps/remotion-studio/out/`, mix the audio, and post.

Open inputs for the operator:

- An ElevenLabs Starter account and its API key in `apps/remotion-studio/.env.local`.
- Approval of the draft words, or replacement lines.
