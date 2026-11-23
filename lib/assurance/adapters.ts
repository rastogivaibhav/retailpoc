import type {Observation} from './model';
export interface SourceAdapter {id:string;kind:'ERP'|'OMS'|'MES'|'WMS'|'TMS'|'SUPPLIER';mode:'LIVE'|'CONTROLLED'|'UNCONNECTED';capabilities:('READ'|'OBSERVE'|'DRAFT'|'EXECUTE'|'RECONCILE')[];poll(cursor?:string):Promise<{observations:Observation[];cursor?:string;complete:boolean}>;}
/** Vendor-neutral contract used by a production connector. Implementations must preserve source IDs,
 * source timestamps and versions; incomplete pages must return complete:false and never imply absence. */
export type ConnectorHealth={connected:boolean;checkedAt:string;sourceVersion?:string;detail?:string};
export type CanonicalRead={observations:Observation[];cursor?:string;complete:boolean;sourceAt:string;extractedAt:string;issues:{recordId?:string;field?:string;message:string}[]};
export type DraftAction={idempotencyKey:string;planId:string;action:'TRANSFER'|'PURCHASE'|'PRODUCTION';lines:{itemId:string;quantity:number;from:string;to:string;due:string}[];reason:string};
export type ActionReceipt={externalId:string;status:'DRAFT'|'SUBMITTED'|'REJECTED'|'UNKNOWN';observedAt:string;detail:string};
/** Adapter boundary for ERP/WMS/TMS/MES integrations. The app's ERPNext implementation is separate;
 * SAP, Oracle, Kinaxis and Coupa still require customer-specific implementations and mappings. */
export interface RecoveryConnector extends SourceAdapter {
 health():Promise<ConnectorHealth>;
 read(cursor?:string):Promise<CanonicalRead>;
 createDraft(action:DraftAction):Promise<ActionReceipt>;
 reconcile(externalId:string):Promise<ActionReceipt>;
}
export type ERPFieldMapping={warehouses:Record<string,string>;customers:Record<string,string>;items:Record<string,string>;market:string;minShelfDays:number;currency:'GBP'};
export const adapterCatalogue=[{id:'ERPNext',status:'IMPLEMENTED_REQUIRES_CREDENTIALS',supports:['Bounded source reads','Incremental modified-time reads','Validated batch and order mapping','Durable background sync','Reviewed draft Stock Entry','Ledger and Delivery Note reconciliation']},{id:'Controlled supplier',status:'CONTROLLED',supports:['Source event ingestion','Versioning','Dependency impact']},{id:'WMS simulator',status:'CONTROLLED',supports:['Pick acceptance/rejection','Dispatch/receipt','Discrepancy']},{id:'Fleetbase',status:'CONTRACT_ONLY',supports:[]},{id:'SAP',status:'CONTRACT_ONLY',supports:[]},{id:'Dynamics',status:'CONTRACT_ONLY',supports:[]},{id:'Oracle',status:'CONTRACT_ONLY',supports:[]},{id:'MES/TMS',status:'CONTRACT_ONLY',supports:[]}];
