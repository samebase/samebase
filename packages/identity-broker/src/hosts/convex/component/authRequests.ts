// Generated from src/store/commands.ts by src/hosts/convex/functions.test.ts.
import { commandMutation, commandQuery } from "../functions.ts";

export const create = commandMutation("authRequests.create");
export const get = commandQuery("authRequests.get");
export const startUpstream = commandMutation("authRequests.startUpstream");
export const claimUpstream = commandMutation("authRequests.claimUpstream");
export const complete = commandMutation("authRequests.complete");
export const abandon = commandMutation("authRequests.abandon");
export const exchangeCode = commandMutation("authRequests.exchangeCode");
