---
layout: compress

# Chirpy v2.2
# https://github.com/cotes2020/jekyll-theme-chirpy
# © 2020 Cotes Chung
# MIT Licensed
---

self.importScripts('{{ "/assets/js/data/cache-list.js" | relative_url }}');

function getCacheName(){
    return new Date().getMonth() + 1 + '-' + new Date().getDate();
}


function isExcluded(url) {
  for (const rule of exclude) {
    if (url.indexOf(rule) != -1) {
      return true;
    }
  }
  return false;
}


self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(getCacheName()).then((cache) => {
      return cache.addAll(include);
    })
  );
});


self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((r) => {
      /* console.log('[Service Worker] Fetching resource: ' + e.request.url); */
      return r || fetch(e.request).then((response) => {
        return caches.open(getCacheName()).then((cache) => {
          if (!isExcluded(e.request.url)) {
            /* console.log('[Service Worker] Caching new resource: ' + e.request.url); */
            cache.put(e.request, response.clone());
          }
          return response;
        });
      });
    })
  );
});


self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
          return Promise.all(keyList.map((key) => {
        if(key !== getCacheName()) {
          return caches.delete(key);
        }
      }));
    })
  );
});
