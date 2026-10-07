# Meu app (painel pessoal)

App instalável (PWA) que mostra o dia da Isis: a rotina do dia com horários (tela Hoje), contagem regressiva
da ADP, o que ficou para trás e os próximos dias. A lista nasce na página Casa do Notion pessoal e chega ao banco (Supabase, tabela `tasks`)
pelo agente pessoal; o painel lê de lá com login e grava a marcação de feito.

- Sem dado sensível: nada de dinheiro, documento ou senha. Sem login o banco não devolve nada.
- Abre na hora com a última lista guardada no aparelho e funciona sem internet (service worker em `sw.js`);
  a marcação precisa de internet e avisa quando não salvou.
- Modo claro e escuro seguem o tema do celular.
- Página marcada com `noindex`, fora de buscadores.
- Para instalar no iPhone: abrir no Safari, Compartilhar, "Adicionar à Tela de Início".

## Publicar uma versão nova

Trocar a versão em `VERSAO` (no `app.js`) e nos `?v=` do CSS e do JS em `index.html`, todos com o mesmo número.
O texto "versão" na tela é preenchido pelo JS. O service worker usa a mesma versão para trocar o cache, então o
celular não mistura tela nova com script velho.

## Sobre o `dados.json`

O painel lia um `dados.json` gerado pelo agente pessoal (`/opt/data/profiles/pessoal/scripts/painel_dados.py`).
Desde a versão com login ele lê do banco, e o arquivo saiu do repositório em 03/10/2026 porque deixava a rotina
pública. Se ele voltar a aparecer, é esse script publicando: desligar a rotina dele no agente pessoal.

## Estado em 03/10/2026

O app entrou em outra versao, com login e itens vindos do banco: ele nao le mais o
`dados.json` publico, que foi removido do repositorio de proposito. O gerador antigo
(`scripts/painel_dados.py`) fica guardado para uso manual, e a rotina `painel-atualizar` esta pausada.

## Bloco novo na lista

Cada bloco (Diárias da casa, Estudos etc.) tem posição em `ORDEM` e cor em `CORES`, os dois no `app.js`. Bloco
que não estiver lá aparece no fim e em cinza; para dar cor, acrescentar o nome em `CORES` com um dos tons
definidos no `style.css` (azul, rosa, verde, ambar, coral, violeta, laranja).

## Layout desde 05/10/2026

Azul e branco, fundo liso. Barra inferior com cinco botões: Hoje, Agenda, + (novo compromisso, ou nova nota na aba Notas), Bem-estar e Notas.
"Ficou para trás" abre pelo sino e pelo menu.

- **Hoje:** frase do dia (toque troca), humor do dia, faixa da semana (toque ou deslize troca o dia; ponto azul é dia
  com compromisso) e a rotina do dia (ver "Rotina" abaixo). As tarefas do Notion saíram desta tela em 07/10/2026;
  continuam na Agenda, no sino e na busca.
- **+:** abre "Novo compromisso" no dia que está na tela.
- **Humor** fica só no aparelho (`localStorage`), não no banco.
- **Busca** e o **sino** (pendências atrasadas) usam o que o app já carregou: 7 dias para trás e 30 para frente.

## Rotina (desde 07/10/2026)

Código em `rotina.js`. Dois tipos de item:

- **Bloco** da rotina fixa: nome, início, fim e dias da semana. Editado pelo lápis da tela Hoje. Bloco que vira a
  noite (22:30 a 06:30) conta até a meia-noite no dia dele.
- **Compromisso**: nome, dia, início e fim. Ele manda no horário: o bloco que bate nele encolhe naquele dia (médico
  das 14h às 16h faz o bloco das 14h às 18h virar 16h às 18h) e, se não sobrar pelo menos 15 minutos, sai do dia e
  aparece em "Fica de fora neste dia". A rotina fixa não muda.
- No dia de hoje, o bloco da hora fica em destaque ("agora") e os que passaram ficam apagados; o destaque anda sozinho.
- Guarda primeiro no aparelho (`painel.rotina.v1:<e-mail>`) e sincroniza com a tabela `routines` do Supabase (uma
  linha por conta, JSON inteiro, vale a versão mais nova). **A tabela precisa ser criada uma vez** com
  `supabase/routines.sql`. Sem ela, o app avisa "Só neste aparelho". Compromisso com mais de 60 dias sai sozinho.

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
