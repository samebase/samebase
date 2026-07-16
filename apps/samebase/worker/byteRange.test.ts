import { describe, expect, it } from "vite-plus/test";
import { parseByteRangeSpec, resolveByteRange, sliceByteRangeStream } from "./byteRange";

const contentLength = 10_487_434;

const decide = (rangeHeader: string, size = contentLength) =>
  resolveByteRange(parseByteRangeSpec(rangeHeader), size);

describe("byte range parsing", () => {
  it("supports the range shapes used by Chromium, Firefox, and WebKit", () => {
    expect(decide("bytes=0-")).toEqual({ kind: "range", start: 0, end: 10_487_433 });
    expect(decide("bytes=0-1")).toEqual({ kind: "range", start: 0, end: 1 });
    expect(decide("bytes=3506176-")).toEqual({
      kind: "range",
      start: 3_506_176,
      end: 10_487_433,
    });
    expect(decide("bytes=3473408-3538943")).toEqual({
      kind: "range",
      start: 3_473_408,
      end: 3_538_943,
    });
  });

  it("supports suffixes and clamps large valid values", () => {
    expect(decide("bytes=-32")).toEqual({
      kind: "range",
      start: 10_487_402,
      end: 10_487_433,
    });
    expect(decide("bytes=-999999999999999999999")).toEqual({
      kind: "range",
      start: 0,
      end: 10_487_433,
    });
    expect(decide("bytes=0-999999999999999999999")).toEqual({
      kind: "range",
      start: 0,
      end: 10_487_433,
    });
  });

  it("accepts case-insensitive units and optional whitespace", () => {
    expect(decide("Bytes= 0-1")).toEqual({ kind: "range", start: 0, end: 1 });
  });

  it("distinguishes unsatisfiable ranges from syntax to ignore", () => {
    expect(decide("bytes=10487434-")).toEqual({ kind: "unsatisfiable" });
    expect(decide("bytes=999999999999999999999-")).toEqual({ kind: "unsatisfiable" });
    expect(decide("bytes=-0")).toEqual({ kind: "unsatisfiable" });
    expect(decide("bytes=5-4")).toEqual({ kind: "ignore" });
    expect(decide("items=0-1")).toEqual({ kind: "ignore" });
    expect(decide("bytes=0-1,3-4")).toEqual({ kind: "ignore" });
    expect(decide("nope")).toEqual({ kind: "ignore" });
    expect(decide(`bytes=0-${"9".repeat(300)}`)).toEqual({ kind: "ignore" });
  });

  it("treats a valid range on an empty representation as unsatisfiable", () => {
    expect(decide("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" });
  });
});

describe("byte range streaming", () => {
  it("returns only the requested bytes across source chunks", async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([0, 1, 2, 3]));
        controller.enqueue(Uint8Array.from([4, 5, 6, 7]));
        controller.enqueue(Uint8Array.from([8, 9, 10, 11]));
        controller.close();
      },
    });

    const body = await new Response(sliceByteRangeStream(source, 2, 8)).arrayBuffer();
    expect([...new Uint8Array(body)]).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });
});
