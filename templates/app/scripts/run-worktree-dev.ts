// Samebase starter dev launcher sha256:14d3bb06df585e94d2112a747d3bed088952e3da8a951f63750057d4034d9788
// Samebase source build: v1989
// Shared starter infrastructure. Read AGENTS.md before changing this file.
/// <reference types="node" />
import process from "node:process";

import { runPrimaryDev } from "./run-primary-dev.ts";

process.env["CONVEX_AGENT_MODE"] = "anonymous";
runPrimaryDev();
