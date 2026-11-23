import type {Assurance,Schedule} from './model';

export type IntelligenceSignal={id:string;severity:'HIGH'|'MEDIUM'|'LOW';title:string;detail:string;affected:string[];score?:number};

/** Deterministic recovery-tower signals. These are explainable heuristics, not an opaque AI score. */
export function intelligenceSignals(state:Assurance, schedule:Schedule, today=new Date()):IntelligenceSignal[]{
 const signals:IntelligenceSignal[]=[];
 const unknown=state.risks.filter(r=>r.state==='UNKNOWN');
 if(unknown.length)signals.push({id:'evidence',severity:'HIGH',title:'Evidence needs checking',detail:`${unknown.length} dependency record(s) are stale, conflicting or incomplete. The planner will not invent certainty.`,affected:unknown.map(r=>r.commitmentId)});
 const shortages=schedule.outcomes.filter(o=>o.gap>0);
 if(shortages.length)signals.push({id:'service',severity:'HIGH',title:'Customer service exposure',detail:`${shortages.reduce((n,o)=>n+o.gap,0).toLocaleString()} customer or upstream units remain uncovered in this plan.`,affected:shortages.map(o=>o.commitmentId)});
 const exposed=shortages.map(o=>{const c=state.commitments.find(x=>x.id===o.commitmentId);return {o,c,score:(c?.priority||1)*10+o.gap*(c?.unitValuePence||0)/1000};}).sort((a,b)=>b.score-a.score);
 if(exposed.length){const top=exposed[0];signals.push({id:'priority',severity:'HIGH',title:'Priority exposure to resolve first',detail:`${top.o.commitmentId} is ranked first by business priority and value at risk. Score ${Math.round(top.score)}; use this ordering when assigning an owner.`,affected:exposed.slice(0,5).map(x=>x.o.commitmentId),score:Math.round(top.score)});}
 const constrained=Object.entries(schedule.resources).filter(([,r])=>r.capacity>0&&r.used/r.capacity>=.8);
 if(constrained.length)signals.push({id:'capacity',severity:'MEDIUM',title:'Capacity is becoming tight',detail:`${constrained.length} resource(s) are at or above 80% planned utilisation.`,affected:constrained.map(([id])=>id)});
 const idleValue=state.lots.filter(l=>l.status==='RELEASED'&&l.expiry<=state.clock.slice(0,10)).reduce((n,l)=>n+Math.max(0,l.qty-l.reserved-l.safety)*l.unitCostPence,0);
 if(idleValue>0)signals.push({id:'working-capital',severity:'MEDIUM',title:'Inventory value needs attention',detail:`${money(idleValue)} of released stock is at or past its declared expiry date and must not be treated as freely allocatable.`,affected:state.lots.filter(l=>l.status==='RELEASED'&&l.expiry<=state.clock.slice(0,10)).map(l=>l.id)});
 const stale=state.sources.filter(s=>s.mode!=='UNCONNECTED'&&s.lastSync&&today.getTime()-Date.parse(s.lastSync)>state.policies.freshnessHours*3600000);
 const pastArrivals=schedule.allocations.filter(a=>a.option.arrival<today.toISOString().slice(0,10));
 const affected=[...new Set([...stale.map(s=>s.id),...pastArrivals.map(a=>a.option.commitmentId)])];
 if(affected.length)signals.push({id:'freshness',severity:'HIGH',title:'Scenario or source dates are stale',detail:`${stale.length} source(s) exceed the ${state.policies.freshnessHours}-hour freshness limit and ${pastArrivals.length} planned move(s) have arrival dates before today. This result needs refreshing before review.`,affected});
 return signals;
}

function money(pence:number){return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100)}
