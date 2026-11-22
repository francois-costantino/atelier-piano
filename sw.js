// sw.js — cache hors-ligne pour Atelier Piano.
const VERSION = 'atelier-piano-v2';
const CORE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './midi.js',
  './pieces.js',
  './synth.js',
  './keyboard.js',
  './midiInput.js',
  './recorder.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin === location.origin || url.hostname.endsWith('jsdelivr.net')) {
    e.respondWith(
      caches.match(e.request).then((hit) =>
        hit ??
        fetch(e.request).then((res) => {
          if (res.ok || res.type === 'opaque') {
            caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
          }
          return res;
        }).catch(() => caches.match(e.request))
      )
    );
  }
});
