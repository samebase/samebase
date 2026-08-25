/// <reference types="node" />
import process from "node:process";

process.env["CONVEX_AGENT_MODE"] = "anonymous";
await import("./run-dev.ts");
