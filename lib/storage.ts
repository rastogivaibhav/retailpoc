import {env} from 'cloudflare:workers';
import {seed,workspace} from './domain';
import type {Workspace} from './domain';

export async function readWorkspace():Promise<Workspace>{
 if(!env.DB)throw new Error('Database binding unavailable');
 const initial=workspace(seed());
 await env.DB.prepare('INSERT OR IGNORE INTO workspaces (id,revision,snapshot,updated_at) VALUES (?,?,?,?)').bind('main',0,JSON.stringify(initial),new Date().toISOString()).run();
 const row=await env.DB.prepare('SELECT snapshot FROM workspaces WHERE id=?').bind('main').first<{snapshot:string}>();
 if(!row)throw new Error('Workspace unavailable');
 return JSON.parse(row.snapshot) as Workspace;
}
