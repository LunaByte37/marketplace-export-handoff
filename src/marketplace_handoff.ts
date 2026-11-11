import { createHash } from "node:crypto";
import { z } from "zod";
import { infrai } from "./infrai.js";

export const handoffRequest = z.object({
  order: z.object({
    id: z.string().min(1),
    placedAt: z.string().datetime(),
    status: z.enum(["paid", "fulfilled"]),
  }),
  seller: z.object({
    name: z.string().min(1),
    assets: z.array(z.object({
      label: z.string().min(1),
      url: z.string().url(),
    })).min(1),
  }),
  buyer: z.object({
    email: z.string().email(),
    updates: z.array(z.object({
      at: z.string().datetime(),
      note: z.string().min(1),
    })),
  }),
});

export type HandoffRequest = z.infer<typeof handoffRequest>;

export function csvForHandoff(input: HandoffRequest): string {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows = input.seller.assets.map((asset, index) => [
    input.order.id,
    input.order.status,
    input.order.placedAt,
    input.seller.name,
    input.buyer.email,
    asset.label,
    asset.url,
    input.buyer.updates[index]?.note ?? "",
  ]);
  return [
    ["order_id", "status", "placed_at", "seller", "buyer_email", "asset", "asset_url", "buyer_update"],
    ...rows,
  ].map((row) => row.map(quote).join(",")).join("\n") + "\n";
}

function markdownForHandoff(input: HandoffRequest): string {
  const assets = input.seller.assets.map((asset) => `- [${asset.label}](${asset.url})`).join("\n");
  const updates = input.buyer.updates.map((update) => `- ${update.at}: ${update.note}`).join("\n");
  return `# Order ${input.order.id}\n\nSeller: ${input.seller.name}\n\n## Assets\n${assets}\n\n## Buyer updates\n${updates || "No updates recorded."}`;
}

export type ExportResult = {
  orderId: string;
  state: "ready";
  csvDownloadUrl: string;
  expiresInSeconds: number;
  renderedDocument: unknown;
};

export async function exportHandoff(input: HandoffRequest, bucket: string): Promise<ExportResult> {
  const csv = csvForHandoff(input);
  const key = `orders/${input.order.id}/handoff.csv`;
  const requestId = createHash("sha256").update(`${input.order.id}:${csv}`).digest("hex");

  const upload = await infrai.storage.object.presign(bucket, key, {
    op: "put",
    expires_seconds: 300,
    content_type: "text/csv; charset=utf-8",
    idempotency_key: requestId,
  });
  const uploaded = await fetch(upload.url, {
    method: "PUT",
    headers: { "Content-Type": "text/csv; charset=utf-8" },
    body: csv,
  });
  if (!uploaded.ok) throw new Error(`CSV upload was rejected (${uploaded.status})`);

  const [download, renderedDocument] = await Promise.all([
    infrai.storage.object.presign(bucket, key, {
      op: "get",
      expires_seconds: 3600,
      response_disposition: `attachment; filename="order-${input.order.id}.csv"`,
      idempotency_key: `${requestId}-download`,
    }),
    infrai.pdf.generate({
      markdown: markdownForHandoff(input),
      page_size: "A4",
      orientation: "landscape",
      store: true,
    }),
  ]);

  return {
    orderId: input.order.id,
    state: "ready",
    csvDownloadUrl: download.url,
    expiresInSeconds: 3600,
    renderedDocument,
  };
}
