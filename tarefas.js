// Tarefas por dia: a pessoa cria, marca, muda de dia e apaga no proprio app (os dados moram no dados.js).
// O que ficou sem fazer nos ultimos dias aparece em "Ficou para trás", com botao para trazer para hoje.

const DIAS_ATRAS = 14;          // pendencia mais velha que isso nao aparece mais no sino

let tarefaEditada = null;

const tarefasDo = (dia) => vivos(dados.tarefas).filter((t) => t.data === dia)
  .sort((a, b) => a.feito - b.feito || (a.ordem || 0) - (b.ordem || 0));

function pendentesAtras() {
  const hoje = hojeISO(), corte = somaDias(hoje, -DIAS_ATRAS);
  return vivos(dados.tarefas).filter((t) => !t.feito && t.data < hoje && t.data >= corte)
    .sort((a, b) => b.data.localeCompare(a.data) || (a.ordem || 0) - (b.ordem || 0));
}

function linhaTarefa(t, extra, acao) {
  const el = criar("div", "tarefa" + (t.feito ? " feita" : ""));
  const marca = criar("button", "marca");
  marca.type = "button";
  marca.setAttribute("aria-pressed", String(!!t.feito));
  marca.setAttribute("aria-label", (t.feito ? "Desmarcar: " : "Marcar como feita: ") + t.titulo);
  marca.appendChild(criar("span", "marca-check", "✓")).setAttribute("aria-hidden", "true");
  marca.addEventListener("click", () => {
    t.feito = !t.feito;
    if (t.feito) vibrar(12);
    mudouDados(t);
  });
  el.appendChild(marca);
  const corpo = criar("button", "texto");
  corpo.type = "button";
  corpo.appendChild(criar("span", null, t.titulo));
  if (extra) corpo.appendChild(criar("small", "tarefa-extra", extra));
  corpo.addEventListener("click", () => { if (Date.now() - deslizouEm > 450) abrirTarefa(t); });
  el.appendChild(corpo);
  if (acao) {
    const b = criar("button", "tarefa-acao", acao.rotulo);
    b.type = "button";
    b.addEventListener("click", acao.fazer);
    el.appendChild(b);
  }
  return el;
}

function renderTarefas() {
  const hoje = hojeISO();
  const n = diasEntre(hoje, diaSel);
  $("#tarefas-titulo").textContent = n === 0 ? "Hoje" : n === 1 ? "Amanhã" : n === -1 ? "Ontem"
    : diaSemana(diaSel) + ", " + bonita(diaSel);

  const doDia = tarefasDo(diaSel);
  const feitas = doDia.filter((t) => t.feito).length;
  const lista = $("#tarefas-lista");
  lista.replaceChildren();
  for (const t of doDia) lista.appendChild(linhaTarefa(t));
  $("#tarefas-resumo").textContent = !doDia.length ? "Nenhuma tarefa neste dia. Escreva abaixo para criar."
    : feitas === doDia.length ? "Tudo feito. 🎉" : feitas + " de " + doDia.length + " feitas.";
  $("#tarefas-barra").style.width = (doDia.length ? Math.round((feitas / doDia.length) * 100) : 0) + "%";
  $("#tarefas-barra").parentElement.hidden = !doDia.length;

  const atras = diaSel === hoje ? pendentesAtras() : [];
  const caixa = $("#tarefas-atras");
  caixa.hidden = !atras.length;
  const lt = $("#tarefas-atras-lista");
  lt.replaceChildren();
  for (const t of atras) {
    lt.appendChild(linhaTarefa(t, quandoFalta(diasEntre(hoje, t.data)),
      { rotulo: "Para hoje", fazer: () => { t.data = hoje; mudouDados(t); } }));
  }
}

// sino: quantas ficaram para tras
function atualizarSino() {
  const pend = pendentesAtras().length;
  const sino = $("#sino-conta");
  sino.hidden = pend === 0;
  sino.textContent = pend > 9 ? "9+" : String(pend);
  $("#sino").setAttribute("aria-label", pend ? "Ficou para trás: " + pend : "Nada para trás");
}

function criarTarefa(ev) {
  ev.preventDefault();
  const campo = $("#tarefa-nova");
  const titulo = campo.value.trim();
  if (!titulo) return;
  const t = { id: novoId(), titulo, data: diaSel, feito: false, ordem: Date.now() };
  dados.tarefas.push(t);
  campo.value = "";
  mudouDados(t);
  campo.focus();   // ja deixa pronto para a proxima
}

/* ---------- folha: editar tarefa ---------- */

function abrirTarefa(t) {
  tarefaEditada = t;
  $("#tarefa-texto").value = t.titulo;
  $("#tarefa-dia").value = t.data;
  abrirFolha("#folha-tarefa");
}

function salvarTarefa() {
  const t = tarefaEditada;
  if (!t) return;
  const titulo = $("#tarefa-texto").value.trim();
  if (!titulo) { $("#tarefa-texto").focus(); return; }
  const data = $("#tarefa-dia").value || t.data;
  const mudouDia = data !== t.data;
  Object.assign(t, { titulo, data });
  fecharFolhas();
  mudouDados(t);
  if (mudouDia) aviso("Passou para " + diaSemana(data) + ", " + bonita(data) + ".");
}

function moverTarefa(dias) {
  const t = tarefaEditada;
  if (!t) return;
  // tarefa atrasada vai para amanha de verdade; tarefa futura anda um dia
  $("#tarefa-dia").value = somaDias(t.data > hojeISO() ? t.data : hojeISO(), dias);
  salvarTarefa();
}

function apagarTarefa() {
  const t = tarefaEditada;
  if (!t) return;
  fecharFolhas();
  apagarItem(t);
  aviso("Tarefa apagada.", false, { rotulo: "Desfazer", fazer: () => desfazerApagar(t) });
}

(function iniciarTarefas() {
  $("#form-tarefa").addEventListener("submit", criarTarefa);
  $("#tarefa-salvar").addEventListener("click", salvarTarefa);
  $("#tarefa-amanha").addEventListener("click", () => moverTarefa(1));
  $("#tarefa-apagar").addEventListener("click", apagarTarefa);
  $("#trazer-todas").addEventListener("click", () => {
    const atras = pendentesAtras();
    for (const t of atras) t.data = hojeISO();
    mudouDados(...atras);
    aviso(atras.length === 1 ? "1 tarefa trazida para hoje." : atras.length + " tarefas trazidas para hoje.");
  });
  aoMudarDados.push(() => {
    if (vista === "tarefas") renderTarefas();
    atualizarSino();
    marcarSemana();
  });
})();
