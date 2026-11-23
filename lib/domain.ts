export type Lot = { id:string; sku:string; site:string; qty:number; reserved:number; status:'RELEASED'|'HOLD'; expiry:string; market:string };
export type Order = { id:string; customer:string; sku:string; site:string; qty:number; due:string; minShelfDays:number; market:string; unitValuePence:number };
export type Inbound = { id:string; sku:string; site:string; qty:number; eta:string; expiry:string; market:string; status:'CONFIRMED'|'RECEIVED' };
export type Lane = { id:string; from:string; to:string; days:number; capacity:number; fixedPence:number; unitPence:number };
export type Event = { id:string; at:string; actor:string; action:string; detail:string };
export type Move = {lotId:string; qty:number};
export type Transfer = {id:string; orderId:string; sku:string; from:string; to:string; qty:number; arrival:string; costPence:number; moves:Move[]; status:'RESERVED'|'DISPATCHED'|'RECEIVED'; approvedBy:string; createdAt:string; deliveredLotIds:string[]};
export type Dataset = { label:string; provenance:'CONTROLLED'|'USER_IMPORTED'; asOf:string; lots:Lot[]; orders:Order[]; inbounds:Inbound[]; lanes:Lane[]; safety:{sku:string; site:string; qty:number}[] };
export type Workspace = Dataset & {revision:number; transfers:Transfer[]; events:Event[]; requests:Record<string,{fingerprint:string;result:unknown}>};
export type Result = {order:Order; covered:number; shortage:number; transferQty:number; remaining:number; arrival:string|null; costPence:number; moves:Move[]; laneId:string|null; checks:{source:string;result:string}[]; evidence:string[]};
export class DomainError extends Error { code:string;status:number;constructor(code:string,message:string,status=400){super(message);this.code=code;this.status=status} }
const iso=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export const addDays=(date:string,n:number)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const enoughLife=(expiry:string,due:string,min:number)=>expiry>=addDays(due,min);
function must(ok:unknown, message:string):asserts ok { if(!ok)throw new DomainError('INVALID_DATA',message) }
export function validateDataset(raw:unknown):Dataset {
 must(raw&&typeof raw==='object','Dataset must be an object'); const d=raw as Dataset;
 must(typeof d.label==='string'&&d.label.length>0&&d.label.length<=150,'Dataset label required'); must(iso(d.asOf),'Valid asOf date required');
 for(const k of ['lots','orders','inbounds','lanes','safety'] as const)must(Array.isArray(d[k])&&d[k].length<=2000,`${k} must be an array of at most 2000 records`);
 const text=(x:unknown)=>typeof x==='string'&&x.length>0&&x.length<=150;
 const n=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0&&Number(x)<=100000000;
 for(const k of ['lots','orders','inbounds','lanes'] as const){const ids=new Set();for(const x of d[k]){must(text(x.id)&&!ids.has(x.id),`${k} IDs must be unique`);ids.add(x.id)}}
 for(const l of d.lots){must(text(l.sku)&&text(l.site)&&text(l.market)&&n(l.qty)&&n(l.reserved)&&l.reserved<=l.qty,'Invalid lot quantities or identity');must(['RELEASED','HOLD'].includes(l.status)&&iso(l.expiry),'Invalid lot status or expiry')}
 for(const o of d.orders){must(text(o.sku)&&text(o.customer)&&text(o.site)&&text(o.market)&&n(o.qty)&&o.qty>0&&iso(o.due)&&o.due>=d.asOf&&n(o.minShelfDays)&&o.minShelfDays<=3650&&n(o.unitValuePence),'Invalid order')}
 for(const i of d.inbounds)must(text(i.sku)&&text(i.site)&&text(i.market)&&n(i.qty)&&iso(i.eta)&&iso(i.expiry)&&['CONFIRMED','RECEIVED'].includes(i.status),'Invalid inbound');
 for(const l of d.lanes)must(text(l.from)&&text(l.to)&&l.from!==l.to&&n(l.days)&&l.days>=1&&l.days<=90&&n(l.capacity)&&n(l.fixedPence)&&n(l.unitPence),'Invalid transfer lane');
 const safetyKeys=new Set();for(const s of d.safety){const key=JSON.stringify([s.sku,s.site]);must(text(s.sku)&&text(s.site)&&n(s.qty)&&!safetyKeys.has(key),'Invalid or duplicate safety stock');safetyKeys.add(key)}
 // Copy only known fields. Operational state cannot be supplied by an importer.
 return JSON.parse(JSON.stringify({label:d.label,asOf:d.asOf,provenance:d.provenance==='CONTROLLED'?'CONTROLLED':'USER_IMPORTED',lots:d.lots,orders:d.orders,inbounds:d.inbounds,lanes:d.lanes,safety:d.safety}));
}
export function seed():Dataset {return {
 label:'Beauty distribution · controlled dataset',provenance:'CONTROLLED',asOf:'2026-10-19',
 lots:[
 {id:'UK-SERUM-01',sku:'SERUM-30',site:'Reading DC',qty:100,reserved:20,status:'RELEASED',expiry:'2027-12-31',market:'UK'},
 {id:'MID-SERUM-01',sku:'SERUM-30',site:'Midlands DC',qty:500,reserved:150,status:'RELEASED',expiry:'2027-12-31',market:'UK'},
 {id:'MID-QA-HOLD',sku:'SERUM-30',site:'Midlands DC',qty:400,reserved:0,status:'HOLD',expiry:'2027-12-31',market:'UK'},
 {id:'MID-SHORT-DATE',sku:'SERUM-30',site:'Midlands DC',qty:200,reserved:0,status:'RELEASED',expiry:'2026-11-01',market:'UK'},
 {id:'MID-EU-LABEL',sku:'SERUM-30',site:'Midlands DC',qty:180,reserved:0,status:'RELEASED',expiry:'2027-12-31',market:'EU'},
 {id:'UK-CREAM-01',sku:'CREAM-50',site:'Reading DC',qty:500,reserved:0,status:'RELEASED',expiry:'2027-12-31',market:'UK'}],
 orders:[
 {id:'SO-1001',customer:'Beauty Retailer A',sku:'SERUM-30',site:'Reading DC',qty:300,due:'2026-10-21',minShelfDays:90,market:'UK',unitValuePence:1800},
 {id:'SO-1002',customer:'Beauty Retailer B',sku:'SERUM-30',site:'Reading DC',qty:200,due:'2026-10-22',minShelfDays:90,market:'UK',unitValuePence:1800},
 {id:'SO-1003',customer:'Online Channel',sku:'SERUM-30',site:'Reading DC',qty:150,due:'2026-10-23',minShelfDays:90,market:'UK',unitValuePence:1800},
 {id:'SO-1004',customer:'Beauty Retailer C',sku:'CREAM-50',site:'Reading DC',qty:120,due:'2026-10-21',minShelfDays:90,market:'UK',unitValuePence:1200}],
 inbounds:[{id:'IN-204',sku:'SERUM-30',site:'Reading DC',qty:600,eta:'2026-10-20',expiry:'2027-12-31',market:'UK',status:'CONFIRMED'}],
 lanes:[{id:'MID-READ',from:'Midlands DC',to:'Reading DC',days:1,capacity:300,fixedPence:4500,unitPence:20}],
 safety:[{sku:'SERUM-30',site:'Midlands DC',qty:100}]
}}
export function workspace(d:Dataset,revision=0):Workspace {return {...validateDataset(d),revision,transfers:[],events:[],requests:{}}}
export function event(w:Workspace,actor:string,action:string,detail:string){w.events.push({id:crypto.randomUUID(),at:new Date().toISOString(),actor,action,detail});}
export function plan(w:Workspace):{results:Result[];tools:{name:string;detail:string}[];engine:string} {
 const free=new Map(w.lots.map(l=>[l.id,l.qty-l.reserved]));
 const incoming=w.inbounds.filter(i=>i.status==='CONFIRMED').map(i=>({...i,left:i.qty}));
 const active=w.transfers.filter(t=>t.status!=='RECEIVED');
 // Safety protects eligible stock, not quarantined or wrongly labelled stock.
 const sourceUsed=new Map<string,number>();const laneUsed=new Map<string,number>();
 for(const t of active){const lane=w.lanes.find(l=>l.from===t.from&&l.to===t.to);if(lane)laneUsed.set(lane.id,(laneUsed.get(lane.id)||0)+t.qty)}
 const results:Result[]=[];
 for(const o of [...w.orders].sort((a,b)=>a.due.localeCompare(b.due)||a.id.localeCompare(b.id))){
 const checks:Result['checks']=[]; const evidence:string[]=[o.id]; let left=o.qty;
 const eligible=(l:Lot)=>l.sku===o.sku&&l.status==='RELEASED'&&l.market===o.market&&enoughLife(l.expiry,o.due,o.minShelfDays);
 // Received transfers are reserved specifically for this order.
 const received=w.transfers.filter(t=>t.orderId===o.id&&t.status==='RECEIVED');
 for(const t of received){left-=Math.min(left,t.qty);evidence.push(t.id)}
 for(const l of [...w.lots].filter(l=>l.site===o.site&&eligible(l)).sort((a,b)=>a.expiry.localeCompare(b.expiry)||a.id.localeCompare(b.id))){const q=Math.min(left,free.get(l.id)||0);left-=q;free.set(l.id,(free.get(l.id)||0)-q);if(q)evidence.push(l.id)}
 for(const i of incoming.filter(i=>i.site===o.site&&i.sku===o.sku&&i.market===o.market&&i.eta<=o.due&&enoughLife(i.expiry,o.due,o.minShelfDays))){const q=Math.min(left,i.left);left-=q;i.left-=q;if(q)evidence.push(i.id)}
 for(const t of active.filter(t=>t.orderId===o.id&&t.arrival<=o.due)){const q=Math.min(left,t.qty);left-=q;if(q)evidence.push(t.id)}
 const shortage=left;const covered=o.qty-left;let transferQty=0;let costPence=0;let arrival:string|null=null;let laneId:string|null=null;const moves:Move[]=[];
 const candidates=w.lanes.filter(l=>l.to===o.site).sort((a,b)=>(a.fixedPence+a.unitPence*left)-(b.fixedPence+b.unitPence*left)||a.id.localeCompare(b.id));
 // R1 selects one lane per order. Quantity constraints are shared across orders.
 for(const lane of candidates){const eta=addDays(w.asOf,lane.days);if(eta>o.due){checks.push({source:lane.id,result:`Rejected: arrives ${eta}, after promise ${o.due}`});continue}
 const capacity=Math.max(0,lane.capacity-(laneUsed.get(lane.id)||0));const key=JSON.stringify([o.sku,lane.from,o.market,o.minShelfDays,o.due]);
 const safety=w.safety.find(s=>s.site===lane.from&&s.sku===o.sku)?.qty||0;
 const pool=w.lots.filter(l=>l.site===lane.from&&eligible(l));const eligibleFree=pool.reduce((n,l)=>n+(free.get(l.id)||0),0);
 // Local orders consume their own site supply first, independent of global order order.
 const localDemand=w.orders.filter(x=>x.site===lane.from&&x.sku===o.sku&&x.due>=w.asOf).reduce((n,x)=>n+x.qty,0);
 const budget=Math.max(0,eligibleFree-safety-localDemand);
 let allowed=Math.min(left,capacity,budget);if(!left)break;
 for(const l of w.lots.filter(l=>l.site===lane.from&&l.sku===o.sku)){
 const why=l.status==='HOLD'?'quality hold':l.market!==o.market?'market mismatch':!enoughLife(l.expiry,o.due,o.minShelfDays)?`less than ${o.minShelfDays} days shelf life`:null;
 if(why){checks.push({source:l.id,result:`Rejected: ${why}`});continue}
 const q=Math.min(allowed,free.get(l.id)||0);if(q){moves.push({lotId:l.id,qty:q});free.set(l.id,(free.get(l.id)||0)-q);allowed-=q;left-=q;transferQty+=q;evidence.push(l.id)}
 }
 checks.push({source:lane.id,result:`${eligibleFree} eligible free units; protect ${safety} safety + ${localDemand} local demand; ${capacity} lane capacity`});
 if(transferQty){arrival=eta;laneId=lane.id;costPence=lane.fixedPence+lane.unitPence*transferQty;laneUsed.set(lane.id,(laneUsed.get(lane.id)||0)+transferQty);break}
 }
 for(const i of w.inbounds.filter(i=>i.sku===o.sku&&i.site===o.site&&i.status==='CONFIRMED'&&i.eta>o.due))checks.push({source:i.id,result:`Arrives ${i.eta}, after promise ${o.due}`});
 results.push({order:o,covered,shortage,transferQty,remaining:left,arrival,costPence,moves,laneId,checks,evidence:[...new Set(evidence)]});
 }
 return {engine:'Deterministic constraint engine v1',results,tools:[{name:'ReadOrders',detail:`${w.orders.length} orders sorted by promise date then ID`},{name:'ReadInventory',detail:`${w.lots.length} batches; quantities minus reservations`},{name:'ReadInbound',detail:`${w.inbounds.length} inbound records; date and shelf-life checks`},{name:'EvaluateRecovery',detail:'Quality, market, shelf life, safety, local demand, transit and shared lane capacity'},{name:'CalculateExposure',detail:'Uncovered units × order unit value; exposure is not lost revenue'}]};
}
export type Command={action:string;expectedRevision:number;idempotencyKey:string;orderId?:string;transferId?:string;inboundId?:string;eta?:string;dataset?:unknown;reason?:string};
export function execute(current:Workspace,c:Command,actor:string):{state:Workspace;result:unknown;replay:boolean}{
 if(typeof c.idempotencyKey!=='string'||c.idempotencyKey.length<8||c.idempotencyKey.length>150)throw new DomainError('KEY_REQUIRED','An idempotency key of 8–150 characters is required');
 const {expectedRevision,idempotencyKey,...semantic}=c; const fingerprint=JSON.stringify(semantic); const prior=current.requests[idempotencyKey];
 if(prior){if(prior.fingerprint!==fingerprint)throw new DomainError('KEY_CONFLICT','Idempotency key was used for a different command',409);return {state:current,result:prior.result,replay:true}}
 if(c.expectedRevision!==current.revision)throw new DomainError('STALE_REVISION','Data changed. Refresh and review the latest plan before acting.',409);
 const w=structuredClone(current);let result:unknown;
 if(c.action==='delay'){
 const i=w.inbounds.find(i=>i.id===c.inboundId&&i.status==='CONFIRMED');must(i,'Confirmed inbound not found');must(typeof c.eta==='string'&&iso(c.eta)&&c.eta>=w.asOf,'ETA must be a valid date on or after scenario date');
 const previous=i.eta;i.eta=c.eta;result={inboundId:i.id,previousEta:previous,eta:i.eta};event(w,actor,'INBOUND_ETA_CHANGED',JSON.stringify(result));
 }else if(c.action==='approve'){
 const r=plan(w).results.find(r=>r.order.id===c.orderId);must(r&&r.transferQty>0&&r.laneId&&r.arrival,'No feasible transfer for this order');
 const lane=w.lanes.find(l=>l.id===r.laneId)!; const id='TR-'+crypto.randomUUID().slice(0,8).toUpperCase();
 for(const move of r.moves){const l=w.lots.find(l=>l.id===move.lotId)!;must(l.qty-l.reserved>=move.qty,'Stock changed');l.reserved+=move.qty}
 const t:Transfer={id,orderId:r.order.id,sku:r.order.sku,from:lane.from,to:lane.to,qty:r.transferQty,arrival:r.arrival,costPence:r.costPence,moves:r.moves,status:'RESERVED',approvedBy:actor,createdAt:new Date().toISOString(),deliveredLotIds:[]};w.transfers.push(t);result=t;event(w,actor,'TRANSFER_APPROVED',`${id}: reserved ${t.qty} units for ${t.orderId}; £${(t.costPence/100).toFixed(2)} incremental transport cost`);
 }else if(c.action==='dispatch'||c.action==='receive'){
 const t=w.transfers.find(t=>t.id===c.transferId);must(t,'Transfer not found');
 if(c.action==='dispatch'){
 must(t.status==='RESERVED','Only reserved transfers can dispatch');for(const m of t.moves){const l=w.lots.find(l=>l.id===m.lotId)!;must(l.reserved>=m.qty&&l.qty>=m.qty,'Source ledger mismatch');l.qty-=m.qty;l.reserved-=m.qty}t.status='DISPATCHED';event(w,actor,'TRANSFER_DISPATCHED',`${t.id}: ${t.qty} units moved from ${t.from} to in-transit inventory`);
 }else{
 must(t.status==='DISPATCHED','Only dispatched transfers can be received');for(const m of t.moves){const source=w.lots.find(l=>l.id===m.lotId)!;const id=`${t.id}-${source.id}`;w.lots.push({...source,id,site:t.to,qty:m.qty,reserved:m.qty});t.deliveredLotIds.push(id)}t.status='RECEIVED';event(w,actor,'TRANSFER_RECEIVED',`${t.id}: ${t.qty} units received at ${t.to}, reserved for ${t.orderId}. Operator-attested receipt; no physical transport integration.`);
 }result=t;
 }else if(c.action==='reset'||c.action==='import'){
 must(typeof c.reason==='string'&&c.reason.trim().length>=5,'A reason is required');
 must(!w.transfers.some(t=>t.status!=='RECEIVED'),'Complete outstanding transfers before replacing the dataset');
 const d=c.action==='reset'?seed():validateDataset(c.dataset);Object.assign(w,d,{transfers:[]});event(w,actor,c.action==='reset'?'CONTROLLED_DATA_LOADED':'DATASET_IMPORTED',`${d.label}. Reason: ${c.reason}`);result={label:d.label};
 }else throw new DomainError('UNKNOWN_ACTION','Unsupported action');
 w.revision++;w.requests[idempotencyKey]={fingerprint,result};if(Object.keys(w.requests).length>3000)throw new DomainError('WORKSPACE_LIMIT','Command limit reached. Export evidence and create a new workspace.');
 return {state:w,result,replay:false};
}
