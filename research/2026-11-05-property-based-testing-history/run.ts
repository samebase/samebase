import fc from "fast-check";
const print = (line: string) => process.stdout.write(line + "\n");
export async function run(name: string, prop: fc.IProperty<any> | fc.IAsyncProperty<any>, opts: fc.Parameters<any> = {}) {
  const out = await fc.check(prop as any, { numRuns: 10_000, ...opts });
  if (!out.failed) { print(`PASS  ${name}  (${out.numRuns} runs)`); return; }
  print(`FAIL  ${name}`);
  print(`      found after ${out.numRuns} run(s), shrunk ${out.numShrinks} time(s), seed ${out.seed}`);
  print(`      counterexample: ${fc.stringify(out.counterexample)}`);
  if (out.errorInstance) print(`      error: ${String((out.errorInstance as any)?.message ?? out.errorInstance).split("\n")[0]}`);
}
