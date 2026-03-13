export type AnonymousLocalPortPair = {
  cloud: number
  site: number
}

export declare const ANONYMOUS_LOCAL_CLOUD_PORT_START: number
export declare const ANONYMOUS_LOCAL_PORT_PAIR_COUNT: number

export declare function listAnonymousLocalPortCandidates(
  worktreeRoot: string,
): AnonymousLocalPortPair[]

export declare function pickAvailableAnonymousLocalPorts(
  worktreeRoot: string,
  isPortInUse: (port: number) => boolean,
): AnonymousLocalPortPair | null
