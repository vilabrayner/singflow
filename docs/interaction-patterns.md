# Menus e confirmações do SingFlow

Padrão aprovado pelo responsável em 10/11/2026 para todo o sistema: “...” abre menu flutuante; confirmações são diálogos modais. Novas telas devem reutilizar os componentes compartilhados, mantendo a identidade SingFlow.

## Componentes

- `shared/components/options-menu.ts`: botão de opções com nome acessível, estado expandido e menu PrimeNG anexado ao corpo da página. O menu não expande nem desloca o cartão de origem. Itens recebem seus comandos e disponibilidade da funcionalidade.
- `shared/components/confirmation-dialog.ts`: diálogo PrimeNG com largura adaptada ao celular, título acessível, conteúdo rolável, contenção de foco com Angular CDK, foco inicial no título e retorno à origem ao fechar. Ações e regras permanecem no componente da funcionalidade.
- Erros aparecem dentro da confirmação em andamento. Escape cancela antes do envio; clique fora não confirma nem fecha. Durante envio, ações de confirmação/cancelamento e Escape ficam bloqueados para evitar resultado ambíguo ou envio duplicado.
- Quando a ação remove o botão de origem, a funcionalidade pode direcionar o foco ao próximo estado relevante. Menus usam um identificador explícito para devolver foco ao botão “...”.

## Aplicado

- Opções da sessão e outras ações da convocação como menus flutuantes.
- Diálogos para encerramento, convocação e resultado de palco; pausa, retomada, reativação e saída de participante; troca de link/QR Code; saída e esquecimento do acesso pelo participante.
- Cancelamento de pedido pelo participante também exige diálogo, com título da música e opção de manter o pedido.
- Na conclusão de oportunidade sem pedido, a música é preenchida no diálogo, sem precisar interagir com a página ao fundo.

Não foram alteradas regras de fila, endpoints, migrations, destinos de API ou serviços. O painel do músico ainda é uma estrutura inicial; suas futuras opções e confirmações devem seguir estes componentes.

## Aceite local

1. Abrir “...” na sessão; conferir menu flutuante e ausência de deslocamento da página.
2. Escolher encerrar; cancelar pelo botão ou Escape e conferir retorno do foco. Somente confirmar deve enviar o encerramento.
3. Convocar e concluir uma apresentação de ensaio, incluindo oportunidade sem música. Conferir falta/recusa/cancelamento em “Outras ações”.
4. Conferir pausa, retorno e saída na ficha do participante; conferir troca de link/QR Code.
5. No participante, conferir cancelar/manter um pedido, sair da fila e esquecer acesso.
6. Repetir em celular e com Tab/Shift+Tab. Durante envio, não deve ser possível fechar nem enviar novamente.

Testes automatizados usam API simulada e não substituem o aceite com os serviços locais. Não houve inicialização, reinício ou encerramento automático dos serviços.

## Validação de 10/11/2026

Passaram 40 testes de interface (20 cenários em desktop e celular), 5 de configuração, formatação e `git diff --check`. Incluem estabilidade do cartão ao abrir menu, foco no título, circulação de Tab no modal, Escape sem envio, retorno de foco, bloqueio de fechamento/envio duplicado durante operação e manutenção/cancelamento de pedido.

Build de produção aprovado após corrigir a assinatura do listener de Escape para `Event`. Pacote inicial de 563,38 kB: mantém aviso acima da meta de 500 kB e avisos CommonJS do QR Code; limites não foram ampliados.

Capturas da implementação:

- [Menu no celular](design/interaction-patterns/menu-flutuante-mobile.png) e [desktop](design/interaction-patterns/menu-flutuante-desktop.png).
- [Confirmação no celular](design/interaction-patterns/confirmacao-mobile.png) e [desktop](design/interaction-patterns/confirmacao-desktop.png).
