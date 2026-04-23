import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UserConfig } from "vite";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function readBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

const devHost = process.env.NOTER_DEV_HOST?.trim() || undefined;
const devPortRaw = process.env.NOTER_DEV_PORT?.trim();
const parsedDevPort = devPortRaw ? Number(devPortRaw) : undefined;
const devPort =
  parsedDevPort !== undefined &&
  Number.isInteger(parsedDevPort) &&
  parsedDevPort >= 1 &&
  parsedDevPort <= 65_535
    ? parsedDevPort
    : undefined;
const devStrictPort = readBooleanEnv(process.env.NOTER_DEV_STRICT_PORT);

type StarterServerConfig = {
  host?: string;
  port?: number;
  strictPort?: boolean;
};

type StarterViteConfig = UserConfig & {
  fmt: {
    printWidth: number;
    proseWrap: "always";
  };
  lint: {
    options: {
      typeAware: true;
      typeCheck: true;
    };
  };
  staged: Record<string, string>;
  test: {
    passWithNoTests: true;
  };
};

const serverConfig = (() => {
  const server: StarterServerConfig = {};
  if (devHost) {
    server.host = devHost;
  }
  if (devPort !== undefined) {
    server.port = devPort;
  }
  if (devStrictPort !== undefined) {
    server.strictPort = devStrictPort;
  }
  return Object.keys(server).length > 0 ? server : undefined;
})();

const config: StarterViteConfig = {
  fmt: {
    printWidth: 80,
    proseWrap: "always",
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(currentDir, "./src"),
    },
  },
  server: serverConfig,
  staged: {
    "*.{cjs,css,cts,html,js,json,jsonc,jsonl,jsx,md,mjs,mts,ts,toml,tsx,yaml,yml}":
      "vp check --fix",
  },
  test: {
    passWithNoTests: true,
  },
};

export default config;
