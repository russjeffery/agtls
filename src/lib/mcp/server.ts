import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { taskTools } from "./tools/tasks";
import { webhookTools } from "./tools/webhooks";
import { artifactTools } from "./tools/artifacts";
import { messageTools } from "./tools/messages";
import { claimTools } from "./tools/claim";
import { registerTools } from "./tools/register";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "agtls",
    version: "0.1.0",
  });

  registerTools(server);
  taskTools(server);
  webhookTools(server);
  artifactTools(server);
  messageTools(server);
  claimTools(server);

  return server;
}
