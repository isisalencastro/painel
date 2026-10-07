// Rotina do dia: blocos fixos com horario e cor (por dia da semana) e compromissos de um dia so.
// O compromisso manda: o bloco que bate no mesmo horario encolhe naquele dia, ou sai se nao sobrar nada.
// A altura de cada bloco na tela segue a duracao (PX_POR_MIN), com um minimo para o texto caber.
// Os dados moram no dados.js; aqui fica so a tela.

const SOBRA_MINIMA = 15;        // pedaco de bloco menor que isso nao aparece
const PX_POR_MIN = 1.1;         // 1 hora = 66px
const ALTURA_MIN = 46;
const LIVRE_MAX = 56;           // tempo livre entre blocos aparece, mas sem empurrar o dia para longe
const PALETA = ["azul", "verde", "violeta", "ambar", "rosa", "coral", "laranja", "turquesa", "vinho", "cinza"];
const NOMES_COR = { azul: "azul", verde: "verde", violeta: "violeta", ambar: "âmbar", rosa: "rosa", coral: "coral",
  laranja: "laranja", turquesa: "turquesa", vinho: "vinho", cinza: "cinza" };
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];   // a semana na tela comeca na segunda

let blocoEditado = null;    // bloco aberto na folha (null = novo)
let compEditado = null;     // compromisso aberto na folha (null = novo)

/* ------------------------------ conta do dia ------------------------------ */

const min = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; };
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
// bloco que vira a noite (22:30 a 06:30) conta ate a meia-noite no dia dele
const fimEfetivo = (ini, fim) => (min(fim) > min(ini) ? min(fim) : 24 * 60);
function duracao(m) {
  const h = Math.floor(m / 60), r = m % 60;
  return h ? h + "h" + (r ? String(r).padStart(2, "0") : "") : r + " min";
}

// cor que a pessoa escolheu; bloco antigo sem cor ganha uma fixa pelo nome
function corDoBloco(b) {
  if (b.cor && PALETA.includes(b.cor)) return b.cor;
  let h = 0;
  for (const c of semAcento(b.titulo)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % 8];
}

function compromissosDe(dia) { return vivos(dados.compromissos).filter((c) => c.data === dia); }

// Tira de [ini, fim) os intervalos ocupados e devolve o que sobra.
function recortar(ini, fim, ocupados) {
  let pedacos = [[ini, fim]];
  for (const [a, b] of ocupados) {
    const novos = [];
    for (const [x, y] of pedacos) {
      if (b <= x || a >= y) { novos.push([x, y]); continue; }
      if (a > x) novos.push([x, a]);
      if (b < y) novos.push([b, y]);
    }
    pedacos = novos;
  }
  return pedacos.filter(([x, y]) => y - x >= SOBRA_MINIMA);
}

// A agenda do dia: blocos da rotina recortados pelos compromissos, tudo em ordem de horario.
function agendaDo(dia) {
  const semana = deISO(dia).getDay();
  const comps = compromissosDe(dia);
  const ocupados = comps.map((c) => [min(c.ini), fimEfetivo(c.ini, c.fim)]);
  const itens = [];
  const foraHoje = [];
  for (const b of vivos(dados.blocos).filter((x) => x.dias.includes(semana))) {
    const ini = min(b.ini), fim = fimEfetivo(b.ini, b.fim);
    const pedacos = recortar(ini, fim, ocupados);
    if (!pedacos.length) { foraHoje.push(b); continue; }
    const mexeu = pedacos.length !== 1 || pedacos[0][0] !== ini || pedacos[0][1] !== fim;
    for (const [x, y] of pedacos) {
      itens.push({ tipo: "bloco", ref: b, titulo: b.titulo, cor: corDoBloco(b), ini: x, fim: y,
        rotuloFim: y === fim ? b.fim : hhmm(y), ajustado: mexeu });
    }
  }
  for (const c of comps) {
    itens.push({ tipo: "comp", ref: c, titulo: c.titulo, cor: c.cor || "coral",
      ini: min(c.ini), fim: fimEfetivo(c.ini, c.fim), rotuloFim: c.fim });
  }
  itens.sort((a, b) => a.ini - b.ini || (a.tipo === "comp" ? -1 : 1));
  return { itens, foraHoje, comps };
}

/* ------------------------------ tela do dia ------------------------------ */

function linhaAgenda(it, agoraMin) {
  const el = criar("button", "rot-item" + (it.tipo === "comp" ? " rot-comp" : ""));
  el.type = "button";
  el.dataset.cor = it.cor;
  el.style.height = Math.max(ALTURA_MIN, Math.round((it.fim - it.ini) * PX_POR_MIN)) + "px";
  if (agoraMin !== null) {
    if (agoraMin >= it.fim) el.classList.add("passou");
    else if (agoraMin >= it.ini) el.classList.add("agora");
  }
  el.appendChild(criar("span", "rot-hora", hhmm(it.ini)));
  const c = criar("span", "rot-cartao");
  c.appendChild(criar("span", "rot-titulo", it.titulo));
  let sub = hhmm(it.ini) + "–" + it.rotuloFim + " · " + duracao(it.fim - it.ini);
  if (it.tipo === "comp") sub += " · compromisso";
  else if (it.ajustado) sub += " · ajustado (o normal é " + it.ref.ini + "–" + it.ref.fim + ")";
  if (el.classList.contains("agora")) sub = "agora · " + sub;
  c.appendChild(criar("small", "rot-sub", sub));
  el.appendChild(c);
  el.setAttribute("aria-label", it.titulo + ", " + sub);
  el.addEventListener("click", () => {
    if (Date.now() - deslizouEm < 450) return;
    if (it.tipo === "comp") abrirCompromisso(it.ref); else abrirBloco(it.ref);
  });
  return el;
}

function espacoLivre(minutos) {
  const el = criar("div", "rot-livre");
  el.style.height = Math.min(LIVRE_MAX, Math.round(minutos * PX_POR_MIN)) + "px";
  if (minutos >= 30) el.appendChild(criar("span", null, "livre · " + duracao(minutos)));
  return el;
}

function renderRotina() {
  const alvo = $("#rotina-dia");
  if (!alvo) return;
  alvo.replaceChildren();
  const hoje = hojeISO();
  const { itens, foraHoje, comps } = agendaDo(diaSel);
  const agora = new Date();
  const agoraMin = diaSel === hoje ? agora.getHours() * 60 + agora.getMinutes() : null;
  const temBlocos = vivos(dados.blocos).length > 0;

  if (!temBlocos && !comps.length) {
    const v = criar("div", "vazio");
    v.appendChild(criar("p", null, "Sua rotina ainda está vazia."));
    const b = criar("button", "botao", "Montar minha rotina");
    b.type = "button";
    b.addEventListener("click", abrirRotina);
    v.appendChild(b);
    alvo.appendChild(v);
  } else if (!itens.length) {
    const v = criar("div", "vazio");
    v.appendChild(criar("p", null, "Nenhum bloco da rotina neste dia."));
    alvo.appendChild(v);
  } else {
    const lista = criar("div", "rot-lista");
    let fimAnterior = null;
    for (const it of itens) {
      if (fimAnterior !== null && it.ini > fimAnterior) lista.appendChild(espacoLivre(it.ini - fimAnterior));
      lista.appendChild(linhaAgenda(it, agoraMin));
      fimAnterior = Math.max(fimAnterior || 0, it.fim);
    }
    alvo.appendChild(lista);
  }
  if (foraHoje.length) {
    alvo.appendChild(criar("p", "rot-fora",
      "Fica de fora neste dia: " + foraHoje.map((b) => b.titulo + " (" + b.ini + "–" + b.fim + ")").join(", ") + "."));
  }

  let resumo;
  if (!temBlocos && !comps.length) resumo = "Monte os blocos fixos do seu dia.";
  else if (agoraMin !== null) {
    const atual = itens.find((it) => agoraMin >= it.ini && agoraMin < it.fim);
    const proximo = itens.find((it) => it.ini > agoraMin);
    resumo = atual ? "Agora: " + atual.titulo + "." : proximo ? "A seguir, às " + hhmm(proximo.ini) + ": " + proximo.titulo + "." : "Fim da rotina de hoje.";
  } else {
    const n = itens.filter((it) => it.tipo === "bloco").length;
    resumo = n + (n === 1 ? " bloco da rotina." : " blocos da rotina.");
  }
  if (comps.length) resumo += " " + comps.length + (comps.length === 1 ? " compromisso" : " compromissos") + " no dia.";
  $("#rotina-resumo").textContent = resumo;
}

/* ------------------------------ escolha de cor ------------------------------ */

function montarCores(caixa) {
  for (const cor of PALETA) {
    const b = criar("button", "cor-bolinha");
    b.type = "button";
    b.dataset.cor = cor;
    b.setAttribute("aria-label", NOMES_COR[cor]);
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => pintarCores(caixa, cor));
    caixa.appendChild(b);
  }
}
function pintarCores(caixa, cor) {
  for (const b of caixa.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.cor === cor));
}
const corEscolhida = (caixa) => { const b = caixa.querySelector("button[aria-pressed='true']"); return b ? b.dataset.cor : PALETA[0]; };
// cor para bloco novo: a primeira que ainda nao esta em uso
function corLivre() {
  const usadas = new Set(vivos(dados.blocos).map(corDoBloco));
  return PALETA.find((c) => !usadas.has(c)) || PALETA[0];
}

/* ------------------------------ folha: compromisso ------------------------------ */

function abrirCompromisso(c, dia) {
  compEditado = c || null;
  $("#comp-titulo-folha").textContent = c ? "Compromisso" : "Novo compromisso";
  $("#comp-texto").value = c ? c.titulo : "";
  $("#comp-dia").value = c ? c.data : (dia || diaSel);
  $("#comp-ini").value = c ? c.ini : "";
  $("#comp-fim").value = c ? c.fim : "";
  pintarCores($("#comp-cores"), c ? (c.cor || "coral") : "coral");
  $("#comp-apagar").hidden = !c;
  $("#comp-erro").textContent = "";
  abrirFolha("#folha-comp");
}

function salvarCompromisso() {
  const titulo = $("#comp-texto").value.trim();
  const data = $("#comp-dia").value;
  const ini = $("#comp-ini").value, fim = $("#comp-fim").value;
  const cor = corEscolhida($("#comp-cores"));
  const erro = $("#comp-erro");
  if (!titulo) { erro.textContent = "Diga o que é o compromisso."; $("#comp-texto").focus(); return; }
  if (!data || !ini || !fim) { erro.textContent = "Preencha o dia e os dois horários."; return; }
  if (min(fim) <= min(ini)) { erro.textContent = "O fim precisa ser depois do início."; return; }
  let c = compEditado;
  if (c) Object.assign(c, { titulo, data, ini, fim, cor });
  else { c = { id: novoId(), titulo, data, ini, fim, cor }; dados.compromissos.push(c); }
  fecharFolhas();
  vibrar(10);
  mudouDados(c);
  if (data !== diaSel) aviso("Guardado para " + diaSemana(data) + ", " + bonita(data) + ".");
}

function apagarCompromisso() {
  const c = compEditado;
  if (!c) return;
  fecharFolhas();
  apagarItem(c);
  aviso("Compromisso apagado.", false, { rotulo: "Desfazer", fazer: () => desfazerApagar(c) });
}

/* ------------------------------ folha: rotina fixa ------------------------------ */

function textoDias(dias) {
  const d = [...dias].sort((a, b) => ORDEM_DIAS.indexOf(a) - ORDEM_DIAS.indexOf(b));
  if (d.length === 7) return "todo dia";
  if (d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x))) return "seg a sex";
  if (d.length === 2 && d.includes(0) && d.includes(6)) return "fim de semana";
  return d.map((x) => DIAS_CURTOS[x]).join(", ");
}

function abrirRotina() {
  const alvo = $("#rotina-blocos");
  alvo.replaceChildren();
  const blocos = vivos(dados.blocos).sort((a, b) => min(a.ini) - min(b.ini));
  if (!blocos.length) alvo.appendChild(criar("p", "secundario", "Nenhum bloco ainda. Comece pelo que você faz quase todo dia: acordar, trabalho, almoço, dormir."));
  for (const b of blocos) {
    const linha = criar("button", "rot-linha");
    linha.type = "button";
    linha.dataset.cor = corDoBloco(b);
    linha.appendChild(criar("strong", null, b.ini + "–" + b.fim));
    linha.appendChild(criar("span", null, b.titulo));
    linha.appendChild(criar("small", null, textoDias(b.dias)));
    linha.addEventListener("click", () => abrirBloco(b));
    alvo.appendChild(linha);
  }
  abrirFolha("#folha-rotina");
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

function pintarDias(dias) {
  for (const b of document.querySelectorAll("#bloco-dias button")) {
    b.setAttribute("aria-pressed", String(dias.includes(Number(b.dataset.d))));
  }
}
const diasMarcados = () => [...document.querySelectorAll("#bloco-dias button[aria-pressed='true']")].map((b) => Number(b.dataset.d));

function abrirBloco(b) {
  blocoEditado = b || null;
  $("#bloco-titulo-folha").textContent = b ? "Bloco da rotina" : "Novo bloco";
  $("#bloco-texto").value = b ? b.titulo : "";
  $("#bloco-ini").value = b ? b.ini : "";
  $("#bloco-fim").value = b ? b.fim : "";
  pintarDias(b ? b.dias : [0, 1, 2, 3, 4, 5, 6]);
  pintarCores($("#bloco-cores"), b ? corDoBloco(b) : corLivre());
  $("#bloco-apagar").hidden = !b;
  $("#bloco-erro").textContent = "";
  abrirFolha("#folha-bloco");
}

function salvarBloco() {
  const titulo = $("#bloco-texto").value.trim();
  const ini = $("#bloco-ini").value, fim = $("#bloco-fim").value;
  const dias = diasMarcados();
  const cor = corEscolhida($("#bloco-cores"));
  const erro = $("#bloco-erro");
  if (!titulo) { erro.textContent = "Dê um nome ao bloco."; $("#bloco-texto").focus(); return; }
  if (!ini || !fim) { erro.textContent = "Preencha os dois horários."; return; }
  if (ini === fim) { erro.textContent = "Início e fim não podem ser iguais."; return; }
  if (!dias.length) { erro.textContent = "Escolha pelo menos um dia."; return; }
  let b = blocoEditado;
  if (b) Object.assign(b, { titulo, ini, fim, dias, cor });
  else { b = { id: novoId(), titulo, ini, fim, dias, cor }; dados.blocos.push(b); }
  vibrar(10);
  mudouDados(b);
  abrirRotina();
}

function apagarBloco() {
  const b = blocoEditado;
  if (!b) return;
  apagarItem(b);
  abrirRotina();
  aviso("Bloco apagado.", false, { rotulo: "Desfazer", fazer: () => { desfazerApagar(b); abrirRotina(); } });
}

/* ------------------------------ ligacoes ------------------------------ */

(function iniciarRotina() {
  const dias = $("#bloco-dias");
  for (const d of ORDEM_DIAS) {
    const b = criar("button", null, DIAS_CURTOS[d]);
    b.type = "button";
    b.dataset.d = String(d);
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")));
    dias.appendChild(b);
  }
  montarCores($("#bloco-cores"));
  montarCores($("#comp-cores"));
  $("#editar-rotina").addEventListener("click", abrirRotina);
  $("#rotina-novo-bloco").addEventListener("click", () => abrirBloco(null));
  $("#bloco-salvar").addEventListener("click", salvarBloco);
  $("#bloco-apagar").addEventListener("click", apagarBloco);
  $("#bloco-voltar").addEventListener("click", abrirRotina);
  $("#comp-salvar").addEventListener("click", salvarCompromisso);
  $("#comp-apagar").addEventListener("click", apagarCompromisso);
  $("#mais-comp").addEventListener("click", () => abrirCompromisso(null, diaSel));
  $("#mais-bloco").addEventListener("click", () => abrirBloco(null));
  aoMudarDados.push(() => { if (vista === "hoje") renderRotina(); });

  // o destaque de "agora" anda sozinho com o relogio
  setInterval(() => { if (vista === "hoje" && diaSel === hojeISO() && !document.hidden) renderRotina(); }, 60 * 1000);
})();
