export type Deployment = {
  type: 'dev' | 'prod' | 'preview'
  name: string
  raw: string
}

export type EnvEntry = {
  name: string
  value: string
}

export function extractMatchingDeploymentDeployKey(args: {
  rawDeployKey: string | undefined
  sourceDeployment: Deployment
}): string | null

export function buildCloudDeploymentUrl(deploymentName: string): string

export function normalizeEnvQueryResult(value: unknown): EnvEntry[]
