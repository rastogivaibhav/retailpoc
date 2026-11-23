import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../app/chatgpt-auth';
import {isOwnerIdentity,tenantKey} from '../access-policy';
import {DomainError} from '../domain';
import {seedAssurance,must} from './model';
import type {Assurance} from './model';
export async function scope(req?:Request){
 // Production workspaces are selected only from trusted sign-in identity.
 // Verification-only header access was removed after the hosted acceptance run.
 const user=await getChatGPTUser();if(!user)return null;const owner=isOwnerIdentity(user.email,env.OWNER_EMAILS);let member:{tenant_id:string;role:import('../operations/jobs').Role}|null=null;if(!owner){try{member=await db().prepare('SELECT tenant_id,role FROM operations_members WHERE email=?').bind(user.email.toLowerCase()).first()}catch{/* Older deployments have no team table yet. */}}return {tenantId:member?.tenant_id||tenantKey(user.userId),actor:user.displayName,isOwner:owner,role:member?.role||'admin' as const,email:user.email.toLowerCase()};
}
export function db(){if(!env.DB)throw new DomainError('DB','Database binding unavailable',503);return env.DB;}
export async function ensure(){await db().batch([
 db().prepare('CREATE TABLE IF NOT EXISTS assurance_state (tenant_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,nonce TEXT NOT NULL,snapshot TEXT NOT NULL,updated_at TEXT NOT NULL)'),
 db().prepare('CREATE TABLE IF NOT EXISTS assurance_nodes (tenant_id TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,record TEXT NOT NULL,PRIMARY KEY(tenant_id,id))'),
 db().prepare('CREATE TABLE IF NOT EXISTS assurance_edges (tenant_id TEXT NOT NULL,id TEXT NOT NULL,source_id TEXT NOT NULL,destination_id TEXT NOT NULL,record TEXT NOT NULL,PRIMARY KEY(tenant_id,id))'),
 db().prepare('CREATE TABLE IF NOT EXISTS assurance_commitments (tenant_id TEXT NOT NULL,id TEXT NOT NULL,source_id TEXT NOT NULL,destination_id TEXT NOT NULL,item_id TEXT NOT NULL,record TEXT NOT NULL,PRIMARY KEY(tenant_id,id))'),
 db().prepare('CREATE TABLE IF NOT EXISTS assurance_dependencies (tenant_id TEXT NOT NULL,commitment_id TEXT NOT NULL,dependency_id TEXT NOT NULL,PRIMARY KEY(tenant_id,commitment_id,dependency_id))'),
 db().prepare('CREATE TABLE IF NOT EXISTS assurance_observations (tenant_id TEXT NOT NULL,id TEXT NOT NULL,source_id TEXT NOT NULL,record TEXT NOT NULL,PRIMARY KEY(tenant_id,id))'),
 db().prepare('CREATE TABLE IF NOT EXISTS assurance_hooks (token_hash TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,source_id TEXT NOT NULL,created_at TEXT NOT NULL)'),
 db().prepare('CREATE TABLE IF NOT EXISTS assurance_sync (tenant_id TEXT NOT NULL,source_id TEXT NOT NULL,snapshot TEXT NOT NULL,PRIMARY KEY(tenant_id,source_id))')
]);}
export async function read(tenantId:string){await ensure();const initial=seedAssurance(tenantId);await db().prepare('INSERT OR IGNORE INTO assurance_state (tenant_id,revision,nonce,snapshot,updated_at) VALUES (?,?,?,?,?)').bind(tenantId,0,'seed',JSON.stringify(initial),new Date().toISOString()).run();const row=await db().prepare('SELECT snapshot FROM assurance_state WHERE tenant_id=?').bind(tenantId).first<{snapshot:string}>();must(row,'Tenant workspace unavailable');const state=JSON.parse(row.snapshot) as Assurance;if(state.sources.some(s=>s.mode==='ERP_LIVE'))state.clock=new Date().toISOString();return state;}
export async function write(state:Assurance,expectedRevision:number){
 const nonce=crypto.randomUUID(),tenant=state.tenantId;const stmts=[db().prepare('UPDATE assurance_state SET snapshot=?,revision=?,nonce=?,updated_at=? WHERE tenant_id=? AND revision=?').bind(JSON.stringify(state),state.revision,nonce,new Date().toISOString(),tenant,expectedRevision)];
 const guard='SELECT 1 FROM assurance_state WHERE tenant_id=? AND nonce=?';
 for(const table of ['assurance_nodes','assurance_edges','assurance_commitments','assurance_dependencies','assurance_observations'])stmts.push(db().prepare(`DELETE FROM ${table} WHERE tenant_id=? AND EXISTS (${guard})`).bind(tenant,tenant,nonce));
 stmts.push(db().prepare("INSERT INTO assurance_nodes SELECT tenant_id,json_extract(j.value,'$.id'),json_extract(j.value,'$.kind'),j.value FROM assurance_state,json_each(snapshot,'$.nodes') j WHERE tenant_id=? AND nonce=?").bind(tenant,nonce));
 stmts.push(db().prepare("INSERT INTO assurance_edges SELECT tenant_id,json_extract(j.value,'$.id'),json_extract(j.value,'$.from'),json_extract(j.value,'$.to'),j.value FROM assurance_state,json_each(snapshot,'$.lanes') j WHERE tenant_id=? AND nonce=?").bind(tenant,nonce));
 stmts.push(db().prepare("INSERT INTO assurance_commitments SELECT tenant_id,json_extract(j.value,'$.id'),json_extract(j.value,'$.from'),json_extract(j.value,'$.to'),json_extract(j.value,'$.itemId'),j.value FROM assurance_state,json_each(snapshot,'$.commitments') j WHERE tenant_id=? AND nonce=?").bind(tenant,nonce));
 stmts.push(db().prepare("INSERT INTO assurance_dependencies SELECT tenant_id,json_extract(j.value,'$.id'),dep.value FROM assurance_state,json_each(snapshot,'$.commitments') j,json_each(j.value,'$.dependencies') dep WHERE tenant_id=? AND nonce=?").bind(tenant,nonce));
 stmts.push(db().prepare("INSERT INTO assurance_observations SELECT tenant_id,json_extract(j.value,'$.id'),json_extract(j.value,'$.source'),j.value FROM assurance_state,json_each(snapshot,'$.observations') j WHERE tenant_id=? AND nonce=?").bind(tenant,nonce));
 const results=await db().batch(stmts);must(results[0].meta.changes===1,'Concurrent update. Refresh and review.','STALE',409);
}
export async function tokenHash(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
