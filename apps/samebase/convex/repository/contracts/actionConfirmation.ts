import { v, type Infer } from "convex/values";

const { literal, number, object, string } = v;

/**
The `confirmation` argument of a gated action (rfcs/125): the token and the exact acknowledgement
sentence from the needs_confirmation result of the first call.
*/
export const vActionConfirmation = object({
  token: string(),
  acknowledgement: string(),
});
export type ActionConfirmation = Infer<typeof vActionConfirmation>;

/**
The result of a gated action called without `confirmation`. Nothing changed. `effect` and
`acknowledgement` are server-owned text; the token is one-use and valid until `expiresAt`.
*/
export const vActionConfirmationRequest = object({
  state: literal("needs_confirmation"),
  effect: string(),
  acknowledgement: string(),
  token: string(),
  expiresAt: number(),
});
export type ActionConfirmationRequest = Infer<typeof vActionConfirmationRequest>;

/** The paragraph that the docs of the four gated actions share. */
export const ACTION_CONFIRMATION_DOC = `Samebase confirms this action on the server, for the dashboard and MCP alike. A call without
\`confirmation\` changes nothing and returns \`needs_confirmation\` with the effect in plain words,
the exact acknowledgement sentence, and a one-use token that expires after 10 minutes. The token is
bound to the user, the client that received it, the action, and the request after Samebase resolves
names and defaults. The second call sends the same arguments and \`confirmation\` with the token and
the exact sentence from the same client; a changed argument, a used or expired token, another
client, or another sentence is rejected and changes nothing.
Samebase records each accepted confirmation in its audit log.`;

export const MCP_ACTION_CONFIRMATION_DESCRIPTION =
  "The first call changes nothing and returns needs_confirmation with the effect, an acknowledgement sentence, and a token. After the user approves the effect, call again with the same arguments and confirmation: the token and the exact sentence.";

export const MCP_ACTION_CONFIRMATION_INPUT_DESCRIPTION =
  "Omit it on the first call. After the user approves the effect in the needs_confirmation result, pass its token and its exact acknowledgement sentence.";
