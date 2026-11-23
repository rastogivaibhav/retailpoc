import type {Assurance} from './model';

export type SampleEditGroup='commitments'|'lots'|'lanes'|'clock';
export type SampleEdit={group:SampleEditGroup;id:string;field:string;value:unknown};
type EditableRecord={id:string;[key:string]:unknown};

/** Apply only fields a visitor explicitly changed to a newly selected example scenario. */
export function applySampleEdits(state:Assurance,edits:SampleEdit[]):Assurance{
 const next=structuredClone(state);
 for(const edit of edits){
  if(edit.group==='clock'){
   if(edit.field==='clock'&&typeof edit.value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(edit.value))next.clock=`${edit.value}T12:00:00Z`;
   continue;
  }
  const rows=next[edit.group] as unknown as EditableRecord[];
  const index=rows.findIndex(row=>row.id===edit.id);
  if(edit.field==='$delete'){
   if(index>=0)rows.splice(index,1);
  }else if(edit.field==='$add'){
   if(index<0&&edit.value&&typeof edit.value==='object')rows.push(structuredClone(edit.value) as EditableRecord);
  }else if(index>=0){
   rows[index]={...rows[index],[edit.field]:structuredClone(edit.value)};
  }
 }
 return next;
}
