#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

import { fail, runMain } from "../../../../scripts/lib/scriptRuntime.ts";

const usage = `Usage: generateFilmV3Audio.ts music <output.mp3>
       generateFilmV3Audio.ts sound <drag|reveal|lift> <output.mp3>

Reads ELEVENLABS_API_KEY from apps/remotion-studio/.env.local. The key is never printed.`;

const apiOrigin = "https://api.elevenlabs.io";

const negativeStyles = [
  "vocals",
  "lyrics",
  "spoken word",
  "cheesy corporate ukulele",
  "trailer braams",
  "lo-fi hiss",
  "dubstep wobble",
];

/**
The film structure at 120 BPM: one beat is 0.5 s and one bar is 2 s. Every section starts on a
bar line, so the hits of `filmV3Timeline.ts` land on the beat grid.
*/
const musicRequest = {
  model_id: "music_v2_5",
  composition_plan: {
    chunks: [
      {
        text: "[Hook] A confident hit on the first downbeat, then a tight groove at 120 BPM: dry punchy kick, crisp clap on 2 and 4, warm analog bass ostinato, short bright synth stabs.",
        duration_ms: 10_000,
        positive_styles: [
          "modern electronic",
          "confident",
          "premium brand film",
          "120 BPM",
          "punchy dry drums",
          "warm analog bass",
          "bright synth stabs",
        ],
        negative_styles: negativeStyles,
      },
      {
        text: "[Hover] The groove thins to closed hi-hats and a glassy arpeggio that climbs, with small crystalline sparkles. Curious and light.",
        duration_ms: 3_000,
        positive_styles: [
          "glassy arpeggio",
          "crystalline",
          "light",
          "curious",
          "120 BPM",
          "minimal",
        ],
        negative_styles: negativeStyles,
      },
      {
        text: "[Held breath] Everything falls away in the first second. Near silence: one soft high tone and a faint reverse swell. The last half second is almost silent.",
        duration_ms: 3_000,
        positive_styles: [
          "near silence",
          "suspense",
          "sustained tone",
          "reverse swell",
          "held breath",
          "sparse",
        ],
        negative_styles: [...negativeStyles, "drums"],
      },
      {
        text: "[Lift] The lift lands exactly on the downbeat: a wide bright synth chord with a deep sub hit, full drums return, a bold simple melodic hook. Premium and surprising.",
        duration_ms: 8_000,
        positive_styles: [
          "uplifting",
          "wide synth chord",
          "deep sub impact",
          "full drums",
          "melodic hook",
          "120 BPM",
          "euphoric",
        ],
        negative_styles: negativeStyles,
      },
      {
        text: "[Scale] Half-time and vast: long reverb, slow deep bass swells, a distant airy pad, the hook melody in long slow notes. Enormous scale and calm awe.",
        duration_ms: 8_000,
        positive_styles: [
          "half-time",
          "vast",
          "long reverb",
          "deep bass swells",
          "airy pad",
          "awe",
        ],
        negative_styles: negativeStyles,
      },
      {
        text: "[Resolve] The confident groove returns for two bars, then resolves to the home chord with one final clean hit on the downbeat that rings out to silence.",
        duration_ms: 10_000,
        positive_styles: [
          "confident",
          "resolved",
          "modern electronic",
          "120 BPM",
          "final hit",
          "clean ending",
          "ring out",
        ],
        negative_styles: negativeStyles,
      },
    ],
  },
};

const soundRequests = new Map([
  [
    "drag",
    {
      text: "A heavy solid block being turned by hand on a smooth surface: a soft low whoosh with a tiny clean click at the grab. Premium interface sound, dry, no music.",
      duration_seconds: 2,
    },
  ],
  [
    "reveal",
    {
      text: "Delicate crystalline shimmer as many tiny square channels open inside a solid block: glassy granular ticks that rise and sparkle. Premium interface sound, no music.",
      duration_seconds: 2.5,
    },
  ],
  [
    "lift",
    {
      text: "A hidden fourth dimension unfolds: a short whoosh in, a deep clean sub impact, then a bright airy shimmer bloom that widens. Cinematic but clean, no music.",
      duration_seconds: 3,
    },
  ],
]);

function readApiKey(): string {
  process.loadEnvFile(new URL("../../.env.local", import.meta.url));
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) {
    return fail("ELEVENLABS_API_KEY is missing from apps/remotion-studio/.env.local.");
  }
  return apiKey;
}

async function post(path: string, body: object, outputPath: string): Promise<void> {
  const response = await fetch(`${apiOrigin}${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "xi-api-key": readApiKey() },
    method: "POST",
  });
  if (!response.ok) {
    fail(`ElevenLabs returned ${response.status}: ${await response.text()}`);
  }
  await writeFile(outputPath, new Uint8Array(await response.arrayBuffer()));
  const costHeaders = [...response.headers].filter(([name]) => /cost|character|credit/i.test(name));
  console.log(`Wrote ${outputPath} ${JSON.stringify(costHeaders)}`);
}

async function generate(): Promise<void> {
  const [command, first, second] = process.argv.slice(2);
  switch (command) {
    case "music":
      if (!first) {
        return fail(usage);
      }
      return post("/v1/music?output_format=mp3_44100_192", musicRequest, first);
    case "sound": {
      const request = first ? soundRequests.get(first) : undefined;
      if (!request || !second) {
        return fail(usage);
      }
      return post("/v1/sound-generation", request, second);
    }
    default:
      return fail(usage);
  }
}

await runMain(generate);
