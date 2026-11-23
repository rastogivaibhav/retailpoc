// Persistent work lives in the Site's transactional outbox, never in this isolate.
export default {
 async scheduled(_event,env,ctx){ctx.waitUntil(tick(env));},
 async fetch(request,env){if(request.method!=='POST'||request.headers.get('authorization')!=='Bearer '+env.RUNNER_KEY)return new Response('Not found',{status:404});return tick(env);}
};
async function tick(env){const response=await fetch(env.SITE_ORIGIN+'/api/operations/worker',{method:'POST',headers:{Authorization:'Bearer '+env.RUNNER_KEY,'x-assurance-runner':'cloudflare-cron'},signal:AbortSignal.timeout(90000),redirect:'manual'});const body=await response.text();if(!response.ok)throw Error('Assurance outbox batch failed: HTTP '+response.status);return new Response(body,{headers:{'content-type':'application/json'}})}
