// Network-first: always fetch the latest files from GitHub Pages.
// The cache is only an offline fallback, never served when online.
// Cache name is unique to this app: GitHub Pages shares one origin across repos.
const CACHE='connect4-offline';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||!r.url.startsWith(self.location.origin))return;
  e.respondWith(
    fetch(r,{cache:'no-store'}).then(res=>{
      if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy))}
      return res;
    }).catch(()=>caches.match(r))
  );
});
