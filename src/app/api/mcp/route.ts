import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { resolveAuth } from "@/lib/api/middleware";
import { errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: Request): Promise<Response> {
  let auth;
  try {
    auth = await resolveAuth(request);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid API key.";
    return errorResponse(errors.unauthorized(msg), 401);
  }

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — each request is independent
  });

  // Expose auth context to tools via the transport instance
  (transport as unknown as Record<string, unknown>)._authContext = auth;

  await server.connect(transport);
  return transport.handleRequest(request);
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
