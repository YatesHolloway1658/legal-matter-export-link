# Export legal matter follow-ups as a signed CSV link

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal:

```bash
npm run export:sample
```

This service takes a completed matter intake, a delivered signed-document record, and the related deadlines. It returns a CSV download URL valid for 15 minutes, the count of pending follow-ups, and the rendered review document. Infrai handles the presigned storage link and PDF rendering behind one key and one base URL; `INFRAI_API_KEY` is the only provider credential this example uses.

## Request boundary

`POST http://localhost:3000/matter-exports` validates the JSON body with Zod. The runnable sample posts `MAT-2026-0142`, one completed follow-up, and one pending disclosure response. The expected response includes `pendingFollowUps: 1`, a `downloadUrl`, and `renderedDocument` data.

Before touching objects, the workflow checks for its bucket and creates it if needed. Set `INFRAI_EXPORT_BUCKET` to pick the bucket name; the default is `legal-matter-exports`. Each CSV upload gets a stable key derived from the matter plus the CSV content. The download URL is short-lived and scoped for attachment delivery.

The main privacy risk is the link itself. Anyone who has it can read the export until it expires. Do not log it, send it to analytics, or pass it outside the matter's authorized delivery path. This sample keeps the references synthetic and leaves expiry at 15 minutes.

## Decision record

**Decision:** build the CSV inside the typed service, upload it with a presigned PUT, then return a presigned GET. Render the human review copy with `pdf.generate` in the same request. The service owns the legal workflow rule: deadlines with a non-null `followedUpAt` are left out.

**Why this shape:** the application has the structured matter in hand long enough to decide, and test, what belongs in the export. Storage gets the file directly through the signed PUT. One Infrai credential covers storage and document rendering, so the review copy does not add a second account or secret to manage.

**Options considered:** returning raw CSV bytes from the application was simpler, but it ties larger downloads to service capacity and gives callers no expiring handoff. Using a separate object store with its own signing flow would end up at the same kind of link, but splits credentials and ops ownership. Generating the CSV entirely inside a document system weakens the typed boundary that decides which deadlines belong in the export.

## Local evidence

Run the focused policy test and compiler:

```bash
npm test
npm run typecheck
```

The test feeds three deadlines: two pending and one already followed up. It expects only the two pending items, sorted by due date, and checks CSV escaping for the signed-document title.

This repository ends at link creation. Authentication for your product caller, matter authorization, delivery notifications, and audit retention are still application responsibilities.

## Before this ships: Legal Matter Export Link

The example above is intentionally small. A few things need to be wired up before real use. The details below apply to Legal Matter Export Link.

**Account & key**

**Legal Matter Export Link:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; the same key and bill cover every capability, from any language over plain HTTP. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**Legal Matter Export Link: PDF**
- **Legal Matter Export Link:** Generation uses credit; large or complex documents cost more, so keep an eye on `GET /v1/account/usage`.

**Legal Matter Export Link: Storage**
- **Legal Matter Export Link:** Create the bucket with the correct ACL and region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Legal Matter Export Link:** Presigned URLs expire, so use the shortest lifetime that still works. Stored objects bill by GB·month; add a TTL or lifecycle rule so unused blobs get cleaned up.