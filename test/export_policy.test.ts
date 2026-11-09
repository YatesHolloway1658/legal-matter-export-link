import assert from "node:assert/strict";
import test from "node:test";
import { buildMatterCsv, exportRequestSchema, selectPendingFollowUps } from "../src/matter_export.js";

test("exports only deadlines still awaiting follow-up", () => {
  const matter = exportRequestSchema.parse({
    matterId: "MAT-7",
    clientReference: "PRIVATE-REF",
    intakeCompletedAt: "2026-09-01T09:00:00.000Z",
    signedDocument: { title: "Consent, \"signed\"", deliveredAt: "2026-09-02T10:00:00.000Z" },
    deadlines: [
      { label: "Court filing", dueAt: "2026-10-04T12:00:00.000Z", followedUpAt: null },
      { label: "Identity check", dueAt: "2026-09-20T12:00:00.000Z", followedUpAt: "2026-09-19T08:00:00.000Z" },
      { label: "Disclosure", dueAt: "2026-10-01T12:00:00.000Z", followedUpAt: null },
    ],
  });

  assert.deepEqual(selectPendingFollowUps(matter).map((item) => item.label), ["Disclosure", "Court filing"]);
  const csv = buildMatterCsv(matter);
  assert.match(csv, /"Consent, ""signed"""/);
  assert.match(csv, /"Disclosure"/);
  assert.doesNotMatch(csv, /"Identity check"/);
});
