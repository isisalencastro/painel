// Painel pessoal da Isis: le dados.json e monta a tela.
const R = 52;
const VOLTA = 2 * Math.PI * R;

const $ = (s) => document.querySelector(s);
const criar = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html !== undefined) el.innerHTML = html;
  return el;
};

function saudacao() {
  const h = new Date().getHours();
  if (h < 5) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function aviso(txt) {
  const box = $("#aviso");
  box.textContent = txt;
  box.hidden = false;
  box.classList.add("visivel");
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => {
    box.classList.remove("visivel");
    setTimeout(() => { box.hidden = true; }, 250);
  }, 1800);
}

function copiar(texto) {
  const limpo = texto.replace(/^[\[\]x\s]+/, "").trim();
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(limpo).then(() => aviso("Copiado: " + limpo.slice(0, 34)));
  } else {
    const a = document.createElement("textarea");
    a.value = limpo;
    document.body.appendChild(a);
    a.select();
    try { document.execCommand("copy"); aviso("Copiado"); } catch (e) { aviso(limpo.slice(0, 40)); }
    document.body.removeChild(a);
  }
}

function cardTarefa(item) {
  const el = criar("div", "tarefa" + (item.feito ? " feita" : ""));
  el.appendChild(criar("div", "marca", "✓"));
  const corpo = criar("div", "texto");
  corpo.appendChild(criar("span", null, item.texto));
  if (item.filhos && item.filhos.length) {
    const filhos = criar("div", "filhos");
    for (const f of item.filhos) {
      const linha = criar("div", "filho" + (f.feito ? " feito" : ""));
      linha.appendChild(criar("div", "marca", "✓"));
      linha.appendChild(criar("span", null, f.texto));
      filhos.appendChild(linha);
    }
    corpo.appendChild(filhos);
  }
  el.appendChild(corpo);
  el.addEventListener("click", () => copiar(item.texto));
  return el;
}

function render(d) {
  $(".saudacao").textContent = saudacao();
  $("#data-hoje").textContent = d.hoje.dia_semana + ", " + d.hoje.data;

  // progresso
  const pct = d.resumo.percentual || 0;
  const anel = $("#anel-valor");
  anel.style.strokeDasharray = VOLTA.toFixed(1);
  anel.style.strokeDashoffset = (VOLTA * (1 - pct / 100)).toFixed(1);
  $("#pct").textContent = pct + "%";
  $("#contagem").textContent = d.resumo.feitos + " de " + d.resumo.total;
  $("#resumo-texto").textContent = d.resumo.total === 0
    ? "Nada pendente para hoje."
    : (d.resumo.feitos === d.resumo.total
      ? "Tudo feito por hoje. 🎉"
      : (d.resumo.feitos ? "Faltam " + (d.resumo.total - d.resumo.feitos) + " para fechar o dia." : "Começando o dia: " + d.resumo.total + " tarefas."));

  // ADP
  const cartaoAdp = $("#cartao-adp");
  if (d.adp) {
    cartaoAdp.hidden = false;
    const f = d.adp.faltam;
    $("#adp-dias").textContent = f === 0 ? "hoje" : (f === 1 ? "1 dia" : f + " dias");
    $("#adp-titulo").textContent = "ADP";
    $("#adp-detalhe").textContent = d.adp.texto;
  } else {
    cartaoAdp.hidden = true;
  }

  // grupos de tarefas
  const alvo = $("#grupos");
  alvo.innerHTML = "";
  for (const g of d.grupos) {
    const bloco = criar("section", "grupo");
    const feitos = g.itens.filter((i) => i.feito).length +
      g.itens.reduce((s, i) => s + (i.filhos || []).filter((f) => f.feito).length, 0);
    const totalG = g.itens.length + g.itens.reduce((s, i) => s + (i.filhos || []).length, 0);
    const topo = criar("div", "grupo-topo");
    topo.appendChild(criar("h3", null, g.icone + "  " + g.rotulo));
    topo.appendChild(criar("span", null, feitos + " de " + totalG));
    bloco.appendChild(topo);
    for (const it of g.itens) bloco.appendChild(cardTarefa(it));
    alvo.appendChild(bloco);
  }
  if (!d.grupos.length) {
    alvo.appendChild(criar("div", "cartao", "<p>Sem tarefas carregadas hoje.</p>"));
  }

  // estudos
  const ce = $("#cartao-estudos");
  const e = d.estudos || {};
  if (e.hoje || e.proximo) {
    ce.hidden = false;
    $("#estudos-titulo").textContent = e.hoje ? e.hoje.texto : "Sem bloco para hoje";
    $("#estudos-proximo").textContent = e.proximo ? "Depois: " + e.proximo.data + " " + e.proximo.texto : "";
  } else {
    ce.hidden = true;
  }

  // proximos
  const cp = $("#cartao-proximos");
  const lt = $("#linha-tempo");
  lt.innerHTML = "";
  if (d.proximos && d.proximos.length) {
    cp.hidden = false;
    for (const p of d.proximos) {
      const li = criar("li");
      const q = criar("div", "quando" + (p.faltam === 0 ? " agora" : ""));
      q.appendChild(criar("strong", null, p.faltam === 0 ? "hoje" : (p.faltam === 1 ? "amanhã" : "em " + p.faltam + " dias")));
      q.appendChild(criar("span", null, p.data + " " + p.dia_semana));
      li.appendChild(q);
      li.appendChild(criar("div", "texto", p.texto));
      lt.appendChild(li);
    }
  } else {
    cp.hidden = true;
  }

  $("#atualizado").textContent = "Atualizado em " + d.gerado_em;
}

async function carregar() {
  const btn = $("#atualizar");
  btn.classList.add("girando");
  try {
    const r = await fetch("dados.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    render(await r.json());
  } catch (err) {
    $("#resumo-texto").innerHTML = '<span class="erro">Não consegui carregar os dados agora.</span>';
    $("#atualizado").textContent = "Toque no ↻ para tentar de novo.";
  } finally {
    setTimeout(() => btn.classList.remove("girando"), 400);
  }
}

$("#atualizar").addEventListener("click", carregar);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") carregar();
});
carregar();
