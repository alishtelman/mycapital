self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Financial data remains online. The worker never caches HTML, API or credentials.
self.addEventListener('fetch',event=>{
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response(
    '<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width"><title>MyCapital</title><body><h1>MyCapital</h1><p>Подключитесь к сети, чтобы открыть бюджет.</p><a href="/">Повторить</a></body></html>',
    {headers:{'Content-Type':'text/html; charset=utf-8'}})));
});
