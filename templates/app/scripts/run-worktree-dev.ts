/// <reference types="node" />
import process from "node:process";

import { runDev } from "./run-dev.ts";

process.env["CONVEX_AGENT_MODE"] = "anonymous";
runDev();
