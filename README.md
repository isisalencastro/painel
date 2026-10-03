# Meu app (painel pessoal)

App instalável (PWA) que mostra o dia da Isis: tarefas de hoje, contagem regressiva da ADP, o que ficou para trás
e os próximos dias. A lista nasce na página Casa do Notion pessoal e chega ao banco (Supabase, tabela `tasks`)
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
