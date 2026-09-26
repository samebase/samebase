/**
The ink film renderer. Canvas 2D paints the washes, ink, and lettering of each frame; WebGPU
ray-marches the giant sponge into a G-buffer and then composes everything on paper with watercolor
effects: dried edges, granulation in the paper tooth, bled ink, mist, haze, and a vignette.
*/
import type { WebGpuFrameRenderer } from "../../webgpu/useWebGpuFrame";
import { drawPaper, drawTooth, HEIGHT, LETTERING_FONT, WIDTH } from "./inkBrush";
import { deg } from "./inkMath";
import { createSceneLayers, paintScene } from "./inkScene";
import {
  MIST_DEPTH,
  readProbe,
  readSpongeBasis,
  SPONGE_DEPTH,
  SPONGE_FRONT_TOP,
  SPONGE_SPAN,
} from "./inkSponge";
import { boilIndex, layerCamera, readCamera, readSpongeState, TIMES } from "./inkTimeline";

export type InkFrameInput = { time: number };

/** The G-buffer is rendered at twice the frame size, so the ink edges can be anti-aliased. */
const SUPERSAMPLE = 2;
const UNIFORM_VECTORS = 10;

const SHARED_WGSL = /* wgsl */ `
struct Uniforms {
  frame: vec4f,      // width, height, time, boil
  sponge: vec4f,     // layer center x, y, layer zoom, visibility
  geometry: vec4f,   // azimuth, elevation (radians), span in px, rest levels
  corner: vec4f,     // front top corner x, y, maximum levels, sponge on
  probe: vec4f,      // probe xyz, reveal radius
  probeStart: vec4f, // probe start xyz, awaken
  mist: vec4f,       // mist layer center x, y, zoom, amount
  finish: vec4f,     // whiteout, vignette, grain, unused
  sun: vec4f,        // sun direction
  basis: vec4f,      // projected origin x, y, unused, unused
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn hash21(p: vec2f) -> f32 {
  let q = fract(p * vec2f(123.34, 456.21));
  let r = q + dot(q, q + 45.32);
  return fract(r.x * r.y);
}
fn hash11(x: f32) -> f32 { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
fn noise2(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y) * 2.0 - 1.0;
}
fn fbm2(p: vec2f) -> f32 {
  return noise2(p) * 0.6 + noise2(p * 2.1 + vec2f(3.3, -1.7)) * 0.28 + noise2(p * 4.3) * 0.12;
}
fn layerPoint(screen: vec2f, center: vec2f, zoom: f32) -> vec2f {
  return (screen - vec2f(960.0, 540.0)) / zoom + center;
}

fn levelOpen(level: i32, p: vec3f) -> f32 {
  let widthPx = u.geometry.z * u.sponge.z / pow(3.0, f32(level));
  // Channels narrower than about 7 px stay closed: they would read as noise, not as structure.
  let lod = clamp(widthPx / 6.0 - 1.0, 0.0, 1.0);
  let rest = i32(u.geometry.w);
  if (level <= rest) {
    return lod;
  }
  let a = u.probeStart.xyz;
  let ab = u.probe.xyz - a;
  let h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  let distance = length(p - (a + ab * h));
  let extra = f32(level - rest - 1);
  let radius = max(u.probe.w * (1.0 - 0.3 * extra), 1e-4);
  var open = 1.0 - smoothstep(0.4 * radius, radius, distance);
  let front = u.probeStart.w * 1.6 - 0.3 - 0.15 * extra;
  open = max(open, 1.0 - smoothstep(front - 0.04, front + 0.1, p.z + 0.25 * abs(p.x - p.y)));
  return lod * open;
}

fn sponge(p: vec3f) -> f32 {
  let q = abs(p - vec3f(0.5)) - vec3f(0.5);
  var d = length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
  var period = 1.0;
  let levels = i32(u.corner.z);
  for (var level = 1; level <= 7; level++) {
    if (level > levels) {
      break;
    }
    let open = levelOpen(level, p);
    if (open > 0.001) {
      let c = abs(fract(p / period) - vec3f(0.5));
      let halfWidth = open / 6.0;
      let crossing = (min(max(c.y, c.z), min(max(c.x, c.z), max(c.x, c.y))) - halfWidth) * period;
      d = max(d, -crossing);
    }
    period = period / 3.0;
  }
  return d;
}
`;

const GBUFFER_WGSL = /* wgsl */ `
${SHARED_WGSL}
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  var corners = array(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(corners[index], 0.0, 1.0);
}

@fragment fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let screen = position.xy / ${SUPERSAMPLE}.0;
  let raw = layerPoint(screen, u.sponge.xy, u.sponge.z);
  // A freehand warp: long edges bow a little, as in the style frame.
  let q = raw - 3.2 * vec2f(fbm2(raw / 420.0 + vec2f(3.0, 0.0)), fbm2(raw / 420.0 + vec2f(9.0, 4.0)));
  let az = u.geometry.x;
  let el = u.geometry.y;
  let right = vec3f(sin(az), -cos(az), 0.0);
  let down = vec3f(cos(az) * sin(el), sin(az) * sin(el), -cos(el));
  let view = vec3f(cos(az) * cos(el), sin(az) * cos(el), sin(el));
  let ab = (q - u.basis.xy) / u.geometry.z;
  let base = ab.x * right + ab.y * down;
  let t0 = (vec3f(0.0) - base) / view;
  let t1 = (vec3f(1.0) - base) / view;
  let tNear = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  let tFar = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  if (tFar > tNear) {
    return vec4f(-1.0, 0.0, 0.0, 0.0);
  }
  let footprint = 1.0 / (u.geometry.z * u.sponge.z * ${SUPERSAMPLE}.0);
  var t = tNear;
  var hit = false;
  for (var step = 0; step < 260; step++) {
    let d = sponge(base + t * view);
    if (d < footprint * 0.4) {
      hit = true;
      break;
    }
    t -= max(d * 0.92, footprint * 0.3);
    if (t < tFar) {
      break;
    }
  }
  if (!hit) {
    return vec4f(-1.0, 0.0, 0.0, 0.0);
  }
  let p = base + t * view;
  let e = footprint * 0.6;
  let g = vec3f(
    sponge(p + vec3f(e, 0.0, 0.0)) - sponge(p - vec3f(e, 0.0, 0.0)),
    sponge(p + vec3f(0.0, e, 0.0)) - sponge(p - vec3f(0.0, e, 0.0)),
    sponge(p + vec3f(0.0, 0.0, e)) - sponge(p - vec3f(0.0, 0.0, e)),
  );
  let a = abs(g);
  var id = 0.0;
  var n = vec3f(1.0, 0.0, 0.0);
  if (a.y > a.x && a.y >= a.z) {
    id = 1.0;
    n = vec3f(0.0, 1.0, 0.0);
  } else if (a.z > a.x && a.z > a.y) {
    id = 2.0;
    n = vec3f(0.0, 0.0, 1.0);
  }
  let depthInside = tNear - t;
  var occlusion = 0.0;
  for (var k = 1; k <= 4; k++) {
    let h = 0.0045 * pow(2.7, f32(k));
    occlusion += clamp((h - sponge(p + n * h)) / h, 0.0, 1.0) * 0.3;
  }
  let openness = clamp(1.0 - occlusion, 0.0, 1.0);
  var lit = 0.0;
  if (dot(n, u.sun.xyz) > 0.0) {
    lit = 1.0;
    var s = footprint * 6.0;
    for (var k = 0; k < 72; k++) {
      let d = sponge(p + n * footprint * 3.0 + u.sun.xyz * s);
      if (d < footprint * 0.3) {
        lit = 0.0;
        break;
      }
      s += max(d, footprint);
      if (s > 0.7) {
        break;
      }
    }
  }
  var shade = 1.0 - openness * exp(-depthInside * 9.0);
  if (id > 0.5 && lit < 0.5) {
    shade += 0.25;
  }
  if (id > 0.5 && lit > 0.5 && depthInside > 0.012) {
    shade -= 0.4;
  }
  if (id < 0.5) {
    shade += 0.1;
  }
  let awake = levelOpen(i32(u.geometry.w) + 1, p);
  return vec4f(id, t, clamp(shade, 0.0, 1.0), awake);
}
`;

const COMPOSITE_WGSL = /* wgsl */ `
${SHARED_WGSL}
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var backTexture: texture_2d<f32>;
@group(0) @binding(3) var frontTexture: texture_2d<f32>;
@group(0) @binding(4) var inkTexture: texture_2d<f32>;
@group(0) @binding(5) var paperTexture: texture_2d<f32>;
@group(0) @binding(6) var toothTexture: texture_2d<f32>;
@group(0) @binding(7) var gbuffer: texture_2d<f32>;

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  var corners = array(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(corners[index], 0.0, 1.0);
}

const SIZE = vec2f(${WIDTH}.0, ${HEIGHT}.0);

fn sampleAt(t: texture_2d<f32>, p: vec2f) -> vec4f {
  return textureSampleLevel(t, linearSampler, p / SIZE, 0.0);
}
fn loadG(p: vec2i) -> vec4f {
  let limit = vec2i(${WIDTH * SUPERSAMPLE - 1}, ${HEIGHT * SUPERSAMPLE - 1});
  return textureLoad(gbuffer, clamp(p, vec2i(0), limit), 0);
}
fn luminance(c: vec3f) -> f32 { return dot(c, vec3f(0.3333)); }

fn faceColor(g: vec4f, q: vec2f) -> vec3f {
  let id = i32(g.x + 0.5);
  var c = vec3f(0.55, 0.64, 0.71);
  if (id == 2) {
    c = mix(vec3f(0.98, 0.87, 0.69), vec3f(0.96, 0.76, 0.6), smoothstep(900.0, 1500.0, q.x + 0.4 * q.y) * 0.5);
  } else if (id == 1) {
    c = mix(vec3f(0.95, 0.79, 0.63), vec3f(0.76, 0.79, 0.77), smoothstep(250.0, 900.0, q.y) * 0.45);
  }
  let m = fbm2(q / 170.0 + vec2f(f32(id) * 7.1, 0.0)) * 0.55 + fbm2(q / 42.0 + vec2f(0.0, f32(id) * 3.7)) * 0.3;
  c = pow(c, vec3f(1.0 + 0.32 * m));
  c = c * pow(vec3f(0.62, 0.63, 0.83), vec3f(g.z * 2.1));
  c = mix(c, c * vec3f(1.04, 0.97, 0.88), g.w * 0.25);
  let haze = 0.05 + 0.3 * smoothstep(250.0, 950.0, q.y);
  return mix(c, vec3f(0.95, 0.92, 0.93), haze);
}

fn hatch(p: vec2f, seed: f32) -> f32 {
  let angle = radians(64.0);
  let d = vec2f(cos(angle), sin(angle));
  let n = vec2f(-d.y, d.x);
  let gap = 8.5;
  let along = dot(p, d);
  let s = dot(p, n) / gap + 0.9 * noise2(vec2f(along / 70.0, floor(dot(p, n) / gap) * 1.3)) / gap;
  let i = floor(s);
  let f = s - i - 0.5 - (hash11(i + seed) - 0.5) * 0.35;
  let halfWidth = 0.62 * (0.8 + 0.4 * hash11(i * 1.7 + seed));
  let coverage = 1.0 - smoothstep(halfWidth - 0.55, halfWidth + 0.55, abs(f) * gap);
  let breaks = smoothstep(-0.55, -0.15, noise2(vec2f(along / 150.0, i * 5.3)));
  return coverage * breaks * (0.7 + 0.5 * hash11(i * 2.3 + seed));
}

fn mistAt(p: vec2f) -> f32 {
  let q = layerPoint(p, u.mist.xy, u.mist.z);
  let extra = clamp(u.mist.w - 1.0, 0.0, 1.0);
  let top = 600.0 - 900.0 * extra;
  let drift = vec2f(u.frame.z * 0.012, 0.0);
  return smoothstep(top, 1010.0, q.y + 95.0 * fbm2(vec2f(q.x / 380.0, q.y / 130.0) + drift)) * 0.96 * min(u.mist.w, 1.0);
}

@fragment fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = position.xy;
  let boil = u.frame.w;
  let tooth = sampleAt(toothTexture, p).r;
  let paper = sampleAt(paperTexture, p).rgb;

  // Washes behind the giant: a slow bleed, dried darker edges, and pigment in the tooth.
  let bleed = 1.1 * vec2f(fbm2(p / 38.0), fbm2(p / 38.0 + vec2f(17.0, 5.0)));
  var back = sampleAt(backTexture, p + bleed).rgb;
  let density = 1.0 - luminance(back);
  var ring = 0.0;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7854 + 0.3;
    let o = vec2f(cos(a), sin(a));
    ring += 2.0 - luminance(sampleAt(backTexture, p + o * 5.0).rgb) - luminance(sampleAt(backTexture, p + o * 11.0).rgb);
  }
  let edge = max(0.0, density - ring / 16.0);
  back = pow(back, vec3f(1.0 + 2.2 * edge));
  back *= 1.0 - 0.28 * density * (tooth - 0.35) * 1.6;
  var color = back;

  if (u.corner.w > 0.5) {
    let q = layerPoint(p, u.sponge.xy, u.sponge.z);
    let footprint = 1.0 / (u.geometry.z * u.sponge.z * ${SUPERSAMPLE}.0);
    let jitter = 1.3 * vec2f(noise2(p / 17.0 + vec2f(boil * 1.7, 0.0)), noise2(p / 17.0 + vec2f(31.0, boil * 2.3)));
    var fill = vec3f(0.0);
    var coverage = 0.0;
    var line = 0.0;
    var shadowSide = 0.0;
    var shade = 0.0;
    let centerG = loadG(vec2i(p * ${SUPERSAMPLE}.0));
    var same = 0.0;
    for (var k = 0; k < 8; k++) {
      let a = f32(k) * 0.7854;
      let other = loadG(vec2i(p * ${SUPERSAMPLE}.0 + vec2f(cos(a), sin(a)) * 7.0));
      same += select(0.0, 1.0, abs(other.x - centerG.x) < 0.5);
    }
    let rim = 1.0 - same / 8.0;
    for (var k = 0; k < 4; k++) {
      let offset = vec2f(f32(k % 2), f32(k / 2)) + vec2f(0.5);
      let gp = p * ${SUPERSAMPLE}.0 - vec2f(1.0) + offset;
      let g = loadG(vec2i(gp));
      if (g.x > -0.5) {
        fill += pow(faceColor(g, q), vec3f(1.0 + 0.8 * rim));
        coverage += 1.0;
        shade += g.z;
        shadowSide += select(0.0, 1.0, g.x < 0.5);
      }
      // Ink edges: face changes and depth jumps, sampled through a boiling wobble.
      let lp = vec2i(gp + jitter * ${SUPERSAMPLE}.0);
      let c = loadG(lp);
      var e = 0.0;
      let directions = array(vec2i(2, 0), vec2i(0, 2), vec2i(2, 2), vec2i(2, -2));
      for (var j = 0; j < 4; j++) {
        let dir = directions[j];
        for (var side = -1; side <= 1; side += 2) {
          let n = loadG(lp + dir * side);
          let jump = abs(n.y - c.y);
          if (abs(n.x - c.x) > 0.5 || (c.x > -0.5 && jump > footprint * 5.0)) {
            e = 1.0;
          }
          let far = loadG(lp + dir * side * 2);
          if (abs(far.y - c.y) > 0.035 && far.x > -0.5 && c.x > -0.5) {
            e = max(e, 0.85);
          }
        }
      }
      line += e;
    }
    let visibility = u.sponge.w;
    if (coverage > 0.0) {
      fill /= coverage;
      shade /= coverage;
      let alpha = coverage / 4.0 * visibility;
      color = mix(color, fill, alpha);
      let mist = mistAt(p);
      let hatchMask = shadowSide / 4.0 * (1.0 - mist) * (0.35 + 0.65 * shade) * visibility;
      let hatching = hatch(q * u.sponge.z, floor(boil / 3.0)) * hatchMask * 0.55;
      color *= 1.0 - hatching * (1.0 - vec3f(0.15, 0.18, 0.2));
    }
    let mist = mistAt(p);
    let lineAlpha = line / 4.0 * (0.9 - 0.25 * shade) * pow(1.0 - mist, 1.6) * visibility * 0.92;
    color *= 1.0 - lineAlpha * (1.0 - vec3f(0.15, 0.18, 0.2));
  }

  let mist = mistAt(p);
  color = mix(color, vec3f(0.995, 0.965, 0.925), mist);

  // Washes in front of the giant, premultiplied.
  let frontBleed = 0.8 * vec2f(fbm2(p / 29.0 + vec2f(5.0, 1.0)), fbm2(p / 29.0 + vec2f(2.0, 9.0)));
  let front = sampleAt(frontTexture, p + frontBleed);
  if (front.a > 0.002) {
    var ringAlpha = 0.0;
    var ringDensity = 0.0;
    for (var k = 0; k < 8; k++) {
      let a = f32(k) * 0.7854 + 0.2;
      let s = sampleAt(frontTexture, p + frontBleed + vec2f(cos(a), sin(a)) * 4.5);
      ringAlpha += s.a;
      ringDensity += s.a - luminance(s.rgb);
    }
    let frontDensity = front.a - luminance(front.rgb);
    let frontEdge = max(0.0, frontDensity - ringDensity / 8.0) + 0.6 * max(0.0, front.a - ringAlpha / 8.0);
    var tint = front.rgb / max(front.a, 1e-4);
    tint = pow(clamp(tint, vec3f(0.0), vec3f(1.0)), vec3f(1.0 + 2.4 * frontEdge));
    tint *= 1.0 - 0.3 * (1.0 - luminance(tint)) * (tooth - 0.35) * 1.6;
    color = color * (1.0 - front.a) + tint * front.a;
  }

  color *= paper;
  color *= 1.0 - 0.035 * tooth;

  // Ink: a little ragged at the edge, bled by a fraction of a pixel, thinner on the tooth peaks.
  let inkWarp = 0.85 * vec2f(noise2(p / 7.0 + vec2f(boil * 3.1, 0.0)), noise2(p / 7.0 + vec2f(40.0, boil * 3.1)));
  let ip = p + inkWarp;
  let ink = (sampleAt(inkTexture, ip + vec2f(0.3, 0.2)) + sampleAt(inkTexture, ip - vec2f(0.3, 0.2)) + sampleAt(inkTexture, ip + vec2f(-0.2, 0.3)) + sampleAt(inkTexture, ip + vec2f(0.2, -0.3))) * 0.25;
  let inkAlpha = ink.a * (1.0 - 0.3 * (1.0 - tooth) * (1.0 - tooth));
  if (inkAlpha > 0.0) {
    let inkColor = ink.rgb / max(ink.a, 1e-4);
    color *= (1.0 - inkAlpha) + inkAlpha * inkColor;
  }

  let d = (p - vec2f(960.0, 540.0)) / vec2f(960.0, 540.0);
  let r = sqrt(d.x * d.x * 0.82 + d.y * d.y * 1.1);
  let vignette = smoothstep(0.62, 1.45, r);
  color *= 1.0 - u.finish.y * vignette;
  color *= vec3f(1.0, 1.0 - 0.03 * vignette, 1.0 - 0.08 * vignette);
  color *= 1.0 + u.finish.z * (hash21(p) - 0.5);
  color = mix(color, paper * 0.985, u.finish.x);
  return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

function createLayerTexture(device: GPUDevice, width = WIDTH, height = HEIGHT): GPUTexture {
  return device.createTexture({
    format: "rgba8unorm",
    size: [width, height],
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

export async function createInkRenderer(
  canvas: HTMLCanvasElement,
): Promise<WebGpuFrameRenderer<InkFrameInput>> {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("The ink film needs a WebGPU adapter.");
  }
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) {
    throw new Error("The ink film needs a WebGPU canvas context.");
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ alphaMode: "opaque", device, format });
  await document.fonts.load(`80px "${LETTERING_FONT}"`);

  const layers = createSceneLayers();
  const backTexture = createLayerTexture(device);
  const frontTexture = createLayerTexture(device);
  const inkTexture = createLayerTexture(device);
  const paperTexture = createLayerTexture(device);
  const toothTexture = createLayerTexture(device);
  device.queue.copyExternalImageToTexture({ source: drawPaper(8) }, { texture: paperTexture }, [
    WIDTH,
    HEIGHT,
  ]);
  device.queue.copyExternalImageToTexture({ source: drawTooth(9) }, { texture: toothTexture }, [
    WIDTH,
    HEIGHT,
  ]);
  const gbufferTexture = device.createTexture({
    format: "rgba32float",
    size: [WIDTH * SUPERSAMPLE, HEIGHT * SUPERSAMPLE],
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const uniformBuffer = device.createBuffer({
    size: UNIFORM_VECTORS * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const uniformLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, buffer: { type: "uniform" }, visibility: GPUShaderStage.FRAGMENT }],
  });
  const gbufferModule = device.createShaderModule({ code: GBUFFER_WGSL });
  const gbufferPipeline = device.createRenderPipeline({
    fragment: {
      entryPoint: "fragmentMain",
      module: gbufferModule,
      targets: [{ format: "rgba32float" }],
    },
    layout: device.createPipelineLayout({ bindGroupLayouts: [uniformLayout] }),
    vertex: { entryPoint: "vertexMain", module: gbufferModule },
  });
  const gbufferBindGroup = device.createBindGroup({
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    layout: uniformLayout,
  });

  const textureEntry = (binding: number): GPUBindGroupLayoutEntry => ({
    binding,
    texture: { sampleType: "float" },
    visibility: GPUShaderStage.FRAGMENT,
  });
  const compositeLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, buffer: { type: "uniform" }, visibility: GPUShaderStage.FRAGMENT },
      { binding: 1, sampler: { type: "filtering" }, visibility: GPUShaderStage.FRAGMENT },
      textureEntry(2),
      textureEntry(3),
      textureEntry(4),
      textureEntry(5),
      textureEntry(6),
      {
        binding: 7,
        texture: { sampleType: "unfilterable-float" },
        visibility: GPUShaderStage.FRAGMENT,
      },
    ],
  });
  const compositeModule = device.createShaderModule({ code: COMPOSITE_WGSL });
  const compositePipeline = device.createRenderPipeline({
    fragment: { entryPoint: "fragmentMain", module: compositeModule, targets: [{ format }] },
    layout: device.createPipelineLayout({ bindGroupLayouts: [compositeLayout] }),
    vertex: { entryPoint: "vertexMain", module: compositeModule },
  });
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  const compositeBindGroup = device.createBindGroup({
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: backTexture.createView() },
      { binding: 3, resource: frontTexture.createView() },
      { binding: 4, resource: inkTexture.createView() },
      { binding: 5, resource: paperTexture.createView() },
      { binding: 6, resource: toothTexture.createView() },
      { binding: 7, resource: gbufferTexture.createView() },
    ],
    layout: compositeLayout,
  });

  const sun = [-0.28, 0.86, 0.42];
  const sunLength = Math.hypot(...sun);

  return {
    destroy: () => device.destroy(),
    render: async ({ time }) => {
      paintScene(time, layers);
      for (const [layer, texture] of [
        [layers.back, backTexture],
        [layers.front, frontTexture],
        [layers.ink, inkTexture],
      ] as const) {
        device.queue.copyExternalImageToTexture(
          { source: layer.canvas },
          { premultipliedAlpha: true, texture },
          [WIDTH, HEIGHT],
        );
      }
      const camera = readCamera(time);
      const spongeState = readSpongeState(time);
      const spongeCamera = layerCamera(camera, SPONGE_DEPTH);
      const mistCamera = layerCamera(camera, MIST_DEPTH);
      const probe = readProbe(
        Math.min(time, TIMES.stroll + 4),
        spongeState.azimuth,
        spongeState.elevation,
      );
      const probeStart = readProbe(TIMES.stroll + 0.3, spongeState.azimuth, spongeState.elevation);
      const basis = readSpongeBasis(spongeState.azimuth, spongeState.elevation);
      const values = new Float32Array(UNIFORM_VECTORS * 4);
      values.set([
        WIDTH,
        HEIGHT,
        time,
        boilIndex(time),
        spongeCamera.center[0],
        spongeCamera.center[1],
        spongeCamera.zoom,
        spongeState.visibility,
        deg(spongeState.azimuth),
        deg(spongeState.elevation),
        SPONGE_SPAN,
        spongeState.restLevels,
        SPONGE_FRONT_TOP[0],
        SPONGE_FRONT_TOP[1],
        6,
        spongeState.on ? 1 : 0,
        probe[0],
        probe[1],
        probe[2],
        spongeState.revealRadius,
        probeStart[0],
        probeStart[1],
        probeStart[2],
        spongeState.awaken,
        mistCamera.center[0],
        mistCamera.center[1],
        mistCamera.zoom,
        spongeState.mist,
        0,
        0.2,
        0.045,
        0,
        (sun[0] ?? 0) / sunLength,
        (sun[1] ?? 0) / sunLength,
        (sun[2] ?? 0) / sunLength,
        0,
        basis.origin[0],
        basis.origin[1],
        0,
        0,
      ]);
      device.queue.writeBuffer(uniformBuffer, 0, values);
      const encoder = device.createCommandEncoder();
      if (spongeState.on) {
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              clearValue: [-1, 0, 0, 0],
              loadOp: "clear",
              storeOp: "store",
              view: gbufferTexture.createView(),
            },
          ],
        });
        pass.setPipeline(gbufferPipeline);
        pass.setBindGroup(0, gbufferBindGroup);
        pass.draw(3);
        pass.end();
      }
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            clearValue: [1, 1, 1, 1],
            loadOp: "clear",
            storeOp: "store",
            view: context.getCurrentTexture().createView(),
          },
        ],
      });
      pass.setPipeline(compositePipeline);
      pass.setBindGroup(0, compositeBindGroup);
      pass.draw(3);
      pass.end();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
    },
  };
}
