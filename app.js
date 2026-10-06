// Painel pessoal da Isis: le a lista do dia no banco e deixa marcar na tela.
// A lista nasce na pagina "Casa" do Notion; o status vive aqui, no banco.
const CFG = {
  url: "https://xpkycwxzvhtaylwferiu.supabase.co",
  chave: "sb_publishable_SDGO156OgN9m5HrqcnLeAQ_fcnYctqU",
};
const VERSAO = "202610051500";
const CHAVE_SESSAO = "painel.sessao.v1";
const CHAVE_LISTA = "painel.lista.v1";      // ultima lista boa, para abrir na hora e sem internet
const DIAS_PARA_TRAS = 7;                   // pendencias atrasadas que ainda aparecem
const DIAS_PARA_FRENTE = 30;
const RECARREGA_APOS_MS = 60 * 1000;        // voltar ao app recarrega, mas nao a cada toque
const R = 52;
const VOLTA = 2 * Math.PI * R;

// ordem em que os blocos aparecem na tela
const ORDEM = ["Diárias da casa", "Cuidados pessoais", "Semanais", "Mensais",
  "Vídeos da semana", "Estudos", "Conteúdo do dia"];
// cor de cada bloco na tela (o tom fica no style.css); bloco novo cai no cinza
const CORES = {
  "Diárias da casa": "azul", "Cuidados pessoais": "rosa", "Semanais": "verde", "Mensais": "ambar",
  "Vídeos da semana": "coral", "Estudos": "violeta", "Conteúdo do dia": "laranja",
};

const $ = (s) => document.querySelector(s);
// Texto vindo do banco entra sempre como texto, nunca como HTML.
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
  sessaoViva = null;
  apagar(CHAVE_SESSAO);
  apagar(CHAVE_LISTA);
  ultimas = [];
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
  if (!r.ok) throw new Error("HTTP " + r.status);
  if (o.metodo === "PATCH" || r.status === 204) return null;
  return r.json();
}

/* ------------------------------ utilidades ------------------------------ */

function saudacao() {
  const h = new Date().getHours();
  if (h < 5) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function aviso(txt, erro) {
  const box = $("#aviso");
  box.textContent = txt;
  box.classList.toggle("erro-aviso", !!erro);
  box.hidden = false;
  requestAnimationFrame(() => box.classList.add("visivel"));
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => {
    box.classList.remove("visivel");
    setTimeout(() => { box.hidden = true; }, 250);
  }, 2200);
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

const CHAVE_HUMOR = "painel.humor.v1";       // humor por dia, so neste aparelho
const CHAVE_ESCONDER = "painel.esconder.v1"; // esconder as feitas
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
const BLOCO_CUIDADOS = "Cuidados pessoais";

/* ------------------------------ tela ------------------------------ */

let ultimas = [];
let diaSel = iso(new Date());   // dia que a lista mostra; a faixa da semana troca
let vista = "hoje";
let fraseExtra = 0;             // quantas vezes a frase do dia foi trocada

const hojeISO = () => iso(new Date());
const limiteAntes = () => somaDias(hojeISO(), -DIAS_PARA_TRAS);
const limiteDepois = () => somaDias(hojeISO(), DIAS_PARA_FRENTE);
function segundaDe(txt) { const d = deISO(txt); return somaDias(txt, -((d.getDay() + 6) % 7)); }
function semAcento(t) { return String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
const corDe = (bloco) => CORES[bloco] || "cinza";

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

async function salvarMarca(item) {
  await banco("tasks?id=eq." + encodeURIComponent(item.id), {
    metodo: "PATCH", corpo: { status: item.feito ? "concluida" : "pendente" },
    cabecalhos: { Prefer: "return=minimal" },
  });
  gravar(CHAVE_LISTA, { em: Date.now(), itens: ultimas });
}

function linhaTarefa(item, extra) {
  const el = criar("div", "tarefa" + (item.feito ? " feita" : ""));
  el.dataset.id = item.id;
  const marca = criar("button", "marca");
  marca.type = "button";
  marca.setAttribute("aria-pressed", String(item.feito));
  marca.setAttribute("aria-label", item.titulo);
  marca.appendChild(criar("span", "marca-check", "✓")).setAttribute("aria-hidden", "true");
  el.appendChild(marca);
  const corpo = criar("div", "texto");
  corpo.appendChild(criar("span", null, item.titulo));
  if (extra) corpo.appendChild(criar("small", "tarefa-extra", extra));
  el.appendChild(corpo);

  const pinta = () => {
    el.classList.toggle("feita", item.feito);
    marca.setAttribute("aria-pressed", String(item.feito));
  };
  el.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (el.classList.contains("ocupada")) return;
    el.classList.add("ocupada");
    item.feito = !item.feito;
    pinta();
    if (item.feito) vibrar(12);
    atualizarResumo();
    salvarMarca(item).catch(() => {
      item.feito = !item.feito;
      pinta();
      atualizarResumo();
      aviso(navigator.onLine === false
        ? "Sem internet: a marcação não foi salva."
        : "Não consegui salvar. Tente de novo.", true);
    }).finally(() => el.classList.remove("ocupada"));
  });
  return el;
}

// Um bloco do dia: na esquerda a conta (3/5), na direita o cartao com cabecalho e checklist.
// Bloco de uma tarefa so vira cartao simples com faixa lateral, como um compromisso.
function blocoDe(nome, itens) {
  const solo = itens.length === 1;
  const bloco = criar("section", "grupo" + (solo ? " solo" : ""));
  bloco.dataset.cor = corDe(nome);
  bloco.appendChild(criar("div", "grupo-conta"));
  const cartao = criar("div", "grupo-cartao");
  if (!solo) cartao.appendChild(criar("h3", "grupo-topo", nome));
  const lista = criar("div", "grupo-lista");
  for (const it of itens) lista.appendChild(linhaTarefa(it, solo ? nome : null));
  cartao.appendChild(lista);
  bloco.appendChild(cartao);
  return bloco;
}

// Lista sem blocos (pendencias, busca, cuidados): cada linha leva a cor do bloco de origem.
function listaSolta(itens, extra) {
  const caixa = criar("div", "lista-solta");
  for (const it of itens) {
    const linha = linhaTarefa(it, extra ? extra(it) : null);
    linha.dataset.cor = corDe(it.bloco);
    caixa.appendChild(linha);
  }
  return caixa;
}

function textoResumo(total, feitos, dia) {
  const futuro = dia > hojeISO();
  if (total === 0) return futuro ? "Nada marcado para esse dia." : "Nada pendente.";
  if (feitos === total) return "Tudo feito. 🎉";
  if (feitos) return "Faltam " + (total - feitos) + " de " + total + ".";
  return total + (total === 1 ? " tarefa" : " tarefas") + (futuro ? " marcadas." : " para fazer.");
}

let estavaCompleto = null;

// Recalcula contas e marcas sem redesenhar a lista (chamado a cada toque).
function atualizarResumo() {
  const doDia = ultimas.filter((t) => t.due_date === diaSel);
  const total = doDia.length;
  const feitos = doDia.filter((t) => t.feito).length;
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  const anel = $("#anel-valor");
  anel.style.strokeDasharray = VOLTA.toFixed(1);
  anel.style.strokeDashoffset = (VOLTA * (1 - pct / 100)).toFixed(1);
  $("#pct").textContent = pct + "%";
  $("#resumo-texto").textContent = textoResumo(total, feitos, diaSel);

  const completo = total > 0 && feitos === total;
  $(".dia-topo").classList.toggle("completo", completo);
  if (completo && estavaCompleto === false) { festejar(); vibrar([18, 60, 18]); }
  estavaCompleto = completo;

  for (const g of $("#grupos").querySelectorAll(".grupo")) {
    const linhas = g.querySelectorAll(".tarefa").length;
    const f = g.querySelectorAll(".tarefa.feita").length;
    g.querySelector(".grupo-conta").textContent = f + "/" + linhas;
    g.classList.toggle("grupo-completo", linhas > 0 && f === linhas);
  }

  const pend = ultimas.filter((t) => t.due_date < hojeISO() && !t.feito).length;
  const sino = $("#sino-conta");
  sino.hidden = pend === 0;
  sino.textContent = pend > 9 ? "9+" : String(pend);
  $("#sino").setAttribute("aria-label", pend ? "Pendências: " + pend : "Nada para trás");
  const pr = $("#pendentes-resumo");
  if (pr) pr.textContent = pend ? pend + (pend === 1 ? " tarefa pendente" : " tarefas pendentes") + " dos últimos " + DIAS_PARA_TRAS + " dias."
    : "Tudo em dia. Nada ficou para trás.";
  marcarSemana();
}

// Confete curto quando o dia fecha. Quem pediu menos movimento nao ve.
function festejar() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const anel = $(".anel");
  const cores = ["#2f6fd6", "#5b9cf0", "#2a9d7c", "#ffffff"];
  for (let i = 0; i < 18; i++) {
    const p = criar("i", "confete");
    const ang = (i / 18) * Math.PI * 2;
    const dist = 30 + Math.random() * 26;
    p.style.setProperty("--x", (Math.cos(ang) * dist).toFixed(1) + "px");
    p.style.setProperty("--y", (Math.sin(ang) * dist).toFixed(1) + "px");
    p.style.background = cores[i % cores.length];
    anel.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

/* ---------- frase do dia e humor ---------- */

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
      renderHumor();
      renderBem();
    });
    caixa.appendChild(b);
  }
}

/* ---------- faixa da semana ---------- */

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

// ponto azul: dia com tarefa; ponto verde: dia todo feito
function marcarSemana() {
  for (const b of document.querySelectorAll("#semana-dias .dia")) {
    const itens = ultimas.filter((t) => t.due_date === b.dataset.dia);
    b.classList.toggle("tem", itens.length > 0);
    b.classList.toggle("fechado", itens.length > 0 && itens.every((t) => t.feito));
    b.setAttribute("aria-selected", String(b.dataset.dia === diaSel));
  }
}

function escolherDia(d) {
  if (d < limiteAntes()) d = limiteAntes();
  if (d > limiteDepois()) d = limiteDepois();
  diaSel = d;
  semanaIni = segundaDe(d);
  renderSemana();
  renderDia();
}

function mudarSemana(n) {
  semanaIni = somaDias(semanaIni, 7 * n);
  // na semana nova, mostra o mesmo dia da semana (dentro do que o app carrega)
  escolherDia(somaDias(diaSel, 7 * n));
}

/* ---------- lista do dia ---------- */

function renderDia() {
  const hoje = hojeISO();
  const n = diasEntre(hoje, diaSel);
  $("#dia-titulo").textContent = n === 0 ? "Hoje" : n === 1 ? "Amanhã" : n === -1 ? "Ontem"
    : diaSemana(diaSel) + ", " + bonita(diaSel);

  const alvo = $("#grupos");
  alvo.replaceChildren();
  const blocos = new Map();
  for (const t of ultimas.filter((x) => x.due_date === diaSel)) {
    const b = t.bloco || "Sem bloco";
    if (!blocos.has(b)) blocos.set(b, []);
    blocos.get(b).push(t);
  }
  const nomes = [...blocos.keys()].sort((a, b) => {
    const ia = ORDEM.indexOf(a), ib = ORDEM.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  for (const nome of nomes) {
    const itens = blocos.get(nome).slice().sort((a, b) => a.feito - b.feito);
    alvo.appendChild(blocoDe(nome, itens));
  }
  if (!nomes.length) {
    const vazio = criar("div", "vazio");
    vazio.appendChild(criar("p", null, diaSel > hoje ? "Nada marcado para esse dia." : "Nada na lista desse dia."));
    alvo.appendChild(vazio);
  }
  estavaCompleto = null;   // trocar de dia nao festeja; so a marcacao feita agora
  atualizarResumo();
}

/* ---------- agenda ---------- */

function renderAgenda() {
  const hoje = hojeISO();
  const futuras = ultimas.filter((t) => t.due_date > hoje).sort((a, b) => a.due_date.localeCompare(b.due_date));

  // contagem da avaliacao presencial (se estiver na lista)
  const prova = ultimas.filter((t) => t.due_date >= hoje).find((t) => /avalia[çc][ãa]o presencial/i.test(t.titulo));
  const cartaoAdp = $("#cartao-adp");
  if (prova) {
    const falta = diasEntre(hoje, prova.due_date);
    cartaoAdp.hidden = false;
    $("#adp-dias").textContent = falta <= 0 ? "hoje" : String(falta);
    $("#adp-unidade").textContent = falta <= 0 ? "" : (falta === 1 ? "dia" : "dias");
    $("#adp-dias").parentElement.classList.toggle("so-texto", falta <= 0);
    $("#adp-titulo").textContent = prova.titulo;
    $("#adp-detalhe").textContent = diaSemana(prova.due_date) + ", " + bonita(prova.due_date);
  } else {
    cartaoAdp.hidden = true;
  }

  const lt = $("#linha-tempo");
  lt.replaceChildren();
  const porDia = new Map();
  for (const p of futuras) {
    if (!porDia.has(p.due_date)) porDia.set(p.due_date, []);
    porDia.get(p.due_date).push(p);
  }
  $("#proximos-vazio").hidden = porDia.size > 0;
  for (const [dia, itens] of porDia) {
    const falta = diasEntre(hoje, dia);
    const li = criar("li");
    const q = criar("div", "quando" + (falta === 1 ? " agora" : ""));
    q.appendChild(criar("strong", null, String(deISO(dia).getDate())));
    q.appendChild(criar("span", null, diaSemana(dia).slice(0, 3)));
    li.appendChild(q);
    const corpo = criar("div", "dia-corpo");
    corpo.appendChild(criar("p", "dia-falta", quandoFalta(falta) + " · " + bonita(dia)));
    const lista = criar("ul", "lista-dia");
    for (const it of itens) lista.appendChild(criar("li", it.feito ? "feito" : null, it.titulo));
    corpo.appendChild(lista);
    li.appendChild(corpo);
    li.addEventListener("click", () => { escolherDia(dia); irPara("hoje"); });
    lt.appendChild(li);
  }
}

/* ---------- pendencias ---------- */

function renderPendentes() {
  const hoje = hojeISO();
  const atrasadas = ultimas.filter((t) => t.due_date < hoje && !t.feito)
    .sort((a, b) => b.due_date.localeCompare(a.due_date));
  const alvo = $("#pendentes");
  alvo.replaceChildren();
  if (atrasadas.length) {
    alvo.appendChild(listaSolta(atrasadas,
      (t) => quandoFalta(diasEntre(hoje, t.due_date)) + " · " + (t.bloco || "sem bloco")));
  }
  atualizarResumo();
}

/* ---------- bem-estar ---------- */

function renderBem() {
  const hoje = hojeISO();
  const hs = humores();
  const sem = $("#humor-semana");
  sem.replaceChildren();
  const barras = $("#barras");
  barras.replaceChildren();
  const dias = [];
  for (let k = 6; k >= 0; k--) dias.push(somaDias(hoje, -k));
  const maior = Math.max(1, ...dias.map((d) => ultimas.filter((t) => t.due_date === d).length));
  for (const d of dias) {
    const achado = HUMORES.find((x) => x[1] === hs[d]);
    const c = criar("div");
    c.title = achado ? achado[1] : "sem registro";
    c.appendChild(criar("b", null, achado ? achado[0] : "·"));
    c.appendChild(criar("small", null, d === hoje ? "hoje" : diaSemana(d).slice(0, 3)));
    sem.appendChild(c);

    const itens = ultimas.filter((t) => t.due_date === d);
    const feitos = itens.filter((t) => t.feito).length;
    const b = criar("div", "barra-dia" + (itens.length && feitos === itens.length ? " cheio" : ""));
    b.appendChild(criar("span", null, itens.length ? feitos + "/" + itens.length : ""));
    const i = criar("i");
    i.style.height = Math.round((feitos / maior) * 80) + "px";
    b.appendChild(i);
    b.appendChild(criar("small", null, d === hoje ? "hoje" : diaSemana(d).slice(0, 3)));
    barras.appendChild(b);
  }

  const cuidados = ultimas.filter((t) => t.due_date === hoje && t.bloco === BLOCO_CUIDADOS);
  const alvo = $("#cuidados");
  alvo.replaceChildren();
  if (cuidados.length) alvo.appendChild(listaSolta(cuidados));
  else alvo.appendChild(criar("p", "secundario", "Nenhum cuidado pessoal na lista de hoje."));
}

/* ---------- busca ---------- */

function renderBusca() {
  const q = semAcento($("#busca").value.trim());
  const alvo = $("#busca-resultado");
  alvo.replaceChildren();
  if (!q) { alvo.appendChild(criar("p", "secundario", "Busca no que o app carregou: os últimos 7 dias e os próximos 30.")); return; }
  const hoje = hojeISO();
  const achadas = ultimas.filter((t) => semAcento(t.titulo + " " + t.bloco).includes(q))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  if (!achadas.length) { alvo.appendChild(criar("p", "secundario", "Nada encontrado.")); return; }
  const partes = [["Para trás", achadas.filter((t) => t.due_date < hoje)],
    ["Hoje", achadas.filter((t) => t.due_date === hoje)],
    ["Próximos dias", achadas.filter((t) => t.due_date > hoje)]];
  for (const [rotulo, itens] of partes) {
    if (!itens.length) continue;
    alvo.appendChild(criar("p", "grupo-rotulo", rotulo));
    alvo.appendChild(listaSolta(itens, (t) => (t.due_date === hoje ? "hoje" : diaSemana(t.due_date) + ", " + bonita(t.due_date)) + " · " + (t.bloco || "sem bloco")));
  }
}

/* ---------- navegacao ---------- */

// quieto: redesenho depois de atualizar a lista, sem rolar a tela nem roubar o foco
function irPara(nome, quieto) {
  vista = nome;
  for (const v of document.querySelectorAll(".vista")) v.hidden = v.dataset.vista !== nome;
  for (const b of document.querySelectorAll("#barra [data-ir]")) {
    if (b.dataset.ir === nome) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  }
  if (nome === "agenda") renderAgenda();
  if (nome === "pendentes") renderPendentes();
  if (nome === "bem") renderBem();
  if (nome === "busca") { renderBusca(); if (!quieto) setTimeout(() => $("#busca").focus(), 50); }
  if (nome === "hoje") renderDia();
  if (!quieto) window.scrollTo({ top: 0 });
}

function abrirFolha(id) {
  fecharFolhas();
  $(id).hidden = false;
  const campo = $(id).querySelector("input");
  if (campo) setTimeout(() => campo.focus(), 120);
}
function fecharFolhas() { for (const f of document.querySelectorAll(".folha")) f.hidden = true; }

function render(dados) {
  ultimas = dados;
  const hoje = hojeISO();
  $("#saudacao").textContent = saudacao() + ", Isis";
  $("#data-hoje").textContent = diaSemana(hoje) + ", " + deISO(hoje).getDate() + " de " + MESES[deISO(hoje).getMonth()];
  if (diaSel < limiteAntes() || diaSel > limiteDepois()) diaSel = hoje;
  renderFrase(false);
  renderHumor();
  renderSemana();
  irPara(vista, true);
}

let carregadoEm = 0;
let carregando = null;

function mostrarEstado(txt, erro) {
  const el = $("#atualizado");
  el.textContent = txt;
  el.classList.toggle("erro", !!erro);
}

async function carregar() {
  if (!sessao()) { mostrarEntrada(); return; }
  if (carregando) return carregando;
  const btn = $("#atualizar");
  btn.classList.add("girando");
  btn.disabled = true;
  mostrarPainel();
  $("#menu-conta").textContent = sessao().email || "";
  carregando = (async () => {
    try {
      const hoje = iso(new Date());
      const linhas = await banco(
        "tasks?select=id,title,description,status,due_date" +
        "&due_date=gte." + somaDias(hoje, -DIAS_PARA_TRAS) +
        "&due_date=lte." + somaDias(hoje, DIAS_PARA_FRENTE) +
        "&order=due_date,title");
      const novas = (linhas || []).map((l) => ({
        id: l.id, titulo: l.title || "(sem título)", bloco: l.description || "",
        due_date: l.due_date, feito: l.status === "concluida",
      })).filter((t) => t.due_date);
      carregadoEm = Date.now();
      gravar(CHAVE_LISTA, { em: carregadoEm, itens: novas });
      render(novas);
      mostrarEstado("Atualizado às " + hora(new Date()));
    } catch (err) {
      if (!sessao()) return;
      const semRede = navigator.onLine === false || (err && err.name === "TypeError");
      const guardada = ler(CHAVE_LISTA);
      if (!ultimas.length && guardada && guardada.itens) render(guardada.itens);
      if (ultimas.length) {
        const desde = guardada && guardada.em ? " (lista de " + hora(new Date(guardada.em)) + ")" : "";
        mostrarEstado((semRede ? "Sem internet" : "Não consegui atualizar") + desde + ". Use o menu para tentar de novo.", true);
      } else {
        $("#resumo-texto").textContent = "Não consegui carregar agora.";
        mostrarEstado("Motivo: " + (semRede ? "sem internet" : (err && err.message) || "desconhecido") +
          ". Use o menu para tentar de novo.", true);
      }
    } finally {
      setTimeout(() => { btn.classList.remove("girando"); btn.disabled = false; }, 400);
      carregando = null;
    }
  })();
  return carregando;
}

// deslizar para o lado troca o dia (na lista) ou a semana (na faixa)
function aoDeslizar(el, fn) {
  let x0 = null, y0 = null;
  el.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 45) fn(dx < 0 ? 1 : -1);
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
    await carregar();
  } catch (e) {
    erro.textContent = navigator.onLine === false ? "Sem internet. Conecte e tente de novo." : e.message;
  } finally {
    bt.disabled = false;
    bt.textContent = "Entrar";
  }
});

$("#sair").addEventListener("click", sair);
$("#atualizar").addEventListener("click", () => { carregar().then(() => fecharFolhas()); });
$("#abrir-menu").addEventListener("click", () => abrirFolha("#folha-menu"));
$("#abrir-busca").addEventListener("click", () => irPara(vista === "busca" ? "hoje" : "busca"));
$("#busca").addEventListener("input", renderBusca);
$("#sino").addEventListener("click", () => irPara("pendentes"));
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
aoDeslizar($("#grupos"), (n) => escolherDia(somaDias(diaSel, n)));

function aplicarEsconder(sim) {
  $("#grupos").classList.toggle("esconde-feitas", sim);
  $("#esconder-feitas").setAttribute("aria-pressed", String(sim));
  $("#esconder-feitas").setAttribute("aria-label", sim ? "Mostrar as feitas" : "Esconder as feitas");
}
aplicarEsconder(!!ler(CHAVE_ESCONDER));
$("#esconder-feitas").addEventListener("click", () => {
  const sim = !ler(CHAVE_ESCONDER);
  gravar(CHAVE_ESCONDER, sim);
  aplicarEsconder(sim);
});

// "+": a lista nasce no Notion, entao a tarefa nova vai pelo agente pessoal (texto copiado e conversa aberta)
$("#abrir-nova").addEventListener("click", () => {
  $("#nova-dia").value = diaSel;
  abrirFolha("#folha-nova");
});
$("#nova-enviar").addEventListener("click", async () => {
  const texto = $("#nova-texto").value.trim();
  if (!texto) { $("#nova-texto").focus(); return; }
  const dia = $("#nova-dia").value || hojeISO();
  const msg = "Adicionar na Casa: " + texto + " (" + diaSemana(dia) + ", " + bonita(dia) + ")";
  try { await navigator.clipboard.writeText(msg); aviso("Copiado. Cole na conversa com o agente."); }
  catch (e) { aviso("Não consegui copiar. Escreva na conversa: " + msg, true); }
  $("#nova-texto").value = "";
  fecharFolhas();
  setTimeout(() => { location.href = "https://t.me/isisalencastro_bot"; }, 700);
});
for (const f of document.querySelectorAll(".folha")) {
  f.addEventListener("click", (ev) => { if (ev.target === f || ev.target.closest("[data-fechar]")) fecharFolhas(); });
}
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") fecharFolhas(); });

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !sessao()) return;
  // virou o dia ou passou um minuto: busca de novo
  const virouDia = carregadoEm && iso(new Date(carregadoEm)) !== iso(new Date());
  if (virouDia) { diaSel = hojeISO(); semanaIni = segundaDe(diaSel); fraseExtra = 0; }
  if (virouDia || Date.now() - carregadoEm > RECARREGA_APOS_MS) carregar();
});
window.addEventListener("online", () => { if (sessao()) carregar(); });

for (const el of document.querySelectorAll(".versao")) el.textContent = "versão " + VERSAO;

// Abre na hora com a ultima lista guardada; a busca no banco atualiza logo depois.
(function partida() {
  const guardada = sessao() && ler(CHAVE_LISTA);
  if (guardada && guardada.itens) {
    mostrarPainel();
    render(guardada.itens);
    mostrarEstado("Lista de " + hora(new Date(guardada.em)) + ", atualizando…");
  }
  carregar();
})();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js?v=" + VERSAO).catch(() => {});
}

window.__versao = VERSAO;
