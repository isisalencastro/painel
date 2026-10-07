// Painel pessoal da Isis ("Meu app"): rotina do dia, tarefas por dia, notas e bem-estar.
// Este arquivo e a casca: sessao, banco, navegacao, faixa da semana, bem-estar e busca.
// Os dados moram no dados.js; as telas em rotina.js, tarefas.js e notas.js (carregados depois deste).
const CFG = {
  url: "https://xpkycwxzvhtaylwferiu.supabase.co",
  chave: "sb_publishable_SDGO156OgN9m5HrqcnLeAQ_fcnYctqU",
};
const VERSAO = "202610072200";
const CHAVE_SESSAO = "painel.sessao.v1";
const DIAS_NAVEGAVEIS = 60;                 // a faixa da semana anda ate 60 dias para tras e para frente

const $ = (s) => document.querySelector(s);

// Dentro de um iframe de outro site o painel nao abre (evita clique enganado por cima da tela).
if (window.top !== window.self) document.documentElement.hidden = true;
// Texto do banco entra sempre como texto, nunca como HTML.
const criar = (tag, cls, texto) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (texto !== undefined) el.textContent = texto;
  return el;
};

/* ------------------------------ armazenamento ------------------------------ */

function ler(chave) {
  try { return JSON.parse(localStorage.getItem(chave) || "null"); }
  catch (e) { return null; }
}
function gravar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* segue em memoria */ }
}
function apagar(chave) {
  try { localStorage.removeItem(chave); } catch (e) {}
}

/* ------------------------------ sessao ------------------------------ */

let sessaoViva = null;   // copia em memoria: vale mesmo se o navegador barrar o armazenamento

function sessao() { return sessaoViva || ler(CHAVE_SESSAO); }
function guardarSessao(s) {
  sessaoViva = s;
  gravar(CHAVE_SESSAO, s);
}
function sair() {
  const s = sessao();
  if (typeof limparNotasDaTela === "function") limparNotasDaTela();
  if (typeof limparDadosDaTela === "function") limparDadosDaTela();
  // revoga a sessao no servidor tambem: quem copiar o token do aparelho nao entra mais
  if (s && s.access_token) {
    fetch(CFG.url + "/auth/v1/logout", {
      method: "POST", headers: { apikey: CFG.chave, Authorization: "Bearer " + s.access_token },
    }).catch(() => {});
  }
  sessaoViva = null;
  apagar(CHAVE_SESSAO);
  mostrarEntrada();
}

function sessaoDe(resposta, email) {
  return {
    access_token: resposta.access_token,
    refresh_token: resposta.refresh_token,
    expira_em: Date.now() + ((resposta.expires_in || 3600) - 60) * 1000,
    email: (resposta.user && resposta.user.email) || email,
  };
}

async function entrar(email, senha) {
  const r = await fetch(CFG.url + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: CFG.chave, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const bruto = String(e.error_description || e.msg || "").toLowerCase();
    let msg = "Não consegui entrar. Confira e-mail e senha.";
    if (bruto.includes("invalid login")) {
      msg = "E-mail ou senha não conferem. Veja se a primeira letra não ficou maiúscula e se não sobrou espaço no fim.";
    } else if (bruto.includes("not confirmed")) {
      msg = "Esse e-mail ainda não está confirmado no Supabase.";
    } else if (bruto.includes("rate limit") || bruto.includes("too many")) {
      msg = "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
    }
    throw new Error(msg);
  }
  guardarSessao(sessaoDe(await r.json(), email));
}

// Uma renovacao por vez: duas chamadas ao mesmo tempo gastariam o mesmo refresh_token
// e a segunda derrubaria a sessao.
let renovando = null;

async function token() {
  const s = sessao();
  if (!s) return null;
  if (Date.now() < s.expira_em) return s.access_token;
  if (!renovando) {
    renovando = (async () => {
      const r = await fetch(CFG.url + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { apikey: CFG.chave, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      if (r.status === 400 || r.status === 401) { sair(); return null; }
      if (!r.ok) throw new Error("HTTP " + r.status);   // rede ruim nao desloga
      const n = sessaoDe(await r.json(), s.email);
      guardarSessao(n);
      return n.access_token;
    })().finally(() => { renovando = null; });
  }
  return renovando;
}

async function banco(caminho, opcoes) {
  const t = await token();
  if (!t) throw new Error("sem sessão");
  const o = opcoes || {};
  const r = await fetch(CFG.url + "/rest/v1/" + caminho, {
    method: o.metodo || "GET",
    body: o.corpo ? JSON.stringify(o.corpo) : undefined,
    headers: Object.assign({
      apikey: CFG.chave,
      Authorization: "Bearer " + t,
      "Content-Type": "application/json",
    }, o.cabecalhos || {}),
  });
  if (r.status === 401) { sair(); throw new Error("sessão expirada"); }
  if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

/* ------------------------------ utilidades ------------------------------ */

function saudacao() {
  const h = new Date().getHours();
  if (h < 5) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// acao opcional: { rotulo, fazer } vira um botao no aviso (ex.: Desfazer), que fica mais tempo na tela
function aviso(txt, erro, acao) {
  const box = $("#aviso");
  box.replaceChildren(criar("span", null, txt));
  if (acao) {
    const b = criar("button", "aviso-acao", acao.rotulo);
    b.type = "button";
    b.addEventListener("click", () => { esconder(); acao.fazer(); });
    box.appendChild(b);
  }
  box.classList.toggle("erro-aviso", !!erro);
  box.classList.toggle("com-acao", !!acao);
  box.hidden = false;
  requestAnimationFrame(() => box.classList.add("visivel"));
  function esconder() {
    clearTimeout(aviso._t);
    box.classList.remove("visivel");
    setTimeout(() => { if (!box.classList.contains("visivel")) box.hidden = true; }, 250);
  }
  clearTimeout(aviso._t);
  aviso._t = setTimeout(esconder, acao ? 5000 : 2400);
}

function vibrar(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}

function iso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function deISO(txt) { return new Date(txt + "T12:00:00"); }
function somaDias(txt, n) { const d = deISO(txt); d.setDate(d.getDate() + n); return iso(d); }
function diasEntre(a, b) { return Math.round((deISO(b) - deISO(a)) / 86400000); }
function bonita(txt) {
  const d = deISO(txt);
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
}
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function diaSemana(txt) { return DIAS[deISO(txt).getDay()]; }
function hora(d) { return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }

function quandoFalta(n) {
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  return n > 0 ? "em " + n + " dias" : "há " + (-n) + " dias";
}
function semAcento(t) { return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

const CHAVE_HUMOR = "painel.humor.v1";       // humor por dia, so neste aparelho
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
  "setembro", "outubro", "novembro", "dezembro"];
const AFIRMACOES = [
  "Cada momento é um novo começo.", "Feito é melhor que perfeito.", "Um passo de cada vez ainda é andar.",
  "Eu dou conta do que é meu hoje.", "Descansar também é parte do trabalho.", "Pequenas tarefas, grande diferença.",
  "Hoje eu escolho o que importa.", "Meu ritmo é suficiente.", "O que eu cuido, cresce.",
  "Começar já é metade do caminho.", "Posso fazer bem feito sem fazer tudo.", "Sou gentil comigo enquanto avanço.",
  "Constância vence pressa.", "O dia de hoje conta.", "Eu mereço a calma que eu crio.",
];
const HUMORES = [
  ["★", "protagonista"], ["☀", "radiante"], ["⚡", "com energia"], ["🎯", "focada"],
  ["☁", "tranquila"], ["🌙", "cansada"], ["🌧", "sensível"],
];

/* ------------------------------ tela ------------------------------ */

let diaSel = iso(new Date());   // dia aberto na Rotina e nas Tarefas; a faixa da semana troca
let vista = "hoje";
let fraseExtra = 0;             // quantas vezes a frase do dia foi trocada

const hojeISO = () => iso(new Date());
const limiteAntes = () => somaDias(hojeISO(), -DIAS_NAVEGAVEIS);
const limiteDepois = () => somaDias(hojeISO(), DIAS_NAVEGAVEIS);
function segundaDe(txt) { const d = deISO(txt); return somaDias(txt, -((d.getDay() + 6) % 7)); }

function mostrarEntrada() {
  $("#app").hidden = true;
  $("#barra").hidden = true;
  fecharFolhas();
  const t = $("#entrar");
  t.hidden = false;
  const s = sessao();
  $("#entrar-email").value = s ? s.email : "";
  setTimeout(() => ($("#entrar-email").value ? $("#entrar-senha") : $("#entrar-email")).focus(), 100);
}

function mostrarPainel() {
  $("#entrar").hidden = true;
  $("#app").hidden = false;
  $("#barra").hidden = false;
}

/* ---------- frase do dia e humor (aba Bem-estar) ---------- */

function renderFrase(animar) {
  const base = Math.floor(deISO(hojeISO()) / 86400000);
  const i = (base + fraseExtra) % AFIRMACOES.length;
  const el = $("#afirmacao-texto");
  el.textContent = AFIRMACOES[i];
  if (animar) { el.classList.remove("troca"); void el.offsetWidth; el.classList.add("troca"); }
  const pontos = $("#afirmacao-pontos");
  pontos.replaceChildren();
  for (let k = 0; k < 3; k++) {
    const b = criar("button");
    b.type = "button";
    b.setAttribute("aria-label", "Frase " + (k + 1));
    b.setAttribute("aria-current", String(fraseExtra % 3 === k));
    b.addEventListener("click", (ev) => { ev.stopPropagation(); fraseExtra = k; renderFrase(true); });
    pontos.appendChild(b);
  }
}

function humores() { return ler(CHAVE_HUMOR) || {}; }
function renderHumor() {
  const h = humores()[hojeISO()];
  const achado = HUMORES.find((x) => x[1] === h);
  $("#humor-valor").textContent = achado ? achado[0] + "  " + achado[1] : "como você está hoje?";
  const caixa = $("#humor-opcoes");
  caixa.replaceChildren();
  for (const [icone, nome] of HUMORES) {
    const b = criar("button", null, icone + " " + nome);
    b.type = "button";
    b.setAttribute("aria-pressed", String(nome === h));
    b.addEventListener("click", () => {
      const todos = humores();
      todos[hojeISO()] = nome;
      // guarda so as ultimas semanas
      for (const d of Object.keys(todos)) if (d < somaDias(hojeISO(), -60)) delete todos[d];
      gravar(CHAVE_HUMOR, todos);
      caixa.hidden = true;
      $("#humor").setAttribute("aria-expanded", "false");
      vibrar(10);
      renderBem();
    });
    caixa.appendChild(b);
  }
}

/* ---------- faixa da semana (Rotina e Tarefas) ---------- */

let semanaIni = segundaDe(diaSel);

function renderSemana() {
  const caixa = $("#semana-dias");
  caixa.replaceChildren();
  const meio = deISO(somaDias(semanaIni, 3));
  $("#semana-mes").textContent = MESES[meio.getMonth()] + (meio.getFullYear() !== new Date().getFullYear() ? " " + meio.getFullYear() : "");
  for (let k = 0; k < 7; k++) {
    const d = somaDias(semanaIni, k);
    const b = criar("button", "dia");
    b.type = "button";
    b.dataset.dia = d;
    b.setAttribute("role", "tab");
    b.appendChild(criar("small", null, diaSemana(d).slice(0, 3)));
    b.appendChild(criar("strong", null, String(deISO(d).getDate())));
    const fora = d < limiteAntes() || d > limiteDepois();
    b.classList.toggle("fora", fora);
    b.disabled = fora;
    b.classList.toggle("hoje", d === hojeISO());
    b.setAttribute("aria-label", diaSemana(d) + ", " + bonita(d));
    b.addEventListener("click", () => escolherDia(d));
    caixa.appendChild(b);
  }
  $("#semana-antes").disabled = semanaIni <= limiteAntes();
  $("#semana-depois").disabled = somaDias(semanaIni, 6) >= limiteDepois();
  $("#semana-hoje").hidden = diaSel === hojeISO() && semanaIni === segundaDe(hojeISO());
  marcarSemana();
}

// Na Rotina, ponto = dia com compromisso. Nas Tarefas, ponto azul = dia com tarefa, verde = tudo feito.
function marcarSemana() {
  for (const b of document.querySelectorAll("#semana-dias .dia")) {
    const d = b.dataset.dia;
    let tem = false, fechado = false;
    if (vista === "tarefas") {
      const ts = tarefasDo(d);
      tem = ts.length > 0;
      fechado = tem && ts.every((t) => t.feito);
    } else {
      tem = compromissosDe(d).length > 0;
    }
    b.classList.toggle("tem", tem);
    b.classList.toggle("fechado", fechado);
    b.setAttribute("aria-selected", String(d === diaSel));
  }
}

function escolherDia(d) {
  if (d < limiteAntes()) d = limiteAntes();
  if (d > limiteDepois()) d = limiteDepois();
  diaSel = d;
  semanaIni = segundaDe(d);
  renderSemana();
  renderVista();
}

function mudarSemana(n) {
  semanaIni = somaDias(semanaIni, 7 * n);
  // na semana nova, mostra o mesmo dia da semana
  escolherDia(somaDias(diaSel, 7 * n));
}

function renderDiaRotina() {
  const n = diasEntre(hojeISO(), diaSel);
  $("#dia-titulo").textContent = n === 0 ? "Hoje" : n === 1 ? "Amanhã" : n === -1 ? "Ontem"
    : diaSemana(diaSel) + ", " + bonita(diaSel);
  renderRotina();
}

/* ---------- exportar para a RING ---------- */

// Baixa um arquivo com a rotina, os compromissos, as tarefas, as notas e o humor deste aparelho, para a RING
// importar. Nada sai daqui sozinho: é um arquivo no aparelho da Isis.
function exportarParaRing() {
  const vivos = (lista) => (lista || []).filter((x) => !x.apagado);
  const pacote = {
    formato: "meu-dia",
    versao: 1,
    exportado_em: new Date().toISOString(),
    dados: { blocos: vivos(dados.blocos), compromissos: vivos(dados.compromissos), tarefas: vivos(dados.tarefas) },
    notas: notas.filter((n) => !n.apagada).map((n) => ({ id: n.id, corpo: n.corpo, fixada: !!n.fixada })),
    humor: humores(),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(pacote, null, 2)], { type: "application/json" }));
  const a = criar("a");
  a.href = url;
  a.download = "meu-dia-para-ring-" + hojeISO() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- bem-estar ---------- */

function renderBem() {
  renderFrase(false);
  renderHumor();
  const hoje = hojeISO();
  const hs = humores();
  const sem = $("#humor-semana");
  sem.replaceChildren();
  const barras = $("#barras");
  barras.replaceChildren();
  const dias = [];
  for (let k = 6; k >= 0; k--) dias.push(somaDias(hoje, -k));
  const maior = Math.max(1, ...dias.map((d) => tarefasDo(d).length));
  for (const d of dias) {
    const achado = HUMORES.find((x) => x[1] === hs[d]);
    const c = criar("div");
    c.title = achado ? achado[1] : "sem registro";
    c.appendChild(criar("b", null, achado ? achado[0] : "·"));
    c.appendChild(criar("small", null, d === hoje ? "hoje" : diaSemana(d).slice(0, 3)));
    sem.appendChild(c);

    const itens = tarefasDo(d);
    const feitos = itens.filter((t) => t.feito).length;
    const b = criar("div", "barra-dia" + (itens.length && feitos === itens.length ? " cheio" : ""));
    b.appendChild(criar("span", null, itens.length ? feitos + "/" + itens.length : ""));
    const i = criar("i");
    i.style.height = Math.round((feitos / maior) * 80) + "px";
    b.appendChild(i);
    b.appendChild(criar("small", null, d === hoje ? "hoje" : diaSemana(d).slice(0, 3)));
    barras.appendChild(b);
  }
}

/* ---------- busca (tarefas e notas) ---------- */

function renderBusca() {
  const q = semAcento($("#busca").value.trim());
  const alvo = $("#busca-resultado");
  alvo.replaceChildren();
  if (!q) { alvo.appendChild(criar("p", "secundario", "Busca nas tarefas e nas notas.")); return; }
  const hoje = hojeISO();
  const achadas = vivos(dados.tarefas).filter((t) => semAcento(t.titulo).includes(q))
    .sort((a, b) => a.data.localeCompare(b.data));
  const notasAchadas = typeof notasQueCasam === "function" ? notasQueCasam(q) : [];
  if (!achadas.length && !notasAchadas.length) { alvo.appendChild(criar("p", "secundario", "Nada encontrado.")); return; }
  if (notasAchadas.length) alvo.appendChild(caixaNotas("Notas", notasAchadas, q));
  if (achadas.length) {
    alvo.appendChild(criar("p", "grupo-rotulo", "Tarefas"));
    const caixa = criar("div", "lista-solta");
    for (const t of achadas) caixa.appendChild(linhaTarefa(t, t.data === hoje ? "hoje" : diaSemana(t.data) + ", " + bonita(t.data)));
    alvo.appendChild(caixa);
  }
}

/* ---------- navegacao ---------- */

const COM_SEMANA = ["hoje", "tarefas"];

function renderVista() {
  if (vista === "hoje") renderDiaRotina();
  if (vista === "tarefas") renderTarefas();
  if (vista === "bem") renderBem();
  if (vista === "busca") renderBusca();
  if (vista === "notas") renderNotas();
  marcarSemana();
}

// quieto: redesenho sem rolar a tela nem roubar o foco
function irPara(nome, quieto) {
  vista = nome;
  for (const v of document.querySelectorAll(".vista")) v.hidden = v.dataset.vista !== nome;
  $("#semana").hidden = !COM_SEMANA.includes(nome);
  for (const b of document.querySelectorAll("#barra [data-ir]")) {
    if (b.dataset.ir === nome) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  }
  renderVista();
  if (nome === "busca" && !quieto) setTimeout(() => $("#busca").focus(), 50);
  const rotulos = { hoje: "Novo na rotina", tarefas: "Nova tarefa", notas: "Nova nota" };
  $("#abrir-nova").setAttribute("aria-label", rotulos[nome] || "Nova tarefa");
  if (!quieto) window.scrollTo({ top: 0 });
}

function abrirFolha(id) {
  fecharFolhas();
  $(id).hidden = false;
  const campo = $(id).querySelector("input[type=text]");
  if (campo) setTimeout(() => campo.focus(), 120);
}
function fecharFolhas() { for (const f of document.querySelectorAll(".folha")) f.hidden = true; }

function abrirApp() {
  mostrarPainel();
  $("#menu-conta").textContent = (sessao() && sessao().email) || "";
  const hoje = hojeISO();
  $("#saudacao").textContent = saudacao() + ", Isis";
  $("#data-hoje").textContent = diaSemana(hoje) + ", " + deISO(hoje).getDate() + " de " + MESES[deISO(hoje).getMonth()];
  renderSemana();
  irPara(vista, true);
  atualizarSino();
}

// deslizar para o lado troca o dia (na lista) ou a semana (na faixa)
let deslizouEm = 0;
function aoDeslizar(el, fn) {
  let x0 = null, y0 = null;
  el.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 45) { deslizouEm = Date.now(); fn(dx < 0 ? 1 : -1); }
  }, { passive: true });
}

/* ------------------------------ partida ------------------------------ */

$("#form-entrar").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const bt = $("#botao-entrar");
  const erro = $("#entrar-erro");
  erro.textContent = "";
  bt.disabled = true;
  bt.textContent = "Entrando…";
  try {
    await entrar($("#entrar-email").value.trim(), $("#entrar-senha").value.trim());
    $("#entrar-senha").value = "";
    notasAoEntrar();
    dadosAoEntrar();
    abrirApp();
  } catch (e) {
    erro.textContent = navigator.onLine === false ? "Sem internet. Conecte e tente de novo." : e.message;
  } finally {
    bt.disabled = false;
    bt.textContent = "Entrar";
  }
});

$("#sair").addEventListener("click", sair);
$("#exportar-ring").addEventListener("click", exportarParaRing);
$("#atualizar").addEventListener("click", async () => {
  const b = $("#atualizar");
  b.classList.add("girando");
  await Promise.all([sincronizarDados(), sincronizarNotas()]);
  b.classList.remove("girando");
  fecharFolhas();
  aviso(modoDados === "local" ? "Sem a tabela no banco: tudo fica neste aparelho." : "Sincronizado.");
});
$("#abrir-menu").addEventListener("click", () => abrirFolha("#folha-menu"));
$("#abrir-busca").addEventListener("click", () => irPara(vista === "busca" ? "hoje" : "busca"));
$("#busca").addEventListener("input", renderBusca);
$("#sino").addEventListener("click", () => { escolherDia(hojeISO()); irPara("tarefas"); });
for (const b of document.querySelectorAll("#barra [data-ir]")) b.addEventListener("click", () => irPara(b.dataset.ir));

$("#afirmacao").addEventListener("click", () => { fraseExtra++; renderFrase(true); });
$("#humor").addEventListener("click", () => {
  const caixa = $("#humor-opcoes");
  caixa.hidden = !caixa.hidden;
  $("#humor").setAttribute("aria-expanded", String(!caixa.hidden));
});

$("#semana-antes").addEventListener("click", () => mudarSemana(-1));
$("#semana-depois").addEventListener("click", () => mudarSemana(1));
$("#semana-hoje").addEventListener("click", () => escolherDia(hojeISO()));
aoDeslizar($("#semana-dias"), (n) => { if (!$(n < 0 ? "#semana-antes" : "#semana-depois").disabled) mudarSemana(n); });
aoDeslizar($("#rotina-dia"), (n) => escolherDia(somaDias(diaSel, n)));
aoDeslizar($("#tarefas-lista"), (n) => escolherDia(somaDias(diaSel, n)));

// "+": o que for da aba aberta
$("#abrir-nova").addEventListener("click", () => {
  if (vista === "notas") { novaNota(); return; }
  if (vista === "hoje") { abrirFolha("#folha-mais"); return; }
  if (vista !== "tarefas") irPara("tarefas");
  $("#tarefa-nova").focus();
});
for (const f of document.querySelectorAll(".folha")) {
  f.addEventListener("click", (ev) => { if (ev.target === f || ev.target.closest("[data-fechar]")) fecharFolhas(); });
}
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") fecharFolhas(); });

let abertoEm = iso(new Date());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !sessao()) return;
  // virou o dia com o app aberto: volta para hoje
  if (abertoEm !== hojeISO()) {
    abertoEm = hojeISO();
    diaSel = abertoEm; semanaIni = segundaDe(diaSel); fraseExtra = 0;
    abrirApp();
  }
});

for (const el of document.querySelectorAll(".versao")) el.textContent = "versão " + VERSAO;

// Os outros scripts (dados, notas, rotina, tarefas) carregam depois deste; a tela abre quando todos chegaram.
window.addEventListener("DOMContentLoaded", () => {
  try { localStorage.removeItem("painel.lista.v1"); } catch (e) {}   // lista antiga do Notion
  aoMudarDados.push(() => { if (vista === "bem") renderBem(); if (vista === "busca") renderBusca(); });
  if (!sessao()) { mostrarEntrada(); return; }
  abrirApp();
  sincronizarDados();
});

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js?v=" + VERSAO).catch(() => {});
}

window.__versao = VERSAO;
