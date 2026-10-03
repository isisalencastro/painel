// Painel pessoal da Isis: le a lista do dia no banco e deixa marcar na tela.
// A lista nasce na pagina "Casa" do Notion; o status vive aqui, no banco.
const CFG = {
  url: "https://xpkycwxzvhtaylwferiu.supabase.co",
  chave: "sb_publishable_SDGO156OgN9m5HrqcnLeAQ_fcnYctqU",
};
const VERSAO = "202610030700";
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

/* ------------------------------ tela ------------------------------ */

function mostrarEntrada() {
  $("#app").hidden = true;
  const t = $("#entrar");
  t.hidden = false;
  const s = sessao();
  $("#entrar-email").value = s ? s.email : "";
  setTimeout(() => ($("#entrar-email").value ? $("#entrar-senha") : $("#entrar-email")).focus(), 100);
}

function mostrarPainel() {
  $("#entrar").hidden = true;
  $("#app").hidden = false;
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

function blocoDe(nome, itens, opcoes) {
  const o = opcoes || {};
  const bloco = criar(o.recolhivel ? "details" : "section", "grupo" + (o.classe ? " " + o.classe : ""));
  const topo = criar(o.recolhivel ? "summary" : "div", "grupo-topo");
  topo.appendChild(criar("h3", null, nome));
  topo.appendChild(criar("span", "grupo-conta"));
  bloco.appendChild(topo);
  for (const it of itens) bloco.appendChild(linhaTarefa(it, o.extra ? o.extra(it) : null));
  return bloco;
}

function textoResumo(total, feitos) {
  if (total === 0) return "Nada pendente para hoje.";
  if (feitos === total) return "Tudo feito por hoje. 🎉";
  if (feitos) return "Faltam " + (total - feitos) + " para fechar o dia.";
  return "Começando o dia: " + total + (total === 1 ? " tarefa." : " tarefas.");
}

let estavaCompleto = null;

function atualizarResumo() {
  const hojeISO = iso(new Date());
  const deHoje = ultimas.filter((t) => t.due_date === hojeISO);
  const total = deHoje.length;
  const feitos = deHoje.filter((t) => t.feito).length;
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  const anel = $("#anel-valor");
  anel.style.strokeDasharray = VOLTA.toFixed(1);
  anel.style.strokeDashoffset = (VOLTA * (1 - pct / 100)).toFixed(1);
  $("#pct").textContent = pct + "%";
  $("#contagem").textContent = feitos + " de " + total;
  $("#resumo-texto").textContent = textoResumo(total, feitos);

  const completo = total > 0 && feitos === total;
  $(".destaque").classList.toggle("completo", completo);
  if (completo && estavaCompleto === false) { festejar(); vibrar([18, 60, 18]); }
  estavaCompleto = completo;

  for (const g of document.querySelectorAll(".grupo")) {
    const linhas = g.querySelectorAll(".tarefa").length;
    const f = g.querySelectorAll(".tarefa.feita").length;
    const conta = g.querySelector(".grupo-conta");
    if (conta) conta.textContent = f + " de " + linhas;
    g.classList.toggle("grupo-completo", linhas > 0 && f === linhas);
  }
  const atras = document.querySelector(".atrasadas .grupo-conta");
  if (atras) {
    const pend = document.querySelectorAll(".atrasadas .tarefa:not(.feita)").length;
    atras.textContent = pend ? pend + (pend === 1 ? " pendente" : " pendentes") : "em dia";
  }
}

// Confete curto quando o dia fecha. Quem pediu menos movimento nao ve.
function festejar() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const anel = $(".anel");
  const cores = ["#4d92ea", "#39c07a", "#ffbd59", "#f4f5f7"];
  for (let i = 0; i < 18; i++) {
    const p = criar("i", "confete");
    const ang = (i / 18) * Math.PI * 2;
    const dist = 46 + Math.random() * 30;
    p.style.setProperty("--x", (Math.cos(ang) * dist).toFixed(1) + "px");
    p.style.setProperty("--y", (Math.sin(ang) * dist).toFixed(1) + "px");
    p.style.background = cores[i % cores.length];
    anel.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

function render(dados) {
  const hojeISO = iso(new Date());
  $("#saudacao").textContent = saudacao();
  $("#data-hoje").textContent = diaSemana(hojeISO) + ", " + bonita(hojeISO);

  const deHoje = dados.filter((t) => t.due_date === hojeISO);
  const futuras = dados.filter((t) => t.due_date > hojeISO)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const atrasadas = dados.filter((t) => t.due_date < hojeISO && !t.feito);

  // contagem da avaliacao presencial (se estiver na lista)
  const prova = futuras.concat(deHoje).find((t) => /avalia[çc][ãa]o presencial/i.test(t.titulo));
  const cartaoAdp = $("#cartao-adp");
  if (prova) {
    const falta = diasEntre(hojeISO, prova.due_date);
    cartaoAdp.hidden = false;
    $("#adp-dias").textContent = falta <= 0 ? "hoje" : (falta === 1 ? "1 dia" : falta + " dias");
    $("#adp-detalhe").textContent = prova.titulo + " · " + diaSemana(prova.due_date) + ", " + bonita(prova.due_date);
  } else {
    cartaoAdp.hidden = true;
  }

  // grupos do dia
  const alvo = $("#grupos");
  alvo.replaceChildren();
  const blocos = new Map();
  for (const t of deHoje) {
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
    const vazio = criar("div", "cartao vazio");
    vazio.appendChild(criar("p", null, "Nada na lista de hoje."));
    alvo.appendChild(vazio);
  }

  // o que ficou para tras: recolhido, para nao pesar no dia
  if (atrasadas.length) {
    atrasadas.sort((a, b) => b.due_date.localeCompare(a.due_date));
    alvo.appendChild(blocoDe("Ficou para trás", atrasadas, {
      recolhivel: true, classe: "atrasadas",
      extra: (t) => quandoFalta(diasEntre(hojeISO, t.due_date)) + " · " + (t.bloco || "sem bloco"),
    }));
  }

  // proximos dias, agrupados por data
  const cp = $("#cartao-proximos");
  const lt = $("#linha-tempo");
  lt.replaceChildren();
  const porDia = new Map();
  for (const p of futuras) {
    if (!porDia.has(p.due_date)) porDia.set(p.due_date, []);
    porDia.get(p.due_date).push(p);
  }
  cp.hidden = porDia.size === 0;
  for (const [dia, itens] of porDia) {
    const falta = diasEntre(hojeISO, dia);
    const li = criar("li");
    const q = criar("div", "quando" + (falta === 1 ? " agora" : ""));
    q.appendChild(criar("strong", null, quandoFalta(falta)));
    q.appendChild(criar("span", null, bonita(dia) + " " + diaSemana(dia)));
    li.appendChild(q);
    const lista = criar("ul", "texto lista-dia");
    for (const it of itens) lista.appendChild(criar("li", it.feito ? "feito" : null, it.titulo));
    li.appendChild(lista);
    lt.appendChild(li);
  }

  estavaCompleto = null;   // render nao festeja; so a marcacao feita agora
  atualizarResumo();
}

let ultimas = [];
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
  carregando = (async () => {
    try {
      const hoje = iso(new Date());
      const linhas = await banco(
        "tasks?select=id,title,description,status,due_date" +
        "&due_date=gte." + somaDias(hoje, -DIAS_PARA_TRAS) +
        "&due_date=lte." + somaDias(hoje, DIAS_PARA_FRENTE) +
        "&order=due_date,title");
      ultimas = (linhas || []).map((l) => ({
        id: l.id, titulo: l.title || "(sem título)", bloco: l.description || "",
        due_date: l.due_date, feito: l.status === "concluida",
      })).filter((t) => t.due_date);
      carregadoEm = Date.now();
      gravar(CHAVE_LISTA, { em: carregadoEm, itens: ultimas });
      render(ultimas);
      mostrarEstado("Atualizado às " + hora(new Date()));
    } catch (err) {
      if (!sessao()) return;
      const semRede = navigator.onLine === false || (err && err.name === "TypeError");
      const guardada = ler(CHAVE_LISTA);
      if (!ultimas.length && guardada && guardada.itens) {
        ultimas = guardada.itens;
        render(ultimas);
      }
      if (ultimas.length) {
        const desde = guardada && guardada.em ? " (lista de " + hora(new Date(guardada.em)) + ")" : "";
        mostrarEstado((semRede ? "Sem internet" : "Não consegui atualizar") + desde + ". Toque no ↻ para tentar de novo.", true);
      } else {
        $("#resumo-texto").textContent = "Não consegui carregar agora.";
        mostrarEstado("Motivo: " + (semRede ? "sem internet" : (err && err.message) || "desconhecido") +
          ". Toque no ↻ para tentar de novo.", true);
      }
    } finally {
      setTimeout(() => { btn.classList.remove("girando"); btn.disabled = false; }, 400);
      carregando = null;
    }
  })();
  return carregando;
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
$("#atualizar").addEventListener("click", carregar);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !sessao()) return;
  // virou o dia ou passou um minuto: busca de novo
  const virouDia = carregadoEm && iso(new Date(carregadoEm)) !== iso(new Date());
  if (virouDia || Date.now() - carregadoEm > RECARREGA_APOS_MS) carregar();
});
window.addEventListener("online", () => { if (sessao()) carregar(); });

for (const el of document.querySelectorAll(".versao")) el.textContent = "versão " + VERSAO;

// Abre na hora com a ultima lista guardada; a busca no banco atualiza logo depois.
(function partida() {
  const guardada = sessao() && ler(CHAVE_LISTA);
  if (guardada && guardada.itens) {
    ultimas = guardada.itens;
    mostrarPainel();
    render(ultimas);
    mostrarEstado("Lista de " + hora(new Date(guardada.em)) + ", atualizando…");
  }
  carregar();
})();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js?v=" + VERSAO).catch(() => {});
}

window.__versao = VERSAO;
