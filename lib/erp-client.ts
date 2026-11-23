import {DomainError} from './domain.ts';
import {siteOrigin} from './integration-domain.ts';
import type {ERPConfig} from './integration-domain.ts';
export type Transport=typeof fetch;
export class ERPClient{
 private config:ERPConfig;private transport:Transport;
 constructor(config:ERPConfig,transport:Transport=fetch){siteOrigin(config.site);this.config=config;this.transport=transport}
 async request(path:string,method='GET',body?:unknown){
  if(!path.startsWith('/api/'))throw new DomainError('PATH','Unsupported ERP path');
  let r:Response;try{r=await this.transport(this.config.site+path,{method,headers:{Authorization:`token ${this.config.apiKey}:${this.config.apiSecret}`,'Content-Type':'application/json','Accept':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(15000)})}catch{throw new DomainError('ERP_NETWORK','ERPNext did not confirm a response. Inspect its records before retrying a write.',502)}
  if(!r.ok)throw new DomainError('ERP_HTTP',`ERPNext returned HTTP ${r.status}. Check site, API permissions and required fields.`,r.status===401||r.status===403?403:502);
  const length=Number(r.headers.get('content-length'));if(length>1500000)throw new DomainError('ERP_SIZE','ERP response exceeded the read limit',502);
  const reader=r.body?.getReader();if(!reader)throw new DomainError('ERP_RESPONSE','ERPNext returned an empty response',502);
  const decoder=new TextDecoder();let raw='',size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>1500000){await reader.cancel();throw new DomainError('ERP_SIZE','ERP response exceeded the read limit',502)}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock()}
  let data;try{data=JSON.parse(raw)}catch{throw new DomainError('ERP_RESPONSE','ERPNext returned an invalid API response',502)}
  if(data.exc||data.exc_type||data.exception)throw new DomainError('ERP_RESPONSE','ERPNext reported an application error. Review the ERP request log.',502);
  return data;
 }
 async list(doctype:string,fields:string[],filters:unknown[]=[]){const q=new URLSearchParams({fields:JSON.stringify(fields),filters:JSON.stringify(filters),limit_page_length:'101'});const v=await this.request('/api/resource/'+encodeURIComponent(doctype)+'?'+q);if(!Array.isArray(v.data))throw new DomainError('ERP_RESPONSE','Expected an ERPNext record list',502);return {rows:v.data.slice(0,100),truncated:v.data.length>100};}
 async doc(doctype:string,name:string){const v=await this.request('/api/resource/'+encodeURIComponent(doctype)+'/'+encodeURIComponent(name));if(!v.data||typeof v.data!=='object')throw new DomainError('ERP_RESPONSE','Expected an ERPNext document',502);return v.data as Record<string,unknown>}
}
