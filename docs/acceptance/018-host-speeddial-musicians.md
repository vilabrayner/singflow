# Anfitrião: atalhos, SpeedDial e músicos — 13/11/2026

## Escopo

- Cabeçalho da fila tem apenas atalho direto de QR Code; participantes são acessados pelo dock.
- Dock mantém Fila, Participantes e Histórico e acrescenta Músicos.
- Gestão de músicos aparece em card dentro da área de rolagem. Permanece seleção por nome, liberação, atualização e revogação confirmada. Sessões encerradas mostram aviso sem ações de gestão.
- Menu da sessão usa novo ActionsSpeedDial, sem substituir OptionsMenu/MenuPopover compartilhados. PrimeNG SpeedDial quarter-circle, direção down-left, máscara em toda a tela, template de ícone e descrição.
- Overlay independente evita recorte pela ScrollArea. Escape, botão fechar e toque na máscara fecham; foco volta ao acionador sem rolar a página. Confirmação de encerramento continua em diálogo.
- Template evita papéis menuitem duplicados e execução dupla pelo teclado. Caso de uma única ação tem posição explícita para contornar o cálculo circular com um único item.

## Puxar para atualizar — somente avaliação

Não foi encontrado componente dedicado no catálogo e nos módulos da versão instalada do PrimeNG 22.1.4. ScrollArea gerencia rolagem; SpeedDial e demais componentes não implementam esse gesto.

Proposta para etapa futura: gesto próprio apenas no topo do viewport interno, indicador “Puxe para atualizar”, transição para “Solte para atualizar” após limiar e “Atualizando…” durante uma única requisição. Atualizar dados, sem recarregar o documento. Ignorar gesto iniciado em controle de formulário, modal ou arraste da fila; manter botão Atualizar como alternativa acessível. Exige teste físico em Safari/Chrome/Brave para conflito com gesto nativo e teclado.

Referência: https://primeng.dev/speeddial

## Ensaio

1. Fila com participantes: QR Code abre diretamente a modal; não há menu duplicando Participantes.
2. Músicos no dock: buscar pelo nome, liberar, cancelar/confirmar revogação e voltar à fila.
3. Abrir SpeedDial: duas ações legíveis, fundo escurecido, nenhuma ação cortada no celular.
4. Fechar por máscara, Escape e botão; conferir foco e posição da rolagem.
5. Encerrar sessão: confirmação original, tratamento de erro e sessão encerrada sem edição.
6. Conferir rascunho, fila vazia e sessão encerrada; nenhuma mudança de backend/migration.

## Validação

Build aprovado. Regressão completa com 146 testes aprovados em desktop e celular (API simulada). Após refinar o posicionamento da ação única, seis testes relacionados ao SpeedDial e à navegação passaram novamente. Conferência visual mobile realizada. Teste físico de toque permanece recomendado; gesto de atualização não implementado.

## Ajuste: SpeedDial linear adaptativo

Por solicitação, formato alterado para linear. Ao abrir, mede espaço livre entre cabeçalho, botão e dock, considerando viewport visual: prefere down; escolhe up se não couber abaixo e houver mais espaço acima. Lista tem limite de altura e rolagem em telas pequenas. Máscara, descrições e confirmações preservadas. Removida compensação específica do círculo de ação única.

Build aprovado e dez testes relacionados passaram em desktop/mobile, incluindo botão posicionado próximo ao rodapé para verificar abertura para cima e itens inteiros acima do acionador. Conferência visual mobile realizada.
