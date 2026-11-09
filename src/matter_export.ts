import { createHash } from "node:crypto";
import { z } from "zod";
import { InfraiError, type InfraiClient } from "./infrai_client.js";

export const exportRequestSchema = z.object({
  matterId: z.string().min(1).max(80),
  clientReference: z.string().min(1).max(120),
  intakeCompletedAt: z.string().datetime(),
  signedDocument: z.object({
    title: z.string().min(1).max(160),
    deliveredAt: z.string().datetime(),
  }),
  deadlines: z.array(
    z.object({
      label: z.string().min(1).max(160),
      dueAt: z.string().datetime(),
      followedUpAt: z.string().datetime().nullable(),
    }),
  ).min(1),
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;

export function selectPendingFollowUps(input: ExportRequest) {
  return input.deadlines
    .filter((deadline) => deadline.followedUpAt === null)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildMatterCsv(input: ExportRequest): string {
  const header = [
    "matter_id",
    "client_reference",
    "intake_completed_at",
    "signed_document",
    "signed_document_delivered_at",
    "deadline",
    "deadline_due_at",
    "follow_up_status",
  ];
  const rows = selectPendingFollowUps(input).map((deadline) => [
    input.matterId,
    input.clientReference,
    input.intakeCompletedAt,
    input.signedDocument.title,
    input.signedDocument.deliveredAt,
    deadline.label,
    deadline.dueAt,
    "pending",
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export async function exportMatter(
  input: ExportRequest,
  infrai: InfraiClient,
  bucket: string,
) {
  const csv = buildMatterCsv(input);
  const digest = createHash("sha256").update(csv).digest("hex").slice(0, 16);
  const key = `matter-exports/${input.matterId}/${digest}.csv`;

  try {
    await infrai.storage.bucket.get(bucket);
  } catch (error) {
    if (!(error instanceof InfraiError) || error.status !== 404) throw error;
    await infrai.storage.bucket.create(bucket);
  }
  const upload = await infrai.storage.object.presign(bucket, key, {
    op: "put",
    expires_seconds: 600,
    content_type: "text/csv; charset=utf-8",
    idempotency_key: `matter-export-${input.matterId}-${digest}`,
  });
  const uploadResponse = await fetch(upload.url, {
    method: "PUT",
    headers: { "Content-Type": "text/csv; charset=utf-8" },
    body: csv,
  });
  if (!uploadResponse.ok) throw new Error("CSV upload was not accepted");

  const download = await infrai.storage.object.presign(bucket, key, {
    op: "get",
    expires_seconds: 900,
    response_disposition: `attachment; filename="${input.matterId}-deadlines.csv"`,
    idempotency_key: `matter-download-${input.matterId}-${digest}`,
  });

  const pending = selectPendingFollowUps(input);
  const renderedDocument = await infrai.pdf.generate({
    markdown: [
      `# Matter export: ${input.matterId}`,
      `Client reference: ${input.clientReference}`,
      `Signed document delivered: ${input.signedDocument.title} at ${input.signedDocument.deliveredAt}`,
      `Pending deadline follow-ups: ${pending.length}`,
      ...pending.map((item) => `- ${item.label}: ${item.dueAt}`),
    ].join("\n\n"),
    page_size: "A4",
    orientation: "portrait",
  });

  return {
    matterId: input.matterId,
    pendingFollowUps: pending.length,
    downloadUrl: download.url,
    expiresInSeconds: 900,
    renderedDocument,
  };
}
