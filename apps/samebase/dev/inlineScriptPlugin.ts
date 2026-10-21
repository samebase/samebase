import { build } from "vite/rolldown";
import type { Plugin } from "vite";

const INLINE_SCRIPT_QUERY = "?inline-script";
const INLINE_SCRIPT_GLOBAL = "inlineScript";

/**
`import source from "./module.ts?inline-script"` gives the module's default export, a function,
as the source text of a function expression, compiled when Vite builds the importing module. A page
renders it into an inline `<script>` as `(${source})(${JSON.stringify(args)})`.

The source is compiled here, from its own file, and not read with `Function#toString` at run time:
the Convex CLI bundles the server build again with esbuild's `keepNames`, which adds calls to its
`__name` helper inside every function of the server bundle, and a serialized function would carry
those calls into a page that has no such helper. Inside a string, the compiled source stays as it
was built.
*/
export function inlineScriptPlugin(): Plugin {
  return {
    name: "samebase-inline-script",
    enforce: "pre",
    async load(id) {
      if (!id.endsWith(INLINE_SCRIPT_QUERY)) {
        return null;
      }

      const sourcePath = id.slice(0, -INLINE_SCRIPT_QUERY.length);
      const { output } = await build({
        input: sourcePath,
        logLevel: "warn",
        output: {
          exports: "default",
          format: "iife",
          minify: true,
          name: INLINE_SCRIPT_GLOBAL,
        },
        write: false,
      });
      const [chunk] = output;
      for (const moduleId of chunk.moduleIds) {
        this.addWatchFile(moduleId);
      }

      // The IIFE declares a variable; the arrow function keeps it out of the page's globals.
      const source = `(()=>{${chunk.code}return ${INLINE_SCRIPT_GLOBAL}})()`;
      return `export default ${JSON.stringify(source)};`;
    },
  };
}
