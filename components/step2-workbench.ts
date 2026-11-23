import {schedule} from '../lib/assurance/engine.ts';
import type {Assurance,Disruption,Schedule,RiskCase,Commitment} from '../lib/assurance/model.ts';

export type Step2Sort='PRIORITY'|'DUE_DATE'|'PENALTY'|'UNITS_AT_RISK';
export type ImpactResult={status:'READY';byDisruption:Record<string,Record<string,number>>;overlapByOrder:Record<string,boolean>;elapsedMs:number}|{status:'FALLBACK';elapsedMs:number;reason:string};
export type ScheduleRunner=(state:Assurance,mode:'baseline')=>Schedule;
const attributionCache=new Map<string,ImpactResult>();
function scenarioVersionKey(state:Assurance){return JSON.stringify([state.tenantId,state.revision,state.factsRevision,state.clock,state.disruptions.filter(d=>d.active),state.observations.map(o=>[o.id,o.sourceVersion,o.entityId,o.field,o.value])]);}

export function sortOrders<T extends RiskCase>(orders:T[],commitments:Commitment[],multipliers:Assurance['policies']['orderPriorityMultipliers'],sort:Step2Sort):T[]{
 const byId=new Map(commitments.map(c=>[c.id,c]));
 const hasPenalty=(c:Commitment|undefined)=>c?.orderType==='PROMOTIONAL'&&c.penaltyPerCasePence!=null&&c.unitsPerCase!=null&&c.unitsPerCase>0;
 const penalty=(r:RiskCase,c:Commitment|undefined)=>hasPenalty(c)?Math.ceil(r.gap/(c!.unitsPerCase||1))*(c!.penaltyPerCasePence||0):0;
 return orders.map((order,index)=>({order,index,commitment:byId.get(order.commitmentId)})).sort((a,b)=>{
  const ac=a.commitment,bc=b.commitment;let delta=0;
  if(sort==='DUE_DATE')delta=(ac?.due||'').localeCompare(bc?.due||'');
  else if(sort==='PENALTY'){const ah=hasPenalty(ac),bh=hasPenalty(bc);if(ah!==bh)return ah?-1:1;const ap=penalty(a.order,ac),bp=penalty(b.order,bc);delta=bp-ap;}
  else if(sort==='UNITS_AT_RISK')delta=b.order.gap-a.order.gap;
  else delta=(bc?bc.priority*(multipliers[bc.orderType||'STANDARD']||1):0)-(ac?ac.priority*(multipliers[ac.orderType||'STANDARD']||1):0);
  return delta||a.index-b.index;
 }).map(x=>x.order);
}

export function getDisruptionImpact(withoutTimelyQty:number,fullTimelyQty:number):number{return Math.max(0,withoutTimelyQty-fullTimelyQty);}

/** Reconstructs only the three reversible controlled examples. Unknown source states are not guessed. */
export function withoutControlledDisruption(input:Assurance,disruption:Disruption):Assurance|null{
 const state=structuredClone(input);const disabled=state.disruptions.find(d=>d.id===disruption.id);if(!disabled)return null;disabled.active=false;
 if(disruption.type==='SUPPLIER_LATE'){
  const lots=state.lots.filter(l=>l.nodeId===disruption.affectedNode&&l.itemId===disruption.affectedItem&&l.availableOn===disruption.expectedResolutionDate);
  if(!lots.length)return null;
  for(const lot of lots)lot.availableOn=state.clock.slice(0,10);
  state.observations=state.observations.filter(o=>!(o.field==='availableOn'&&lots.some(l=>l.id===o.entityId)));
 }else if(disruption.type==='WAREHOUSE_HOLD'){
  const lot=state.lots.find(l=>l.id===disruption.recordId&&l.nodeId===disruption.affectedNode&&l.itemId===disruption.affectedItem&&l.status==='HOLD');if(!lot)return null;lot.status='RELEASED';state.observations=state.observations.filter(o=>!(o.field==='status'&&o.entityId===lot.id));
 }else if(disruption.type==='ROUTE_UNAVAILABLE'){
  const lane=state.lanes.find(l=>l.id===(disruption.recordId||disruption.affectedNode)&&l.blocked);if(!lane)return null;lane.blocked=false;state.observations=state.observations.filter(o=>!(o.field==='blocked'&&o.entityId===lane.id));
 }else return null;
 return state;
}

export function calculateDisruptionImpacts(state:Assurance,runner:ScheduleRunner=schedule,timeoutMs=8000,now=()=>performance.now()):ImpactResult{
 const active=state.disruptions.filter(d=>d.active);if(active.length<2)return {status:'READY',byDisruption:{},overlapByOrder:{},elapsedMs:0};const key=scenarioVersionKey(state),useCache=runner===schedule;if(useCache){const cached=attributionCache.get(key);if(cached)return cached;}const started=now(),store=(result:ImpactResult)=>{if(useCache){attributionCache.set(key,result);while(attributionCache.size>50)attributionCache.delete(attributionCache.keys().next().value!);}return result;};
 const full=runner(state,'baseline');if(now()-started>timeoutMs)return store({status:'FALLBACK',elapsedMs:now()-started,reason:'Individual attribution unavailable — scenario too large. Showing combined shortfall only.'});
 const byDisruption:Record<string,Record<string,number>>={};
 for(const disruption of active){if(now()-started+1500>timeoutMs)return store({status:'FALLBACK',elapsedMs:now()-started,reason:'Individual attribution unavailable — scenario too large. Showing combined shortfall only.'});const counterfactual=withoutControlledDisruption(state,disruption);if(!counterfactual)return store({status:'FALLBACK',elapsedMs:now()-started,reason:'Individual attribution unavailable — source state cannot be reconstructed. Showing combined shortfall only.'});const without=runner(counterfactual,'baseline');if(now()-started>timeoutMs)return store({status:'FALLBACK',elapsedMs:now()-started,reason:'Individual attribution unavailable — scenario too large. Showing combined shortfall only.'});const perOrder:Record<string,number>={};for(const outcome of full.outcomes){const withoutOutcome=without.outcomes.find(x=>x.commitmentId===outcome.commitmentId);if(withoutOutcome)perOrder[outcome.commitmentId]=getDisruptionImpact(withoutOutcome.timelyQty,outcome.timelyQty);}byDisruption[disruption.id]=perOrder;}
 const overlapByOrder:Record<string,boolean>={};for(const outcome of full.outcomes){const attributed=active.reduce((n,d)=>n+(byDisruption[d.id]?.[outcome.commitmentId]||0),0);overlapByOrder[outcome.commitmentId]=outcome.gap<attributed;}
 const result:ImpactResult={status:'READY',byDisruption,overlapByOrder,elapsedMs:now()-started};return store(result);
}

export function shortDisruptionLabel(disruption:Disruption):string{
 let label='';if(disruption.type==='SUPPLIER_LATE')label=`${disruption.affectedNode} late`;else if(disruption.type==='WAREHOUSE_HOLD')label='WH hold';else if(disruption.type==='ROUTE_UNAVAILABLE')label=`Route ${disruption.recordId||disruption.affectedNode}`;else if(disruption.type==='QUALITY_HOLD')label='Quality hold';else label=`${disruption.type.replaceAll('_',' ').toLowerCase()}`;
 return label.length>12?`${label.slice(0,11).trimEnd()}…`:label;
}
