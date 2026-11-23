import {owner,requireOwner} from '../../../lib/auth';
import {DomainError} from '../../../lib/domain';
import {readWorkspace} from '../../../lib/storage';
import {simulate} from '../../../lib/integration-domain';
import type {Sim,SimEvent} from '../../../lib/integration-domain';
import {db,ensureIntegrations,readSim} from '../../../lib/integration-storage';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(){if(!await owner())return json({error:'Owner access required'},403);try{await ensureIntegrations();const r=await db().prepare('SELECT snapshot FROM wms_simulations ORDER BY rowid DESC LIMIT 30').all<{snapshot:string}>();return json({source:'WMS_SIMULATOR',simulations:r.results.map(x=>JSON.parse(x.snapshot))})}catch{return json({error:'Simulator unavailable'},503)}}
export async function POST(req:Request){try{
 await requireOwner();
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Cross-origin action rejected'},403);
 if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'application/json required'},415);
 const raw=await req.text();if(raw.length>2000)return json({error:'Request too large'},413);let b:Record<string,unknown>;try{b=JSON.parse(raw)}catch{return json({error:'Malformed JSON'},400)}
 await ensureIntegrations();
 if(b.action==='start-demo'){
  const sim:Sim={id:crypto.randomUUID(),transferId:'SIM-DEMO-100',qty:100,revision:0,status:'NEW',events:[]};await db().prepare('INSERT INTO wms_simulations (id,revision,snapshot) VALUES (?,?,?)').bind(sim.id,0,JSON.stringify(sim)).run();return json({simulation:sim});
 }
 if(b.action==='start'){
  const w=await readWorkspace();if(w.revision!==b.expectedRevision)throw new DomainError('STALE','Workspace changed. Refresh before starting a simulation.',409);
  const t=w.transfers.find(x=>x.id===b.transferId);if(!t)throw new DomainError('TRANSFER','Choose an approved transfer first');
  const sim:Sim={id:crypto.randomUUID(),transferId:t.id,qty:t.qty,revision:0,status:'NEW',events:[]};
  await db().prepare('INSERT INTO wms_simulations (id,revision,snapshot) VALUES (?,?,?)').bind(sim.id,sim.revision,JSON.stringify(sim)).run();return json({simulation:sim});
 }
 if(b.action==='event'){
  if(typeof b.simulationId!=='string')throw new DomainError('SIM','Simulation ID required');const current=await readSim(b.simulationId);if(!current)throw new DomainError('SIM','Simulation not found');
  if(!b.event||typeof b.event!=='object')throw new DomainError('EVENT','Event required');const r=b.event as Record<string,unknown>;
  const next=simulate(current,{id:r.id as string,type:r.type as SimEvent['type'],qty:r.qty as number,note:r.note as string},b.expectedRevision as number);
  if(next===current)return json({simulation:current,replay:true});
  const result=await db().prepare('UPDATE wms_simulations SET revision=?,snapshot=? WHERE id=? AND revision=?').bind(next.revision,JSON.stringify(next),next.id,current.revision).run();if(!result.meta.changes)throw new DomainError('STALE','Simulator changed. Refresh before acting.',409);return json({simulation:next});
 }
 throw new DomainError('ACTION','Unsupported simulator action');
}catch(e){return json({error:e instanceof DomainError?e.message:'Simulation failed'},e instanceof DomainError?e.status:500)}}
