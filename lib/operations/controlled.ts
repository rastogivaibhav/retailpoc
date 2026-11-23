import {executeAssurance} from '../assurance/commands.ts';
import {must} from '../assurance/model.ts';
import type {Assurance} from '../assurance/model.ts';
import type {Job} from './jobs.ts';
export function advanceControlled(s:Assurance,j:Pick<Job,'id'|'payload'>){const p=s.plans.find(p=>p.id===j.payload.planId);must(p?.adapter,'Controlled adapter job required');const requestId='job-'+j.id+'-'+p.status.replaceAll('_','-');return executeAssurance(s,{action:'pump',planId:p.id,expectedRevision:s.revision,requestId},'Durable controlled worker')}
