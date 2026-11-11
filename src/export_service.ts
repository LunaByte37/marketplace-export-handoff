import { createServer } from "node:http";
import { handoffRequest, exportHandoff } from "./marketplace_handoff.js";
import { InfraiError, infrai } from "./infrai.js";

const bucket = process.env.EXPORT_BUCKET ?? "marketplace-handoffs";
const port = Number(process.env.PORT ?? 3000);

async function readJson(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

await infrai.storage.bucket.create(bucket);

createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/exports/handoff") {
    response.writeHead(404).end(JSON.stringify({ error: "route_not_found" }));
    return;
  }

  try {
    const parsed = handoffRequest.safeParse(await readJson(request));
    if (!parsed.success) {
      response.writeHead(400).end(JSON.stringify({ error: "invalid_request", issues: parsed.error.issues }));
      return;
    }
    const result = await exportHandoff(parsed.data, bucket);
    response.writeHead(201).end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof SyntaxError) {
      response.writeHead(400).end(JSON.stringify({ error: "invalid_json" }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.code, message: error.message }));
      return;
    }
    response.writeHead(502).end(JSON.stringify({ error: "export_failed" }));
  }
}).listen(port, () => console.log(`Export service listening on http://localhost:${port}`));
