import { describe, expect, it } from "vite-plus/test";
import {
  buildPathWithTanStackSearch,
  parseTanStackSearch,
  stringifyTanStackSearch,
} from "@/lib/tanstackSearchParams";

describe("tanstackSearchParams", () => {
  it("parses plain query strings without JSON coercion", () => {
    expect(parseTanStackSearch("?freeView&rot=10&threadId=thread_123")).toEqual({
      freeView: "",
      rot: "10",
      threadId: "thread_123",
    });
  });

  it("stringifies booleans and numbers using the app's plain query semantics", () => {
    expect(
      stringifyTanStackSearch({
        freeView: true,
        rot: 10,
        threadId: "thread_123",
      }),
    ).toBe("?freeView&rot=10&threadId=thread_123");
  });

  it("serializes known presence flags by key presence", () => {
    expect(
      stringifyTanStackSearch({
        "create-account": true,
        delete: "noter-md/noter",
        dev: false,
        diff: 0,
        freeView: "false",
        openedByCli: null,
        "sign-in": true,
      }),
    ).toBe("?create-account&delete&dev&diff&freeView&sign-in");
  });

  it("builds paths with normalized app search and hash strings", () => {
    expect(
      buildPathWithTanStackSearch({
        pathname: "/logo",
        search: {
          dev: true,
          rot: "10",
        },
        hash: "top",
      }),
    ).toBe("/logo?dev&rot=10#top");
  });

  it("treats reset as a visible one-param sentinel", () => {
    expect(parseTanStackSearch("?reset=false&primary=red-600&rot=10")).toEqual({
      reset: "",
    });

    expect(
      stringifyTanStackSearch({
        primary: "red-600",
        reset: true,
        rot: 10,
      }),
    ).toBe("?reset");

    expect(stringifyTanStackSearch({ reset: "" })).toBe("?reset");

    expect(
      stringifyTanStackSearch({
        primary: "red-600",
        reset: "false",
      }),
    ).toBe("?reset");

    expect(
      stringifyTanStackSearch({
        primary: "red-600",
        reset: null,
      }),
    ).toBe("?primary=red-600");
  });

  it("ignores inherited reset sentinels", () => {
    const search = { primary: "red-600" };
    Object.setPrototypeOf(search, { reset: true });

    expect(stringifyTanStackSearch(search)).toBe("?primary=red-600");
  });
});
