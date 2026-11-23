import {owner,requireOwner} from '../../../lib/auth';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { DomainError,execute,plan,seed,workspace } from '../../../lib/domain';
import type { Workspace,Command } from '../../../lib/domain';
export const dynamic='force-dynamic';
const json=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function read(){
 if(!env.DB)throw new Error('Database binding unavailable');
 const initial=workspace(seed());
 await env.DB.prepare('INSERT OR IGNORE INTO workspaces (id,revision,snapshot,updated_at) VALUES (?,?,?,?)').bind('main',0,JSON.stringify(initial),new Date().toISOString()).run();
 const row=await env.DB.prepare('SELECT snapshot FROM workspaces WHERE id=?').bind('main').first<{snapshot:string}>();
 if(!row)throw new Error('Workspace unavailable');return JSON.parse(row.snapshot) as Workspace;
}
export async function GET(){try{const u=await owner();const state=u?await read():workspace(seed());return json({state,plan:plan(state),access:{owner:Boolean(u)},boundary:'Public controlled demonstration. Operational records and actions require the owner.'})}catch(e){return error(e)}}
export async function POST(req:Request){try{
 await requireOwner();
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Cross-origin action rejected'},403);
 if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'application/json required'},415);
 const text=await req.text();if(text.length>1500000)return json({error:'Maximum dataset size is 1.5 MB'},413);
 let command:Command;try{command=JSON.parse(text)}catch{return json({error:'Malformed JSON'},400)}
 const user=await getChatGPTUser();const actor=user?.displayName||'Owner-private service';
 const current=await read();const out=execute(current,command,actor);
 if(!out.replay){const saved=await env.DB!.prepare('UPDATE workspaces SET snapshot=?,revision=?,updated_at=? WHERE id=? AND revision=?').bind(JSON.stringify(out.state),out.state.revision,new Date().toISOString(),'main',current.revision).run();if(saved.meta.changes!==1)return json({error:'Concurrent update. Refresh and review.',code:'STALE_REVISION'},409)}
 return json({state:out.state,plan:plan(out.state),result:out.result,replay:out.replay});
 }catch(e){return error(e)}}
function error(e:unknown){if(e instanceof DomainError)return json({error:e.message,code:e.code},e.status);console.error('workspace request failed',e instanceof Error?e.message:'unknown');return json({error:'Request failed. No action was committed.'},500)}
