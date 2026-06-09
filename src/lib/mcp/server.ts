import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { taskTools } from "./tools/tasks";
import { webhookTools } from "./tools/webhooks";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "agtls",
    version: "0.1.0",
  });

  taskTools(server);
  webhookTools(server);

  return server;
}
