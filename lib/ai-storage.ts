import {env} from 'cloudflare:workers';
import {DomainError} from './domain';
import type {AgentRun} from './agent';
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const decode=(text:string)=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
export async function ensureAI(){
 if(!env.DB)throw new Error('Database binding unavailable');
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS ai_settings (id TEXT PRIMARY KEY,nonce TEXT NOT NULL,ciphertext TEXT NOT NULL,updated_at TEXT NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY,order_id TEXT NOT NULL,revision INTEGER NOT NULL,created_at TEXT NOT NULL,snapshot TEXT NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS agent_control (id TEXT PRIMARY KEY,lease TEXT NOT NULL,expires INTEGER NOT NULL)')
 ]);
}
async function encryptionKey(){
 if(!env.AI_SETTINGS_KEY)throw new DomainError('AI_CONFIGURATION','Server credential protection is unavailable',503);
 return crypto.subtle.importKey('raw',decode(env.AI_SETTINGS_KEY),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function configured(){
 await ensureAI();
 return Boolean(env.NVIDIA_API_KEY||await env.DB!.prepare('SELECT id FROM ai_settings WHERE id=?').bind('nvidia').first());
}
export async function saveProviderKey(value:string){
 await ensureAI();
 if(!value.startsWith('nvapi-')||value.length<25||value.length>500||/\s/.test(value))throw new DomainError('INVALID_KEY','Enter a valid NVIDIA API key');
 const key=await encryptionKey(),nonce=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:new TextEncoder().encode('order-recovery:nvidia:v1')},key,new TextEncoder().encode(value));
 await env.DB!.prepare('INSERT INTO ai_settings (id,nonce,ciphertext,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET nonce=excluded.nonce,ciphertext=excluded.ciphertext,updated_at=excluded.updated_at').bind('nvidia',encode(nonce),encode(new Uint8Array(ciphertext)),new Date().toISOString()).run();
}
export async function providerKey(){
 if(env.NVIDIA_API_KEY)return env.NVIDIA_API_KEY;
 const row=await env.DB!.prepare('SELECT nonce,ciphertext FROM ai_settings WHERE id=?').bind('nvidia').first<{nonce:string;ciphertext:string}>();
 if(!row)throw new DomainError('AI_NOT_CONFIGURED','Configure the NVIDIA credential in Data & boundaries',503);
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(row.nonce),additionalData:new TextEncoder().encode('order-recovery:nvidia:v1')},await encryptionKey(),decode(row.ciphertext));
 return new TextDecoder().decode(bytes);
}
export async function saveRun(run:AgentRun){await env.DB!.prepare('UPDATE agent_runs SET snapshot=? WHERE id=?').bind(JSON.stringify(run),run.id).run();}
export async function readRun(id:string){const row=await env.DB!.prepare('SELECT snapshot FROM agent_runs WHERE id=?').bind(id).first<{snapshot:string}>();return row?JSON.parse(row.snapshot) as AgentRun:null;}
