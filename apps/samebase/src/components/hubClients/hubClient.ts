import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

/** One client at the identity hub with who made it, as the moderation actions answer it. */
export type HubClient = Extract<
  FunctionReturnType<typeof api.hubClients.moderation.readOverview>,
  { status: "on" }
>["clientList"]["clients"][number];

export const formatTime = (time: number) => new Date(time).toLocaleString();

export const ownerOf = (client: HubClient) => client.registeredBy.githubRepository.split("/")[0];

/**
The id of a client's app for its connector grants and its sign-in page exemption: an app is a
repository plus an exact name, so a preview or development client's storage group
(`gh-<repository>-<name hash>-preview`) maps to its production group's id. The broker keys and
checks the rows the same way (`moderationIdOf` in packages/identity-broker/src/component/apps.ts);
this one only picks the row to show and the id to send.
*/
export const moderationIdOf = (client: HubClient) =>
  /^(gh-[1-9][0-9]*-[0-9a-f]{32})-preview$/.exec(client.appId)?.[1] ?? client.appId;
