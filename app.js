// Painel pessoal da Isis: le a lista do dia no banco e deixa marcar na tela.
// A lista nasce na pagina "Casa" do Notion; o status vive aqui, no banco.
const CFG = {
  url: "https://xpkycwxzvhtaylwferiu.supabase.co",
  chave: "sb_publishable_SDGO156OgN9m5HrqcnLeAQ_fcnYctqU",
};
const CHAVE_SESSAO = "painel.sessao.v1";
const R = 52;
const VOLTA = 2 * Math.PI * R;

// ordem em que os blocos aparecem na tela
const ORDEM = ["Diárias da casa", "Cuidados pessoais", "Semanais", "Mensais",
  "Vídeos da semana", "Estudos", "Conteúdo do dia"];

const $ = (s) => document.querySelector(s);
const criar = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html !== undefined) el.innerHTML = html;
  return el;
};

/* ------------------------------ sessao ------------------------------ */

function sessao() {
  try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null"); }
  catch (e) { return null; }
}
function guardarSessao(s) { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s)); }
function sair() { localStorage.removeItem(CHAVE_SESSAO); mostrarEntrada(); }

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
  const s = await r.json();
  guardarSessao({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expira_em: Date.now() + ((s.expires_in || 3600) - 60) * 1000,
    email: (s.user && s.user.email) || email,
  });
}

async function token() {
  const s = sessao();
  if (!s) return null;
  if (Date.now() < s.expira_em) return s.access_token;
  const r = await fetch(CFG.url + "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: { apikey: CFG.chave, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!r.ok) { sair(); return null; }
  const n = await r.json();
  guardarSessao({
    access_token: n.access_token,
    refresh_token: n.refresh_token,
    expira_em: Date.now() + ((n.expires_in || 3600) - 60) * 1000,
    email: s.email,
  });
  return n.access_token;
}

async function banco(caminho, opcoes) {
  const t = await token();
  if (!t) throw new Error("sem sessao");
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
  if (r.status === 401) { sair(); throw new Error("sessao expirada"); }
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
  box.classList.add("visivel");
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => {
    box.classList.remove("visivel");
    setTimeout(() => { box.hidden = true; }, 250);
  }, 2000);
}

function iso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function deISO(txt) { return new Date(txt + "T12:00:00"); }
function diasEntre(a, b) { return Math.round((deISO(b) - deISO(a)) / 86400000); }
function bonita(txt) {
  const d = deISO(txt);
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
}
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function diaSemana(txt) { return DIAS[deISO(txt).getDay()]; }

/* ------------------------------ tela ------------------------------ */

function mostrarEntrada() {
  $("#app").hidden = true;
  const t = $("#entrar");
  t.hidden = false;
  const s = sessao();
  $("#entrar-email").value = s ? s.email : "";
  setTimeout(() => $("#entrar-email").focus(), 100);
}

function mostrarPainel() {
  $("#entrar").hidden = true;
  $("#app").hidden = false;
}

function linhaTarefa(item, aoMarcar) {
  const el = criar("div", "tarefa" + (item.feito ? " feita" : ""));
  const marca = criar("button", "marca", "✓");
  marca.type = "button";
  marca.setAttribute("aria-label", item.feito ? "Desmarcar" : "Marcar como feito");
  el.appendChild(marca);
  const corpo = criar("div", "texto");
  corpo.appendChild(criar("span", null, item.titulo));
  el.appendChild(corpo);
  el.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (el.classList.contains("ocupada")) return;
    el.classList.add("ocupada");
    item.feito = !item.feito;
    el.classList.toggle("feita", item.feito);
    aoMarcar(item).catch(() => {
      item.feito = !item.feito;
      el.classList.toggle("feita", item.feito);
      aviso("Não consegui salvar. Tente de novo.", true);
    }).finally(() => el.classList.remove("ocupada"));
  });
  return el;
}

function render(dados) {
  const hojeISO = iso(new Date());
  $(".saudacao").textContent = saudacao();
  $("#data-hoje").textContent = diaSemana(hojeISO) + ", " + bonita(hojeISO);

  const deHoje = dados.filter((t) => t.due_date === hojeISO);
  const futuras = dados.filter((t) => t.due_date > hojeISO);

  // progresso
  const total = deHoje.length;
  const feitos = deHoje.filter((t) => t.feito).length;
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  const anel = $("#anel-valor");
  anel.style.strokeDasharray = VOLTA.toFixed(1);
  anel.style.strokeDashoffset = (VOLTA * (1 - pct / 100)).toFixed(1);
  $("#pct").textContent = pct + "%";
  $("#contagem").textContent = feitos + " de " + total;
  $("#resumo-texto").textContent = total === 0
    ? "Nada pendente para hoje."
    : (feitos === total ? "Tudo feito por hoje. 🎉"
      : (feitos ? "Faltam " + (total - feitos) + " para fechar o dia."
        : "Começando o dia: " + total + " tarefas."));

  // contagem da avaliacao presencial (se estiver na lista)
  const prova = futuras.concat(deHoje).find((t) => /avalia[çc][ãa]o presencial/i.test(t.titulo));
  const cartaoAdp = $("#cartao-adp");
  if (prova) {
    const falta = diasEntre(hojeISO, prova.due_date);
    cartaoAdp.hidden = false;
    $("#adp-dias").textContent = falta <= 0 ? "hoje" : (falta === 1 ? "1 dia" : falta + " dias");
    $("#adp-titulo").textContent = "Avaliação presencial";
    $("#adp-detalhe").textContent = prova.titulo;
  } else {
    cartaoAdp.hidden = true;
  }

  // grupos do dia
  const alvo = $("#grupos");
  alvo.innerHTML = "";
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
    const itens = blocos.get(nome);
    const bloco = criar("section", "grupo");
    const feitosG = itens.filter((i) => i.feito).length;
    const topo = criar("div", "grupo-topo");
    topo.appendChild(criar("h3", null, nome));
    topo.appendChild(criar("span", null, feitosG + " de " + itens.length));
    bloco.appendChild(topo);
    for (const it of itens) {
      bloco.appendChild(linhaTarefa(it, async (item) => {
        await banco("tasks?id=eq." + item.id, {
          metodo: "PATCH", corpo: { status: item.feito ? "concluida" : "pendente" },
          cabecalhos: { Prefer: "return=minimal" },
        });
        atualizarResumo();
      }));
    }
    alvo.appendChild(bloco);
  }
  if (!nomes.length) {
    alvo.appendChild(criar("div", "cartao", "<p>Nada carregado para hoje.</p>"));
  }

  // proximos dias
  const cp = $("#cartao-proximos");
  const lt = $("#linha-tempo");
  lt.innerHTML = "";
  if (futuras.length) {
    cp.hidden = false;
    for (const p of futuras) {
      const falta = diasEntre(hojeISO, p.due_date);
      const li = criar("li");
      const q = criar("div", "quando" + (falta === 0 ? " agora" : ""));
      q.appendChild(criar("strong", null, falta === 1 ? "amanhã" : "em " + falta + " dias"));
      q.appendChild(criar("span", null, bonita(p.due_date) + " " + diaSemana(p.due_date)));
      li.appendChild(q);
      li.appendChild(criar("div", "texto", p.titulo));
      lt.appendChild(li);
    }
  } else {
    cp.hidden = true;
  }
}

function atualizarResumo() {
  const deHoje = ultimas.filter((t) => t.due_date === iso(new Date()));
  const total = deHoje.length;
  const feitos = deHoje.filter((t) => t.feito).length;
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  $("#anel-valor").style.strokeDashoffset = (VOLTA * (1 - pct / 100)).toFixed(1);
  $("#pct").textContent = pct + "%";
  $("#contagem").textContent = feitos + " de " + total;
  $("#resumo-texto").textContent = total === 0
    ? "Nada pendente para hoje."
    : (feitos === total ? "Tudo feito por hoje. 🎉"
      : (feitos ? "Faltam " + (total - feitos) + " para fechar o dia."
        : "Começando o dia: " + total + " tarefas."));
  for (const s of document.querySelectorAll(".grupo")) {
    const linhas = s.querySelectorAll(".tarefa");
    const f = s.querySelectorAll(".tarefa.feita").length;
    const contador = s.querySelector(".grupo-topo span");
    if (contador) contador.textContent = f + " de " + linhas.length;
  }
}

let ultimas = [];

async function carregar() {
  if (!sessao()) { mostrarEntrada(); return; }
  const btn = $("#atualizar");
  btn.classList.add("girando");
  try {
    mostrarPainel();
    const hoje = new Date();
    const limite = iso(new Date(hoje.getTime() + 30 * 86400000));
    const linhas = await banco(
      "tasks?select=id,title,description,status,due_date&due_date=lte." + limite + "&order=due_date,title");
    ultimas = (linhas || []).map((l) => ({
      id: l.id, titulo: l.title, bloco: l.description || "",
      due_date: l.due_date, feito: l.status === "concluida",
    })).filter((t) => t.due_date);
    render(ultimas);
    $("#atualizado").textContent = "Atualizado às " +
      new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch (err) {
    if (sessao()) {
      $("#resumo-texto").innerHTML = '<span class="erro">Não consegui carregar agora.</span>';
      $("#atualizado").textContent = "Toque no ↻ para tentar de novo.";
    }
  } finally {
    setTimeout(() => btn.classList.remove("girando"), 400);
  }
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
    erro.textContent = e.message;
  } finally {
    bt.disabled = false;
    bt.textContent = "Entrar";
  }
});

$("#sair").addEventListener("click", sair);
$("#atualizar").addEventListener("click", carregar);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && sessao()) carregar();
});
carregar();
