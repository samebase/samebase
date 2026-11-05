import { execFileSync } from "node:child_process"; import { mkdtempSync, writeFileSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const { rebaseStagedContent } = await import(new URL("./versions/v9-main/", import.meta.url).href + "packages/git-editor/src/stagingRebase.ts");
const dir = mkdtempSync(join(tmpdir(), "m-"));
const git = (b: string, o: string, t: string) => { writeFileSync(join(dir,"o"), o); writeFileSync(join(dir,"b"), b); writeFileSync(join(dir,"t"), t); try { return execFileSync("git", ["merge-file","-p",join(dir,"o"),join(dir,"b"),join(dir,"t")],{encoding:"utf8"}); } catch { return "CONFLICT"; } };
const cases = JSON.parse(process.argv[2]);
for (const [b, u, t] of cases) {
  const r = rebaseStagedContent({ baseContent: b, stagedContent: u, upstreamContent: t });
  for (const [k, v] of [["base", b], ["user", u], ["teammate", t], ["git", git(b, u, t)], ["samebase", r.content + (r.hasConflict ? " (conflict)" : "")]]) console.log(k.padEnd(9), JSON.stringify(v));
  console.log();
}
