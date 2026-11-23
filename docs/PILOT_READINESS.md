# Pilot preparation workflow

This release adds an editable ERP-shaped sample dataset and a tenant-scoped pilot preparation workspace. Neither feature claims customer ERP connectivity or customer outcomes.

## Editable ERP-style sample

Open **Settings → Orders and stock**. The editor can change customer orders and upstream supply tasks, batch stock, and delivery routes. It can add or remove those rows, export the dataset as JSON, and recalculate the existing recovery engine. Public visitors get a temporary preview that resets on refresh; signed-in users can save the changes to their workspace.

The ERP label (ERPNext, SAP S/4HANA, or generic) describes the sample's shape only. The saved provenance is `USER_IMPORTED`. These records do not come from the named ERP, and editing them never writes to an ERP. A real ERPNext connection is configured separately and has its own permissions, mapping, and draft-only action boundary.

Saving a dataset uses the existing validated import command. It clears plans, observations and previous execution state so that stale actions cannot be carried into a changed scenario. The import retains user-supplied provenance and passes through the normal network validation and risk calculation.

## Outcome scorecard

Open **Pilot toolkit → Measure results**. Before/after fields are intentionally empty. A user enters the measurement period, source, and four pairs:

| Measure | Unit | Difference shown |
| --- | --- | --- |
| Time to decide an exception | Minutes | Faster or slower |
| Orders on time | Percent | Percentage-point change |
| Expedite spend | GBP pence | More or less spend |
| Planner time per exception | Minutes | Faster or slower |

The application reports arithmetic differences only. It does not infer causation, compute a return on investment, or claim recovered revenue. Pilot conclusions should include the sample size, metric definition, source records, period, exclusions, and customer reviewer.

## Operational readiness checklist

Open **Pilot toolkit → Check readiness**. Each entry has a status, named owner, and evidence reference. The API rejects `VERIFIED` items without an owner and evidence. An editable sample dataset cannot be used as evidence that customer data mapping, system permissions, role separation, or ERP execution have passed.

Items cover real data and owners, data quality and reconciliation, planner eligibility rules, access roles, ERP sandbox action, duplicate and timeout handling, support ownership, and agreed success measures.

## Paid pilot offer draft

Open **Pilot toolkit → Draft pilot offer**. The editable fields capture target customer, buyer, workflow, ERP boundary, sites, product family, proposed duration, fee, success measures, exclusions, and next step. The default four-week duration is a discussion starting point only. The fee is not prefilled. Export produces a Markdown draft and print output.

Agree commercial terms, data scope, success criteria, access, support, and security requirements with the customer before treating the draft as an offer.

## Persistence and access

The pilot workspace API stores one JSON snapshot per authenticated tenant in D1. Reads for unauthenticated public visitors return a blank workspace; writes require the owner or a planner/admin role. The sample editor uses the existing authenticated assurance import action for saved workspaces. The unauthenticated preview endpoint runs validated data through the server-side engine without persisting it. Keep confidential customer information out of public demo records until customer-specific access, retention, deletion, and security requirements have been reviewed.
