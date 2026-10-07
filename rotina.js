// Rotina do dia: blocos fixos com horario (por dia da semana) e compromissos de um dia so.
// O compromisso manda: o bloco que bate no mesmo horario encolhe naquele dia, ou sai se nao sobrar nada.
// Guarda primeiro no aparelho e sincroniza com a tabela "painel_rotina" do Supabase quando ela existe
// (SQL em supabase/painel_rotina.sql). Sem a tabela, a rotina fica so neste aparelho.
// Carregado depois do app.js e do notas.js: usa $, criar, ler, gravar, banco, sessao, aviso, vibrar,
// iso, deISO, somaDias, diaSemana, bonita, hojeISO, diaSel, vista, abrirFolha, fecharFolhas e novoId.

const CHAVE_ROTINA = "painel.rotina.v1:";   // + e-mail da conta
const SOBRA_MINIMA = 15;                    // pedaco de bloco menor que isso nao aparece
const GUARDA_COMPROMISSO_DIAS = 60;         // compromisso mais velho que isso sai do aparelho e do banco
const CORES_BLOCO = ["azul", "verde", "violeta", "ambar", "rosa", "laranja"];
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];   // a semana na tela comeca na segunda

let rotina = { blocos: [], compromissos: [], atualizada: 0, sujo: false };
let modoRotina = "?";       // "nuvem", "local" (sem tabela) ou "?"
let sincronizandoRotina = null;
let blocoEditado = null;    // bloco aberto na folha (null = novo)
let compEditado = null;     // compromisso aberto na folha (null = novo)

function chaveRotina() { const s = sessao(); return CHAVE_ROTINA + ((s && s.email) || "").toLowerCase(); }
function carregarRotinaLocal() {
  const g = ler(chaveRotina());
  rotina = { blocos: [], compromissos: [], atualizada: 0, sujo: false };
  if (g && g.rotina) Object.assign(rotina, g.rotina);
  modoRotina = (g && g.modo === "nuvem") ? "nuvem" : "?";   // "local" e reavaliado a cada abertura
}
function gravarRotina() { gravar(chaveRotina(), { modo: modoRotina, rotina }); }

function mudouRotina() {
  const corte = somaDias(hojeISO(), -GUARDA_COMPROMISSO_DIAS);
  rotina.compromissos = rotina.compromissos.filter((c) => c.data >= corte);
  rotina.atualizada = Date.now();
  rotina.sujo = true;
  gravarRotina();
  renderRotina();
  if (typeof marcarSemana === "function") marcarSemana();
  agendarSincroniaRotina();
}

/* ------------------------------ conta do dia ------------------------------ */

const min = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; };
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
// bloco que vira a noite (22:30 a 06:30) conta ate a meia-noite no dia dele
const fimEfetivo = (ini, fim) => (min(fim) > min(ini) ? min(fim) : 24 * 60);

function corDoBloco(titulo) {
  let h = 0;
  for (const c of semAcento(titulo)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES_BLOCO[h % CORES_BLOCO.length];
}

function compromissosDe(dia) { return rotina.compromissos.filter((c) => c.data === dia); }

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
  for (const b of rotina.blocos.filter((x) => x.dias.includes(semana))) {
    const ini = min(b.ini), fim = fimEfetivo(b.ini, b.fim);
    const pedacos = recortar(ini, fim, ocupados);
    if (!pedacos.length) { foraHoje.push(b); continue; }
    const mexeu = pedacos.length !== 1 || pedacos[0][0] !== ini || pedacos[0][1] !== fim;
    for (const [x, y] of pedacos) {
      itens.push({ tipo: "bloco", ref: b, titulo: b.titulo, ini: x, fim: y,
        rotuloFim: y === fim ? b.fim : hhmm(y), ajustado: mexeu });
    }
  }
  for (const c of comps) {
    itens.push({ tipo: "comp", ref: c, titulo: c.titulo, ini: min(c.ini), fim: fimEfetivo(c.ini, c.fim), rotuloFim: c.fim });
  }
  itens.sort((a, b) => a.ini - b.ini || (a.tipo === "comp" ? -1 : 1));
  return { itens, foraHoje, comps };
}

/* ------------------------------ tela do dia ------------------------------ */

function linhaAgenda(it, agoraMin) {
  const el = criar("button", "rot-item" + (it.tipo === "comp" ? " rot-comp" : ""));
  el.type = "button";
  el.dataset.cor = it.tipo === "comp" ? "coral" : corDoBloco(it.titulo);
  if (agoraMin !== null) {
    if (agoraMin >= it.fim) el.classList.add("passou");
    else if (agoraMin >= it.ini) el.classList.add("agora");
  }
  const h = criar("div", "rot-hora");
  h.appendChild(criar("strong", null, hhmm(it.ini)));
  h.appendChild(criar("small", null, it.rotuloFim));
  el.appendChild(h);
  const c = criar("div", "rot-cartao");
  c.appendChild(criar("span", "rot-titulo", it.titulo));
  let sub = "";
  if (it.tipo === "comp") sub = "compromisso";
  else if (it.ajustado) sub = "ajustado hoje (o normal é " + it.ref.ini + " às " + it.ref.fim + ")";
  if (el.classList.contains("agora")) sub = "agora" + (sub ? " · " + sub : "");
  if (sub) c.appendChild(criar("small", "rot-sub", sub));
  el.appendChild(c);
  el.setAttribute("aria-label", hhmm(it.ini) + " a " + it.rotuloFim + ", " + it.titulo + (sub ? ", " + sub : ""));
  el.addEventListener("click", () => {
    if (Date.now() - deslizouEm < 450) return;
    if (it.tipo === "comp") abrirCompromisso(it.ref); else abrirBloco(it.ref);
  });
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

  if (!rotina.blocos.length && !comps.length) {
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
    for (const it of itens) lista.appendChild(linhaAgenda(it, agoraMin));
    alvo.appendChild(lista);
  }
  if (foraHoje.length) {
    const p = criar("p", "rot-fora");
    p.textContent = "Fica de fora neste dia: " + foraHoje.map((b) => b.titulo + " (" + b.ini + " às " + b.fim + ")").join(", ") + ".";
    alvo.appendChild(p);
  }

  let resumo;
  if (!rotina.blocos.length && !comps.length) resumo = "Monte os blocos fixos do seu dia.";
  else if (agoraMin !== null) {
    const atual = itens.find((it) => agoraMin >= it.ini && agoraMin < it.fim);
    const proximo = itens.find((it) => it.ini > agoraMin);
    resumo = atual ? "Agora: " + atual.titulo + "." : proximo ? "A seguir, às " + hhmm(proximo.ini) + ": " + proximo.titulo + "." : "Fim da rotina de hoje.";
  } else {
    const n = itens.filter((it) => it.tipo === "bloco").length;
    resumo = n + (n === 1 ? " bloco da rotina." : " blocos da rotina.");
  }
  if (comps.length) resumo += " " + comps.length + (comps.length === 1 ? " compromisso" : " compromissos") + " no dia.";
  $("#resumo-texto").textContent = resumo;
  const modo = $("#rotina-modo");
  if (modo) modo.textContent = modoRotina === "local" ? "Só neste aparelho: a tabela da rotina ainda não existe no banco." : "";
}

/* ------------------------------ folha: compromisso ------------------------------ */

function abrirCompromisso(c, dia) {
  compEditado = c || null;
  $("#comp-titulo-folha").textContent = c ? "Compromisso" : "Novo compromisso";
  $("#comp-texto").value = c ? c.titulo : "";
  $("#comp-dia").value = c ? c.data : (dia || diaSel);
  $("#comp-ini").value = c ? c.ini : "";
  $("#comp-fim").value = c ? c.fim : "";
  $("#comp-apagar").hidden = !c;
  $("#comp-erro").textContent = "";
  abrirFolha("#folha-comp");
}

function salvarCompromisso() {
  const titulo = $("#comp-texto").value.trim();
  const data = $("#comp-dia").value;
  const ini = $("#comp-ini").value, fim = $("#comp-fim").value;
  const erro = $("#comp-erro");
  if (!titulo) { erro.textContent = "Diga o que é o compromisso."; $("#comp-texto").focus(); return; }
  if (!data || !ini || !fim) { erro.textContent = "Preencha o dia e os dois horários."; return; }
  if (min(fim) <= min(ini)) { erro.textContent = "O fim precisa ser depois do início."; return; }
  if (compEditado) Object.assign(compEditado, { titulo, data, ini, fim });
  else rotina.compromissos.push({ id: novoId(), titulo, data, ini, fim });
  fecharFolhas();
  vibrar(10);
  mudouRotina();
  if (data !== diaSel) aviso("Guardado para " + diaSemana(data) + ", " + bonita(data) + ".");
}

function apagarCompromisso() {
  const c = compEditado;
  if (!c) return;
  rotina.compromissos = rotina.compromissos.filter((x) => x !== c);
  fecharFolhas();
  mudouRotina();
  aviso("Compromisso apagado.", false, { rotulo: "Desfazer", fazer: () => { rotina.compromissos.push(c); mudouRotina(); } });
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
  const blocos = rotina.blocos.slice().sort((a, b) => min(a.ini) - min(b.ini));
  if (!blocos.length) alvo.appendChild(criar("p", "secundario", "Nenhum bloco ainda. Comece pelo que você faz quase todo dia: acordar, trabalho, almoço, dormir."));
  for (const b of blocos) {
    const linha = criar("button", "rot-linha");
    linha.type = "button";
    linha.dataset.cor = corDoBloco(b.titulo);
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
  $("#bloco-apagar").hidden = !b;
  $("#bloco-erro").textContent = "";
  abrirFolha("#folha-bloco");
}

function salvarBloco() {
  const titulo = $("#bloco-texto").value.trim();
  const ini = $("#bloco-ini").value, fim = $("#bloco-fim").value;
  const dias = diasMarcados();
  const erro = $("#bloco-erro");
  if (!titulo) { erro.textContent = "Dê um nome ao bloco."; $("#bloco-texto").focus(); return; }
  if (!ini || !fim) { erro.textContent = "Preencha os dois horários."; return; }
  if (ini === fim) { erro.textContent = "Início e fim não podem ser iguais."; return; }
  if (!dias.length) { erro.textContent = "Escolha pelo menos um dia."; return; }
  if (blocoEditado) Object.assign(blocoEditado, { titulo, ini, fim, dias });
  else rotina.blocos.push({ id: novoId(), titulo, ini, fim, dias });
  vibrar(10);
  mudouRotina();
  abrirRotina();
}

function apagarBloco() {
  const b = blocoEditado;
  if (!b) return;
  rotina.blocos = rotina.blocos.filter((x) => x !== b);
  mudouRotina();
  abrirRotina();
  aviso("Bloco apagado.", false, { rotulo: "Desfazer", fazer: () => { rotina.blocos.push(b); mudouRotina(); } });
}

/* ------------------------------ sincronia ------------------------------ */

let sincronizarRotinaT = null;
function agendarSincroniaRotina(ms) {
  if (modoRotina === "local") return;
  clearTimeout(sincronizarRotinaT);
  sincronizarRotinaT = setTimeout(sincronizarRotina, ms === undefined ? 1200 : ms);
}

async function sincronizarRotina() {
  if (!sessao() || modoRotina === "local") return;
  if (sincronizandoRotina) return sincronizandoRotina;
  sincronizandoRotina = (async () => {
    try {
      const linhas = await banco("painel_rotina?select=data,updated_at");
      modoRotina = "nuvem";
      const r = linhas && linhas[0];
      const quando = r ? Date.parse(r.updated_at) : 0;
      if (r && quando > rotina.atualizada) {
        // a versao do banco e mais nova (editada em outro aparelho): ela vale
        const d = r.data || {};
        rotina.blocos = Array.isArray(d.blocos) ? d.blocos : [];
        rotina.compromissos = Array.isArray(d.compromissos) ? d.compromissos : [];
        rotina.atualizada = quando;
        rotina.sujo = false;
      } else if (rotina.sujo) {
        const em = rotina.atualizada;
        await banco("painel_rotina?on_conflict=user_id", {
          metodo: "POST",
          corpo: { data: { blocos: rotina.blocos, compromissos: rotina.compromissos }, updated_at: new Date(em).toISOString() },
          cabecalhos: { Prefer: "resolution=merge-duplicates,return=minimal" },
        });
        if (rotina.atualizada === em) rotina.sujo = false;   // mudou enquanto subia: sobe de novo depois
        else agendarSincroniaRotina();
      }
    } catch (e) {
      if (e && e.status === 404) modoRotina = "local";   // tabela ainda nao criada
    } finally {
      gravarRotina();
      sincronizandoRotina = null;
      if (vista === "hoje") renderRotina();
      if (typeof marcarSemana === "function") marcarSemana();
    }
  })();
  return sincronizandoRotina;
}

/* ------------------------------ ligacoes ------------------------------ */

function rotinaAoEntrar() { carregarRotinaLocal(); renderRotina(); sincronizarRotina(); }
function limparRotinaDaTela() {
  if (!rotina.sujo) apagar(chaveRotina());   // o que so existe aqui fica guardado
  rotina = { blocos: [], compromissos: [], atualizada: 0, sujo: false };
  modoRotina = "?";
}

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
  $("#editar-rotina").addEventListener("click", abrirRotina);
  $("#rotina-novo-bloco").addEventListener("click", () => abrirBloco(null));
  $("#bloco-salvar").addEventListener("click", salvarBloco);
  $("#bloco-apagar").addEventListener("click", apagarBloco);
  $("#bloco-voltar").addEventListener("click", abrirRotina);
  $("#comp-salvar").addEventListener("click", salvarCompromisso);
  $("#comp-apagar").addEventListener("click", apagarCompromisso);

  if (sessao()) { carregarRotinaLocal(); renderRotina(); sincronizarRotina(); }

  // o destaque de "agora" anda sozinho com o relogio
  setInterval(() => { if (vista === "hoje" && diaSel === hojeISO() && !document.hidden) renderRotina(); }, 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && sessao()) { renderRotina(); sincronizarRotina(); }
  });
  window.addEventListener("online", () => { if (sessao()) sincronizarRotina(); });
})();
