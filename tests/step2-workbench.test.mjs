import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAssurance} from '../lib/assurance/model.ts';
import {executeAssurance} from '../lib/assurance/commands.ts';
import {calculateDisruptionImpacts,sortOrders,getDisruptionImpact} from '../components/step2-workbench.ts';

function combined(){let state=seedAssurance();const result=executeAssurance(state,{action:'scenarios',scenarios:['supplier','warehouse'],expectedRevision:state.revision,requestId:crypto.randomUUID()},'QA','2026-10-19');return result.state;}
function fixtureSchedule(rows){return {outcomes:Object.entries(rows).map(([commitmentId,timelyQty])=>({commitmentId,timelyQty,gap:({A:100,B:100,C:100}[commitmentId]||0)-timelyQty}))};}

test('two disruption marginal attribution returns per-order impacts for three orders',()=>{
 const state=combined(),ids=state.disruptions.filter(d=>d.active).map(d=>d.id),full={A:60,B:80,C:100},without={
  [ids[0]]:{A:70,B:100,C:100},[ids[1]]:{A:80,B:90,C:100}
 };
 const runner=s=>{const active=s.disruptions.filter(d=>d.active);if(active.length===2)return fixtureSchedule(full);const removed=ids.find(id=>!active.some(d=>d.id===id));return fixtureSchedule(without[removed]);};
 const result=calculateDisruptionImpacts(state,runner,8000,()=>1);
 assert.equal(result.status,'READY');assert.equal(result.byDisruption[ids[0]].A,10);assert.equal(result.byDisruption[ids[0]].B,20);assert.equal(result.byDisruption[ids[1]].A,20);assert.equal(result.byDisruption[ids[1]].B,10);assert.equal(result.byDisruption[ids[0]].C,0);assert.equal(getDisruptionImpact(50,70),0);
});

test('overlapping marginal impacts flag the order row',()=>{
 const state=combined(),ids=state.disruptions.filter(d=>d.active).map(d=>d.id),runner=s=>{const active=s.disruptions.filter(d=>d.active);return active.length===2?fixtureSchedule({A:70,B:85,C:100}):active.some(d=>d.id===ids[0])?fixtureSchedule({A:90,B:95,C:100}):fixtureSchedule({A:90,B:95,C:100});};
 const result=calculateDisruptionImpacts(state,runner,8000,()=>1);assert.equal(result.status,'READY');assert.equal(result.overlapByOrder.A,true);assert.equal(result.overlapByOrder.B,true);assert.equal(result.overlapByOrder.C,false);
});

test('slow attribution skips individual columns and returns combined-impact fallback',()=>{
 const state=combined();let elapsed=0;const runner=()=>{elapsed+=9001;return fixtureSchedule({A:60,B:80,C:100})};const result=calculateDisruptionImpacts(state,runner,8000,()=>elapsed);
 assert.equal(result.status,'FALLBACK');assert.match(result.reason,/Individual attribution unavailable/);assert.match(result.reason,/combined shortfall only/);
});

test('attribution is cached by scenario version',()=>{
 const state=combined(),first=calculateDisruptionImpacts(state),cached=calculateDisruptionImpacts(state);assert.equal(first,cached);
 const next=structuredClone(state);next.factsRevision++;assert.notEqual(calculateDisruptionImpacts(next),first);
});

test('priority sort uses effective order priority descending',()=>{
 const s=seedAssurance(),items=s.commitments.filter(c=>['SALE-A','SALE-B','SALE-CREAM','SALE-CREAM-PROMO'].includes(c.id)).map((c,i)=>({id:c.id,commitmentId:c.id,gap:i+1}));
 assert.deepEqual(sortOrders(items,s.commitments,s.policies.orderPriorityMultipliers,'PRIORITY').map(x=>x.id),['SALE-CREAM-PROMO','SALE-A','SALE-B','SALE-CREAM']);
});

test('due-date sort is ascending and stable for ties',()=>{
 const s=seedAssurance();s.commitments.find(c=>c.id==='SALE-A').due='2026-10-22';s.commitments.find(c=>c.id==='SALE-B').due='2026-10-21';const items=['SALE-A','SALE-B','SALE-CREAM','SALE-CREAM-PROMO'].map(id=>({id,commitmentId:id,gap:1}));
 assert.deepEqual(sortOrders(items,s.commitments,s.policies.orderPriorityMultipliers,'DUE_DATE').map(x=>x.id),['SALE-B','SALE-A','SALE-CREAM','SALE-CREAM-PROMO']);
});

test('penalty-risk sort ranks estimated penalty first and null penalty orders last',()=>{
 const s=seedAssurance(),items=['SALE-A','SALE-CREAM-PROMO','SALE-B','SALE-CREAM'].map((id,i)=>({id,commitmentId:id,gap:[1,25,3,4][i]}));
 assert.deepEqual(sortOrders(items,s.commitments,s.policies.orderPriorityMultipliers,'PENALTY').map(x=>x.id),['SALE-CREAM-PROMO','SALE-A','SALE-B','SALE-CREAM']);
});

test('units-at-risk sort is descending',()=>{
 const s=seedAssurance(),items=['SALE-A','SALE-B','SALE-CREAM','SALE-CREAM-PROMO'].map((id,i)=>({id,commitmentId:id,gap:[5,40,10,40][i]}));
 assert.deepEqual(sortOrders(items,s.commitments,s.policies.orderPriorityMultipliers,'UNITS_AT_RISK').map(x=>x.id),['SALE-B','SALE-CREAM-PROMO','SALE-CREAM','SALE-A']);
});
