// Dados proprios do app: blocos da rotina, compromissos do dia e tarefas por dia.
// Guarda primeiro no aparelho (abre na hora e funciona sem internet) e sincroniza com a tabela "painel_rotina"
// do Supabase (SQL em supabase/painel_rotina.sql): uma linha por conta, com tudo num JSON.
// Na sincronia as duas versoes se juntam item a item e vale a mudanca mais nova de cada item (campo "em"),
// entao marcar uma tarefa no celular nao some porque outro aparelho mexeu em outra coisa.
// Apagar deixa o item marcado como apagado (para o apagar chegar aos outros aparelhos) e ele sai depois de 30 dias.
// Carregado depois do app.js: usa ler, gravar, apagar, banco, sessao, somaDias e hojeISO de la.

const CHAVE_DADOS = "painel.dados.v1:";       // + e-mail da conta
const CHAVE_ROTINA_ANTIGA = "painel.rotina.v1:";
const LISTAS = ["blocos", "compromissos", "tarefas"];
const GUARDA_DIAS = 60;                       // compromisso e tarefa mais velhos que isso saem
const GUARDA_APAGADO_DIAS = 30;

let dados = { blocos: [], compromissos: [], tarefas: [], sujo: false };
let modoDados = "?";            // "nuvem", "local" (sem tabela) ou "?"
let sincronizandoDados = null;
let sincronizarDadosT = null;
const aoMudarDados = [];        // quem redesenha quando os dados mudam

function chaveDados() { const s = sessao(); return CHAVE_DADOS + ((s && s.email) || "").toLowerCase(); }

function vazio() { return { blocos: [], compromissos: [], tarefas: [], sujo: false }; }

function carregarDadosLocais() {
  const s = sessao();
  const email = ((s && s.email) || "").toLowerCase();
  const g = ler(chaveDados());
  dados = vazio();
  if (g && g.dados) Object.assign(dados, g.dados);
  else {
    // primeira abertura desde a versao so com rotina: traz o que estava la
    const velha = ler(CHAVE_ROTINA_ANTIGA + email);
    if (velha && velha.rotina) {
      const em = velha.rotina.atualizada || Date.now();
      for (const k of ["blocos", "compromissos"]) {
        dados[k] = (velha.rotina[k] || []).map((x) => Object.assign({ em }, x));
      }
      dados.sujo = true;
    }
  }
  modoDados = (g && g.modo === "nuvem") ? "nuvem" : "?";   // "local" e reavaliado a cada abertura
}

function gravarDados() {
  gravar(chaveDados(), { modo: modoDados, dados });
  apagar(CHAVE_ROTINA_ANTIGA + ((sessao() && sessao().email) || "").toLowerCase());
}

const vivos = (lista) => lista.filter((x) => !x.apagado);

function podar(d) {
  const corte = somaDias(hojeISO(), -GUARDA_DIAS);
  const corteApagado = Date.now() - GUARDA_APAGADO_DIAS * 86400000;
  d.compromissos = d.compromissos.filter((c) => c.data >= corte);
  d.tarefas = d.tarefas.filter((t) => t.data >= corte);
  for (const k of LISTAS) d[k] = d[k].filter((x) => !x.apagado || (x.em || 0) > corteApagado);
}

function avisarMudanca() { for (const fn of aoMudarDados) { try { fn(); } catch (e) { console.error(e); } } }

// Toda mudanca passa por aqui: marca o item com a hora, grava no aparelho, redesenha e agenda a subida.
function mudouDados(...itens) {
  const agora = Date.now();
  for (const it of itens) if (it) it.em = agora;
  podar(dados);
  dados.sujo = true;
  gravarDados();
  avisarMudanca();
  agendarSincroniaDados();
}

function apagarItem(item) { item.apagado = true; mudouDados(item); }
function desfazerApagar(item) { item.apagado = false; mudouDados(item); }

/* ------------------------------ sincronia ------------------------------ */

function mesclar(local, remoto) {
  const r = { blocos: [], compromissos: [], tarefas: [] };
  for (const k of LISTAS) {
    const porId = new Map();
    for (const x of (remoto && Array.isArray(remoto[k]) ? remoto[k] : [])) porId.set(x.id, x);
    for (const x of local[k]) {
      const outro = porId.get(x.id);
      if (!outro || (x.em || 0) > (outro.em || 0)) porId.set(x.id, x);
    }
    r[k] = [...porId.values()];
  }
  podar(r);
  return r;
}

const assinatura = (d) => JSON.stringify(LISTAS.map((k) => (d[k] || []).slice().sort((a, b) => (a.id < b.id ? -1 : 1))));

function agendarSincroniaDados(ms) {
  if (modoDados === "local") return;
  clearTimeout(sincronizarDadosT);
  sincronizarDadosT = setTimeout(sincronizarDados, ms === undefined ? 1200 : ms);
}

async function sincronizarDados() {
  if (!sessao() || modoDados === "local") return;
  if (sincronizandoDados) return sincronizandoDados;
  sincronizandoDados = (async () => {
    let mudouAlgo = false;
    try {
      const linhas = await banco("painel_rotina?select=data");
      modoDados = "nuvem";
      const remoto = (linhas && linhas[0] && linhas[0].data) || null;
      const antes = assinatura(dados);
      const versaoLocal = JSON.stringify(dados);
      const junto = mesclar(dados, remoto);
      mudouAlgo = assinatura(junto) !== antes;
      if (!remoto || assinatura(junto) !== assinatura(mesclar(vazio(), remoto))) {
        await banco("painel_rotina?on_conflict=user_id", {
          metodo: "POST",
          corpo: { data: junto, updated_at: new Date().toISOString() },
          cabecalhos: { Prefer: "resolution=merge-duplicates,return=minimal" },
        });
      }
      // se mudou algo na tela enquanto subia, junta de novo na proxima volta
      if (JSON.stringify(dados) === versaoLocal) { Object.assign(dados, junto); dados.sujo = false; }
      else { dados = Object.assign(mesclar(dados, junto), { sujo: true }); agendarSincroniaDados(); }
    } catch (e) {
      if (e && e.status === 404) modoDados = "local";   // tabela ainda nao criada
    } finally {
      gravarDados();
      sincronizandoDados = null;
      if (mudouAlgo) avisarMudanca();
      const m = $("#dados-modo");
      if (m) m.textContent = modoDados === "local" ? "Só neste aparelho: a tabela painel_rotina ainda não existe no banco." : "";
    }
  })();
  return sincronizandoDados;
}

function dadosAoEntrar() { carregarDadosLocais(); avisarMudanca(); sincronizarDados(); }

// Saida da conta: o que ja subiu sai do aparelho; o que so existe aqui fica guardado.
function limparDadosDaTela() {
  if (modoDados === "nuvem" && !dados.sujo) apagar(chaveDados());
  dados = vazio();
  modoDados = "?";
}

(function iniciarDados() {
  if (sessao()) carregarDadosLocais();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && sessao()) agendarSincroniaDados(200);
    if (document.visibilityState === "hidden" && sessao()) gravarDados();
  });
  window.addEventListener("online", () => { if (sessao()) agendarSincroniaDados(200); });
})();
