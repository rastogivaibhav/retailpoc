import {scope,ensure,db} from '../../../lib/assurance/store';
import {must} from '../../../lib/assurance/model';
import {DomainError} from '../../../lib/domain';

export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const readinessIds=['realData','dataQuality','plannerRules','roles','erpSandbox','reconciliation','support','successMeasures'];
type JsonRecord=Record<string,unknown>;
const isRecord=(value:unknown):value is JsonRecord=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const blank=()=>({
 scorecard:{period:'',source:'',decisionMinutesBefore:'',decisionMinutesAfter:'',onTimeRateBefore:'',onTimeRateAfter:'',expediteSpendBefore:'',expediteSpendAfter:'',plannerMinutesBefore:'',plannerMinutesAfter:'',notes:''},
 readiness:readinessIds.map(id=>({id,status:'NOT_STARTED',owner:'',evidence:''})),
 offer:{customerType:'',buyer:'',workflow:'',sites:'',products:'',erp:'ERPNext sandbox',durationWeeks:'4',fee:'',successMeasures:'',exclusions:'',nextStep:''}
});
async function ensurePilotTable(){await ensure();await db().prepare('CREATE TABLE IF NOT EXISTS pilot_workspace (tenant_id TEXT PRIMARY KEY,snapshot TEXT NOT NULL,updated_at TEXT NOT NULL)').run()}
export async function GET(req:Request){try{const p=await scope(req);if(!p)return json({workspace:blank(),saved:false});await ensurePilotTable();const r=await db().prepare('SELECT snapshot,updated_at FROM pilot_workspace WHERE tenant_id=?').bind(p.tenantId).first<{snapshot:string;updated_at:string}>();return json({workspace:r?JSON.parse(r.snapshot):blank(),saved:Boolean(r),updatedAt:r?.updated_at||null})}catch{return json({error:'Pilot workspace is unavailable'},500)}}
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');must(!origin||origin===new URL(req.url).origin,'Cross-origin action rejected','ORIGIN',403);
 const p=await scope(req);must(p,'Sign in to save pilot evidence','AUTH',401);must(p.isOwner||p.role==='planner'||p.role==='admin','Your workspace role cannot edit pilot evidence','FORBIDDEN',403);
 must(req.headers.get('content-type')?.includes('application/json'),'application/json required');const raw=await req.text();must(raw.length<=50000,'Pilot workspace is too large');
 const body=JSON.parse(raw) as {workspace?:unknown};const w=body.workspace;must(isRecord(w),'Pilot workspace required');
 const s=w.scorecard,o=w.offer,r=w.readiness;must(isRecord(s)&&isRecord(o)&&Array.isArray(r)&&r.length===readinessIds.length,'Scorecard, checklist and offer are required');
 for(const k of ['period','source','decisionMinutesBefore','decisionMinutesAfter','onTimeRateBefore','onTimeRateAfter','expediteSpendBefore','expediteSpendAfter','plannerMinutesBefore','plannerMinutesAfter','notes'])must(typeof s[k]==='string'&&s[k].length<=2000,`Invalid scorecard field: ${k}`);
 for(const k of ['customerType','buyer','workflow','sites','products','erp','durationWeeks','fee','successMeasures','exclusions','nextStep'])must(typeof o[k]==='string'&&o[k].length<=2000,`Invalid offer field: ${k}`);
 const ids=new Set<string>();for(const value of r){must(isRecord(value),'Readiness item must be an object');const row=value;must(typeof row.id==='string'&&readinessIds.includes(row.id)&&!ids.has(row.id),'Invalid or duplicate readiness item');ids.add(row.id);must(typeof row.status==='string'&&['NOT_STARTED','IN_PROGRESS','VERIFIED'].includes(row.status),'Invalid readiness status');must(typeof row.owner==='string'&&row.owner.length<=200&&typeof row.evidence==='string'&&row.evidence.length<=2000,'Invalid readiness evidence');must(row.status!=='VERIFIED'||(row.owner.trim()&&row.evidence.trim()),'A verified item needs a named owner and evidence reference')}
 const scorecard=s as Record<string,string>,offer=o as Record<string,string>;const numeric=['decisionMinutesBefore','decisionMinutesAfter','onTimeRateBefore','onTimeRateAfter','expediteSpendBefore','expediteSpendAfter','plannerMinutesBefore','plannerMinutesAfter'];for(const k of numeric)if(scorecard[k].trim()){const n=Number(scorecard[k]);must(Number.isFinite(n)&&n>=0&&n<=100000000,'Metric must be a non-negative number');if(k.startsWith('onTimeRate'))must(n<=100,'On-time rate must be from 0 to 100 percent')}
 if(offer.durationWeeks.trim())must(Number.isInteger(Number(offer.durationWeeks))&&Number(offer.durationWeeks)>=1&&Number(offer.durationWeeks)<=52,'Pilot duration must be 1–52 weeks');
 await ensurePilotTable();const snapshot=JSON.stringify({scorecard:s,readiness:r,offer:o});const updatedAt=new Date().toISOString();await db().prepare('INSERT INTO pilot_workspace VALUES (?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET snapshot=excluded.snapshot,updated_at=excluded.updated_at').bind(p.tenantId,snapshot,updatedAt).run();return json({workspace:JSON.parse(snapshot),saved:true,updatedAt});
 }catch(e){return json({error:e instanceof DomainError?e.message:'Pilot workspace could not be saved'},e instanceof DomainError?e.status:400)}}
