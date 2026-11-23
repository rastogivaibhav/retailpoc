# Order Recovery Lab

A working, persistent supply-chain exception application. Change an inbound ETA, inspect affected orders and eligible transfer options, approve a stock reservation, dispatch it, receive it and inspect the evidence trail.

## Honest scope
- Controlled beauty-distribution dataset; no L’Oréal data.
- Actual backend calculations and durable D1 state.
- Actual stock reservations and movements in this application's own ledger.
- Editable ERP-shaped customer orders, supply tasks, batches and routes are available as user-provided demo records. Selecting an ERP label does not connect to that ERP.
- An ERPNext adapter supports bounded reads and reviewed draft transfer requests in the owner workspace. A draft is not a stock movement. Live operation against a customer's ERP schema and rules must be validated in a customer sandbox before a pilot.
- The WMS simulator is labelled as a simulator and cannot change ERP stock.
- NVIDIA Nemotron investigation agent calls real read-only tools; the deterministic engine validates numeric proposals and source references. Model prose is advisory.
- Private provider configuration encrypts NVIDIA credentials with AES-GCM under a runtime-only key. No credential is exported in run evidence.
- Greedy planning heuristic; no global optimality claim.
- Public engineering demonstration; production customer-data readiness, security review and customer outcomes are not established.

## Commercial order priority
Customer sales can be classified as STANDARD, PROMOTIONAL, KEY_ACCOUNT_COMMITTED or CONTRACTUAL_MUST_SERVE. Existing records without a class remain STANDARD. Base priority is an integer from 1–100; configurable policy multipliers default to 1×, 10×, 5× and 50× respectively.

Promotional orders require a campaign window, units per case and a positive penalty per case. The planner only considers arrivals inside the window. Estimated short-case penalties use ceiling rounding and appear separately from transport and recovery execution cost; they are not booked charges or realised losses. The controlled dataset includes SALE-CREAM-PROMO (600 units, 12 units per case, £3.50 per short case).

## Recovery planning extensions
- Combined supplier, warehouse and transport disruptions are retained together and solved against the same constrained network. Current UI choices are the three defined scenarios; authoring arbitrary disruption types and a per-disruption quantified counterfactual remain future work.
- Supplier profiles gate sources by qualification and approved item. Contingency sourcing uses the supplier P85 lead time and load rule. Metrics in the controlled dataset are illustrative; rolling supplier performance history is not connected.
- The planner expands recursive bills of material to a validated maximum depth of six and rejects cycles. The material-requirements view is explanatory; the constrained plan remains the authority for shared inventory and capacity allocation.
- Recovery cost separates transport, fixed lane, production, material, supplier premium, express freight, configured customer penalties and estimated write-off exposure. Lost sales use gross order value as a proxy, not profit or cash loss.
- Supplier expedite requests are drafted, edited and logged for external sending. Replies are entered by a user; the app does not send supplier email or connect to a supplier portal.
- `RecoveryConnector` defines the health, canonical read, draft action and reconciliation boundary. ERPNext has its own implemented owner-workspace adapter. SAP, Oracle, Kinaxis, Coupa, TMS and MES connectors remain customer-specific work; the interface does not imply those systems are connected.

## Pilot preparation
- **Data and connections → Orders and stock** opens the editable ERP-style sample. Public visitors can recalculate temporary edits in their browser session; signed-in users can save the sample to their workspace. Neither path updates an ERP.
- **Pilot toolkit → Measure results** records manually verified before/after metrics. The app calculates differences but does not attribute causality or claim savings.
- **Pilot toolkit → Check readiness** tracks operational evidence with a named owner and reference. A check cannot be marked verified without both.
- **Pilot toolkit → Draft pilot offer** prepares an editable offer draft for discussion. The fee, system scope and success measures remain open until agreed with a customer.
- Pilot scorecard, checklist and offer drafts are tenant-scoped in D1. Do not enter sensitive customer details in the public example workspace.

## Try the workflow
1. Open the deployed application and sign in.
2. Initially, all four orders have timely supply.
3. Set IN-204 arrival to 2026-10-24 and choose Apply & investigate.
4. Observe 570 uncovered units; 250 are recoverable while protecting source constraints.
5. SO-1001 proposes 220 units, arriving 2026-10-20, costing £89.
6. Review and approve. Source batch MID-SERUM-01 reserves another 220 units.
7. In Transfer execution, confirm dispatch then record receipt.
8. Inventory and evidence show the actual committed state changes. Refresh preserves the result.
9. SO-1002 still has a partial option. The application does not invent a full recovery.

## Development
Node 24 or the hosted platform's supported runtime. Install with the supplied Sites installer; the lockfile pins dependency versions.

Run domain tests: `node --experimental-strip-types --test tests/domain.test.mjs`.
Typecheck: `node node_modules/typescript/bin/tsc --noEmit`.
Build and deploy using the Sites skill workflow. `.openai/hosting.json` declares the D1 binding. Migrations are under drizzle/.

Domain and lifecycle logic: lib/domain.ts.
HTTP API: app/api/workspace/route.ts.
UI: app/page.tsx and app/globals.css.
Detailed architecture, data assumptions, state transitions and limits: docs/ARCHITECTURE.md.

To connect an external source later, map its authorised records to the documented JSON contract and implement an adapter. No adapter is currently claimed.
