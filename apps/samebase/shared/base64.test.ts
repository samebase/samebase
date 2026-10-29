import { describe, expect, it } from "vite-plus/test";
import { base64ToBytes, bytesToBase64, bytesToBase64Url, utf8ToBase64 } from "./base64";

describe("base64", () => {
  it("encodes bytes", () => {
    expect(bytesToBase64(new Uint8Array([72, 105]))).toBe("SGk=");
  });

  it("encodes UTF-8 text", () => {
    expect(utf8ToBase64("samebase:ă")).toBe("c2FtZWJhc2U6xIM=");
  });

  it("round-trips bytes through the URL-safe alphabet without padding", () => {
    const bytes = new Uint8Array([251, 255, 191, 0]);

    expect(bytesToBase64Url(bytes)).toBe("-_-_AA");
    expect(base64ToBytes("-_-_AA")).toEqual(bytes);
    expect(base64ToBytes("+/+/AA==")).toEqual(bytes);
  });
});
