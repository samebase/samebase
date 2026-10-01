/**
Text rendering of connected servers for subjects that receive the tool list in the prompt.
Annotations are left out because hosts do not show them to the model.
*/
import type { ServerTools } from "./runtime.ts";

export function catalogTextFor(servers: ServerTools[]): string {
  return servers
    .map((server) => {
      const tools = server.tools
        .map(
          (tool) =>
            `- name: ${tool.name}\n  description: ${tool.description.replaceAll("\n", "\n    ")}\n  input schema: ${JSON.stringify(tool.inputSchema)}`,
        )
        .join("\n");
      return `### Server: ${server.server}\n${server.instructions ? `Server instructions:\n${server.instructions}\n\n` : ""}Tools:\n${tools}`;
    })
    .join("\n\n");
}
