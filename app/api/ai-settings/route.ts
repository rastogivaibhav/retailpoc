import {owner,requireOwner} from '../../../lib/auth';
import {configured,saveProviderKey} from '../../../lib/ai-storage';
import {MODEL} from '../../../lib/agent';
import {DomainError} from '../../../lib/domain';
export const dynamic='force-dynamic';
const json=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(){try{return json({configured:await configured(),provider:'NVIDIA',model:MODEL})}catch{return json({error:'AI settings unavailable'},503)}}
export async function POST(req:Request){
 try{
  await requireOwner();
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Cross-origin action rejected'},403);
  if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'application/json required'},415);
  const text=await req.text();if(text.length>1200)return json({error:'Request too large'},413);
  let body:{key?:unknown};try{body=JSON.parse(text)}catch{return json({error:'Malformed JSON'},400)}
  if(typeof body.key!=='string')return json({error:'NVIDIA key required'},400);
  await saveProviderKey(body.key.trim());return json({configured:true,provider:'NVIDIA',model:MODEL});
 }catch(e){return json({error:e instanceof DomainError?e.message:'Credential could not be stored'},e instanceof DomainError?e.status:500)}
}
