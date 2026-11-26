import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

/** One client at the identity broker with who made it, as the moderation actions answer it. */
export type BrokerClient = Extract<
  FunctionReturnType<typeof api.brokerClients.moderation.readOverview>,
  { status: "on" }
>["clientList"]["clients"][number];

export const formatTime = (time: number) => new Date(time).toLocaleString();

export const ownerOf = (client: BrokerClient) => client.registeredBy.githubRepository.split("/")[0];
