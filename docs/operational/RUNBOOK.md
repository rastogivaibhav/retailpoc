# Operational runbook

## Current hosted topology
The existing Site and D1 retain state. A separate lightweight Cloudflare cron worker calls the authenticated /api/operations/worker endpoint every minute. It carries only a runner secret, not ERP or AI credentials. The runner can process enrolled jobs but cannot approve, change credentials or read via the user APIs. The UI refreshes progress; closing it does not stop persisted work.

## Enable ERP test integration
1. Connect the authorised Frappe Cloud ERPNext site in Settings / Connections. Retain a least-privilege integration account. No credential belongs in mappings, source control or job payloads.
2. Export a backup before applying mappings. In Durable operations, map external warehouse/customer/supplier/item identities to canonical nodes/items. Map actual batch release/market/reservation/safety fields, stock unit and source timezone. Standard quantity reads use the whitelisted batch.get_batch_qty API. Missing or inconsistent evidence is excluded.
3. Configure company and a site-enforced unique Data Custom Field on Stock Entry named custom_assurance_action_id (or an explicitly configured equivalent). The adapter reads Custom Field metadata to verify uniqueness. This requires metadata read permission. It refuses draft creation without this constraint.
4. Supply actual lane policies. Queue one complete ERP snapshot and inspect mapping issues. Scope is deliberately bounded: 100 list rows; 12 expanded documents/type; 24 batch/warehouse quantity reads. Truncation fails visibly rather than silently claiming a complete sync.
5. Enable background sync (5–60 minutes) only after validating records. Initial full snapshots reconcile cancelled and removed source orders. The legacy bounded incremental source reader remains available separately; the operational path uses complete snapshots for correctness.
6. Calculate, review and approve a fully live-source transfer plan. Queue its ERP draft. The adapter rereads current sources, checks the approved fingerprint, persists intent and creates at most one correlated draft. It never submits a document.
7. Authorised ERP operators process the draft externally. Reconciliation polls submitted Stock Entry, active Stock Ledger entries and matching submitted on-time Delivery Note lines. A draft remains EXTERNAL_ACCEPTED; submitted book movement without customer evidence remains EXECUTING. VERIFIED/ERP_DOCUMENTS is ERP book evidence, never independent physical delivery attestation.

## Failed and ambiguous jobs
READY/RETRY/WAITING jobs are eligible after due time. RUNNING lease expires after three minutes; a new runner can claim it and fences the previous worker. Reads retry with exponential backoff up to five failures. DEAD requires operator review and explicit requeue. ERP_DRAFT with stored intent but no visible document becomes NEEDS_REVIEW and cannot be blindly requeued. Search ERP by the unique correlation value; reconcile ambiguous outcomes with an authorised operator. A unique key prevents duplicate documents, not overselling caused by other systems; ERP validation/reservation policy remains necessary.

## Restart proof
Stop the cron runner or process after creating a pending job. Jobs remain in D1. Restore the runner and inspect a new heartbeat plus persisted job history. Use a fixture transport unit test to reproduce a crash after remote commit; require one POST and remote lookup on resume. Do not describe fixture tests as live ERP evidence.

## Recovery and rollback
Export the operational snapshot and retain the pre-upgrade/provider database backup. The UI snapshot contains at most 60 jobs and is explicitly not a full restore image. Source rollback for this release is e1538b5fe6b74a6e16c80c15b5a70d4390e84786. No existing operational tables are deleted. To stop unattended work, remove the cron schedule and disable pollEnabled. Pausing does not cancel an external request. Restore canonical state only under a maintenance window after reconciling every external write; never restore old approval/lease/idempotency state over real ERP changes. Database/provider restore and PostgreSQL migration require a separate verified procedure and endpoint.

## Remaining production gates
Actual ERP site credentials, schema/permission verification, independent warehouse/carrier acknowledgements, source-reservation concurrency, production SSO and role administration, stronger tamper-evident retention, scale tests, planning calendars and PostgreSQL deployment/parity/restore verification. No live account has been inferred from a Frappe registration alone. Team grants use trusted sign-in email; no invitation email is sent. In-app assignment/overdue tasks are persisted, not external messaging.
