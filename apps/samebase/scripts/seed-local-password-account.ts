#!/usr/bin/env node
import path from "node:path";
import { makeFunctionReference } from "convex/server";
import { createLocalConvexAdminClient } from "./localConvexAdminClient.ts";

const localConfigPath = path.join(".convex", "local", "default", "config.json");
const client = await createLocalConvexAdminClient(localConfigPath);

const result = await client.action(
  makeFunctionReference<"action", Record<string, never>, unknown>("devAuth:seedPasswordAccount"),
  {},
);
console.log(JSON.stringify(result, null, 2));
