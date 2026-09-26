#!/usr/bin/env node
import { spawnSync } from "node:child_process";

import { fail, runMain } from "../../../../scripts/lib/scriptRuntime.ts";

const usage = `Usage: analyzeMusicBeats.ts <audio file> [section starts in seconds, comma-separated]

Prints the tempo, the beat grid, the loudness of each bar, and the strongest onsets.
Example: analyzeMusicBeats.ts out/music.mp3 8,16,26,29`;

const sampleRate = 22_050;
const windowSize = 1024;
const hopSize = 256;
const hopSeconds = hopSize / sampleRate;

function decode(file: string): Float32Array {
  const result = spawnSync(
    "ffmpeg",
    ["-loglevel", "error", "-i", file, "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "-"],
    { maxBuffer: 1 << 30 },
  );
  if (result.error || result.status !== 0) {
    return fail(`ffmpeg could not decode ${file}: ${result.stderr.toString()}`);
  }
  // Copy into a fresh buffer: the Node buffer can start at an offset that is not 4-byte aligned.
  return new Float32Array(new Uint8Array(result.stdout).buffer);
}

/** In-place radix-2 FFT of one window. */
function fft(real: Float64Array, imaginary: Float64Array): void {
  const size = real.length;
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    for (; reversed & bit; bit >>= 1) {
      reversed ^= bit;
    }
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed] ?? 0, real[index] ?? 0];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed] ?? 0, imaginary[index] ?? 0];
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    for (let start = 0; start < size; start += length) {
      for (let offset = 0; offset < length / 2; offset += 1) {
        const cos = Math.cos(angle * offset);
        const sin = Math.sin(angle * offset);
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal = (real[odd] ?? 0) * cos - (imaginary[odd] ?? 0) * sin;
        const oddImaginary = (real[odd] ?? 0) * sin + (imaginary[odd] ?? 0) * cos;
        real[odd] = (real[even] ?? 0) - oddReal;
        imaginary[odd] = (imaginary[even] ?? 0) - oddImaginary;
        real[even] = (real[even] ?? 0) + oddReal;
        imaginary[even] = (imaginary[even] ?? 0) + oddImaginary;
      }
    }
  }
}

/** Spectral flux of log magnitudes (the onset strength) and RMS, one value per hop. */
function readEnvelopes(samples: Float32Array) {
  const hops = Math.floor((samples.length - windowSize) / hopSize);
  const onset = new Float64Array(hops);
  const loudness = new Float64Array(hops);
  const previous = new Float64Array(windowSize / 2);
  const real = new Float64Array(windowSize);
  const imaginary = new Float64Array(windowSize);
  for (let hop = 0; hop < hops; hop += 1) {
    let energy = 0;
    for (let index = 0; index < windowSize; index += 1) {
      const sample = samples[hop * hopSize + index] ?? 0;
      energy += sample * sample;
      real[index] = sample * (0.5 - 0.5 * Math.cos((2 * Math.PI * index) / windowSize));
      imaginary[index] = 0;
    }
    fft(real, imaginary);
    let flux = 0;
    for (let bin = 1; bin < windowSize / 2; bin += 1) {
      const magnitude = Math.log1p(100 * Math.hypot(real[bin] ?? 0, imaginary[bin] ?? 0));
      flux += Math.max(0, magnitude - (previous[bin] ?? 0));
      previous[bin] = magnitude;
    }
    onset[hop] = flux;
    loudness[hop] = Math.sqrt(energy / windowSize);
  }
  return { loudness, onset };
}

function sampleAt(values: Float64Array, position: number): number {
  return values[Math.round(position)] ?? 0;
}

/** Tempo and phase with the largest onset sum on the grid, from 80 to 170 BPM. */
function findBeatGrid(onset: Float64Array) {
  let best = { bpm: 0, firstBeat: 0, score: -1 };
  for (let bpm = 80; bpm <= 170; bpm += 0.05) {
    const period = 60 / bpm / hopSeconds;
    for (let phase = 0; phase < period; phase += 0.5) {
      let score = 0;
      let count = 0;
      for (let position = phase; position < onset.length; position += period) {
        score += sampleAt(onset, position);
        count += 1;
      }
      score /= count;
      if (score > best.score) {
        best = { bpm, firstBeat: phase * hopSeconds, score };
      }
    }
  }
  return best;
}

function readPeaks(onset: Float64Array, count: number) {
  const radius = Math.round(0.12 / hopSeconds);
  const peaks: { strength: number; time: number }[] = [];
  for (let hop = 1; hop < onset.length - 1; hop += 1) {
    const value = onset[hop] ?? 0;
    let isPeak = true;
    for (let offset = -radius; offset <= radius && isPeak; offset += 1) {
      if ((onset[hop + offset] ?? 0) > value) {
        isPeak = false;
      }
    }
    if (isPeak) {
      peaks.push({ strength: value, time: hop * hopSeconds });
    }
  }
  const strongest = [...peaks]
    .sort((left, right) => right.strength - left.strength || left.time - right.time)
    .slice(0, count);
  return strongest.sort((left, right) => left.time - right.time);
}

function mean(values: Float64Array, startSeconds: number, endSeconds: number): number {
  const start = Math.max(0, Math.floor(startSeconds / hopSeconds));
  const end = Math.min(values.length, Math.floor(endSeconds / hopSeconds));
  let sum = 0;
  for (let hop = start; hop < end; hop += 1) {
    sum += values[hop] ?? 0;
  }
  return end > start ? sum / (end - start) : 0;
}

async function analyzeMusicBeats(): Promise<void> {
  const [file, sectionText, ...rest] = process.argv.slice(2);
  if (!file || rest.length > 0) {
    return fail(usage);
  }
  const samples = decode(file);
  const duration = samples.length / sampleRate;
  const { loudness, onset } = readEnvelopes(samples);
  const onsetScale = Math.max(...onset);
  const { bpm, firstBeat } = findBeatGrid(onset);
  const beat = 60 / bpm;

  console.log(
    `${file}: ${duration.toFixed(2)} s, ${bpm.toFixed(2)} BPM, beat ${beat.toFixed(4)} s`,
  );
  console.log(`first beat ${firstBeat.toFixed(3)} s`);

  const bars: string[] = [];
  for (let start = firstBeat; start < duration; start += 4 * beat) {
    const level = mean(loudness, start, start + 4 * beat);
    bars.push(`${start.toFixed(2)}:${(level * 100).toFixed(0)}`);
  }
  console.log(`bar RMS x100: ${bars.join(" ")}`);

  if (sectionText) {
    const starts = [0, ...sectionText.split(",").map(Number), duration];
    const sections = starts.slice(0, -1).map((start, index) => {
      const end = starts[index + 1] ?? duration;
      return `${start}-${end}: rms ${(mean(loudness, start, end) * 100).toFixed(1)} onset ${((mean(onset, start, end) / onsetScale) * 100).toFixed(1)}`;
    });
    console.log(`sections: ${sections.join(" | ")}`);
  }

  const peaks = readPeaks(onset, 24).map(({ strength, time }) => {
    const beatIndex = Math.round((time - firstBeat) / beat);
    const offsetMs = (time - (firstBeat + beatIndex * beat)) * 1000;
    return `${time.toFixed(2)}(b${beatIndex}${offsetMs >= 0 ? "+" : ""}${offsetMs.toFixed(0)}ms,${((strength / onsetScale) * 100).toFixed(0)})`;
  });
  console.log(`strongest onsets: ${peaks.join(" ")}`);
}

await runMain(analyzeMusicBeats);
