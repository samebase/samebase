// @vitest-environment jsdom

import { createContext, Script } from "node:vm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { stripPolarCustomerSessionTokenBeforeHydration } from "@/lib/polarCheckoutReturnPrehydration";
import { buildRootHead } from "@/lib/rootHead";

function runPolarCheckoutReturnPrehydrationScript() {
  const prehydrationScript = buildRootHead().scripts.find((script) =>
    script.children.includes("customer_session_token"),
  );
  if (typeof prehydrationScript === "undefined") {
    throw new Error("The Polar checkout return prehydration script is missing from the root head.");
  }

  new Script(prehydrationScript.children).runInContext(
    createContext({
      URL,
      window,
    }),
  );
}

describe("Polar checkout return prehydration", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("removes the customer session token while checkout confirmation stays visible", () => {
    window.history.replaceState(
      { tanstack: "state" },
      "",
      "/settings?checkout=success&customer_session_token=private-value&devtools#billing",
    );
    const historyLength = window.history.length;

    runPolarCheckoutReturnPrehydrationScript();

    expect(window.location.href).toBe(
      "http://localhost:3000/settings?checkout=success&devtools#billing",
    );
    expect(window.history.state).toEqual({ tanstack: "state" });
    expect(window.history.length).toBe(historyLength);
  });

  it("removes every customer session token without changing unrelated values", () => {
    window.history.replaceState(
      null,
      "",
      "/settings/?delete-account&customer_session_token=first&customer_session_token=second",
    );

    runPolarCheckoutReturnPrehydrationScript();

    expect(window.location.href).toBe("http://localhost:3000/settings/?delete-account");
  });

  it("does not change the same query key on another route", () => {
    window.history.replaceState(null, "", "/vault?customer_session_token=unrelated");

    runPolarCheckoutReturnPrehydrationScript();

    expect(window.location.href).toBe(
      "http://localhost:3000/vault?customer_session_token=unrelated",
    );
  });

  it("lets the client fallback clean a checkout return before hydration", () => {
    window.history.replaceState(
      null,
      "",
      "/settings?customer_session_token=private-value&checkout=success",
    );

    stripPolarCustomerSessionTokenBeforeHydration();

    expect(window.location.href).toBe("http://localhost:3000/settings?checkout=success");
  });
});
