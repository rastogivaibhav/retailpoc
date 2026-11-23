export function isOwnerIdentity(email:string|undefined|null,owners:string|undefined){return Boolean(email&&owners?.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase()));}
export function tenantKey(userId:string|undefined|null){if(!userId||userId.length>200)throw new Error('Authenticated tenant identity required');return 'user:'+userId;}
