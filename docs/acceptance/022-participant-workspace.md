# Participante: padrão de workspace — 13/11/2026

## Entrega

- Header com marca, nome da sessão na mesma linha e menu cinza. Nome completo da pessoa/sessão, status, atualização e saída/esquecimento no menu, com ícones/alinhamento à esquerda e separador.
- Dock Pedidos, Catálogo e Histórico, usando o mesmo BottomNavigation do anfitrião. Catálogo usa fa-solid fa-music conforme autorização; pacote Font Awesome Free 7.3.1 instalado, CSS local carregado; posteriormente a migração global de ícones foi autorizada e PrimeIcons removido como dependência direta.
- ScrollArea interno com CdkScrollable, viewport dinâmico, altura real do dock e posição independente de cada aba. Conteúdo e estado do catálogo preservados ao alternar; busca carregada na primeira visita.
- Pedidos mantém status, próxima música/posição e lista reordenável, com ações em coluna como no anfitrião. Preview do arraste mantém o formato; bordas do viewport rolam automaticamente; teclado permanece suportado.
- Catálogo de tela permite adicionar sem modal, com busca incremental, deduplicação, prova de seleção externa e texto livre na própria lista. Favoritas e Mais cantadas são apenas estados preparados, sem simular personalização.
- Modais de inclusão/troca reaproveitam o catálogo moderno: busca/orientação no header branco, lista cinza em ScrollArea, rodapé fixo. Texto livre conserva o título digitado; confirmações e reenvios mantidos.
- Histórico com números nas participações resolvidas e faixa estática com ícone nos cancelamentos sem participação. Não são inventados horários ou uma ordem de execução para pedidos cancelados.
- Nova convocação leva a Pedidos, fechando modais de edição conflitantes; se navegar para outra aba durante uma chamada, o atalho de convocação permanece visível. Conclusão pelo anfitrião volta ao estado de fila mesmo sem aceitação prévia.
- Saída leva ao estado de retorno em Pedidos; esquecimento remove o acesso e o dock. Check-in, retorno assistido, pausa e expiração mantêm regras anteriores. Nenhuma alteração de backend/migration.

## Validação

Build aprovado e regressão completa com 172 testes de navegador em desktop/celular aprovados, usando API simulada. Cobertura nova: header em 320px, tabs/rolagem, catálogo direto e estado preservado, chamada chegando fora de Pedidos, conclusão sem aceitação, saída e foco, preview/rolagem de arraste e carregamento local do Font Awesome.

Aceite físico pelo responsável ainda necessário: teclado virtual nas buscas, Safari/Chrome, área segura inferior, QR/acesso real e ciclo completo de convocação. Não foram iniciados ou encerrados serviços pelo agente, nem realizado deploy.

Referência normativa para novas implementações: [Padrão atual de telas](../ui/screen-pattern.md). [Migração global de ícones](../ui/icon-migration-proposal.md) posteriormente aprovada e aplicada com quatro ajustes do responsável.
