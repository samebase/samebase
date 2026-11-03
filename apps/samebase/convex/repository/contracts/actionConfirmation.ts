import { v, type Infer } from "convex/values";

const { literal, object, string, union } = v;

/** Where a gated call came from. It sets the wording of the acknowledgement sentence. */
export const vActionConfirmationSurface = union(literal("dashboard"), literal("mcp"));
export type ActionConfirmationSurface = Infer<typeof vActionConfirmationSurface>;

/**
The `confirmation` argument of a gated action (rfcs/125): the exact acknowledgement sentence from
the needs_confirmation result of the first call.
*/
export const vActionConfirmation = object({
  acknowledgement: string(),
});
export type ActionConfirmation = Infer<typeof vActionConfirmation>;

/**
The result of a gated action called without `confirmation`. Nothing changed. `effect` and
`acknowledgement` are server-owned text.
*/
export const vActionConfirmationRequest = object({
  state: literal("needs_confirmation"),
  effect: string(),
  acknowledgement: string(),
});
export type ActionConfirmationRequest = Infer<typeof vActionConfirmationRequest>;

/** The paragraph that the docs of the gated actions share. */
export const ACTION_CONFIRMATION_DOC = `Samebase confirms this action on the server, for the dashboard and MCP alike. A call without
\`confirmation\` changes nothing and returns \`needs_confirmation\` with the effect in plain words and
the exact acknowledgement sentence, which names the repository. The second call sends the same
arguments and \`confirmation\` with that exact sentence; any other sentence is rejected and changes
nothing.`;

export const MCP_ACTION_CONFIRMATION_DESCRIPTION =
  "The first call changes nothing and returns needs_confirmation with the effect and an acknowledgement sentence. After the user approves the effect, call again with the same arguments and confirmation: the exact sentence.";

export const MCP_ACTION_CONFIRMATION_INPUT_DESCRIPTION =
  "Omit it on the first call. After the user approves the effect in the needs_confirmation result, pass its exact acknowledgement sentence.";
