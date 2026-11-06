// Writes every page state of src/client/html.states.test.helper.ts to its own HTML file, plus an
// index, to open in a browser and use: hover, resize, switch the system theme. The pages are plain
// HTML with no script, so a file is the real page. Run `pnpm run pages`.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The source imports `./html.js`, as tsc needs; Node runs the `.ts` file beside it.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL !== undefined) {
      const typescript = new URL(specifier.replace(/\.js$/, ".ts"), context.parentURL);
      if (existsSync(fileURLToPath(typescript))) {
        return nextResolve(typescript.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const { pageStates } = await import("../src/client/html.states.test.helper.ts");

const out = path.resolve(import.meta.dirname, "../.playwright/pages");
mkdirSync(out, { recursive: true });
const names = Object.keys(pageStates);
for (const name of names) {
  writeFileSync(path.join(out, `${name}.html`), await pageStates[name]().text());
}
const links = names.map((name) => `<li><a href="${name}.html">${name}</a></li>`).join("\n");
const frames = names
  .map(
    (name) =>
      `<figure><figcaption><a href="${name}.html">${name}</a></figcaption><iframe src="${name}.html"></iframe></figure>`,
  )
  .join("\n");
writeFileSync(
  path.join(out, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Identity broker pages</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 1.5rem; font: 14px/1.5 system-ui, sans-serif; }
  .frames { display: flex; flex-wrap: wrap; gap: 1.5rem; }
  figure { margin: 0; }
  figcaption { margin-bottom: 0.25rem; font-weight: 600; }
  iframe { width: 390px; height: 700px; border: 1px solid #8884; }
</style>
</head>
<body>
<p>Each page at phone width. Open one by its name to see it full size. The theme follows the system.</p>
<ul>
${links}
</ul>
<div class="frames">
${frames}
</div>
</body>
</html>
`,
);
console.log(path.join(out, "index.html"));
