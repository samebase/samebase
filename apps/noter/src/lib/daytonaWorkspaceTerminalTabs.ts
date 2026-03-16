export type WorkspaceTerminalKind = "shell" | "dev_server";

export type WorkspaceTerminalSessions<Session> = Partial<
  Record<WorkspaceTerminalKind, Session>
>;

export type WorkspaceTerminalState<Session> = {
  activeKind: WorkspaceTerminalKind | null;
  sessions: WorkspaceTerminalSessions<Session>;
};

export type WorkspaceTerminalAction<Session> =
  | {
      type: "opened";
      kind: WorkspaceTerminalKind;
      session: Session;
    }
  | {
      type: "activated";
      kind: WorkspaceTerminalKind;
    }
  | {
      type: "closed";
      kind: WorkspaceTerminalKind;
    }
  | {
      type: "reset";
    };

export const WORKSPACE_TERMINAL_KIND_ORDER = [
  "shell",
  "dev_server",
] as const satisfies readonly WorkspaceTerminalKind[];

export function createWorkspaceTerminalState<
  Session,
>(): WorkspaceTerminalState<Session> {
  return {
    activeKind: null,
    sessions: {},
  };
}

export function listOpenWorkspaceTerminalKinds<Session>(
  sessions: WorkspaceTerminalSessions<Session>,
): WorkspaceTerminalKind[] {
  return WORKSPACE_TERMINAL_KIND_ORDER.filter((kind) =>
    Object.hasOwn(sessions, kind),
  );
}

export function getWorkspaceTerminalTitle(kind: WorkspaceTerminalKind): string {
  return kind === "shell" ? "Shell" : "Dev Server";
}

export function getWorkspaceTerminalHelperText(
  kind: WorkspaceTerminalKind,
): string {
  return kind === "dev_server"
    ? "The dev server tab is read-only and reattaches to the sandbox tmux session."
    : "The shell tab reattaches to the sandbox tmux session. Use “Open External Terminal” if the embedded PTY hits a Daytona or browser edge case.";
}

export function reduceWorkspaceTerminalState<Session>(
  state: WorkspaceTerminalState<Session>,
  action: WorkspaceTerminalAction<Session>,
): WorkspaceTerminalState<Session> {
  if (action.type === "reset") {
    return createWorkspaceTerminalState<Session>();
  }

  if (action.type === "opened") {
    return {
      activeKind: action.kind,
      sessions: {
        ...state.sessions,
        [action.kind]: action.session,
      },
    };
  }

  if (action.type === "activated") {
    if (!Object.hasOwn(state.sessions, action.kind)) {
      return state;
    }
    return {
      ...state,
      activeKind: action.kind,
    };
  }

  if (!Object.hasOwn(state.sessions, action.kind)) {
    return state;
  }

  const nextSessions = { ...state.sessions };
  delete nextSessions[action.kind];
  const nextKinds = listOpenWorkspaceTerminalKinds(nextSessions);

  return {
    activeKind:
      state.activeKind === action.kind
        ? nextKinds[0] ?? null
        : state.activeKind,
    sessions: nextSessions,
  };
}
