import {DomainError} from '../domain.ts';
import {must,validate,seedAssurance,audit,day} from './model.ts';
import type {Assurance,Observation,RecoveryPlan,Lifecycle,Schedule} from './model.ts';
import {assess,schedule,credit} from './engine.ts';
export type AssuranceCommand={action:string;expectedRevision:number;requestId:string;scenario?:'supplier'|'warehouse'|'transport';observation?:Observation;planId?:string;mode?:'fast'|'economical';failAt?:'accept'|'execute'|'receipt';dataset?:unknown;policies?:Partial<Assurance['policies']>};
export function ingest(s:Assurance,raw:Observation,controlledObservedAt?:string){
 must(raw&&typeof raw==='object'&&typeof raw.id==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(raw.id),'Observation ID required');
 const old=s.observations.find(x=>x.id===raw.id);if(old){const comparison=(x:Observation)=>JSON.stringify([x.source,x.sourceVersion,x.sourceAt,x.entityId,x.field,x.value,x.provenance,x.note]);must(comparison(old)===comparison(raw),'Observation ID was reused with different content','EVENT_CONFLICT',409);return {duplicate:true}}
 must(typeof raw.source==='string'&&s.sources.some(x=>x.id===raw.source)&&Number.isSafeInteger(raw.sourceVersion)&&raw.sourceVersion>=1,'Known source and positive source version required');must(typeof raw.note==='string'&&raw.note.length<=300&&typeof raw.sourceAt==='string'&&!Number.isNaN(Date.parse(raw.sourceAt)),'Valid observation timestamp and note required');must(['CONTROLLED','ERP_LIVE','USER_IMPORTED'].includes(raw.provenance),'Observation provenance required');
 const e={...raw,observedAt:controlledObservedAt||new Date().toISOString()};must(Date.parse(e.observedAt)&&Date.parse(e.sourceAt)<=Date.parse(e.observedAt)+300000,'Source timestamp is in the future');
 const entity=s.lots.find(x=>x.id===e.entityId)||s.lanes.find(x=>x.id===e.entityId)||s.resources.find(x=>x.id===e.entityId)||s.commitments.find(x=>x.id===e.entityId);must(entity,'Source entity does not exist');
 const previous=s.observations.filter(x=>x.source===e.source&&x.entityId===e.entityId&&x.field===e.field).reduce((n,x)=>Math.max(n,x.sourceVersion),entity.stamp.system===e.source?entity.stamp.version:0);
 must(e.sourceVersion>previous,'Older or repeated source versions are rejected','SOURCE_VERSION',409);
 const validField=('nodeId' in entity&&'status' in entity)?['availableOn','status','qty']:('blocked' in entity)?['blocked','dailyCapacity']:('blockedDays' in entity)?['dailyCapacity']:['due','qty'];
 must(e.field==='contradiction'||validField.includes(e.field),'This field cannot update the selected entity');
 s.observations.push(e);if(e.field==='contradiction'||s.policies.owners[e.field]!==e.source){entity.stamp={...entity.stamp,unknown:'Conflicting observation or source-of-truth mismatch'};audit(s,e.source,'EVIDENCE_CONFLICT',`${e.id}: ${e.entityId}; value retained but excluded from authoritative planning.`);}else{
  if(e.field==='qty'||e.field==='dailyCapacity')must(Number.isSafeInteger(e.value)&&Number(e.value)>=0&&Number(e.value)<=1000000,'Quantity or capacity must be a whole nonnegative unit');
  if(e.field==='status')must(['RELEASED','HOLD'].includes(String(e.value)),'Release status required');
  if(e.field==='blocked')must(typeof e.value==='boolean','Blocked must be boolean');
  if(e.field==='availableOn'||e.field==='due')must(typeof e.value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e.value)&&day(e.value)===e.value,'Valid ISO date required');
  Object.assign(entity,{[e.field]:e.value,stamp:{system:e.source,recordId:e.entityId,sourceAt:e.sourceAt,observedAt:e.observedAt,version:e.sourceVersion,provenance:e.provenance}});audit(s,e.source,'OBSERVATION_APPLIED',`${e.id}: ${e.entityId}.${e.field} changed; downstream feasibility recalculated.`);
 }
 if(Date.parse(e.observedAt)>Date.parse(s.clock))s.clock=e.observedAt;s.factsRevision++;return {duplicate:false};
}
export function controlledSignal(s:Assurance,scenario:'supplier'|'warehouse'|'transport'):Observation{
 const target=scenario==='supplier'?{entityId:'PACK-A',field:'availableOn' as const,value:'2026-10-23',source:'SUPPLIER'}:scenario==='warehouse'?{entityId:'SOUTH-SERUM',field:'status' as const,value:'HOLD',source:'ERP'}:{entityId:'N-A',field:'blocked' as const,value:true,source:'TMS'};
 const version=s.observations.filter(o=>o.source===target.source&&o.entityId===target.entityId).reduce((n,o)=>Math.max(n,o.sourceVersion),1)+1;
 // Scenario time is deliberately isolated from wall-clock time. Advancing a
 // controlled scenario to the machine's current date made every untouched
 // seed record look stale, even though no simulated time had elapsed.
 const scenarioAt=new Date(s.clock).toISOString();
 return {id:`EVENT-${target.source}-${target.entityId}-${target.field}-V${version}`,...target,sourceVersion:version,sourceAt:scenarioAt,observedAt:scenarioAt,provenance:'CONTROLLED',note:`Scenario ${scenario}: controlled adapter input; no L’Oréal systems involved.`};
}
const active=(p:RecoveryPlan)=>['APPROVED','EXTERNAL_REQUESTED','EXTERNAL_ACCEPTED','EXECUTING','RECONCILED','TIMED_OUT'].includes(p.status);
function step(s:Assurance,p:RecoveryPlan,status:Lifecycle,detail:string,source:'PLATFORM'|'CONTROLLED_ADAPTER'='PLATFORM'){p.status=status;p.events.push({id:crypto.randomUUID(),planId:p.id,state:status,at:new Date().toISOString(),source,detail,...(p.adapter?{externalId:p.adapter.id}:{})});audit(s,source,'PLAN_'+status,`${p.id}: ${detail}`)}
export function executeAssurance(current:Assurance,c:AssuranceCommand,actor:string,today=new Date().toISOString().slice(0,10)):{state:Assurance;result:unknown;replay:boolean}{
 must(typeof c.requestId==='string'&&/^[A-Za-z0-9-]{8,100}$/.test(c.requestId),'Valid request ID required');const {expectedRevision,requestId,...semantics}=c;const fingerprint=JSON.stringify(semantics);const prior=current.requests[c.requestId];if(prior){must(prior.fingerprint===fingerprint,'Request ID reused with different action','REQUEST_CONFLICT',409);return {state:current,result:prior.result,replay:true}}
 must(c.expectedRevision===current.revision,'Workspace changed. Refresh and review the latest state.','STALE',409);const s=structuredClone(current);let result:unknown;
 if(c.action==='observe'){must(c.observation,'Observation required');result=ingest(s,c.observation);}
 else if(c.action==='scenario'){must(['supplier','warehouse','transport'].includes(c.scenario||''),'Choose a controlled scenario');const event=controlledSignal(s,c.scenario!);result={observation:event,...ingest(s,event,event.observedAt)};}
 else if(c.action==='plans'){
  must(!s.plans.some(active),'Reconcile or cancel the active recovery before replanning execution.','ACTIVE_PLAN',409);
  const alternatives=['fast','economical'] as const;const firstSequence=s.plans.length+1;const plans=alternatives.map((mode,index)=>{const p:RecoveryPlan={id:`PLAN-${s.factsRevision}-${firstSequence+index}-${mode.toUpperCase()}`,schedule:schedule(s,mode),status:'PROPOSED',events:[]};step(s,p,'PROPOSED','Feasible integer schedule calculated. Approval and execution are separate.');return p});s.plans.push(...plans);result={planIds:plans.map(p=>p.id)};
 }else if(['review','approve','send','cancel','pump'].includes(c.action)){
  const p=s.plans.find(p=>p.id===c.planId);must(p,'Recovery plan not found');
  if(c.action==='review'){must(p.status==='PROPOSED','Only proposed plans can be reviewed');must(p.schedule.revision===s.factsRevision,'Material inputs changed. Generate new alternatives.','STALE_PLAN',409);must(!s.risks.some(r=>r.state==='UNKNOWN'),'Source evidence needs checking. Refresh or resolve the uncertain records before review.','STALE_EVIDENCE',409);must(p.schedule.allocations.every(a=>a.option.arrival>=today),'This plan contains arrivals before today. Refresh the scenario and calculate a current plan before review.','STALE_PLAN',409);p.reviewedBy=actor;step(s,p,'REVIEWED','Planner reviewed schedule, source evidence, costs and assumptions.');}
  if(c.action==='approve'){must(p.status==='REVIEWED','Review the plan before approval');must(p.schedule.revision===s.factsRevision,'Material inputs changed. Generate new alternatives.','STALE_PLAN',409);must(!s.risks.some(r=>r.state==='UNKNOWN'),'Source evidence needs checking. Refresh or resolve the uncertain records before approval.','STALE_EVIDENCE',409);must(p.schedule.allocations.every(a=>a.option.arrival>=today),'This plan contains arrivals before today. Refresh the scenario and calculate a current plan before approval.','STALE_PLAN',409);must(!s.plans.some(x=>x.id!==p.id&&active(x)),'Another plan holds the shared resource allocation.','ACTIVE_PLAN',409);p.approvedBy=actor;p.approvedRevision=s.factsRevision;step(s,p,'APPROVED','Approver approved the full-network schedule; exclusive execution hold created for this tenant.');}
  if(c.action==='send'){must(!p.schedule.allocations.some(a=>s.commitments.find(c=>c.id===a.option.commitmentId)?.stamp.provenance==='ERP_LIVE'),'Live-source plans require the ERP adapter; controlled execution is forbidden');must(p.status==='APPROVED','Approve the plan before execution');must(p.approvedRevision===s.factsRevision,'Material inputs changed after approval. Replan before execution.','STALE_PLAN',409);must(c.failAt===undefined||['accept','execute','receipt'].includes(c.failAt),'Unknown adapter failure mode');p.adapter={id:'CTRL-'+crypto.randomUUID(),cursor:0,nextAt:new Date().toISOString(),receipts:{},failAt:c.failAt};step(s,p,'EXTERNAL_REQUESTED','Action sent to the controlled execution adapter. No ERP or physical action requested.');}
  if(c.action==='cancel'){must(!p.erp,'External ERP request requires document reconciliation before cancellation');must(['PROPOSED','REVIEWED','APPROVED'].includes(p.status),'A requested or executing action requires adapter reconciliation before cancellation');step(s,p,'CANCELLED','Cancelled before adapter execution; execution hold released.');}
  if(c.action==='pump'){
   must(p.adapter&&['EXTERNAL_REQUESTED','EXTERNAL_ACCEPTED','EXECUTING','RECONCILED'].includes(p.status),'No active controlled job to advance');const a=p.adapter;
   if(p.status==='EXTERNAL_REQUESTED'){if(a.failAt==='accept')step(s,p,'REJECTED','Controlled adapter rejected the request.','CONTROLLED_ADAPTER');else{a.cursor=1;step(s,p,'EXTERNAL_ACCEPTED','Controlled adapter accepted the exact approved allocation.','CONTROLLED_ADAPTER');}}
   else if(p.status==='EXTERNAL_ACCEPTED'){
    if(a.failAt==='execute'){step(s,p,'TIMED_OUT','Controlled adapter timed out before confirming execution. Allocation remains held pending investigation.','CONTROLLED_ADAPTER');}
    else{must(p.approvedRevision===s.factsRevision,'Inputs changed before dispatch; execution stopped for review.','STALE_PLAN',409);const total:Record<string,number>={};for(const x of p.schedule.allocations)for(const [id,q] of Object.entries(x.option.uses))total[id]=(total[id]||0)+q*x.qty;for(const [id,q] of Object.entries(total)){if(id.startsWith('lot:')){const l=s.lots.find(l=>l.id===id.slice(4))!;must(l&&l.qty-l.reserved-l.safety>=q,'Source inventory no longer supports the approved schedule');l.qty-=q;}else s.executedUsage[id]=(s.executedUsage[id]||0)+q;}a.cursor=2;step(s,p,'EXECUTING','Controlled dispatch consumed the approved source stock and occupied the planned capacity.','CONTROLLED_ADAPTER');s.factsRevision++;}
   }else if(p.status==='EXECUTING'){
    for(const x of p.schedule.allocations){const received=a.failAt==='receipt'?Math.floor(x.qty/2):x.qty;a.receipts[x.option.id]=received;
     for(const commitment of s.commitments){const n=credit(commitment,x.option)*received;if(n)s.actuals.push({commitmentId:commitment.id,qty:n,at:commitment.kind==='SALE'?x.option.arrival:x.option.steps.filter(st=>st.to===commitment.to&&st.itemId===commitment.itemId&&st.arrive<=commitment.due).map(st=>st.arrive).sort().at(-1)||x.option.arrival,planId:p.id,source:'CONTROLLED_ADAPTER'});}
     if(received){const target=s.commitments.find(c=>c.id===x.option.commitmentId)!;const lotId='RCPT-'+p.id.slice(0,8)+'-'+x.option.id;s.lots.push({id:lotId,nodeId:target.to,itemId:target.itemId,qty:received,reserved:received,safety:0,availableOn:x.option.arrival,expiry:s.recipes.find(r=>x.option.evidence.includes(r.id))?.expiry||s.lots.find(l=>l.itemId===target.itemId&&x.option.evidence.includes(l.id))!.expiry,market:target.market,status:'RELEASED',unitCostPence:0,stamp:{system:'CONTROLLED_ADAPTER',recordId:a.id,sourceAt:s.clock,observedAt:new Date().toISOString(),version:1,provenance:'CONTROLLED'}});}
    }
    a.cursor=3;const final=p.schedule.allocations.map(x=>x.option.arrival).sort().at(-1);if(final&&final>day(s.clock))s.clock=final+'T17:00:00Z';s.factsRevision++;
    step(s,p,a.failAt==='receipt'?'PARTIAL':'RECONCILED',a.failAt==='receipt'?'Controlled receipt quantities differ from dispatch. Remaining stock is in transit or unresolved.':'Every controlled allocation has a matching receipt observation.','CONTROLLED_ADAPTER');
   }else{
    const actualByCommitment:Record<string,number>={};for(const x of s.actuals.filter(x=>x.planId===p.id))actualByCommitment[x.commitmentId]=(actualByCommitment[x.commitmentId]||0)+x.qty;
    must(p.schedule.allocations.every(x=>a.receipts[x.option.id]===x.qty),'Observed receipts do not match the approved plan');
    for(const cmt of s.commitments){const expected=p.schedule.allocations.reduce((n,x)=>n+credit(cmt,x.option)*x.qty,0);must((actualByCommitment[cmt.id]||0)===expected,'Commitment outcome differs from recorded execution evidence');}
    const remaining=s.commitments.filter(c=>c.kind==='SALE').reduce((n,c)=>n+Math.max(0,c.qty-s.actuals.filter(x=>x.commitmentId===c.id&&day(x.at)<=c.due).reduce((q,x)=>q+x.qty,0)),0);
    p.verifiedAt=new Date().toISOString();p.verification={basis:'Exact approved allocation matched to controlled adapter receipts and on-time commitment observations. This is a controlled verification, not a physical warehouse attestation.',actualByCommitment,remaining,provenance:'CONTROLLED'};a.cursor=4;step(s,p,'VERIFIED',`Controlled execution verified; ${remaining} customer units remain uncovered.`,'CONTROLLED_ADAPTER');
   }
   result={status:p.status,externalId:a.id};
  }
  result=result||{planId:p.id,status:p.status};
 }else if(c.action==='policies'){
  must(c.policies&&typeof c.policies==='object','Policies required');must(!s.plans.some(active),'Resolve active execution before changing policies');s.policies={...s.policies,...c.policies};s.factsRevision++;audit(s,actor,'POLICY_UPDATED','Freshness, scheduling horizon or source ownership changed.');
 }else if(c.action==='reset'){
  must(!s.plans.some(active),'Reconcile active execution before resetting');const fresh=seedAssurance(s.tenantId);Object.assign(s,fresh,{revision:current.revision,factsRevision:current.factsRevision+1,audit:[...current.audit],requests:current.requests});audit(s,actor,'CONTROLLED_RESET','Controlled assurance scenario restored; legacy operational records unchanged.');
 }else if(c.action==='import'){
  must(!s.plans.some(active),'Reconcile active execution before importing');must(c.dataset&&typeof c.dataset==='object','Dataset required');const d=structuredClone(c.dataset) as Assurance;d.tenantId=s.tenantId;d.schemaVersion=1;d.revision=s.revision;d.factsRevision=s.factsRevision+1;d.actuals=[];d.executedUsage={};d.observations=[];d.plans=[];d.risks=[];d.audit=s.audit;d.requests=s.requests;d.notificationRead=[];for(const x of [...d.lots,...d.lanes,...d.resources,...d.recipes,...d.commitments])x.stamp.provenance='USER_IMPORTED';validate(d);Object.assign(s,d);audit(s,actor,'DATASET_IMPORTED','Validated network imported. Source provenance is user supplied, not independently attested.');
 }else throw new DomainError('ACTION','Unsupported assurance command');
 validate(s);assess(s);s.revision++;s.requests[c.requestId]={fingerprint,result};must(Object.keys(s.requests).length<=2000,'Request limit reached; export evidence and start a new lab.');return {state:s,result,replay:false};
}
