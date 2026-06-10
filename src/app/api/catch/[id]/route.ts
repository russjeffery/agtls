import { NextRequest, NextResponse } from "next/server";
import { eq, count, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEndpoint, webhookEvent } from "@/lib/db/schema";
import { newId } from "@/lib/api/ids";

// Headers to strip from captured data for security
const SENSITIVE_HEADERS = new Set([
  "host",
  "authorization",
  "cookie",
  "set-cookie",
  "x-forwarded-proto",
]);

async function handleWebhook(
  request: NextRequest,
  endpointId: string
): Promise<NextResponse> {
  // Always return 200 — never leak info about endpoint existence
  const fallbackEventId = newId("webhookEvent");

  // Look up endpoint
  const endpoints = await db
    .select()
    .from(webhookEndpoint)
    .where(eq(webhookEndpoint.id, endpointId))
    .limit(1);

  if (endpoints.length === 0) {
    return NextResponse.json(
      { received: true, event_id: fallbackEventId },
      { status: 200 }
    );
  }

  const endpoint = endpoints[0];

  // Extract method
  const method = request.method.toUpperCase();

  // Extract URL path
  const url = new URL(request.url);
  const path = url.pathname;

  // Extract query params
  const queryParams: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    queryParams[key] = value;
  });

  // Extract headers (filter sensitive ones)
  const capturedHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (!SENSITIVE_HEADERS.has(lowerKey)) {
      capturedHeaders[lowerKey] = value;
    }
  });

  // Extract source IP
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  let sourceIp: string | null = null;
  if (forwardedFor) {
    sourceIp = forwardedFor.split(",")[0].trim();
  } else if (realIp) {
    sourceIp = realIp.trim();
  }

  // Extract body
  let rawBody = "";
  let parsedBody: unknown = null;
  const contentType = request.headers.get("content-type") ?? "";

  try {
    rawBody = await request.text();
  } catch {
    rawBody = "";
  }

  const sizeBytes = Buffer.byteLength(rawBody, "utf8");

  if (contentType.toLowerCase().includes("application/json") && rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      // Not valid JSON — leave parsedBody as null
    }
  }

  // Store the event
  const eventId = newId("webhookEvent");
  const now = new Date();

  await db.insert(webhookEvent).values({
    id: eventId,
    endpointId: endpoint.id,
    organizationId: endpoint.organizationId,
    method,
    path,
    headers: capturedHeaders,
    body: rawBody || null,
    parsedBody: parsedBody,
    queryParams,
    sourceIp,
    sizeBytes,
    receivedAt: now,
  });

  // Enforce max_events: delete oldest events beyond the limit
  const maxEvents = endpoint.maxEvents ?? 100;

  const [{ value: currentCount }] = await db
    .select({ value: count() })
    .from(webhookEvent)
    .where(eq(webhookEvent.endpointId, endpoint.id));

  if (currentCount > maxEvents) {
    const overflow = currentCount - maxEvents;
    // Find the IDs of the oldest events to delete
    const oldest = await db
      .select({ id: webhookEvent.id })
      .from(webhookEvent)
      .where(eq(webhookEvent.endpointId, endpoint.id))
      .orderBy(asc(webhookEvent.receivedAt))
      .limit(overflow);

    if (oldest.length > 0) {
      for (const row of oldest) {
        await db.delete(webhookEvent).where(eq(webhookEvent.id, row.id));
      }
    }
  }

  return NextResponse.json(
    { received: true, event_id: eventId },
    { status: 200 }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleWebhook(request, id);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleWebhook(request, id);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleWebhook(request, id);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleWebhook(request, id);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleWebhook(request, id);
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleWebhook(request, id);
}

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleWebhook(request, id);
}
