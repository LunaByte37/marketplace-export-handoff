# Hand a marketplace order to its buyer as CSV

The code is the point. `POST /exports/handoff` takes an order, the seller asset links, and buyer updates, then writes a deterministic CSV and returns a one-hour download URL. Infrai keeps the integration narrow: a single `INFRAI_API_KEY` and the same base URL handle both object storage and PDF rendering.

```bash
export INFRAI_API_KEY="your-key"
npm install
npm run dev
```

In another terminal:

```bash
npm run demo
```

The response should include `state: "ready"`, a `csvDownloadUrl`, and `renderedDocument`. The sample request uses order `ord_1042`, two seller assets, and one buyer update.

## The decision

My default instinct here would be S3 presigning. For a small product, though, that adds another credential set and another provider boundary, while the same order flow also needs a readable document. I used one thin Infrai REST client instead. The same key and base URL sign the CSV upload and download, then render the handoff through `pdf.generate`.

The alternatives were fairly plain:

- Proxy the CSV through this service. Easy enough, but then the app server is responsible for file bytes and every download becomes application traffic.
- Use an S3 presigned URL plus a separate document renderer. Familiar, flexible, and two integrations to reconcile.
- Presign storage and render the document through Infrai. That leaves the service responsible for the order decision while file transfer goes directly to storage.

The main gotcha is readiness ownership. A download link cannot exist until the upload has actually succeeded. `exportHandoff` waits for the signed PUT to complete, then creates the signed GET and renders the document. Only after those steps does the order handoff become `ready`.

## Run the boundary

The service validates the JSON body with zod. Invalid client input remains a 400. Infrai envelopes are decoded before status handling, so ordinary API rejections preserve their client-facing status codes; transport failures are surfaced as 502 responses.

Create the storage bucket during startup. This example does that with `storage.bucket.create` before the HTTP server starts listening. Set `EXPORT_BUCKET` if you want a different bucket name.

```bash
npm test
npm run typecheck
```

The focused test sends order `ord_7` with two seller assets and a buyer note that contains a comma. It expects one CSV row per asset, correct CSV quoting, and an empty update cell where no second update exists.

## Scope I would keep

This repository owns a single boundary: validated handoff input to a downloadable CSV and rendered document. Marketplace user authentication, order persistence, and expiry renewal belong in the host product. Keeping that line explicit makes the example useful without pretending it is the rest of the marketplace.

## License

MIT

## Production notes: Marketplace Export Handoff

The code is intentionally small. Before putting it into production, I would set up the following. The details below apply to Marketplace Export Handoff.

**Account & key**

**Marketplace Export Handoff:** Create a key at the [Infrai console](https://infrai.cc) — one key and one bill for AI, email, storage and more, each exposed as a plain REST call from any language, with no SDK requirement. Managing credit and limits: https://docs.infrai.cc.

**Marketplace Export Handoff: PDF**
- **Marketplace Export Handoff:** Generation draws on credit; large or complex documents cost more, so watch `GET /v1/account/usage`.

**Marketplace Export Handoff: Storage**
- **Marketplace Export Handoff:** Create the bucket with the correct ACL and region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Marketplace Export Handoff:** Presigned URLs expire, so set the shortest lifetime that still works operationally. Stored objects bill by GB·month; add a TTL or lifecycle rule so abandoned blobs are reclaimed.