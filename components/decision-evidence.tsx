'use client';
import {traceAllocation} from '../lib/assurance/decision-trace';
import type {Allocation, Assurance} from '../lib/assurance/model';

export function DecisionEvidence({allocation,state,today}:{allocation:Allocation;state:Assurance;today?:string}){
 const trace=traceAllocation(state,allocation,today);
 return <details className="decision-evidence"><summary>Why this move was chosen · show source records</summary>
  {trace.pastArrival&&<p className="decision-evidence-warning"><strong>Past arrival:</strong> this move is dated {allocation.option.arrival}, before {today||new Date().toISOString().slice(0,10)}. It is historical example evidence and cannot support an operational decision.</p>}
  <p className="agent-note">The explanation below is generated from the planner’s selected records and configured rules. “Trusted” means the record passed this workspace’s freshness and completeness checks; it does not mean a live enterprise source.</p>
  <div className="decision-records">{trace.records.map(record=><article key={`${record.kind}-${record.id}`}>
   <div><strong>{record.name}</strong><span className={record.trusted?'trace-trusted':'trace-untrusted'}>{record.trusted?'Evidence check passed':'Needs checking'}</span></div>
   <p>{record.detail}</p>
   <small>Source {record.stamp.system} · record {record.stamp.recordId} · version {record.stamp.version} · source time {record.stamp.sourceAt} · observed {record.stamp.observedAt}</small>
   {record.stamp.unknown&&<small>Unresolved: {record.stamp.unknown}</small>}
  </article>)}</div>
  {trace.lots.length>0&&<><h3>Other stock checked for this commitment</h3><div className="decision-lots">{trace.lots.map(({lot,used,eligible,reason})=><article key={lot.id}><div><strong>{lot.id}</strong><span className={eligible?'trace-trusted':'trace-untrusted'}>{used?`${used.toLocaleString()} units selected`:eligible?'Lot checks passed':'Not eligible'}</span></div><p>{reason}</p></article>)}</div><p className="agent-note">Passing lot checks alone does not guarantee fulfilment. The route, arrival date and shared capacity must also pass.</p></>}
  <p className="agent-note">This trace explains the configured planning result. Confirm real source mappings, quality release, cut-off times and execution evidence with the system owner before acting.</p>
 </details>
}
