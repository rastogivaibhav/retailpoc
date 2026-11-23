import {env} from 'cloudflare:workers';
import {DomainError} from './domain';
import type {ERPConfig,Sim} from './integration-domain';
export const db=()=>{if(!env.DB)throw new DomainError('DB','Database unavailable',503);return env.DB};
export async function ensureIntegrations(){await db().batch([
 db().prepare('CREATE TABLE IF NOT EXISTS erp_config (id TEXT PRIMARY KEY,nonce TEXT NOT NULL,ciphertext TEXT NOT NULL,status TEXT NOT NULL)'),
 db().prepare('CREATE TABLE IF NOT EXISTS erp_jobs (transfer_id TEXT PRIMARY KEY,config_id TEXT NOT NULL,snapshot TEXT NOT NULL)'),
 db().prepare('CREATE TABLE IF NOT EXISTS wms_simulations (id TEXT PRIMARY KEY,revision INTEGER NOT NULL,snapshot TEXT NOT NULL)')
]);}
const encode=(b:Uint8Array)=>btoa(String.fromCharCode(...b));const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function key(){if(!env.AI_SETTINGS_KEY)throw new DomainError('PROTECTION','Server credential protection is unavailable',503);return crypto.subtle.importKey('raw',decode(env.AI_SETTINGS_KEY),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function saveERP(c:ERPConfig,status:unknown){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('order-recovery:erpnext:v1')},await key(),new TextEncoder().encode(JSON.stringify(c)));await db().prepare('INSERT INTO erp_config (id,nonce,ciphertext,status) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET nonce=excluded.nonce,ciphertext=excluded.ciphertext,status=excluded.status').bind('main',encode(iv),encode(new Uint8Array(cipher)),JSON.stringify(status)).run();}
export async function erpConfig(){const r=await db().prepare('SELECT nonce,ciphertext FROM erp_config WHERE id=?').bind('main').first<{nonce:string;ciphertext:string}>();if(!r)throw new DomainError('ERP_CONFIG','Connect an ERPNext site first',409);const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(r.nonce),additionalData:new TextEncoder().encode('order-recovery:erpnext:v1')},await key(),decode(r.ciphertext));return JSON.parse(new TextDecoder().decode(bytes)) as ERPConfig;}
export async function erpStatus(){const r=await db().prepare('SELECT status FROM erp_config WHERE id=?').bind('main').first<{status:string}>();return r?JSON.parse(r.status):{connected:false};}
export type ERPJob={transferId:string;configId:string;site:string;state:'PENDING'|'DRAFT'|'SUBMITTED'|'CANCELLED'|'UNKNOWN';marker:string;expected:Record<string,unknown>;name?:string;checkedAt:string;message:string};
export async function readJob(id:string){const r=await db().prepare('SELECT snapshot FROM erp_jobs WHERE transfer_id=?').bind(id).first<{snapshot:string}>();return r?JSON.parse(r.snapshot) as ERPJob:null;}
export async function saveJob(j:ERPJob){await db().prepare('UPDATE erp_jobs SET snapshot=? WHERE transfer_id=?').bind(JSON.stringify(j),j.transferId).run()}
export async function readSim(id:string){const r=await db().prepare('SELECT snapshot FROM wms_simulations WHERE id=?').bind(id).first<{snapshot:string}>();return r?JSON.parse(r.snapshot) as Sim:null;}
