import {owner,requireOwner} from '../../../lib/auth';
import {DomainError,addDays} from '../../../lib/domain';
import {readWorkspace} from '../../../lib/storage';
import {ERPClient} from '../../../lib/erp-client';
import {siteOrigin,text,mappingInput,stockEntry,matchesEntry} from '../../../lib/integration-domain';
import {db,ensureIntegrations,saveERP,erpConfig,erpStatus,readJob,saveJob} from '../../../lib/integration-storage';
import type {ERPConfig} from '../../../lib/integration-domain';
import type {ERPJob} from '../../../lib/integration-storage';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function inspect(c:ERPClient){
 const specs=[['Company',['name']],['Warehouse',['name','company','is_group','disabled']],['Item',['name','item_name','stock_uom','has_batch_no','has_serial_no','is_stock_item']],['Sales Order',['name','customer','delivery_date','status','docstatus']],['Bin',['item_code','warehouse','actual_qty','reserved_qty']],['Batch',['name','item','expiry_date','disabled']]] as const;
 const results=await Promise.allSettled(specs.map(([type,fields])=>c.list(type,[...fields])));
 return specs.map(([doctype],i)=>{const r=results[i];return r.status==='fulfilled'?{doctype,...r.value}:{doctype,error:r.reason instanceof DomainError?r.reason.message:'Read failed',rows:[],truncated:false}});
}
export async function GET(){if(!await owner())return json({error:'Owner access required'},403);try{await ensureIntegrations();const jobs=await db().prepare('SELECT snapshot FROM erp_jobs ORDER BY rowid DESC LIMIT 30').all<{snapshot:string}>();return json({settings:await erpStatus(),jobs:jobs.results.map(x=>JSON.parse(x.snapshot))})}catch{return json({error:'ERP settings unavailable'},503)}}
export async function POST(req:Request){
 try{
  await requireOwner();
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Cross-origin action rejected'},403);
  if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'application/json required'},415);
  const raw=await req.text();if(raw.length>8000)return json({error:'Request too large'},413);let b:Record<string,unknown>;try{b=JSON.parse(raw)}catch{return json({error:'Malformed JSON'},400)}
  await ensureIntegrations();
  if(b.action==='connect'){
   const c:ERPConfig={site:siteOrigin(b.site),apiKey:text(b.apiKey,'API key'),apiSecret:text(b.apiSecret,'API secret'),id:crypto.randomUUID()};
   if(/[\s:]/.test(c.apiKey+c.apiSecret))throw new DomainError('KEY','API credentials cannot contain whitespace or colons');
   const old=await erpStatus();if(old.connected&&old.site!==c.site){const pending=await db().prepare('SELECT transfer_id FROM erp_jobs LIMIT 1').first();if(pending)throw new DomainError('SITE','This workspace has ERP export history. Use the same ERP site.',409)}
   const client=new ERPClient(c),auth=await client.request('/api/method/frappe.auth.get_logged_user');
   if(typeof auth.message!=='string'||auth.message==='Guest')throw new DomainError('AUTH','ERPNext did not verify a signed-in API user',403);
   await client.list('Company',['name']); // Frappe accounts without ERPNext do not pass this check.
   const settings={connected:true,site:c.site,verifiedAt:new Date().toISOString(),note:'API authentication and Company read verified. Other permissions are checked separately.'};
   // Keep the configuration identity across credential rotation on the same site.
   if(old.connected)c.id=(await erpConfig()).id;
   await saveERP(c,settings);return json({settings,catalog:await inspect(client)});
  }
  const config=await erpConfig(),client=new ERPClient(config);
  if(b.action==='inspect')return json({catalog:await inspect(client),readAt:new Date().toISOString()});
  if(b.action==='draft'){
   const w=await readWorkspace();if(w.revision!==b.expectedRevision)throw new DomainError('STALE','Workspace changed. Refresh before creating an ERP draft.',409);
   const t=w.transfers.find(x=>x.id===b.transferId);if(!t)throw new DomainError('TRANSFER','Approved transfer not found');
   const m=mappingInput(b.mapping,t),marker=`Order Recovery Lab / ${t.id}`;
   const old=await readJob(t.id);if(old)return json({job:old,replay:true});
   const [item,source,target]=await Promise.all([client.doc('Item',m.itemCode),client.doc('Warehouse',m.fromWarehouse),client.doc('Warehouse',m.toWarehouse)]);
   if(!item.is_stock_item||item.disabled)throw new DomainError('ITEM','Choose an enabled stock item');
   if([source,target].some(x=>x.company!==m.company||x.is_group||x.disabled))throw new DomainError('WAREHOUSE','Choose enabled leaf warehouses belonging to the selected company');
   const expected=stockEntry(t,m,item as {stock_uom:string;has_batch_no:number;has_serial_no:number},marker);
   for(const move of t.moves){if(item.has_batch_no){const batch=await client.doc('Batch',m.batches[move.lotId]);if(batch.item!==m.itemCode||batch.disabled)throw new DomainError('BATCH','Selected batch is disabled or belongs to another item');const order=w.orders.find(o=>o.id===t.orderId);if(!order||typeof batch.expiry_date!=='string'||batch.expiry_date<addDays(order.due,order.minShelfDays))throw new DomainError('BATCH','ERP batch expiry is missing or does not satisfy the order shelf-life requirement');}}
   // Reserve a single export slot before the remote write. A timeout cannot trigger a second POST.
   const job:ERPJob={transferId:t.id,configId:config.id,site:config.site,state:'PENDING',marker,expected,checkedAt:new Date().toISOString(),message:'Draft creation pending; no ERP submission requested.'};
   const inserted=await db().prepare('INSERT OR IGNORE INTO erp_jobs (transfer_id,config_id,snapshot) VALUES (?,?,?)').bind(t.id,config.id,JSON.stringify(job)).run();if(!inserted.meta.changes)return json({job:await readJob(t.id),replay:true});
   const latest=await readWorkspace();if(latest.revision!==w.revision){job.state='UNKNOWN';job.message='Workspace changed before export. No request was sent. Review this export slot.';await saveJob(job);throw new DomainError('STALE',job.message,409)}
   try{
    const response=await client.request('/api/resource/Stock%20Entry','POST',expected),doc=response.data;
    if(!doc||typeof doc.name!=='string'||Number(doc.docstatus)!==0||!matchesEntry(doc,expected))throw new DomainError('ERP_MISMATCH','ERP response differs from the approved draft. Reconcile before proceeding.',502);
    job.state='DRAFT';job.name=doc.name;job.message='Real ERPNext draft created. It has not been submitted and has not moved ERP stock.';
   }catch(e){job.state='UNKNOWN';job.message=e instanceof DomainError?e.message:'ERP draft outcome is unknown. Reconcile in ERPNext before retrying.';}
   job.checkedAt=new Date().toISOString();await saveJob(job);return json({job},job.state==='UNKNOWN'?502:200);
  }
  if(b.action==='reconcile'){
   const j=await readJob(text(b.transferId,'Transfer ID'));if(!j)throw new DomainError('JOB','ERP export not found');if(j.configId!==config.id||j.site!==config.site)throw new DomainError('SITE','Reconnect the original ERP site',409);
   let name=j.name;
   if(!name){const list=await client.list('Stock Entry',['name'],[['remarks','=',j.marker]]);if(list.truncated||list.rows.length!==1)throw new DomainError('RECONCILE',`Found ${list.rows.length} matching ERP drafts. Inspect ERPNext manually; no write was retried.`,409);name=list.rows[0].name;}
   const doc=await client.doc('Stock Entry',name!);if(!matchesEntry(doc,j.expected as ReturnType<typeof stockEntry>))throw new DomainError('MISMATCH','ERP document differs from the approved mapping or quantities; manual review required',409);
   if(![0,1,2].includes(Number(doc.docstatus)))throw new DomainError('STATE','Unrecognised ERP document state',502);
   j.name=name;j.state=Number(doc.docstatus)===0?'DRAFT':Number(doc.docstatus)===1?'SUBMITTED':'CANCELLED';j.checkedAt=new Date().toISOString();j.message=j.state==='SUBMITTED'?'ERP confirms a submitted Stock Entry. This does not confirm physical delivery or modify the app ledger.':`ERP confirms ${j.state.toLowerCase()} status. Internal ledger is independent.`;
   await saveJob(j);return json({job:j});
  }
  throw new DomainError('ACTION','Unsupported ERP action');
 }catch(e){return json({error:e instanceof DomainError?e.message:'ERP operation failed'},e instanceof DomainError?e.status:500)}
}
