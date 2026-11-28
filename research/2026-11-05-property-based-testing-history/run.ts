import fc from "fast-check";
const print = (line: string) => process.stdout.write(line + "\n");
export async function run<Ts>(
  name: string,
  prop: fc.IRawProperty<Ts>,
  opts: fc.Parameters<Ts> = {},
) {
  const out = await fc.check(prop, { numRuns: 10_000, ...opts });
  if (!out.failed) {
    print(`PASS  ${name}  (${out.numRuns} runs)`);
    return;
  }
  print(`FAIL  ${name}`);
  print(
    `      found after ${out.numRuns} run(s), shrunk ${out.numShrinks} time(s), seed ${out.seed}`,
  );
  print(`      counterexample: ${fc.stringify(out.counterexample)}`);
  if (out.errorInstance) {
    const error = out.errorInstance;
    print(
      `      error: ${(error instanceof Error ? error.message : fc.stringify(error)).split("\n")[0]}`,
    );
  }
}
