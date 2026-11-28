import { register } from "node:module";

// A value that absorbs anything: property reads, calls, `new`. Module-level code such as
// `export const commitAllStaged = action({...})` or `v.object({...})` runs against it harmlessly.
const target = function stub() {};
const stub = new Proxy(target, {
  get(_t, key) {
    if (key === "then") return undefined; // not a thenable
    if (key === Symbol.toPrimitive) return () => "stub";
    if (key === Symbol.iterator) return function* () {};
    return stub;
  },
  apply: () => stub,
  construct: () => stub,
});
globalThis.__stub = stub;

register("./hooks.mjs", import.meta.url);
