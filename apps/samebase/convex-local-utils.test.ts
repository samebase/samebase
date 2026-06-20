import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  readConfiguredLocalDevPort,
  readEnvFile,
  resolveSiteUrlSyncOrigin,
  usesLocalConvexDeployment,
} from "./scripts/convex-local-utils.ts";

const temporaryDirectories: string[] = [];

const createTempWorkspace = () => {
  const cwd = mkdtempSync(join(tmpdir(), "noter-convex-local-utils-"));
  temporaryDirectories.push(cwd);
  return cwd;
};

const writeEnvFile = (cwd: string, contents: string) => {
  writeFileSync(join(cwd, ".env.local"), contents, "utf8");
};

const reserveFreePort = async () =>
  await new Promise<number>((resolve, reject) => {
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
        resolve(address.port);
      });
    });
  });

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const cwd = temporaryDirectories.pop();
    if (!cwd) {
      continue;
    }
    rmSync(cwd, { force: true, recursive: true });
  }
});

describe("convex local utils", () => {
  it("normalizes quoted env file values when reading .env.local", () => {
    const cwd = createTempWorkspace();
    writeEnvFile(
      cwd,
      `VITE_PORT="5174"
CONVEX_URL='http://127.0.0.1:3210'
EMPTY_VALUE=""
`,
    );

    expect(readEnvFile(cwd)).toEqual({
      CONVEX_URL: "http://127.0.0.1:3210",
      EMPTY_VALUE: "",
      VITE_PORT: "5174",
    });
  });

  it("treats quoted localhost Convex URLs as local deployments", () => {
    const cwd = createTempWorkspace();
    writeEnvFile(cwd, `CONVEX_URL="http://localhost:3210"\n`);

    expect(usesLocalConvexDeployment(cwd)).toBe(true);
  });

  it("requires an explicit origin before syncing SITE_URL to a shared deployment", () => {
    const cwd = createTempWorkspace();
    writeEnvFile(cwd, `CONVEX_URL="https://team-noter.convex.cloud"\n`);

    expect(() => resolveSiteUrlSyncOrigin({}, cwd)).toThrow(
      "DEV_ENV_ORIGIN is required unless the Convex deployment points at localhost.",
    );
  });

  it("keeps explicit origins for shared deployments", () => {
    const cwd = createTempWorkspace();
    writeEnvFile(cwd, `CONVEX_URL="https://team-noter.convex.cloud"\n`);

    expect(
      resolveSiteUrlSyncOrigin(
        {
          DEV_ENV_ORIGIN: `"https://preview.noter.md"`,
        },
        cwd,
      ),
    ).toBe("https://preview.noter.md");
  });

  it("falls back to the chosen localhost port for local deployments", async () => {
    const cwd = createTempWorkspace();
    const freePort = await reserveFreePort();
    writeEnvFile(cwd, `CONVEX_URL="http://127.0.0.1:3210"\n`);

    expect(
      resolveSiteUrlSyncOrigin(
        {
          VITE_PORT: `'${freePort}'`,
        },
        cwd,
      ),
    ).toBe(`http://localhost:${freePort}`);
  });

  it("normalizes configured VITE ports from process env values", () => {
    expect(
      readConfiguredLocalDevPort({
        VITE_PORT: "'43121'",
      }),
    ).toBe("43121");
    expect(readConfiguredLocalDevPort({ VITE_PORT: "0" })).toBeNull();
  });
});
