# Operate: Samebase agent plugin

The Samebase agent plugin packages the complete workflow around the Samebase MCP server: create or
connect an app, continue in its real GitHub repository, validate the source, then ship and observe
the provider result when publishing is requested.

The plugin supports Codex and Claude Code from one shared package. It carries workflow and routing
guidance. The live MCP tool list and the action contracts indexed by
[samebase.com/llms.txt](https://samebase.com/llms.txt) remain the source of truth for exact tools,
arguments, safety metadata, and results.

## Codex

Add the marketplace and install the plugin:

```sh
codex plugin marketplace add samebase/agent-plugins
codex plugin add samebase@samebase
```

Start a new Codex task after installation so both workflow skills and the MCP server load. Complete
Samebase OAuth when Codex prompts for access.

## Claude Code

Add the marketplace, install, and reload:

```text
/plugin marketplace add samebase/agent-plugins
/plugin install samebase@samebase
/reload-plugins
```

Open `/mcp` to complete Samebase authentication if Claude Code prompts for it.

## Responsibility split

- `samebase-building` selects the create, connect, or existing-app path, preserves control-plane
  identifiers, then implements and validates the requested product in the local repository.
- `samebase-hosting` commits and pushes authorized source, observes the resulting GitHub, Convex,
  and Cloudflare state, and returns only the deployment result it can verify.
- Samebase MCP owns app inventory, provider joins, registry updates, infrastructure verification,
  and learned repair flows.
- Git and the app repository own source changes and version identity.
- Routine logs, environment values, migrations, and custom domains remain provider-direct.

The plugin does not add a second source repository, build archive, or synthetic release version. A
Git commit is the release identity, and a successful push is only a deployment candidate until the
relevant provider reports terminal success.
