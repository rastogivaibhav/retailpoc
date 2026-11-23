import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validate,seedAssurance} from '../lib/assurance/model.ts';
import {executeAssurance} from '../lib/assurance/commands.ts';
import {schedule} from '../lib/assurance/engine.ts';
import {traceAllocation} from '../lib/assurance/decision-trace.ts';

const fixture=JSON.parse(await readFile(new URL('../examples/beauty-network-validation.json',import.meta.url),'utf8'));
function dataset(){
 const state=structuredClone(fixture);state.tenantId='beauty-validation-test';state.revision=0;state.factsRevision=0;state.actuals=[];state.executedUsage={};state.observations=[];state.risks=[];state.plans=[];state.audit=[];state.requests={};state.notificationRead=[];
 for(const record of [...state.lots,...state.lanes,...state.resources,...state.recipes,...state.commitments])record.stamp.provenance='USER_IMPORTED';
 return validate(state);
}
function applyScenario(state,scenario){return executeAssurance(state,{action:'scenario',scenario,expectedRevision:state.revision,requestId:crypto.randomUUID()},'validation operator','2026-10-21').state;}
function assertCostsReconcile(state,plan){const move=plan.allocations.reduce((total,a)=>total+a.qty*a.option.costPence,0);const fixed=new Set(plan.allocations.flatMap(a=>a.option.steps.filter(s=>state.lanes.some(l=>l.id===s.edgeId)).map(s=>`${s.edgeId}:${s.depart}`)));const shared=[...fixed].reduce((total,key)=>total+state.lanes.find(l=>l.id===key.slice(0,key.lastIndexOf(':'))).fixedPence,0);assert.equal(move+shared,plan.costPence);}

test('illustrative beauty dataset validates and covers freshness, quality, market, expiry and capacity constraints',()=>{
 const state=dataset();assert.equal(state.nodes.length,8);assert.equal(state.commitments.filter(c=>c.kind==='SALE').length,4);assert.ok(state.clock.startsWith('2026-10-21'));
 const plan=schedule(state,'economical');assert.equal(plan.fulfilled,2100);assert.ok(plan.resources['resource:FILL-LINE:2026-10-22']);
 for(const allocation of plan.allocations){assert.ok(!allocation.option.evidence.includes('SERUM-QA-HOLD'));assert.ok(!allocation.option.evidence.includes('SERUM-EU-LABEL'));assert.ok(!allocation.option.evidence.includes('SERUM-SHORT-LIFE'));}
 assertCostsReconcile(state,plan);
});

test('supplier delay carries through the sample dataset without planning PACK-A before availability',()=>{
 const state=applyScenario(dataset(),'supplier');const plan=schedule(state,'economical');
 assert.equal(state.lots.find(x=>x.id==='PACK-A').availableOn,'2026-10-23');assert.equal(plan.outcomes.find(x=>x.commitmentId==='PO-PACK-A').gap,1800);
 for(const allocation of plan.allocations.filter(x=>x.option.evidence.includes('PACK-A'))){assert.ok(allocation.option.arrival>='2026-10-23');assert.ok(allocation.option.steps.every(step=>step.depart>='2026-10-23'));}
 assertCostsReconcile(state,plan);
});

test('warehouse hold scenario excludes SOUTH-SERUM and identifies uncovered customer orders',()=>{
 const state=applyScenario(dataset(),'warehouse');const plan=schedule(state,'economical');
 assert.equal(state.lots.find(x=>x.id==='SOUTH-SERUM').status,'HOLD');assert.ok(plan.allocations.every(a=>!a.option.evidence.includes('SOUTH-SERUM')));assert.ok(plan.outcomes.some(o=>state.commitments.some(c=>c.id===o.commitmentId&&c.kind==='SALE')&&o.gap>0));assert.equal(plan.outcomes.find(o=>o.commitmentId==='SALE-CREAM').gap,0);assertCostsReconcile(state,plan);
});

test('route disruption excludes N-A and uses only finite configured express capacity',()=>{
 const state=applyScenario(dataset(),'transport');const plan=schedule(state,'economical');
 assert.ok(plan.allocations.every(a=>a.option.steps.every(step=>step.edgeId!=='N-A')));assert.ok(plan.allocations.some(a=>a.option.steps.some(step=>step.edgeId==='N-A-EXPRESS')));
 for(const [id,use] of Object.entries(plan.resources)){if(id.startsWith('lane:N-A-EXPRESS:'))assert.ok(use.used<=state.lanes.find(x=>x.id==='N-A-EXPRESS').dailyCapacity);}
 assertCostsReconcile(state,plan);
});

test('app preview can import the dataset and then apply a controlled problem without saving it',()=>{
 const preview=executeAssurance(seedAssurance(),{action:'import',expectedRevision:0,requestId:crypto.randomUUID(),dataset:dataset()},'Temporary public sample preview','2026-10-21').state;
 const changed=applyScenario(preview,'supplier');const planned=executeAssurance(changed,{action:'plans',expectedRevision:changed.revision,requestId:crypto.randomUUID()},'Temporary public sample preview','2026-10-21').state;
 assert.equal(planned.plans.length,2);assert.equal(planned.plans[0].status,'PROPOSED');assert.equal(planned.plans[0].schedule.revision,planned.factsRevision);
});

test('decision trace shows source provenance and explains why held stock was not selected',()=>{
 const state=dataset(),plan=schedule(state,'economical'),allocation=plan.allocations.find(x=>x.option.commitmentId==='SALE-B');assert.ok(allocation);
 const trace=traceAllocation(state,allocation,'2026-10-21');
 assert.ok(trace.records.some(x=>x.kind==='Commitment'&&x.id==='SALE-B'&&x.trusted));
 assert.ok(trace.records.some(x=>x.kind==='Stock lot'&&x.id==='PACK-A'&&x.trusted));
 assert.ok(trace.records.some(x=>x.kind==='Route'&&x.stamp.recordId));
 const held=trace.lots.find(x=>x.lot.id==='SERUM-QA-HOLD');assert.equal(held.eligible,false);assert.match(held.reason,/quality status is HOLD/);
 assert.equal(trace.pastArrival,false);
 const past=traceAllocation(state,allocation,'2026-10-26');assert.equal(past.pastArrival,true);
});
