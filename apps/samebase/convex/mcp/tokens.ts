import { createCodeChallenge, randomToken } from "../oauthUtils";
export { isAgentBrowserHandoffTokenValue } from "../../shared/agentBrowserHandoff";

export const MCP_AUTHORIZATION_CODE_TTL_MS = 10 * 60 * 1000;
export const MCP_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
export const MCP_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const AGENT_BROWSER_HANDOFF_TTL_MS = 5 * 60 * 1000;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createOpaqueToken(prefix: string): string {
  return `${prefix}_${randomToken(32)}`;
}

export function createAuthorizationCodeValue(): string {
  return createOpaqueToken("mcpac");
}

export function createAccessTokenValue(): string {
  return createOpaqueToken("mcpat");
}

export function createRefreshTokenValue(): string {
  return createOpaqueToken("mcprt");
}

export function createAgentBrowserHandoffTokenValue(): string {
  return createOpaqueToken("agbh");
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyPkceS256(args: {
  codeVerifier: string;
  expectedCodeChallenge: string;
}): Promise<boolean> {
  const actualChallenge = await createCodeChallenge(args.codeVerifier);
  return actualChallenge === args.expectedCodeChallenge;
}
