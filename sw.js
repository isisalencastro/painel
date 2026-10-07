// Service worker do painel: guarda a casca do app (HTML, CSS, JS e icones) para abrir
// sem internet. Sempre tenta a rede primeiro; o cache so entra quando a rede falha.
// Os dados do banco (Supabase) nao passam por aqui: a ultima lista fica no app.
const VERSAO = new URL(self.location).searchParams.get("v") || "dev";
const CACHE = "painel-" + VERSAO;
const CASCA = ["./", "./index.html", "./style.css?v=" + VERSAO, "./app.js?v=" + VERSAO, "./notas.js?v=" + VERSAO, "./rotina.js?v=" + VERSAO,
  "./manifest.webmanifest", "./icones/icon-192.png", "./icones/apple-touch-icon.png",
  "./icones/favicon.svg", "./icones/favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith("painel-") && n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((resp) => {
      if (resp.ok) {
        const copia = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
      }
      return resp;
    }).catch(() => caches.match(req, { ignoreSearch: req.mode === "navigate" })
      .then((r) => r || caches.match("./index.html")))
  );
});
