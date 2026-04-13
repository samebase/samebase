import { createServer } from "node:net";

import { describe, expect, it } from "vitest";

import {
  buildPrimaryDevArgs,
  buildPrimaryDevEnvironment,
} from "./run-primary-dev.ts";

const reserveFreePort = async (): Promise<string> =>
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => {
          reject(new Error("Expected an ephemeral TCP port."));
        });
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(String(address.port));
      });
    });
  });

describe("run-primary-dev", () => {
  it("pins VITE_PORT and DEV_ENV_ORIGIN together when the origin is missing", async () => {
    const freePort = await reserveFreePort();

    expect(buildPrimaryDevEnvironment({ VITE_PORT: freePort })).toMatchObject({
      DEV_ENV_ORIGIN: `http://localhost:${freePort}`,
      VITE_PORT: freePort,
    });
  });

  it("backfills VITE_PORT from an explicit localhost origin when needed", () => {
    expect(
      buildPrimaryDevEnvironment({
        DEV_ENV_ORIGIN: "http://localhost:43121",
      }),
    ).toMatchObject({
      DEV_ENV_ORIGIN: "http://localhost:43121",
      VITE_PORT: "43121",
    });
  });

  it("leaves explicit non-local origins alone", () => {
    expect(
      buildPrimaryDevEnvironment({
        DEV_ENV_ORIGIN: "https://preview.noter.md",
      }),
    ).toEqual({
      DEV_ENV_ORIGIN: "https://preview.noter.md",
    });
  });

  it("forwards extra arguments to Vite+ task running", () => {
    expect(buildPrimaryDevArgs(["--", "--continue"])).toEqual([
      "exec",
      "vp",
      "run",
      "--filter=noter",
      "dev",
      "--",
      "--continue",
    ]);
  });
});
