# Intervenções do anfitrião na fila — 12/11/2026

## Comportamento aprovado

- Sugestões ativas usam o formato dos pedidos pessoais: faixa cinza de 44 px, número na altura do nome, grip centralizado e botões de ícone com área de toque de 44 px. Arraste ou teclas de seta na alça reorganizam pessoas. Durante a busca, arraste e teclas de reordenação ficam desabilitados para não aplicar índices de uma lista filtrada.
- Microfone em cada pessoa elegível. Apenas uma convocação ativa. Ao chamar fora da primeira posição, a modal avisa que a pessoa passará à frente das demais e a requisição exige autorização explícita `allowOutOfOrder`.
- Pausa substitui o antigo Pular na interface. Confirmação explica a retirada da fila ativa sem falta ou perda de pedidos. Pessoas PAUSED ficam acessíveis em Participações pausadas, com pi-play para confirmar retomada. Retomada mantém apresentações e chegada e segue a ordem automática, atrás das intervenções ainda vigentes.
- App continua sugerindo por apresentações e chegada conforme as regras existentes. Arraste é intervenção explícita, sem modificar chegada, contagem de apresentações ou ordem pessoal dos pedidos.

## Persistência e concorrência

V17 cria posições manuais por sessão e operações idempotentes de reordenação. As posições têm efeito nas próximas oportunidades do lote e novas chegadas entram depois dele pela classificação automática. Posição manual é consumida após concluir/registrar falta/desistência; cancelar convocação por engano preserva a intervenção enquanto não houver nova reordenação. Pausar ou sair remove a posição manual da pessoa. A convocação ativa não integra o arraste.

Reordenação exige snapshot completo da fila elegível e IDs únicos; sessão é bloqueada durante a operação. Snapshot obsoleto, IDs de outra sessão ou pessoa inelegível retornam conflito. Reenvio da mesma operação não aplica uma segunda intervenção. Convocação fora da vez valida elegibilidade, pedido esperado e ausência de outra convocação. Auditoria registra QUEUE_MANUALLY_REORDERED e CALL_PRIORITY_OVERRIDDEN, além dos eventos existentes de pausa/retomada. As mesmas sugestões são usadas para posição do participante e leitura do músico.

API antiga de Pular foi preservada para compatibilidade; a interface deixa de usá-la. Não editar migrations anteriores nem executar repair.

## Ensaio integrado

1. Reiniciar backend pela IDE para aplicar V17; atualizar frontend. Criar sessão de ensaio com três pessoas e pedidos.
2. Arrastar a última pessoa ao início; atualizar a página e conferir persistência. Adicionar uma nova pessoa e conferir que não apaga o lote ajustado.
3. Convocar/concluir cada pessoa ajustada; após a oportunidade, conferir retorno à classificação automática. Conferir também a posição no participante.
4. Convocar pessoa fora da primeira posição: aviso deve aparecer. Confirmar e verificar que não existe segunda convocação simultânea.
5. Pausar pessoa com pedidos, conferir remoção da fila ativa e botão Retomar na seção de pausados. Retomar e conferir pedidos e apresentações preservados.
6. Tentar reordenar em duas abas usando a mesma ordem anterior: segunda operação deve falhar e atualizar os dados. Durante filtro, alça não altera a ordem.
7. Conferir arraste com dedo, menus e operação por teclado no aparelho real.

## Verificação

Backend compila; 29 testes sem banco passaram. Responsável informou BUILD SUCCESS no verify completo, incluindo V17, lote manual/novas chegadas, idempotência, convocação fora da vez, pausa/retomada, permissões e concorrência. Testes de interface usam API simulada; ensaio com dedo e dados reais permanece a cargo do responsável.

Regressão final: build frontend aprovado e 132 cenários de interface passaram em desktop/mobile com API simulada. Mantidos os avisos preexistentes de orçamento inicial e dependências CommonJS.
