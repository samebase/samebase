import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

/** One client at the identity hub with who made it, as the moderation actions answer it. */
export type HubClient = Extract<
  FunctionReturnType<typeof api.hubClients.moderation.readOverview>,
  { status: "on" }
>["clientList"]["clients"][number];

export const formatTime = (time: number) => new Date(time).toLocaleString();

export const ownerOf = (client: HubClient) => client.registeredBy.githubRepository.split("/")[0];
