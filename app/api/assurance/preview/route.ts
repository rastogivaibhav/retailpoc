import {seedAssurance,must} from '../../../../lib/assurance/model';
import {assess} from '../../../../lib/assurance/engine';
import {executeAssurance} from '../../../../lib/assurance/commands';
import {DomainError} from '../../../../lib/domain';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');must(!origin||origin===new URL(req.url).origin,'Cross-origin preview rejected','ORIGIN',403);
 must(req.headers.get('content-type')?.includes('application/json'),'application/json required');const raw=await req.text();must(raw.length<=250000,'Sample data is too large');
 const body=JSON.parse(raw) as {dataset?:unknown;plans?:boolean;scenario?:'supplier'|'warehouse'|'transport'};must(body.dataset&&typeof body.dataset==='object'&&!Array.isArray(body.dataset),'Sample dataset required');if(body.scenario!==undefined)must(['supplier','warehouse','transport'].includes(body.scenario),'Choose a supported controlled scenario');
 const s=seedAssurance('public-demo');const out=executeAssurance(s,{action:'import',expectedRevision:s.revision,requestId:crypto.randomUUID(),dataset:body.dataset as never},'Temporary public sample preview');
 let current=out.state;if(body.scenario){const changed=executeAssurance(current,{action:'scenario',scenario:body.scenario,expectedRevision:current.revision,requestId:crypto.randomUUID()},'Temporary public sample preview');current=changed.state;}
 if(body.plans){const planned=executeAssurance(current,{action:'plans',expectedRevision:current.revision,requestId:crypto.randomUUID()},'Temporary public sample preview');return json({state:planned.state,baseline:assess(planned.state),access:{signedIn:false,owner:false,role:'viewer',publicExample:true},storage:'Temporary calculation only; not saved to a workspace'});}
 return json({state:current,baseline:assess(current),access:{signedIn:false,owner:false,role:'viewer',publicExample:true},storage:'Temporary calculation only; not saved to a workspace'});
 }catch(e){return json({error:e instanceof DomainError?e.message:'Sample preview failed validation'},e instanceof DomainError?e.status:400)}}
