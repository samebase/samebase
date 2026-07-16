export type ByteRangeSpec =
  | { kind: "ignore" }
  | { kind: "range"; end: bigint | null; start: bigint }
  | { kind: "suffix"; length: bigint };

export type ByteRangeDecision =
  | { kind: "ignore" }
  | { kind: "range"; end: number; start: number }
  | { kind: "unsatisfiable" };

export const parseByteRangeSpec = (rangeHeader: string): ByteRangeSpec => {
  // Keep BigInt parsing bounded well above the size of real media ranges.
  if (rangeHeader.length > 256) {
    return { kind: "ignore" };
  }

  const match = /^bytes[ \t]*=[ \t]*(\d*)-(\d*)[ \t]*$/i.exec(rangeHeader.trim());
  const startText = match?.[1];
  const endText = match?.[2];

  if (startText === undefined || endText === undefined || (startText === "" && endText === "")) {
    return { kind: "ignore" };
  }

  if (startText === "") {
    return { kind: "suffix", length: BigInt(endText) };
  }

  const start = BigInt(startText);
  const end = endText === "" ? null : BigInt(endText);
  if (end !== null && end < start) {
    return { kind: "ignore" };
  }

  return {
    kind: "range",
    end,
    start,
  };
};

export const resolveByteRange = (spec: ByteRangeSpec, contentLength: number): ByteRangeDecision => {
  if (!Number.isSafeInteger(contentLength) || contentLength < 0 || spec.kind === "ignore") {
    return { kind: "ignore" };
  }

  const total = BigInt(contentLength);
  if (spec.kind === "suffix") {
    if (total === 0n || spec.length === 0n) {
      return { kind: "unsatisfiable" };
    }

    return {
      kind: "range",
      start: Number(spec.length >= total ? 0n : total - spec.length),
      end: contentLength - 1,
    };
  }

  if (total === 0n || spec.start >= total) {
    return { kind: "unsatisfiable" };
  }

  const end = spec.end === null || spec.end >= total ? total - 1n : spec.end;
  return { kind: "range", start: Number(spec.start), end: Number(end) };
};

export const sliceByteRangeStream = (
  source: ReadableStream<Uint8Array>,
  start: number,
  end: number,
): ReadableStream<Uint8Array> => {
  const reader = source.getReader();
  let sourceOffset = 0;
  let remaining = end - start + 1;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (remaining > 0) {
        const result = await reader.read();
        if (result.done) {
          controller.error(new Error("Static asset ended before the requested byte range"));
          return;
        }

        const chunkStart = sourceOffset;
        sourceOffset += result.value.byteLength;
        if (sourceOffset <= start) {
          continue;
        }

        const sliceStart = Math.max(start - chunkStart, 0);
        const sliceLength = Math.min(result.value.byteLength - sliceStart, remaining);
        controller.enqueue(result.value.subarray(sliceStart, sliceStart + sliceLength));
        remaining -= sliceLength;

        if (remaining === 0) {
          await reader.cancel();
          controller.close();
        }
        return;
      }
    },
    cancel(reason?: unknown) {
      return reader.cancel(reason);
    },
  });
};
