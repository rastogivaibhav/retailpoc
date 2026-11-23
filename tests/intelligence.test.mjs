import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAssurance} from '../lib/assurance/model.ts';
import {schedule,assess} from '../lib/assurance/engine.ts';
import {intelligenceSignals} from '../lib/assurance/intelligence.ts';

test('historical controlled data raises an explicit freshness signal',()=>{
 const state=seedAssurance();
 assess(state);
 const signals=intelligenceSignals(state,schedule(state,'economical'),new Date('2026-10-21T12:00:00Z'));
 const freshness=signals.find(x=>x.id==='freshness');
 assert.ok(freshness);
 assert.equal(freshness.severity,'HIGH');
 assert.match(freshness.detail,/before today/);
 assert.ok(freshness.affected.includes('ERP'));
});

test('risk ranking reports the highest value and priority commitment with an explanation',()=>{
 const state=seedAssurance();
 state.lots.find(x=>x.id==='PACK-A').availableOn='2026-10-23';
 assess(state);
 const signals=intelligenceSignals(state,schedule(state,'economical'),new Date('2026-10-21T12:00:00Z'));
 const priority=signals.find(x=>x.id==='priority');
 assert.ok(priority);
 assert.ok(priority.affected.length>0);
 assert.match(priority.detail,/ranked first/);
});
