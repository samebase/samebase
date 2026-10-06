import { describe, expect, it } from "vite-plus/test";

import type { Id } from "../_generated/dataModel";
import {
  isSamebaseManagedProviderPlan,
  readRepositoryProvisioningMode,
  REPOSITORY_ACTIONS_OWN_PROVIDERS_MESSAGE,
  requireSamebaseProvisioningPlan,
  type RepositoryProvisioningPlan,
} from "./provisioningPlan";

function fakeRepositoryId(value: string): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; these pure rules never read them.
  return value;
}

function fakePlanId(value: string): Id<"workflow_repositoryProvisioning_plans"> {
  // @ts-expect-error Convex ids are strings at runtime; these pure rules never read them.
  return value;
}

const repositoryId = fakeRepositoryId("k57a3m9x2p8q4r6t1v0w5y7z3b8c2d4e");

const samebasePlan = {
  _id: fakePlanId("j97b4n2c8x5v1m3k6p9q0r7s2t4u8w1y"),
  _creationTime: 1,
  repositoryId,
  convexConfigPath: "convex.json",
  convex: { state: "planned", projectName: "app", deploymentRegion: "aws-us-east-1" },
  cloudflare: { state: "planned", workerName: "app", rootDirectory: "/", buildTokenUuid: null },
  createdAt: 1,
  updatedAt: 1,
} satisfies RepositoryProvisioningPlan;

const repositoryActionsPlan = {
  _id: fakePlanId("j97b4n2c8x5v1m3k6p9q0r7s2t4u8w2z"),
  _creationTime: 1,
  provisioning: "repository_actions",
  repositoryId,
  convexConfigPath: "convex.json",
  ciSecrets: { state: "planned" },
  createdAt: 1,
  updatedAt: 1,
} satisfies RepositoryProvisioningPlan;

describe("repository provisioning mode", () => {
  it("reads a plan without the provisioning field as samebase", () => {
    expect(readRepositoryProvisioningMode(samebasePlan)).toBe("samebase");
    expect(readRepositoryProvisioningMode(repositoryActionsPlan)).toBe("repository_actions");
  });

  it("reads the dashboard projection with the same rule", () => {
    const projection = {
      provisioning: "repository_actions",
      convexConfigPath: "convex.json",
      ciSecrets: { state: "written", writtenAt: 2, credentialRevision: 1 },
    } as const;

    expect(readRepositoryProvisioningMode(projection)).toBe("repository_actions");
    expect(isSamebaseManagedProviderPlan(projection)).toBe(false);
    expect(isSamebaseManagedProviderPlan(null)).toBe(false);
  });

  it("refuses the samebase-only steps for a repository_actions plan", () => {
    expect(requireSamebaseProvisioningPlan(samebasePlan)).toBe(samebasePlan);
    expect(() => requireSamebaseProvisioningPlan(repositoryActionsPlan)).toThrow(
      REPOSITORY_ACTIONS_OWN_PROVIDERS_MESSAGE,
    );
  });
});
