// Notas do painel, no jeito das Notas do iPhone: lista por data, fixadas no topo, busca e editor de tela cheia.
// Guarda primeiro no aparelho (abre na hora e funciona sem internet) e sincroniza com a tabela "notes" do
// Supabase quando ela existe (SQL em supabase/notes.sql). Sem a tabela, as notas ficam so neste aparelho.
// Carregado depois do app.js: usa $, criar, ler, gravar, apagar, banco, sessao, aviso, vibrar e MESES de la.

const CHAVE_NOTAS = "painel.notas.v1:";   // + e-mail da conta: conta diferente nao ve nota de outra
const MARCA_VAZIA = "☐ ";
const MARCA_FEITA = "☑ ";

let notas = [];
let modoNotas = "?";        // "nuvem" (tabela existe), "local" (sem tabela) ou "?" (ainda nao sabe)
let notaAberta = null;
let salvarNotaT = null;
let sincronizarT = null;
let sincronizando = null;

function chaveNotas() { const s = sessao(); return CHAVE_NOTAS + ((s && s.email) || "").toLowerCase(); }
function carregarNotasLocais() {
  const g = ler(chaveNotas());
  notas = Array.isArray(g && g.itens) ? g.itens : [];
  if (g && g.modo) modoNotas = g.modo;
}
function gravarNotas() { gravar(chaveNotas(), { modo: modoNotas, itens: notas }); }

function novoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
}

const visiveis = () => notas.filter((n) => !n.apagada);
function tituloDe(n) {
  const l = n.corpo.split("\n").map((x) => x.trim()).find(Boolean);
  return l ? l.replace(/^[☐☑]\s*/, "") : "Nova nota";
}
function previaDe(n) {
  const linhas = n.corpo.split("\n").map((x) => x.trim()).filter(Boolean);
  return linhas.length > 1 ? linhas.slice(1).join(" ") : "Sem texto adicional";
}
function quandoNota(ms) {
  const d = new Date(ms), hoje = iso(new Date()), dia = iso(d);
  if (dia === hoje) return hora(d);
  if (diasEntre(dia, hoje) === 1) return "Ontem";
  if (diasEntre(dia, hoje) < 7) return diaSemana(dia);
  return bonita(dia) + (d.getFullYear() !== new Date().getFullYear() ? "/" + d.getFullYear() : "");
}
function grupoDe(ms) {
  const dia = iso(new Date(ms)), n = diasEntre(dia, iso(new Date()));
  if (n <= 0) return "Hoje";
  if (n === 1) return "Ontem";
  if (n < 7) return "Últimos 7 dias";
  if (n < 30) return "Últimos 30 dias";
  const d = new Date(ms);
  return MESES[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? " de " + d.getFullYear() : "");
}

/* ------------------------------ lista ------------------------------ */

function linhaNota(n, termo) {
  const b = criar("button", "nota-linha");
  b.type = "button";
  b.appendChild(criar("strong", null, tituloDe(n)));
  const sub = criar("span", "nota-sub");
  sub.appendChild(criar("b", null, quandoNota(n.atualizada)));
  sub.appendChild(document.createTextNode(" " + (termo ? trechoCom(n, termo) : previaDe(n))));
  b.appendChild(sub);
  if (n.fixada) b.appendChild(criar("i", "nota-pino", "📌")).setAttribute("aria-hidden", "true");
  b.addEventListener("click", () => abrirNota(n.id));
  return b;
}

function trechoCom(n, termo) {
  const plano = n.corpo.replace(/\s+/g, " ");
  const i = semAcento(plano).indexOf(termo);
  if (i < 0) return previaDe(n);
  const ini = Math.max(0, i - 20);
  return (ini ? "…" : "") + plano.slice(ini, i + termo.length + 40);
}

function caixaNotas(rotulo, itens, termo) {
  const frag = document.createDocumentFragment();
  frag.appendChild(criar("p", "grupo-rotulo", rotulo));
  const caixa = criar("div", "notas-caixa");
  for (const n of itens) caixa.appendChild(linhaNota(n, termo));
  frag.appendChild(caixa);
  return frag;
}

function renderNotas() {
  const termo = semAcento($("#notas-busca").value.trim());
  const alvo = $("#notas-lista");
  alvo.replaceChildren();
  let lista = visiveis().sort((a, b) => b.atualizada - a.atualizada);
  if (termo) lista = lista.filter((n) => semAcento(n.corpo).includes(termo));

  if (!lista.length) {
    const v = criar("div", "vazio");
    v.appendChild(criar("p", null, termo ? "Nenhuma nota com esse texto." : "Nenhuma nota ainda. Toque no + para escrever a primeira."));
    alvo.appendChild(v);
  } else if (termo) {
    alvo.appendChild(caixaNotas("Resultados", lista, termo));
  } else {
    const fixadas = lista.filter((n) => n.fixada);
    if (fixadas.length) alvo.appendChild(caixaNotas("Fixadas", fixadas));
    const grupos = new Map();
    for (const n of lista.filter((x) => !x.fixada)) {
      const g = grupoDe(n.atualizada);
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(n);
    }
    for (const [g, itens] of grupos) alvo.appendChild(caixaNotas(g, itens));
  }
  const total = visiveis().length;
  $("#notas-conta").textContent = total === 1 ? "1 nota" : total + " notas";
  $("#notas-modo").textContent = modoNotas === "local"
    ? "Só neste aparelho: a tabela de notas ainda não existe no banco."
    : modoNotas === "nuvem" ? (temPendentes() ? "Sincronizando…" : "Sincronizado com a sua conta.") : "";
}

/* ------------------------------ editor ------------------------------ */

function abrirNota(id) {
  const n = notas.find((x) => x.id === id);
  if (!n) return;
  notaAberta = n;
  const ed = $("#nota-editor");
  ed.hidden = false;
  document.body.classList.add("com-editor");
  const t = $("#nota-texto");
  t.value = n.corpo;
  pintarEditor();
  ajustarAltura();
  // foco no mesmo toque: no iPhone o teclado so abre se o foco vier direto do gesto
  if (!n.corpo) t.focus({ preventScroll: true });
}

function pintarEditor() {
  const n = notaAberta;
  if (!n) return;
  const d = new Date(n.atualizada);
  $("#nota-data").textContent = d.getDate() + " de " + MESES[d.getMonth()] + " de " + d.getFullYear() + " às " + hora(d);
  const pino = $("#nota-fixar");
  pino.setAttribute("aria-pressed", String(!!n.fixada));
  pino.setAttribute("aria-label", n.fixada ? "Desafixar nota" : "Fixar nota");
}

function ajustarAltura() {
  const t = $("#nota-texto");
  t.style.height = "auto";
  t.style.height = Math.max(t.scrollHeight, window.innerHeight * 0.6) + "px";
}

function novaNota(textoInicial) {
  const agora = Date.now();
  const n = { id: novoId(), corpo: textoInicial || "", fixada: false, criada: agora, atualizada: agora, apagada: false, sujo: true };
  notas.push(n);
  gravarNotas();
  abrirNota(n.id);
}

function mudouNota() {
  const n = notaAberta;
  if (!n) return;
  const v = $("#nota-texto").value;
  if (v === n.corpo) return;
  n.corpo = v;
  n.atualizada = Date.now();
  n.sujo = true;
  ajustarAltura();
  clearTimeout(salvarNotaT);
  salvarNotaT = setTimeout(() => { gravarNotas(); pintarEditor(); agendarSincronia(); }, 350);
}

function fecharNota() {
  const n = notaAberta;
  if (!n) return;
  clearTimeout(salvarNotaT);
  mudouNota();
  // nota vazia nao fica na lista, como no iPhone
  if (!n.corpo.trim()) {
    if (n.subiu) { n.apagada = true; n.sujo = true; n.atualizada = Date.now(); }
    else notas = notas.filter((x) => x !== n);
  }
  gravarNotas();
  notaAberta = null;
  $("#nota-texto").blur();
  $("#nota-editor").hidden = true;
  document.body.classList.remove("com-editor");
  renderNotas();
  agendarSincronia(200);
}

function apagarNota() {
  const n = notaAberta;
  if (!n) return;
  n.apagada = true; n.sujo = true; n.atualizada = Date.now();
  fecharNota();
  vibrar(12);
  aviso("Nota apagada.", false, {
    rotulo: "Desfazer",
    fazer: () => {
      // a sincronia pode ter tirado a nota do aparelho nesse meio-tempo: volta com ela
      if (!notas.includes(n)) notas.push(n);
      n.apagada = false; n.sujo = true; n.atualizada = Date.now();
      gravarNotas(); renderNotas(); agendarSincronia();
    },
  });
}

function fixarNota() {
  const n = notaAberta;
  if (!n) return;
  n.fixada = !n.fixada; n.sujo = true; n.atualizada = Date.now();
  gravarNotas(); pintarEditor(); agendarSincronia();
  vibrar(10);
}

// botao de checklist: poe ou tira a caixinha na linha do cursor
function alternarChecklist() {
  const t = $("#nota-texto");
  const pos = t.selectionStart;
  const ini = t.value.lastIndexOf("\n", pos - 1) + 1;
  const linha = t.value.slice(ini);
  let delta;
  if (linha.startsWith(MARCA_VAZIA) || linha.startsWith(MARCA_FEITA)) {
    t.setRangeText("", ini, ini + 2, "preserve"); delta = -2;
  } else {
    t.setRangeText(MARCA_VAZIA, ini, ini, "preserve"); delta = 2;
  }
  t.focus();
  t.setSelectionRange(Math.max(ini, pos + delta), Math.max(ini, pos + delta));
  mudouNota();
}

// tocar na caixinha (primeiros caracteres da linha) marca ou desmarca
function tocarNoTexto() {
  const t = $("#nota-texto");
  if (t.selectionStart !== t.selectionEnd) return;
  const pos = t.selectionStart;
  const ini = t.value.lastIndexOf("\n", pos - 1) + 1;
  if (pos - ini > 1) return;
  const marca = t.value.slice(ini, ini + 2);
  if (marca !== MARCA_VAZIA && marca !== MARCA_FEITA) return;
  t.setRangeText(marca === MARCA_VAZIA ? MARCA_FEITA : MARCA_VAZIA, ini, ini + 2, "preserve");
  t.setSelectionRange(ini + 2, ini + 2);
  vibrar(8);
  mudouNota();
}

// Enter numa linha de checklist abre outra caixinha; Enter numa caixinha vazia encerra a lista
function teclaNoTexto(ev) {
  if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) return;
  const t = $("#nota-texto");
  const pos = t.selectionStart;
  const ini = t.value.lastIndexOf("\n", pos - 1) + 1;
  const linha = t.value.slice(ini, pos);
  if (!linha.startsWith(MARCA_VAZIA) && !linha.startsWith(MARCA_FEITA)) return;
  ev.preventDefault();
  if (linha.trim().length <= 1) {
    t.setRangeText("", ini, pos, "end");
  } else {
    t.setRangeText("\n" + MARCA_VAZIA, pos, t.selectionEnd, "end");
  }
  mudouNota();
}

async function compartilharNota() {
  const n = notaAberta;
  if (!n || !n.corpo.trim()) return;
  try {
    if (navigator.share) { await navigator.share({ title: tituloDe(n), text: n.corpo }); return; }
    await navigator.clipboard.writeText(n.corpo);
    aviso("Nota copiada.");
  } catch (e) {
    if (e && e.name === "AbortError") return;   // a pessoa fechou o compartilhar
    aviso("Não consegui compartilhar.", true);
  }
}

/* ------------------------------ sincronia ------------------------------ */

const temPendentes = () => notas.some((n) => n.sujo);

function agendarSincronia(ms) {
  if (modoNotas === "local") return;
  clearTimeout(sincronizarT);
  sincronizarT = setTimeout(sincronizarNotas, ms === undefined ? 1500 : ms);
}

function paraBanco(n) {
  return { id: n.id, body: n.corpo, pinned: !!n.fixada, deleted: !!n.apagada,
    created_at: new Date(n.criada).toISOString(), updated_at: new Date(n.atualizada).toISOString() };
}

async function sincronizarNotas() {
  if (!sessao() || modoNotas === "local") return;
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    try {
      const remotas = await banco("notes?select=id,body,pinned,deleted,created_at,updated_at&order=updated_at.desc&limit=2000");
      modoNotas = "nuvem";
      const porId = new Map(notas.map((n) => [n.id, n]));
      for (const r of remotas || []) {
        const quando = Date.parse(r.updated_at);
        const l = porId.get(r.id);
        // vale a versao mais nova; a que esta sendo editada agora nao e trocada por baixo
        if (l && (l.atualizada >= quando || l === notaAberta)) continue;
        const n = { id: r.id, corpo: r.body || "", fixada: !!r.pinned, apagada: !!r.deleted,
          criada: Date.parse(r.created_at), atualizada: quando, sujo: false, subiu: true };
        if (l) Object.assign(l, n); else notas.push(n);
      }
      // nao sobe: nota vazia ainda aberta, nem nota apagada que nunca chegou ao banco
      for (const n of notas) if (n.sujo && n.apagada && !n.subiu) n.sujo = false;
      const sujas = notas.filter((n) => n.sujo && !(n === notaAberta && !n.corpo.trim()) && !(n.apagada && !n.subiu));
      if (sujas.length) {
        const enviadas = sujas.map((n) => ({ n, em: n.atualizada }));
        await banco("notes?on_conflict=id", {
          metodo: "POST", corpo: sujas.map(paraBanco),
          cabecalhos: { Prefer: "resolution=merge-duplicates,return=minimal" },
        });
        // so limpa a marca se a nota nao mudou enquanto subia
        for (const { n, em } of enviadas) { n.subiu = true; if (n.atualizada === em) n.sujo = false; }
      }
      // apagada e ja sincronizada nao precisa mais ficar no aparelho
      notas = notas.filter((n) => !(n.apagada && !n.sujo));
    } catch (e) {
      if (e && e.status === 404) modoNotas = "local";   // tabela ainda nao criada
    } finally {
      gravarNotas();
      sincronizando = null;
      if (vista === "notas") renderNotas();
    }
  })();
  return sincronizando;
}

// sem a tabela, as notas ficam no aparelho; quando ela aparece, a proxima abertura do app sobe tudo
function reavaliarModo() { if (modoNotas === "local") modoNotas = "?"; }

/* ------------------------------ ligacoes ------------------------------ */

function notasQueCasam(termo) {
  return visiveis().filter((n) => semAcento(n.corpo).includes(termo)).sort((a, b) => b.atualizada - a.atualizada);
}

function iniciarNotas() {
  carregarNotasLocais();
  reavaliarModo();
  $("#notas-busca").addEventListener("input", renderNotas);
  $("#nota-voltar").addEventListener("click", fecharNota);
  $("#nota-ok").addEventListener("click", fecharNota);
  $("#nota-apagar").addEventListener("click", apagarNota);
  $("#nota-fixar").addEventListener("click", fixarNota);
  $("#nota-lista").addEventListener("click", alternarChecklist);
  $("#nota-compartilhar").addEventListener("click", compartilharNota);
  const t = $("#nota-texto");
  t.addEventListener("input", mudouNota);
  t.addEventListener("click", tocarNoTexto);
  t.addEventListener("keydown", teclaNoTexto);
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && notaAberta) fecharNota(); });
  // o app pode fechar a qualquer momento no celular: grava o que estiver digitado
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { mudouNota(); clearTimeout(salvarNotaT); gravarNotas(); }
    else if (sessao()) agendarSincronia(300);
  });
  window.addEventListener("pagehide", () => { mudouNota(); gravarNotas(); });
  window.addEventListener("online", () => agendarSincronia(300));
  if (sessao()) agendarSincronia(800);
}

// Saida da conta (chamar antes de apagar a sessao). Se tudo ja esta no banco, a copia do aparelho sai junto;
// se a nota so existe aqui (sem tabela ou sem internet), fica guardada para nao se perder.
function limparNotasDaTela() {
  if (notaAberta) fecharNota();
  if (modoNotas === "nuvem" && !temPendentes()) apagar(chaveNotas());
  else gravarNotas();
  notas = [];
  modoNotas = "?";
}
function notasAoEntrar() { carregarNotasLocais(); reavaliarModo(); agendarSincronia(300); }

iniciarNotas();
