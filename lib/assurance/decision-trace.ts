import {trusted} from './engine.ts';
import type {Allocation, Assurance, Lane, Lot, Stamp} from './model.ts';

export type TraceRecord={kind:string;id:string;name:string;detail:string;stamp:Stamp;trusted:boolean};
export type LotAssessment={lot:Lot;used:number;eligible:boolean;reason:string};

/** Build an auditable explanation from the exact records used by a planned allocation. */
export function traceAllocation(state:Assurance,allocation:Allocation,today=state.clock.slice(0,10)):{records:TraceRecord[];lots:LotAssessment[];pastArrival:boolean}{
 const option=allocation.option,commitment=state.commitments.find(x=>x.id===option.commitmentId);
 if(!commitment) return {records:[],lots:[],pastArrival:option.arrival<today};
 const recordIds=new Set(option.evidence),records:TraceRecord[]=[];
 const add=(kind:string,id:string,name:string,detail:string,stamp:Stamp)=>records.push({kind,id,name,detail,stamp,trusted:trusted(state,stamp)});
 add('Commitment',commitment.id,`${commitment.kind} · ${commitment.id}`,`${commitment.qty.toLocaleString()} ${commitment.uom} due ${commitment.due} · priority ${commitment.priority}`,commitment.stamp);
 for(const lot of state.lots.filter(x=>recordIds.has(x.id))) add('Stock lot',lot.id,`${lot.id} · ${state.items.find(i=>i.id===lot.itemId)?.name||lot.itemId}`,`${lot.qty.toLocaleString()} units; ${lot.qty-lot.reserved-lot.safety} free after reservations and safety stock; ${lot.status}; ${lot.market} market; available ${lot.availableOn}; expires ${lot.expiry}`,lot.stamp);
 const lanes=new Map<string,Lane>();
 for(const step of option.steps){
  const lane=state.lanes.find(x=>x.id===step.edgeId);if(lane)lanes.set(lane.id,lane);
  const recipe=state.recipes.find(x=>x.id===step.edgeId);if(recipe&&recordIds.has(recipe.id)) add('Recipe',recipe.id,recipe.id,`${recipe.inputs.map(i=>`${i.qtyPerUnit} ${state.items.find(x=>x.id===i.itemId)?.name||i.itemId}`).join(' + ')} → ${state.items.find(x=>x.id===recipe.outputItemId)?.name||recipe.outputItemId}; ${recipe.days} day(s); ${recipe.market} market`,recipe.stamp);
 }
 for(const lane of lanes.values()) add('Route',lane.id,`${lane.id} · ${state.nodes.find(x=>x.id===lane.from)?.name||lane.from} → ${state.nodes.find(x=>x.id===lane.to)?.name||lane.to}`,`${lane.days} day(s); ${lane.dailyCapacity.toLocaleString()} units/day; ${lane.unitCostPence} pence/unit + ${lane.fixedPence} pence fixed charge`,lane.stamp);
 for(const id of recordIds){const resource=state.resources.find(x=>x.id===id);if(resource)add('Production capacity',resource.id,resource.id,`${resource.dailyCapacity.toLocaleString()} units/day; blocked dates: ${resource.blockedDays.join(', ')||'none'}`,resource.stamp)}
 const usedLots=new Set(records.filter(x=>x.kind==='Stock lot').map(x=>x.id));
 const lots=state.lots.filter(x=>x.itemId===commitment.itemId&&x.nodeId===commitment.from).map(lot=>{
  const used=usedLots.has(lot.id)?allocation.qty:0;let reason='Passes lot-level market, quality, date, shelf-life and stock checks; route and capacity are evaluated separately.';
  if(used)reason='Selected for this allocation.';
  else if(lot.status!=='RELEASED')reason='Excluded: quality status is HOLD.';
  else if(!trusted(state,lot.stamp))reason='Excluded: source evidence is stale, incomplete or conflicting.';
  else if(lot.availableOn>commitment.due)reason=`Excluded: available ${lot.availableOn}, after the commitment due date ${commitment.due}.`;
  else if(lot.qty<=lot.reserved+lot.safety)reason='Excluded: no free units remain after reservations and safety stock.';
  else if(!(lot.market==='*'||lot.market===commitment.market||commitment.market==='*'))reason=`Excluded: lot is labelled for ${lot.market}, not ${commitment.market}.`;
  else if(lot.expiry<new Date(Date.parse(`${commitment.due}T00:00:00Z`)+commitment.minShelfDays*86400000).toISOString().slice(0,10))reason=`Excluded: expiry ${lot.expiry} does not meet the ${commitment.minShelfDays}-day shelf-life requirement.`;
  return {lot,used,eligible:used>0||reason.startsWith('Passes lot-level'),reason};
 });
 return {records,lots,pastArrival:option.arrival<today};
}
