import type { Infer } from "convex/values";

import type { CloudflareWorkerDiscoveryItem } from "../cloudflareResources";
import type { vCloudflareWorkerDiscovery } from "./contracts/cloudflareAttachments";

/**
Decides the attachment status that the dashboard and MCP both show for one Worker observed in the
repository's Cloudflare account. A Worker recorded on this Samebase app is attached whatever
Cloudflare reports now.
*/
export function toCloudflareWorkerDiscovery(
  worker: CloudflareWorkerDiscoveryItem,
  attachedWorkerTags: ReadonlySet<string>,
): Infer<typeof vCloudflareWorkerDiscovery> {
  if (attachedWorkerTags.has(worker.workerTag)) {
    return { attachment: "attached", workerName: worker.workerName, workerTag: worker.workerTag };
  }

  switch (worker.repository.state) {
    case "ready":
      return {
        attachment: "attachable",
        workerName: worker.workerName,
        workerTag: worker.workerTag,
        rootDirectory: worker.repository.rootDirectory,
      };
    case "not_connected":
      return {
        attachment: "connectable",
        workerName: worker.workerName,
        workerTag: worker.workerTag,
      };
    case "connected_elsewhere":
      return {
        attachment: "connected_elsewhere",
        workerName: worker.workerName,
        workerTag: worker.workerTag,
      };
    case "ambiguous":
    case "failed":
      return {
        attachment: "unavailable",
        workerName: worker.workerName,
        workerTag: worker.workerTag,
      };
    default:
      worker.repository satisfies never;
      throw new Error("Unsupported Cloudflare Worker repository state.");
  }
}
