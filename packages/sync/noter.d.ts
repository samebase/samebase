import type { IncomingMessage, Server, ServerResponse } from 'node:http'

export const LOCAL_CODEX_CONTROL_HOST: '127.0.0.1'
export const LOCAL_CODEX_CONTROL_PORT: 0

export type CodexLocalControlProtocolMode = 'json-schema' | 'ts'

export interface CodexLocalControlRuntimeSnapshot {
  running: boolean
  initialized: boolean
  startedAt: number | null
  currentThreadId: string | null
  lastError: string | null
  lastExitCode: number | null
  lastExitSignal: NodeJS.Signals | null
  pendingRequestCount: number
  pendingApprovalCount: number
  eventCursor: number
}

export interface CodexLocalControlStatus {
  workspaceRoot: string
  codexInstalled: boolean
  codexVersion: string | null
  codexInstallError: string | null
  runtime: CodexLocalControlRuntimeSnapshot
  service?: {
    auth: {
      allowedOrigins: string[]
      enforced: boolean
      machineId: string | null
      mode: 'disabled' | 'machine-control'
      positiveCacheSize: number
    }
    loopbackOnly: boolean
    routeBasePath: string
  }
}

export interface CodexLocalControlProtocolRequest {
  mode: CodexLocalControlProtocolMode
  experimental: boolean
}

export interface CodexLocalControlRuntimeLike {
  getStatus(): Promise<CodexLocalControlStatus>
  ensureRuntime(forceRestart: boolean): Promise<unknown>
  stopRuntime(): Promise<unknown>
  listEvents(since: number): Promise<unknown>
  listRequests(): Promise<unknown>
  listThreads(searchParams: URLSearchParams): Promise<unknown>
  listLoadedThreads(searchParams: URLSearchParams): Promise<unknown>
  readThread(threadId: string): Promise<unknown>
  respondApproval(body: unknown): Promise<unknown>
  threadStart(body: unknown): Promise<unknown>
  threadResume(body: unknown): Promise<unknown>
  threadArchive(body: unknown): Promise<unknown>
  threadUnarchive(body: unknown): Promise<unknown>
  turnStart(body: unknown): Promise<unknown>
  turnInterrupt(body: unknown): Promise<unknown>
  generateProtocol(args: CodexLocalControlProtocolRequest): Promise<unknown>
}

export class CodexLocalControlRuntime implements CodexLocalControlRuntimeLike {
  constructor(workspaceRoot: string)
  readonly workspaceRoot: string
  getStatus(): Promise<CodexLocalControlStatus>
  ensureRuntime(forceRestart: boolean): Promise<unknown>
  stopRuntime(): Promise<unknown>
  listEvents(since: number): Promise<unknown>
  listRequests(): Promise<unknown>
  listThreads(searchParams: URLSearchParams): Promise<unknown>
  listLoadedThreads(searchParams: URLSearchParams): Promise<unknown>
  readThread(threadId: string): Promise<unknown>
  respondApproval(body: unknown): Promise<unknown>
  threadStart(body: unknown): Promise<unknown>
  threadResume(body: unknown): Promise<unknown>
  threadArchive(body: unknown): Promise<unknown>
  threadUnarchive(body: unknown): Promise<unknown>
  turnStart(body: unknown): Promise<unknown>
  turnInterrupt(body: unknown): Promise<unknown>
  generateProtocol(args: CodexLocalControlProtocolRequest): Promise<unknown>
}

export interface CodexLocalControlRouterArgs {
  loopbackOnly?: boolean
  machineControlAuth?: {
    allowedOrigins?: string[]
    introspectionUrl?: string
    machineId?: string
  }
  routeBasePath?: string
  runtime: CodexLocalControlRuntimeLike
  serviceStatus?: {
    loopbackOnly: boolean
  }
}

export type CodexLocalControlRouter = (
  req: IncomingMessage,
  res: ServerResponse,
  next?: () => void,
) => Promise<void>

export function createCodexLocalControlRouter(
  args: CodexLocalControlRouterArgs,
): CodexLocalControlRouter

export interface StartLocalCodexControlServerArgs {
  host?: string
  machineControlAuth?: {
    allowedOrigins?: string[]
    introspectionUrl?: string
    machineId?: string
  }
  port?: number
  routeBasePath?: string
  workspaceRoot?: string
}

export interface LocalCodexControlServerHandle {
  runtime: CodexLocalControlRuntime
  server: Server
  host: string
  port: number
  origin: string
  close(): Promise<void>
}

export function startLocalCodexControlServer(
  args?: StartLocalCodexControlServerArgs,
): Promise<LocalCodexControlServerHandle>
