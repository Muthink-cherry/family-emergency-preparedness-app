const CACHE = 'family-preparedness-v2';
const SHELL = ['./index.html','./styles.css','./app.js','./storage.js','./catalog.js','./pwa.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable.png','./icon.svg'];
const assets = new Set(SHELL.map(path=>new URL(path,self.registration.scope).href));

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('family-preparedness-') && key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const {request}=event;
  if (request.method!=='GET') return;
  const url=new URL(request.url);
  const scope=new URL(self.registration.scope);
  if (url.origin!==scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (request.mode==='navigate' && (url.pathname===scope.pathname || url.pathname===scope.pathname+'index.html')) {
    const index=new URL('./index.html',scope).href;
    event.respondWith(caches.open(CACHE).then(cache=>cache.match(index)).then(cached=>cached || fetch(request)));
  } else if (assets.has(url.href)) {
    event.respondWith(caches.match(request,{cacheName:CACHE}).then(cached=>cached || fetch(request)));
  }
});
