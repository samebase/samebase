// Serves every page state of src/client/html.states.test.helper.ts at http://localhost:4319, to
// open in a browser and use: hover, resize, switch the system theme. The pages are plain HTML with
// no script, so each is the real page. `pnpm run pages` runs this under `node --watch`: a change to
// the page code restarts it, and each open page reloads itself when the server is back.
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const PORT = 4319;

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

// Only these served copies get it: the open connection breaks when `node --watch` restarts the
// server, and the page reloads once it connects again.
const RELOAD = `<script>
  let lost = false;
  const events = new EventSource("/events");
  events.onerror = () => { lost = true; };
  events.onopen = () => { if (lost) location.reload(); };
</script>`;

function index() {
  const names = Object.keys(pageStates);
  const frames = names
    .map(
      (name) =>
        `<figure><figcaption><a href="/${name}">${name}</a></figcaption><iframe src="/${name}"></iframe></figure>`,
    )
    .join("\n");
  return `<!doctype html>
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
<p>Each page at phone width; open one by its name to see it full size. The theme follows the
system, and the pages reload by themselves when the page code changes.</p>
<div class="frames">
${frames}
</div>
${RELOAD}
</body>
</html>`;
}

const states = new Map(Object.entries(pageStates));

async function respond(request: IncomingMessage, response: ServerResponse) {
  const name = (request.url ?? "/").slice(1);
  if (name === "events") {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
    response.write(": open\n\n");
    return;
  }
  const render = states.get(name);
  const html =
    name === ""
      ? index()
      : render === undefined
        ? null
        : (await render().text()).replace("</body>", `${RELOAD}</body>`);
  response.writeHead(html === null ? 404 : 200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html ?? "Not found");
}

createServer((request, response) => {
  void respond(request, response);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`http://localhost:${PORT}`);
});
