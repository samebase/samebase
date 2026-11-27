// Generated from src/store/commands.ts by scripts/generate-convex-functions.ts.
import { commandMutation, commandQuery } from "../functions.ts";

export const begin = commandMutation("cimd.begin");
export const put = commandMutation("cimd.put");
export const remove = commandMutation("cimd.remove");
export const blockHost = commandMutation("cimd.blockHost");
export const unblockHost = commandMutation("cimd.unblockHost");
export const hostBlocks = commandQuery("cimd.hostBlocks");
export const clients = commandQuery("cimd.clients");
