/* 収集マップ Service Worker */
var VER = "cm-shell-4.1.0";
var TILES = "cm-tiles-1";
var TILE_MAX = 2000;
var SHELL = ["./", "index.html", "app.js", "data.json", "b/index.json", "manifest.webmanifest",
             "vendor/leaflet.js", "vendor/leaflet.css", "icon-192.png", "icon-512.png"];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(VER).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== VER && k !== TILES; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

var putCount = 0;
function trimTiles(){
  return caches.open(TILES).then(function(c){
    return c.keys().then(function(keys){
      var over = keys.length - TILE_MAX;
      if(over <= 0) return;
      return Promise.all(keys.slice(0, over).map(function(k){ return c.delete(k); }));
    });
  });
}

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;
  var url = new URL(req.url);

  // 地図タイル：キャッシュ優先（表示したことのある範囲は圏外でも出る）
  if(url.hostname === "tile.openstreetmap.org"){
    e.respondWith(caches.open(TILES).then(function(c){
      return c.match(req).then(function(hit){
        if(hit) return hit;
        return fetch(req).then(function(res){
          if(res && res.ok){
            c.put(req, res.clone());
            if(++putCount % 50 === 0) trimTiles();
          }
          return res;
        });
      });
    }));
    return;
  }

  // アプリ本体：通信優先（更新を拾う）、だめならキャッシュ
  if(url.origin === self.location.origin){
    e.respondWith(
      Promise.race([
        fetch(req).then(function(res){
          if(res && res.ok){ var cp = res.clone(); caches.open(VER).then(function(c){ c.put(req, cp); }); }
          return res;
        }),
        new Promise(function(_, rej){ setTimeout(function(){ rej(new Error("timeout")); }, 4000); })
      ]).catch(function(){
        return caches.match(req, {ignoreSearch:true}).then(function(hit){
          return hit || caches.match("index.html");
        });
      })
    );
  }
});
