function quoteForShell(input: string): string {
  return `'${input.replace(/'/g, `'\\''`)}'`;
}

export const DAYTONA_DEV_SERVER_TMUX_SESSION = "noter-dev-server";
export const DAYTONA_SHELL_TMUX_SESSION = "noter-shell";

export function buildCreateOrAttachShellTmuxCommand(args: {
  cwd: string;
}): string {
  return `exec tmux new-session -A -s ${quoteForShell(
    DAYTONA_SHELL_TMUX_SESSION,
  )} -c ${quoteForShell(args.cwd)}`;
}

export function buildAttachDevServerTmuxCommand(): string {
  return `exec tmux attach-session -r -t ${quoteForShell(
    DAYTONA_DEV_SERVER_TMUX_SESSION,
  )}`;
}
