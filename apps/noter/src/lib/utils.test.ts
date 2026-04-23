import { describe, expect, it, vi } from "vite-plus/test";

import { preventDefaultIfCancelable } from "./utils";

describe("preventDefaultIfCancelable", () => {
  it("prevents the default action for cancelable events", () => {
    const preventDefault = vi.fn();

    preventDefaultIfCancelable({
      cancelable: true,
      preventDefault,
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("leaves non-cancelable events alone", () => {
    const preventDefault = vi.fn();

    preventDefaultIfCancelable({
      cancelable: false,
      preventDefault,
    });

    expect(preventDefault).not.toHaveBeenCalled();
  });
});
