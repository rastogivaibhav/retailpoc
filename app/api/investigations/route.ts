import {owner,requireOwner} from '../../../lib/auth';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {readWorkspace} from '../../../lib/storage';
import {DomainError} from '../../../lib/domain';
import {MODEL,POLICY_VERSION,selectedResult,runInvestigation} from '../../../lib/agent';
import type {AgentRun} from '../../../lib/agent';
import {ensureAI,providerKey,saveRun,readRun} from '../../../lib/ai-storage';
export const dynamic='force-dynamic';
const json=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(){if(!await owner())return json({error:'Owner access required'},403);try{await ensureAI();const rows=await env.DB!.prepare('SELECT snapshot FROM agent_runs ORDER BY created_at DESC LIMIT 20').all<{snapshot:string}>();return json({runs:rows.results.map(r=>JSON.parse(r.snapshot))})}catch{return json({error:'Investigation history unavailable'},503)}}
export async function POST(req:Request){
 let locked=false,run:AgentRun|undefined;
 try{
  await requireOwner();
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Cross-origin action rejected'},403);
  if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'application/json required'},415);
  const text=await req.text();if(text.length>1000)return json({error:'Request too large'},413);
  let body:{orderId?:unknown;expectedRevision?:unknown;requestId?:unknown};try{body=JSON.parse(text)}catch{return json({error:'Malformed JSON'},400)}
  if(typeof body.orderId!=='string'||typeof body.requestId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(body.requestId)||!Number.isSafeInteger(body.expectedRevision))return json({error:'Order, revision and valid request ID required'},400);
  await ensureAI();
  const prior=await readRun(body.requestId);
  if(prior){if(prior.orderId!==body.orderId||prior.revision!==body.expectedRevision)return json({error:'Request ID was used for another investigation'},409);return json({run:prior,replay:true},prior.status==='RUNNING'?202:200);}
  const state=await readWorkspace();if(state.revision!==body.expectedRevision)return json({error:'Data changed. Refresh before investigating.',code:'STALE_REVISION'},409);
  const facts=selectedResult(state,body.orderId);
  if(state.orders.length>100||state.lots.length>300||state.inbounds.length>100||state.lanes.length>100)return json({error:'AI investigation supports up to 100 orders, 300 batches, 100 inbounds and 100 lanes per dataset. Deterministic planning remains available.'},422);
  const key=await providerKey();
  const today=new Date().toISOString().slice(0,10);
  const count=await env.DB!.prepare('SELECT COUNT(*) AS n FROM agent_runs WHERE created_at>=?').bind(today).first<{n:number}>();
  if((count?.n||0)>=30)return json({error:'Daily investigation limit of 30 reached'},429);
  const acquired=await env.DB!.prepare('INSERT INTO agent_control (id,lease,expires) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET lease=excluded.lease,expires=excluded.expires WHERE agent_control.expires<?').bind('main',body.requestId,Date.now()+110000,Date.now()).run();
  if(acquired.meta.changes!==1)return json({error:'Another investigation is running or cooling down. Retry shortly.'},429);
  locked=true;
  const snapshot=JSON.stringify({revision:state.revision,asOf:state.asOf,lots:state.lots,orders:state.orders,inbounds:state.inbounds,lanes:state.lanes,safety:state.safety,transfers:state.transfers});
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const actor=(await getChatGPTUser())?.displayName||'Owner-private service';
  run={policyVersion:POLICY_VERSION,id:body.requestId,orderId:body.orderId,revision:state.revision,inputHash:hash,actor,startedAt:new Date().toISOString(),status:'RUNNING',model:MODEL,trace:[],usage:{inputTokens:0,outputTokens:0,requests:0},facts};
  await env.DB!.prepare('INSERT INTO agent_runs (id,order_id,revision,created_at,snapshot) VALUES (?,?,?,?,?)').bind(run.id,run.orderId,run.revision,run.startedAt,JSON.stringify(run)).run();
  try{await runInvestigation(state,run,key,saveRun);const latest=await readWorkspace();run.status=latest.revision===run.revision?'COMPLETED':'STALE';if(run.status==='STALE')run.error='Workspace changed during investigation. Run again before approving.'}catch(e){run.status='FAILED';run.error=e instanceof Error&&e.name==='TimeoutError'?'NVIDIA response timed out; no recommendation accepted':e instanceof Error?e.message:'Investigation failed';}
  run.finishedAt=new Date().toISOString();await saveRun(run);
  return json({run},run.status==='FAILED'?502:200);
 }catch(e){return json({error:e instanceof DomainError?e.message:'Investigation could not start'},e instanceof DomainError?e.status:500)}
 finally{if(locked){await env.DB!.prepare('UPDATE agent_control SET expires=? WHERE id=? AND lease=?').bind(Date.now()+10000,'main',run?.id||'').run();}}
}
