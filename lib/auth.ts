import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../app/chatgpt-auth';
import {DomainError} from './domain';
import {isOwnerIdentity} from './access-policy';
export async function owner(){const u=await getChatGPTUser();return u&&isOwnerIdentity(u.email,env.OWNER_EMAILS)?u:null;}
export async function requireOwner(){const u=await owner();if(!u)throw new DomainError('OWNER_REQUIRED','Sign in as the site owner to access configuration or execute this action.',403);return u;}
export async function principal(){const u=await getChatGPTUser();if(!u)throw new DomainError('SIGN_IN','Sign in to use a private lab workspace.',401);return u;}
