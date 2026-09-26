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

Samebase already has the right engine: Remotion 4 in `apps/remotion-studio`, with `@remotion/three`
and `@samebase/logo-model`. A Samebase video needs no new framework. It needs a reference, a music
decision, real screens, a storyboard, and the same verification loop.

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

Assets that already exist:

- `apps/remotion-studio`: Remotion 4.0.489, `@remotion/captions`, `@remotion/three`, the 12-second
  `LogoHype` identity sequence, recorded-demo speed ramps, and render scripts
  ([README](../apps/remotion-studio/README.md)).
- `packages/logo-model`: the voxel mark, isometric views, cube shuffle, and Menger depth transition
  ([motion vocabulary](../apps/remotion-studio/notes/logo-motion-directions.md)). No other product
  has this mark. It is the strongest visual asset for a Samebase video.
- `packages/onboarding-video-tools`: real Chrome capture on macOS for true product footage.
- Brand tokens: 0 px radius everywhere, Liberation Sans, and a teal-gray primary
  ([index.css](../apps/samebase/src/index.css)).
- Hero copy: "The correct way to build web apps." and "One place to manage GitHub, Convex, and
  Cloudflare across all your apps." The hero also shows the agent prompt
  ([LandingPreviewPage.tsx:125](../apps/samebase/src/components/LandingPreviewPage.tsx)).

Tool decisions:

- **Remotion, not HyperFrames.** Both give deterministic frames. Remotion already runs here and
  imports `logo-model` directly. HyperFrames would add a second render stack for no gain.
- **No 21st.dev components.** Samebase has its own sharp-cornered UI. Borrowed components would look
  off-brand. Use real Samebase screens and tokens.
- **No generated video base.** Seedance helped with characters and physics in the music videos. A
  product video needs exact UI.
- **Missing piece: a contact sheet command.** Remotion Studio previews one frame at a time. The
  agent needs one command that renders a list of times into one image, as PDoomVideo does.

## Recommended direction

Reference: [opencode 2](https://x.com/kitlangton/status/2103884479710523586) for the terminal-native
pacing and mono captions, with the restraint of the
[mexicat](https://x.com/_mexicat/status/2103108369569726802) type system. Samebase colors: black,
white, and one brand accent. Avoid Claude orange, so that the video does not read as an Anthropic
ad.

Story, about 45 s, 1920x1080, 30 fps:

1. **Hook, 0 to 4 s.** A dark terminal. An agent prompt types itself. Big kinetic mono words.
2. **Setup, 4 to 18 s.** Samebase MCP calls fire on the beat. GitHub, Convex, and Cloudflare nodes
   light up and connect. Real dashboard rows appear.
3. **Proof, 18 to 30 s.** The live URL opens and the real app plays (the existing tic-tac-toe
   recording).
4. **Same base, 30 to 40 s.** The voxel mark shuffles and goes to Menger depth, one control per
   beat: many apps, one base.
5. **End card, 40 to 45 s.** The isometric mark, "The correct way to build web apps.", and
   samebase.com.

## Production plan

1. Decide the inputs below.
2. Capture real screens: landing, organization dashboard, repository dashboard, and the new app
   flow.
3. Write a storyboard in `apps/remotion-studio/notes/` with three variants of the recommended
   direction. Pick one.
4. Render one still per scene and review them as one contact sheet before any motion.
5. Build a `LaunchFilm` composition: music first, beat-grid constants, a shared texture layer, and a
   camera helper.
6. Iterate with contact sheets, then give director notes in camera words.
7. Render the master to `apps/remotion-studio/out/` and post it.

Open inputs for the operator:

- Music: a licensed track, or a generated track (for example ElevenLabs Music) at the exact length
  and tempo.
- The claims the video must show, in order.
- Voiceover or no voiceover. All the examples above use music and on-screen text only.
