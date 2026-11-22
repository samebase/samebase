// Generated from src/store/commands.ts by scripts/generate-convex-functions.ts.
import { commandMutation, commandQuery } from "../functions.ts";

export const create = commandMutation("connections.create");
export const claim = commandMutation("connections.claim");
export const complete = commandMutation("connections.complete");
export const abandon = commandMutation("connections.abandon");
export const exchangeCode = commandMutation("connections.exchangeCode");
export const admitRefresh = commandMutation("connections.admitRefresh");
export const authenticate = commandQuery("connections.authenticate");
export const cleanup = commandMutation("connections.cleanup");
