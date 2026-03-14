import { describe, expect, it } from "vitest";
import {
  createWorkspaceTerminalState,
  getWorkspaceTerminalHelperText,
  getWorkspaceTerminalTitle,
  listOpenWorkspaceTerminalKinds,
  reduceWorkspaceTerminalState,
} from "@/lib/daytonaWorkspaceTerminalTabs";

describe("daytonaWorkspaceTerminalTabs", () => {
  it("opens sessions in the fixed tab order", () => {
    const initialState = createWorkspaceTerminalState<string>();
    const withDevServer = reduceWorkspaceTerminalState(initialState, {
      type: "opened",
      kind: "dev_server",
      session: "dev",
    });
    const withShellAndDevServer = reduceWorkspaceTerminalState(withDevServer, {
      type: "opened",
      kind: "shell",
      session: "shell",
    });

    expect(
      listOpenWorkspaceTerminalKinds(withShellAndDevServer.sessions),
    ).toEqual(["shell", "dev_server"]);
    expect(withShellAndDevServer.activeKind).toBe("shell");
  });

  it("falls back to the remaining tab when the active tab closes", () => {
    const withShell = reduceWorkspaceTerminalState(
      createWorkspaceTerminalState<string>(),
      {
        type: "opened",
        kind: "shell",
        session: "shell",
      },
    );
    const withBoth = reduceWorkspaceTerminalState(withShell, {
      type: "opened",
      kind: "dev_server",
      session: "dev",
    });
    const afterClose = reduceWorkspaceTerminalState(withBoth, {
      type: "closed",
      kind: "dev_server",
    });

    expect(afterClose.activeKind).toBe("shell");
    expect(listOpenWorkspaceTerminalKinds(afterClose.sessions)).toEqual([
      "shell",
    ]);
  });

  it("does not activate a tab that is not open", () => {
    const initialState = createWorkspaceTerminalState<string>();
    const nextState = reduceWorkspaceTerminalState(initialState, {
      type: "activated",
      kind: "shell",
    });

    expect(nextState).toEqual(initialState);
  });

  it("resets all tabs at once", () => {
    const withShell = reduceWorkspaceTerminalState(
      createWorkspaceTerminalState<string>(),
      {
        type: "opened",
        kind: "shell",
        session: "shell",
      },
    );
    const withBoth = reduceWorkspaceTerminalState(withShell, {
      type: "opened",
      kind: "dev_server",
      session: "dev",
    });
    const resetState = reduceWorkspaceTerminalState(withBoth, {
      type: "reset",
    });

    expect(resetState).toEqual(createWorkspaceTerminalState<string>());
  });

  it("returns stable labels for each terminal kind", () => {
    expect(getWorkspaceTerminalTitle("shell")).toBe("Shell");
    expect(getWorkspaceTerminalTitle("dev_server")).toBe("Dev Server");
    expect(getWorkspaceTerminalHelperText("shell")).toContain("Open in tab");
    expect(getWorkspaceTerminalHelperText("dev_server")).toContain(
      "temporarily writable",
    );
  });
});
