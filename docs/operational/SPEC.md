# Operational Assurance release specification

## Outcome
Upgrade the existing public project in place. Preserve legacy tables and revisions. Connect a bounded, explicitly mapped ERPNext test tenant to canonical commitments and eligible stock, then coordinate reviewed transfer drafts and reconcile actual documents. Controlled scenarios remain clearly distinct.

## Architecture
Site UI → authenticated command API → canonical state and durable outbox in existing D1 → leased background runner → ERPNext supported HTTP API → observed document reconciliation → risk recalculation. The runner cannot approve plans. A separate Cloudflare cron worker wakes the outbox; work and leases survive its restart. The browser only reads progress.

## Data contract
External names and stable child-row IDs map to canonical item/facility/customer/supplier IDs. UTC timestamps require an explicit ERP timezone offset. Unit conversions must produce whole stock units. Batch quantity is read from ERP's batch API; Bin quantities constrain aggregate stock and reservations. Missing market/release/shelf-life evidence remains UNKNOWN. Explicit field mappings are configuration, never invented ERP values. A complete source snapshot is required before replacing ERP-derived state. Cancelled/closed source orders are removed on full refresh. Incremental polling never silently advances on failed/truncated reads.

## Durable commands
Jobs have tenant/id/deduplication key/kind/state/attempt/next-run/lease-token/lease-expiry/payload/result/error timestamps. Claim is an atomic compare-and-set. Lease tokens fence all completion writes. Retryable reads use bounded exponential backoff and end in a visible dead-letter state. Requeue is explicit and audited. Controlled progress is idempotent through canonical request IDs and revision CAS. External writes commit intent before sending. A crash or timeout after intent leads to lookup/reconciliation, never blind recreation. Require a unique external correlation field before enabling draft creation. ERP validation remains authoritative.

## Roles and tasks
An owner's workspace may grant email-bound viewer, planner, approver or operator membership using trusted sign-in identity. Site owner alone manages credentials and membership. Permissions are enforced server-side. Review and approval are recorded separately; material changes invalidate approvals. Risk ownership and due dates create persistent in-app notifications and overdue status; no email is sent without separate configuration.

## External execution boundary
Only explicitly supported warehouse transfer allocations can create ERP Stock Entry drafts. No automatic submission. Submitted documents and ledger/receipt evidence are read back and compared with exact items/warehouses/batches/quantities. A draft is never delivery proof. A submitted one-step transfer is ERP book-stock movement evidence, not physical attestation. Final customer verification requires matching submitted Delivery Note evidence, and cannot be inferred from the transfer alone.

## PostgreSQL
Provide executable PostgreSQL migrations and an HTTP gateway contract/driver, plus migration/export/restore tooling. Activate only against an authorised endpoint after parity tests. Existing D1 remains authoritative until that migration is verified; no fabricated PostgreSQL claim.

## Acceptance
Real HTTP webhook and persisted risk propagation; controlled job finishes with browser closed; concurrent claims execute once; expired lease cannot commit; restart resumes pending work; reads retry and dead-letter; ambiguous write is looked up before any retry; stale stock/approval blocks writes; tenant/role failures denied; partial receipts not verified; unknown data not upgraded to authoritative stock; all legacy regression tests pass. Live ERP acceptance is blocked until site URL and credentials are supplied.

## Reuse
Learn transaction/milestone separation from ERPNext/OpenBoxes and durable orchestration/activity idempotency from Temporal. No copyleft source copied. Keep existing solver and bounded NVIDIA tools; OR-Tools, LangGraph, Debezium, Fleetbase and external-news ingestion are not dependencies of this release.

## Implemented release decisions
- Use a D1 transactional outbox plus an authenticated Cloudflare cron wake-up rather than deploying a Temporal cluster for the bounded pilot.
- Operational ERP polling uses complete bounded snapshots so deleted/closed records are reconciled. Existing incremental reader remains available but is not used as the material execution preflight.
- Batch quantities come from the supported ERPNext batch API; release, market and batch reservation/safety fields are explicit tenant mappings. Missing fields remain UNKNOWN.
- ERP verification is explicitly ERP_DOCUMENTS. Controlled simulation cannot execute live-source plans. Independent physical acknowledgement remains a separate production gate.
- PostgreSQL stays a deployment gate; do not claim the target schema is a connected database or deploy an untested SQL translation layer.
