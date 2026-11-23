import {DomainError} from './domain.ts';
import type {Transfer} from './domain.ts';
export type ERPConfig={site:string;apiKey:string;apiSecret:string;id:string};
export type Mapping={company:string;itemCode:string;fromWarehouse:string;toWarehouse:string;batches:Record<string,string>};
export function siteOrigin(raw:unknown){
 if(typeof raw!=='string')throw new DomainError('SITE','Enter the ERPNext site URL');
 let u:URL;try{u=new URL(raw.trim())}catch{throw new DomainError('SITE','Enter a complete HTTPS site URL')}
 if(u.protocol!=='https:'||u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!u.hostname.endsWith('.frappe.cloud')||u.hostname.split('.').length!==3)throw new DomainError('SITE','Use your ERPNext site origin, https://your-site.frappe.cloud. Custom domains need a separate allowlist configuration.');
 return u.origin;
}
export function text(value:unknown,label:string){if(typeof value!=='string'||!value.trim()||value.length>150||/[\r\n\x00-\x1f]/.test(value))throw new DomainError('INPUT',`${label} is required (maximum 150 characters)`);return value.trim()}
export function mappingInput(raw:unknown,t:Transfer):Mapping{
 if(!raw||typeof raw!=='object')throw new DomainError('MAPPING','ERP mapping required');const r=raw as Record<string,unknown>;
 const m={company:text(r.company,'Company'),itemCode:text(r.itemCode,'Item code'),fromWarehouse:text(r.fromWarehouse,'Source warehouse'),toWarehouse:text(r.toWarehouse,'Destination warehouse'),batches:{} as Record<string,string>};
 if(m.fromWarehouse===m.toWarehouse)throw new DomainError('MAPPING','Source and destination must differ');
 const batches=r.batches as Record<string,unknown>|undefined;
 for(const move of t.moves){if(batches&&Object.hasOwn(batches,move.lotId)&&batches[move.lotId])m.batches[move.lotId]=text(batches[move.lotId],'Batch');}
 return m;
}
export function stockEntry(t:Transfer,m:Mapping,item:{stock_uom:string;has_batch_no:number;has_serial_no:number},marker:string){
 if(t.status!=='RESERVED')throw new DomainError('STATE','Export is available only while the approved transfer is reserved',409);
 if(item.has_serial_no)throw new DomainError('SERIAL','Serialized items need serial selection and are not supported in this release');
 const uom=text(item.stock_uom,'ERP stock UOM');
 if(item.has_batch_no&&t.moves.some(x=>!m.batches[x.lotId]))throw new DomainError('BATCH','Map every source lot to an ERPNext batch before exporting');
 return {doctype:'Stock Entry',docstatus:0,stock_entry_type:'Material Transfer',purpose:'Material Transfer',company:m.company,from_warehouse:m.fromWarehouse,to_warehouse:m.toWarehouse,remarks:marker,items:t.moves.map(x=>({item_code:m.itemCode,qty:x.qty,uom,stock_uom:uom,conversion_factor:1,s_warehouse:m.fromWarehouse,t_warehouse:m.toWarehouse,...(item.has_batch_no?{use_serial_batch_fields:1,batch_no:m.batches[x.lotId]}:{})}))};
}
export function matchesEntry(doc:Record<string,unknown>,expected:ReturnType<typeof stockEntry>){
 const a=doc.items as Record<string,unknown>[];
 return doc.purpose==='Material Transfer'&&doc.company===expected.company&&doc.remarks===expected.remarks&&Array.isArray(a)&&a.length===expected.items.length&&a.every((x,i)=>{const e=expected.items[i];return x.item_code===e.item_code&&Number(x.qty)===e.qty&&x.s_warehouse===e.s_warehouse&&x.t_warehouse===e.t_warehouse&&(!('batch_no' in e)||x.batch_no===e.batch_no)});
}
export type SimEvent={id:string;type:'PICK_ACCEPTED'|'PICK_REJECTED'|'DISPATCHED'|'RECEIVED'|'DISCREPANCY';qty:number;note:string;at:string;source:'WMS_SIMULATOR'};
export type Sim={id:string;transferId:string;qty:number;revision:number;status:'NEW'|SimEvent['type'];events:SimEvent[]};
export function simulate(current:Sim,input:Omit<SimEvent,'at'|'source'>,expectedRevision:number):Sim{
 if(typeof input.id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(input.id))throw new DomainError('ID','Valid event ID required');
 const prior=current.events.find(x=>x.id===input.id);if(prior){if(prior.type!==input.type||prior.qty!==input.qty||prior.note!==input.note)throw new DomainError('DUPLICATE','Event ID was reused with different data',409);return current}
 if(expectedRevision!==current.revision)throw new DomainError('STALE','Simulator changed. Refresh before acting.',409);
 const allowed:Record<string,string[]>={NEW:['PICK_ACCEPTED','PICK_REJECTED'],PICK_ACCEPTED:['DISPATCHED','DISCREPANCY'],DISPATCHED:['RECEIVED','DISCREPANCY']};
 if(!allowed[current.status]?.includes(input.type))throw new DomainError('SEQUENCE',`Cannot record ${input.type} after ${current.status}`,409);
 if(!Number.isSafeInteger(input.qty)||input.qty<0||input.qty>current.qty)throw new DomainError('QUANTITY','Observed units must be between zero and the requested quantity');
 if(['PICK_ACCEPTED','DISPATCHED','RECEIVED'].includes(input.type)&&input.qty!==current.qty)throw new DomainError('QUANTITY','Use Discrepancy for a short observation');
 if(input.type==='PICK_REJECTED'&&input.qty!==0)throw new DomainError('QUANTITY','Rejected picks must have zero accepted units');
 const note=text(input.note,'Event note');
 return {...current,revision:current.revision+1,status:input.type,events:[...current.events,{...input,note,at:new Date().toISOString(),source:'WMS_SIMULATOR'}]};
}
