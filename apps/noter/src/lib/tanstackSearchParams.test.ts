import { describe, expect, it } from "vite-plus/test";
import {
  buildPathWithTanStackSearch,
  parseTanStackSearch,
  stringifyTanStackSearch,
} from "@/lib/tanstackSearchParams";

describe("tanstackSearchParams", () => {
  it("parses plain query strings without JSON coercion", () => {
    expect(parseTanStackSearch("?freeView&rot=10&threadId=thread_123")).toEqual(
      {
        freeView: "",
        rot: "10",
        threadId: "thread_123",
      },
    );
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
});
