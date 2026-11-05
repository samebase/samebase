// Loads one commit's source tree from versions/<label>/ (made by extract.sh) so the real commit engine runs.
// Imports that are not under test (Convex runtime, generated API, Octokit, other app modules that
// fail to resolve) become a do-nothing proxy. The engine, the merge code and the "diff" library run for real.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { realpathSync } from "node:fs";
const ROOT = realpathSync(fileURLToPath(new URL("..", import.meta.url))).replace(/\/$/, "");
const VERSIONS = `${ROOT}/versions/`;
// diff@8 for commits whose package.json pins ^8, diff@9 after.
const DIFF9 = new Set(["v7-before-7ceb8f30c", "v8-7ceb8f30c", "v7m-before-3e3b443ae", "v8m-3e3b443ae", "v9-main"]);

function versionOf(path) {
  return path.startsWith(VERSIONS) ? path.slice(VERSIONS.length).split("/")[0] : null;
}

function resolveRelative(fromFile, spec) {
  const base = resolvePath(dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`];
  if (base.endsWith(".js")) candidates.unshift(`${base.slice(0, -3)}.ts`);
  return candidates.find((p) => existsSync(p) && !p.endsWith("/")) ?? null;
}

// Where an import inside a version tree goes: a real file, a real npm package, or the stub.
function classify(fromFile, spec) {
  if (spec.includes("_generated/")) return { stub: true };
  if (spec.startsWith("node:")) return { real: spec };
  if (spec === "diff") return { real: DIFF9.has(versionOf(fromFile)) ? "diff9" : "diff8" };
  if (spec.startsWith(".")) {
    const file = resolveRelative(fromFile, spec);
    return file && /\.tsx?$/.test(file) ? { file } : { stub: true };
  }
  if (spec.startsWith("@samebase/dependent")) {
    const v = VERSIONS + versionOf(fromFile);
    const file = resolveRelative(`${v}/packages/dependent/x`, `./src/${spec.split("/").slice(2).join("/") || "index"}`);
    return file ? { file } : { stub: true };
  }
  return { stub: true };
}

const importRe = /^\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["'];?/gm;
const sideEffectImportRe = /^\s*import\s+["']([^"']+)["'];?/gm;

function bindingsToConst(clause) {
  const out = [];
  let rest = clause.trim();
  const ns = rest.match(/^\*\s+as\s+(\w+)$/);
  if (ns) return `const ${ns[1]} = globalThis.__stub;`;
  const named = rest.match(/\{([\s\S]*)\}/);
  const defaultPart = rest.replace(/\{[\s\S]*\}/, "").replace(/,/g, "").trim();
  if (defaultPart) out.push(`const ${defaultPart} = globalThis.__stub;`);
  if (named) {
    const names = named[1].split(",").map((s) => s.trim()).filter((s) => s && !s.startsWith("type "));
    if (names.length) out.push(`const { ${names.map((n) => n.replace(/\s+as\s+/, ": ")).join(", ")} } = globalThis.__stub;`);
  }
  return out.join(" ");
}

function transform(file, source) {
  let code = source.replace(importRe, (whole, typeOnly, clause, spec) => {
    if (typeOnly) return "";
    const c = classify(file, spec);
    return c.stub ? bindingsToConst(clause) : whole;
  });
  code = code.replace(sideEffectImportRe, (whole, spec) => (classify(file, spec).stub ? "" : whole));
  // Before d6e75127a the engine was not exported.
  code = code.replace(/^async function createCommitWithMultipleFiles/m, "export async function createCommitWithMultipleFiles");
  return code;
}

export async function resolve(spec, context, next) {
  const parent = context.parentURL?.startsWith("file:") ? fileURLToPath(context.parentURL) : null;
  if (parent && versionOf(parent)) {
    const c = classify(parent, spec);
    if (c.file) return { url: pathToFileURL(c.file).href, shortCircuit: true };
    if (c.real) return next(c.real, { ...context, parentURL: pathToFileURL(`${ROOT}/x.mjs`).href });
  }
  return next(spec, context);
}

export async function load(url, context, next) {
  if (url.startsWith("file:")) {
    const file = fileURLToPath(url);
    if (versionOf(file) && /\.tsx?$/.test(file)) {
      return { format: "module-typescript", source: transform(file, readFileSync(file, "utf8")), shortCircuit: true };
    }
  }
  return next(url, context);
}
