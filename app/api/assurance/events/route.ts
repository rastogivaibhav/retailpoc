import {DomainError} from '../../../../lib/domain';
import {executeAssurance} from '../../../../lib/assurance/commands';
import {ensure,db,tokenHash,read,write} from '../../../../lib/assurance/store';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request){try{
 const token=req.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)return json({error:'Scoped source token required'},401);await ensure();const grant=await db().prepare('SELECT tenant_id,source_id FROM assurance_hooks WHERE token_hash=?').bind(await tokenHash(token)).first<{tenant_id:string;source_id:string}>();if(!grant)return json({error:'Invalid source token'},403);
 if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'application/json required'},415);const raw=await req.text();if(raw.length>4000)return json({error:'Event too large'},413);let event;try{event=JSON.parse(raw)}catch{return json({error:'Malformed event JSON'},400)}
 if(event.source!==grant.source_id)return json({error:'Token source scope mismatch'},403);
 const current=await read(grant.tenant_id);const out=executeAssurance(current,{action:'observe',expectedRevision:current.revision,requestId:'event-'+(await tokenHash(String(event.id))).slice(0,64),observation:event},'Webhook/'+grant.source_id);if(!out.replay)await write(out.state,current.revision);return json({accepted:true,revision:out.state.revision,riskCases:out.state.risks.length,replay:out.replay});
}catch(e){return json({error:e instanceof DomainError?e.message:'Event ingestion failed'},e instanceof DomainError?e.status:500)}}
