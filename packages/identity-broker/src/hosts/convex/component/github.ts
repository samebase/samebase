// Generated from src/store/commands.ts by scripts/generate-convex-functions.ts.
import { commandMutation, commandQuery } from "../functions.ts";

export const admit = commandMutation("github.admit");
export const createClient = commandMutation("github.createClient");
export const readInitialAccessToken = commandQuery("github.readInitialAccessToken");
export const createDevelopmentClient = commandMutation("github.createDevelopmentClient");
export const renew = commandMutation("github.renew");
export const remove = commandMutation("github.remove");
export const counts = commandQuery("github.counts");
export const blocks = commandQuery("github.blocks");
export const changeBlock = commandMutation("github.changeBlock");
export const signInPage = commandQuery("github.signInPage");
export const changeSignInPage = commandMutation("github.changeSignInPage");
export const connectorGrants = commandQuery("github.connectorGrants");
export const changeConnectorGrant = commandMutation("github.changeConnectorGrant");
export const clients = commandQuery("github.clients");
export const deleteClient = commandMutation("github.deleteClient");
