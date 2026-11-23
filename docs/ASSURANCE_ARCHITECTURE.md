# Supply Chain Assurance — implemented architecture

This is an additive upgrade of Sites project appgprj_6ad546d6376481919adf81d78c5e7706. The public URL is retained. The legacy operational workspace, AI runs, encrypted provider configuration, ERP configuration and WMS simulation tables remain unchanged. Before migration, complete operational snapshots and encrypted credential rows were backed up. Source rollback before this upgrade is ddc70bf47bcfbdb925ee648b8d286ec742811409.

## Boundary and identity

Anonymous visitors receive a calculated controlled example. Authenticated users receive separate assurance workspaces keyed from Sites' trusted request identity. A client-provided tenant ID is never used for selection, ingestion, import or updates. Tenant snapshots use optimistic revisions; normalized nodes, edges, commitments, dependencies and observations update in the same D1 transaction under a unique write nonce. Owner-only legacy APIs now explicitly check configured OWNER_EMAILS. A secret-scoped isolated verification service has its own tenant and no ERP, credential or NVIDIA-owner privilege.

The original shared order ledger remains available to the owner inside Recovery Planner, Execution and Settings. The public API presents synthetic legacy input rather than exposing the owner's operational snapshot. Existing mutation logic is preserved; owner authentication now precedes it. Source/API credentials are never exposed to the public or sent to AI. A visitor can explore the public example but must sign in for persisted private scenario actions.

## Canonical model

An organisation owns facilities. Node roles represent suppliers, factories, distribution centres, retailers and customers; a node can be source and destination. Products/materials retain stock units. Batches retain finite quantities, reservations, safety stock, release, market, expiry and availability dates. Production recipes join one or two component inputs, a production resource and a finished product. Routes have finite per-day capacity, transit time and configured costs. Purchase, production, replenishment and sale commitments form an acyclic dependency network. Observations, source stamps, policies, risk cases, recovery schedules, approvals, execution events and verified outcomes preserve provenance and revisions.

This model covers the implemented bounded scenarios. It is not a complete manufacturing or logistics master-data model: shipment carrier details, arbitrary bills of material, shift calendars, changeovers, customs and real user-directory roles remain extensions.

## Observation → risk

A source-scoped bearer token can POST an observation to /api/assurance/events. Only its tenant and declared source are authorised. Event IDs are idempotent; changed payloads and old source versions are rejected. Authoritative fields follow configurable source-of-truth ownership. Conflicts retain the old value with an UNKNOWN marker. Material stale/conflicting/missing evidence is excluded from planning and endangered commitments become UNKNOWN. Source timestamps and observation time are stored separately. Risk cases, quantities and dependency chains are recalculated in the transaction; they are not supplied by an LLM or hard-coded per scenario.

In-app risk cases act as operational notifications. No email, Teams or Slack delivery has been configured. Supplier, warehouse and transport scenario controls invoke a controlled source adapter, clearly labelled. The real webhook endpoint supports independently delivered events without a user supplying risk or recovery answers.

## Scheduling model

javascript-lp-solver 1.0.3 (Unlicense) runs in the Worker. It is an actual mixed integer solver, used as the licensed equivalent permitted in the brief. No external solver service or Python process is required. Candidate flows combine eligible stock, bounded simple routes, production starts and one/two material sourcing combinations. Variables allocate whole units. Constraints share every source lot, route departure day, occupied production day and customer demand across commitments. Fixed lane costs use binary activation variables. Intermediate commitment credit comes from actual allocated path steps, so downstream flows can support upstream commitments without consuming the stock twice. Extra stage-only deliveries consume their own finite stock/capacity.

Optimisation is lexicographic: maximise priority-weighted on-time customer units, then upstream commitments, then a configured execution cost objective. The faster alternative adds 10,000 pence per unit-day to completion; the economical alternative minimises execution cost. All returned units, demand bounds and resource sums are independently checked before acceptance. The interface reports modelled cost and does not call it realised savings. No probability is derived from an AI opinion.

Model bounds: 30 nodes, 20 items, 50 inventory positions, 35 lanes, four recipes, 20 commitments, two inputs per recipe, four route hops, 1–14 days of horizon, 2,500 candidate flows, bounded material combinations and 1.5-second solver stages. Initial material transport is scheduled at earliest availability; intermediate route waiting and production resequencing are modelled. No global enterprise optimality, changeover optimisation or calibrated risk probability is claimed. Latest start is calculated from declared dependency lead times; operational cut-offs require confirmation.

## Approval and execution

PROPOSED → REVIEWED → APPROVED → EXTERNAL_REQUESTED → EXTERNAL_ACCEPTED → EXECUTING → RECONCILED → VERIFIED is persisted with actor, dates, IDs and source evidence. An approval rechecks material revision and gives one plan the exclusive execution hold for the entire tenant. Concurrent alternatives cannot approve the same resource network. Source changes after approval block dispatch.

The controlled adapter now progresses from a durable D1 outbox. A separate authenticated Cloudflare cron runner wakes work without an open browser; the UI only refreshes persisted progress. See docs/operational/SPEC.md and RUNBOOK.md for the new lease, retry, failure and ERP execution contracts. At dispatch it consumes the planned source quantities and records occupied daily capacity. Receipt observations are recorded per allocated flow; commitment outcomes are reconstructed from those observations and route steps, not from a manually supplied final result. Full receipts can pass verification; rejected requests, timeouts and short receipts remain explicit REJECTED, TIMED_OUT or PARTIAL states. A timeout holds the allocation for investigation. Controlled verification never asserts physical delivery. The adapter can be tested through APIs independently of the UI.

The original ERPNext exporter still creates a draft Stock Entry only. It does not submit it. Its accepted docstatus is not physical delivery. WMS simulator events remain separate and never masquerade as a live WMS acknowledgement.

## Enterprise adapters and reads

The ERPNext connector uses encrypted owner credentials and allowlisted Frappe Cloud site origins. Initial and incremental reads cover Sales Orders, Purchase Orders, Items, Warehouses, Batches, Delivery Notes, Purchase Receipts, Stock Entries and aggregate Bin stock. Results retain individual errors, truncation and source timestamps. An incomplete snapshot does not advance the cursor; a complete cursor uses the provider's modified timestamps. The original bounded reader remains available. Operational polling uses complete bounded snapshots from the durable worker, with explicit mapping and source reconciliation; incomplete reads retain prior canonical facts. Background polling is owner-enrolled and disabled by default.

Explicit mappings can create canonical ERP-source sale commitments from open submitted GBP orders, using outstanding stock units. Unmapped identities, fractions and unsupported currency are skipped. Aggregate Bin stock is not converted into a batch-level availability claim. Such orders remain UNKNOWN until batch quantity, release, market and shelf-life evidence is verified. Real-source orders cannot consume controlled stock or recipes and cannot be sent to the controlled execution adapter. Live drafts require verified batch/warehouse stock and unique remote correlation. Reconciliation distinguishes drafts, submitted book movements and matching customer Delivery Notes. ERP authentication and document compatibility still require the user's actual site URL and credentials.

Fleetbase, SAP, Dynamics, Oracle, MES and TMS have an adapter contract/catalogue entry only. They are not live integrations. No source from Fleetbase, OmniSupply or WorldPulse was copied.

## Storage and deployment gap

The hosted application uses its existing Cloudflare D1 binding. The target PostgreSQL relational/RLS schema is in db/postgres/001_assurance.sql. It is not applied or verified against a PostgreSQL instance. Moving this release to PostgreSQL needs an authorised endpoint, a supported HTTP access service/driver for the Sites runtime, data migration and RLS/restore tests. The requested initial PostgreSQL deployment is therefore not complete. This is explicitly visible in Settings and the release report.

## AI

The original NVIDIA order investigator remains available to the owner. A new network investigator can call selected commitment, dependency and recovery tools using the same protected provider key. It has bounded tool calls and requests, no action/credential tools, daily/run limits, persisted evidence and stale-result rejection. Submitted explanations must be qualitative and cite known IDs. They remain advisory: quantitative risk/feasibility/approval/execution never depend on model prose. Failure of NVIDIA leaves deterministic planning available.

## Production limitations

This is a functioning controlled assurance laboratory. Required work before operational production includes live ERP batch normalization, independent customer data validation, PostgreSQL deployment if required, independent physical warehouse/carrier acknowledgement adapters, production team administration and separation-of-duty policies, tamper-evident retention, broader scale tests, shift calendars, stronger optimisation benchmarks, recovery operations for ambiguous external writes and measured financial outcomes. The UI is not evidence that these unfinished parts exist.
