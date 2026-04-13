type Deployment = {
  type: "dev" | "prod" | "preview";
  name: string;
  raw: string;
};

type EnvEntry = {
  name: string;
  value: string;
};

/**
 * Return the deploy key only when it targets the exact source deployment.
 */
export function extractMatchingDeploymentDeployKey({
  rawDeployKey,
  sourceDeployment,
}: {
  rawDeployKey: string | undefined;
  sourceDeployment: Deployment;
}): string | null {
  const normalizedDeployKey = rawDeployKey?.trim() ?? "";
  if (normalizedDeployKey.length === 0) {
    return null;
  }

  const separatorIndex = normalizedDeployKey.indexOf("|");
  if (
    separatorIndex <= 0 ||
    separatorIndex === normalizedDeployKey.length - 1
  ) {
    return null;
  }

  const deploymentSpecifier = normalizedDeployKey
    .slice(0, separatorIndex)
    .trim();
  const deployKeyDeployment = parseDeploymentSpecifier(deploymentSpecifier);
  if (deployKeyDeployment === null) {
    return null;
  }

  if (
    deployKeyDeployment.type !== sourceDeployment.type ||
    deployKeyDeployment.name !== sourceDeployment.name
  ) {
    return null;
  }

  return normalizedDeployKey;
}

export function buildCloudDeploymentUrl(deploymentName: string): string {
  const normalizedName = deploymentName.trim();
  if (normalizedName.length === 0) {
    throw new Error("Deployment name is required to build a Convex cloud URL.");
  }
  return `https://${normalizedName}.convex.cloud`;
}

export function normalizeEnvQueryResult(value: unknown): EnvEntry[] {
  if (!Array.isArray(value)) {
    throw new Error("Convex environment query returned an unexpected payload.");
  }

  const entries: EnvEntry[] = [];
  for (const item of value) {
    if (!isEnvEntry(item)) {
      throw new Error("Convex environment query returned invalid entries.");
    }
    entries.push({ name: item.name, value: item.value });
  }
  return entries;
}

function parseDeploymentSpecifier(rawDeployment: string): Deployment | null {
  const normalizedDeployment = rawDeployment.trim();
  if (normalizedDeployment.length === 0) {
    return null;
  }

  const separatorIndex = normalizedDeployment.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const deploymentType = normalizedDeployment.slice(0, separatorIndex).trim();
  const deploymentName = normalizedDeployment.slice(separatorIndex + 1).trim();
  if (deploymentName.length === 0) {
    return null;
  }

  if (
    deploymentType !== "dev" &&
    deploymentType !== "prod" &&
    deploymentType !== "preview"
  ) {
    return null;
  }

  return {
    type: deploymentType,
    name: deploymentName,
    raw: normalizedDeployment,
  };
}

function isEnvEntry(value: unknown): value is EnvEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  if (!("name" in value) || !("value" in value)) {
    return false;
  }

  return typeof value.name === "string" && typeof value.value === "string";
}
