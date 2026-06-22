import { describe, expect, it } from "vite-plus/test";
import { bytesToBase64, utf8ToBase64 } from "./base64";

describe("base64", () => {
  it("encodes bytes", () => {
    expect(bytesToBase64(new Uint8Array([72, 105]))).toBe("SGk=");
  });

  it("encodes UTF-8 text", () => {
    expect(utf8ToBase64("samebase:ă")).toBe("c2FtZWJhc2U6xIM=");
  });
});
