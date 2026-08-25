# Operate: Samebase agent plugin

The Samebase agent plugin packages the complete workflow around the Samebase MCP server: create or
connect an app, continue in its real GitHub repository, validate the source, then ship and observe
the provider result when publishing is requested.

The plugin supports Codex and Claude Code from one shared package. It carries workflow and routing
guidance. The live MCP tool list and the action contracts indexed by
[samebase.com/llms.txt](https://samebase.com/llms.txt) remain the source of truth for exact tools,
arguments, safety metadata, and results.

## Codex

Add the public [samebase/plugin](https://github.com/samebase/plugin) marketplace and install the
plugin. `samebase@samebase` means the `samebase` plugin from the `samebase` marketplace. It is not
an npm package name.

```sh
codex plugin marketplace add samebase/plugin
codex plugin add samebase@samebase
```

Start a new Codex task after installation so the workflow skill and the MCP server load. Complete
Samebase OAuth when Codex prompts for access.

If the skill loads but no Samebase actions appear, run `codex plugin marketplace upgrade samebase`,
then `codex plugin list --available --json`. Verify that version 0.2.26 is available. If the direct
`samebase@samebase` entry is installed and enabled, open Codex Plugins, uninstall only that entry,
and install it again. Complete the OAuth flow started by installation, fully restart Codex, start a
new task, and verify that version 0.2.26 is installed. If the CLI does not work, refresh the
Samebase marketplace and verify version 0.2.26 in Codex Plugins before reinstall. Do not open the
public Samebase site as an authorization or dashboard fallback. The agent can open the dashboard
only with the one-time URL returned by the Samebase browser-handoff action.

## Claude Code

Add the same public marketplace, install, and reload:

```text
/plugin marketplace add samebase/plugin
/plugin install samebase@samebase
/reload-plugins
```

Open `/mcp` to complete Samebase authentication if Claude Code prompts for it.

If actions are absent, inspect the local entry with `/plugin`, then run
`/plugin marketplace update samebase`, `/plugin update samebase@samebase`, and `/reload-plugins`.
Use `/mcp` only when the connection reports an authorization error. If actions remain absent after
reload, report that the MCP connection did not register and stop. Do not use Codex plugin state or
controls.

## Responsibility split

- The `samebase` skill selects the create, connect, or existing-app path. It then guides repository
  work, an authorized publish, and deployment verification.
- Samebase MCP owns app inventory, stable provider joins, and explicit repair flows.
- Git and the app repository own source changes and version identity.
- Routine logs, environment values, migrations, and custom domains remain provider-direct.

The plugin does not add a second source repository, build archive, or synthetic release version. A
Git commit is the release identity, and a successful push is only a deployment candidate until the
relevant provider reports terminal success.
