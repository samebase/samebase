// The blob shas, API paths, and commit messages of the state branches.
import { describe, expect, it } from "vitest";
import { blobSha, commitMessage, encodePath } from "../src/git.ts";

describe("blobSha", () => {
  it("is the sha that git gives the same text", () => {
    // `git hash-object --stdin` of each text.
    expect(blobSha("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
    expect(blobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
});

describe("encodePath", () => {
  it("encodes each segment and keeps the slashes", () => {
    expect(encodePath("my app/prod#1/A?.json")).toBe("my%20app/prod%231/A%3F.json");
  });
});

describe("commitMessage", () => {
  it("names the resources of each stage, and counts more than five", () => {
    const set = (key: string) => ({ key, deleted: false, lock: "" });
    expect(
      commitMessage([
        set("app/prod/Worker.json"),
        set("app/prod/Site__Assets.json"),
        { key: "app/prod/Old.json", deleted: true, lock: "" },
        set("app/prod/__stack_output__.json"),
        ...["A", "B", "C", "D", "E", "F"].map((name) => set(`app/staging/${name}.json`)),
      ]),
    ).toBe(
      `app prod: set Worker, Site/Assets, stack output; delete Old
app staging: set 6 resources`,
    );
  });

  it("names a lock change by its lock text", () => {
    expect(
      commitMessage([{ key: "app/prod/__lease__.json", deleted: false, lock: "take lock" }]),
    ).toBe("app prod: take lock");
  });

  it("keeps a stack name with slashes whole", () => {
    expect(commitMessage([{ key: "org/app/prod/Worker.json", deleted: false, lock: "" }])).toBe(
      "org/app prod: set Worker",
    );
  });
});
