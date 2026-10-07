# Meu app (painel pessoal)

App instalável (PWA) da Isis com quatro abas: **Rotina** (o dia em blocos com horário), **Tarefas** (lista por
dia), **Notas** e **Bem-estar** (frase do dia, humor e as tarefas da semana). Tudo é criado e editado no próprio
app, com login no Supabase.

- Sem dado sensível: nada de dinheiro, documento ou senha. Sem login o banco não devolve nada.
- Abre na hora com o que está guardado no aparelho e funciona sem internet (service worker em `sw.js`); a
  sincronia com o banco acontece quando a internet volta.
- Modo claro e escuro seguem o tema do celular. Página marcada com `noindex`, fora de buscadores.
- Para instalar no iPhone: abrir no Safari, Compartilhar, "Adicionar à Tela de Início".

## Publicar uma versão nova

Trocar a versão em `VERSAO` (no `app.js`) e em todos os `?v=` do `index.html`, com o mesmo número. O service
worker usa a mesma versão para trocar o cache, então o celular não mistura tela nova com script velho. Arquivo
JS novo entra também na lista `CASCA` do `sw.js`.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `app.js` | casca: sessão, banco, navegação, faixa da semana, Bem-estar, busca, partida |
| `dados.js` | blocos, compromissos e tarefas: aparelho primeiro e sincronia com a tabela `painel_rotina` |
| `rotina.js` | tela da Rotina e folhas de bloco e compromisso |
| `tarefas.js` | tela das Tarefas e folha de editar tarefa |
| `notas.js` | Notas (tabela própria, `notes`) |

A ordem dos `<script>` importa: `app.js` primeiro; a tela abre no `DOMContentLoaded`, quando todos chegaram.

## Banco (Supabase)

Duas tabelas, criadas uma vez pelo SQL Editor:

- `painel_rotina` (`supabase/painel_rotina.sql`): uma linha por conta com blocos, compromissos e tarefas num
  JSON. O projeto já tem uma tabela `routines` do app antigo (alencastros), com outro formato: não mexer nela.
- `notes` (`supabase/notes.sql`).

Sem a tabela, o app avisa "Só neste aparelho" e sobe tudo quando ela aparece.

**Sincronia de `painel_rotina`:** cada item tem `em` (hora da última mudança). Na sincronia, a versão do aparelho e
a do banco se juntam item a item e vale a mais nova de cada item; marcar tarefa no celular não some porque outro
aparelho mexeu em outra coisa. Apagar marca `apagado: true` (para o apagar chegar aos outros aparelhos), e o
item sai de vez depois de 30 dias. Compromisso e tarefa com mais de 60 dias saem sozinhos.

A tabela `tasks` (lista que vinha da página Casa do Notion pelo agente pessoal) **não é mais lida** desde
07/10/2026: a Isis escolheu ter a lista própria no app.

## Rotina

- **Bloco** da rotina fixa: nome, início, fim, dias da semana e **cor escolhida** (10 tons). Lápis da Rotina ou
  "+" > "Bloco fixo da rotina". Bloco que vira a noite (22:30 a 06:30) conta até a meia-noite no dia dele.
- **Altura proporcional à duração:** 1 hora = 66px (`PX_POR_MIN` no `rotina.js`), mínimo de 46px para o texto
  caber. Tempo livre entre blocos aparece como "livre · 1h", limitado a 56px para não empurrar o dia.
- **Compromisso** ("+" > "Compromisso só neste dia"): nome, dia, horário e cor. Ele manda no horário: o bloco
  que bate nele encolhe naquele dia (médico das 14h às 16h faz o bloco das 14h às 18h virar 16h às 18h) e, se
  não sobrarem 15 minutos, sai do dia e aparece em "Fica de fora neste dia". A rotina fixa não muda.
- Hoje: o bloco da hora fica em destaque ("agora") e os que passaram ficam mais claros; o destaque anda sozinho.

## Tarefas

- Lista do dia aberto na faixa da semana. Escrever no campo "Nova tarefa" e Enter cria; o campo fica pronto
  para a próxima. Tocar na bolinha marca; tocar no texto abre a folha (mudar texto ou dia, adiar um dia, apagar
  com "Desfazer").
- **Ficou para trás** (só no dia de hoje): o que ficou sem fazer nos últimos 14 dias, com "Para hoje" e "Trazer
  todas para hoje". O sino do topo conta essas e abre as Tarefas.
- Na faixa da semana: na Rotina, ponto azul é dia com compromisso; nas Tarefas, azul é dia com tarefa e verde é
  dia todo feito.

## Bem-estar

Frase do dia (toque troca), humor do dia, humor da semana (só no aparelho, `localStorage`) e barras com as
tarefas feitas nos últimos sete dias.

## Notas (desde 05/10/2026)

No jeito das Notas do iPhone: lista por data com fixadas no topo, busca, editor de tela cheia, caixinhas de
checklist (botão na barra; tocar na caixinha marca; Enter abre outra), fixar, compartilhar e apagar com "Desfazer".
Código em `notas.js`.

- Guarda primeiro no aparelho, por conta (`painel.notas.v1:<e-mail>`), e sincroniza com a tabela `notes` do
  Supabase. **A tabela precisa ser criada uma vez** com `supabase/notes.sql` (SQL Editor do Supabase). Sem ela o
  app avisa "Só neste aparelho" e, quando a tabela aparece, sobe tudo na próxima abertura.
- Conflito: vale a versão mais nova (`updated_at`). Apagar marca `deleted = true`, para o apagar chegar aos outros
  aparelhos.
- Ao sair da conta, a cópia do aparelho é apagada se tudo já está no banco; se só existe aqui, fica guardada.

## Segurança

- Política de conteúdo (CSP) no `index.html`: só scripts do próprio site, conexão só com o Supabase do projeto.
  Trocar o projeto do Supabase exige trocar a URL ali e no `app.js`.
- Sair revoga a sessão no servidor (`/auth/v1/logout`), não só no aparelho.
- O painel não abre dentro de iframe de outro site.
- Texto do banco e das notas entra na tela sempre como texto, nunca como HTML.
