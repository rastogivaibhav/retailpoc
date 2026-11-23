import {seedAssurance,audit,must} from '../../../lib/assurance/model';
import {assess} from '../../../lib/assurance/engine';
import {executeAssurance,controlledSignal} from '../../../lib/assurance/commands';
import type {AssuranceCommand} from '../../../lib/assurance/commands';
import {scope,read,write,db,ensure,tokenHash} from '../../../lib/assurance/store';
import {authorise} from '../../../lib/operations/jobs';
import {enqueueControlled} from '../../../lib/operations/runtime';
import {DomainError} from '../../../lib/domain';
export const dynamic='force-dynamic';
const json=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(req:Request){try{const identity=await scope(req),state=identity?await read(identity.tenantId):seedAssurance();if(!identity){const scenario=new URL(req.url).searchParams.get('scenario');const scenarios=(scenario||'').split(',').filter(Boolean);if(scenarios.length&&scenarios.length<=5&&scenarios.every(x=>['supplier','warehouse','transport'].includes(x))){const out=executeAssurance(state,{action:scenarios.length===1?'scenario':'scenarios',...(scenarios.length===1?{scenario:scenarios[0] as 'supplier'|'warehouse'|'transport'}:{scenarios:scenarios as ('supplier'|'warehouse'|'transport')[]}),expectedRevision:state.revision,requestId:'public-example-'+scenario},'Controlled public example');Object.assign(state,out.state);}if(new URL(req.url).searchParams.get('preview')==='plans'){const out=executeAssurance(state,{action:'plans',expectedRevision:state.revision,requestId:'public-plans-preview'},'Controlled public example');Object.assign(state,out.state);}}const baseline=assess(state);return json({state,baseline,access:{signedIn:Boolean(identity),owner:identity?.isOwner||false,role:identity?.role||'viewer',publicExample:!identity},storage:'Cloudflare D1; PostgreSQL migration requires a configured endpoint.'})}catch(e){return fail(e)}}
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Cross-origin action rejected'},403);
 const identity=await scope(req);if(!identity)return json({error:'Sign in to use a private lab workspace',signIn:'/signin-with-chatgpt?return_to=%2F'},401);
 must(req.headers.get('content-type')?.includes('application/json'),'application/json required');const raw=await req.text();must(raw.length<=250000,'Request too large');let c:AssuranceCommand;try{c=JSON.parse(raw)}catch{throw new DomainError('JSON','Malformed JSON')}
 authorise(identity.role,c.action);
 if(c.action==='webhook-key'){
  const source=(c as unknown as {source:string}).source;must(['SUPPLIER','ERP','TMS','MES'].includes(source),'Choose a supported event source');await ensure();const bytes=crypto.getRandomValues(new Uint8Array(32));const token=Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');
  await db().batch([db().prepare('DELETE FROM assurance_hooks WHERE tenant_id=? AND source_id=?').bind(identity.tenantId,source),db().prepare('INSERT INTO assurance_hooks VALUES (?,?,?,?)').bind(await tokenHash(token),identity.tenantId,source,new Date().toISOString())]);return json({token,source,endpoint:new URL('/api/assurance/events',req.url).href,notice:'Shown once. This token can ingest events only for this source and private tenant.'});
 }
 const current=await read(identity.tenantId);const out=executeAssurance(current,c,identity.actor);if(!out.replay)await write(out.state,current.revision);if(c.action==='send'&&c.planId)await enqueueControlled(identity.tenantId,c.planId);return json({...out,baseline:assess(out.state)});
}catch(e){return fail(e)}}
function fail(e:unknown){return json({error:e instanceof DomainError?e.message:'Assurance request failed'},e instanceof DomainError?e.status:500)}
