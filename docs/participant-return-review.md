# Revisão aprovada — saída e retorno do participante

Estado: regras e implementação autorizadas em 10/11/2026; evolução implementada, com validação automatizada aprovada. Aceite manual integrado pendente; veja o [roteiro](acceptance/004-participant-return.md).

Esta revisão substitui a exigência de revogar a credencial em toda saída voluntária da [revisão do participante](participant-review.md) e atualiza a [ADR 004](decisions/004-participation-and-repeat-suggestions.md). Pausas, faltas e inativação por ausência continuam com as regras já aprovadas.

## Comportamento aprovado

| Ação/situação | Resultado esperado |
| --- | --- |
| Sair da fila voluntariamente | Retirar da fila, cancelar pedidos não atendidos e resolver eventual convocação como desistência. Preservar histórico e apresentações concluídas |
| Acesso após saída voluntária | Manter credencial limitada a consultar dados próprios e solicitar retorno; não permitir novos pedidos comuns ou convocações enquanto estiver fora |
| Voltar a participar | Exigir sessão aberta, credencial válida e uma nova música. Reutilizar o mesmo participante e preservar apresentações concluídas |
| Prioridade no retorno | Atribuir nova ordem de chegada, mantendo a prioridade pelo número de apresentações concluídas. Não restaurar posição antiga |
| Pedidos anteriores | Pedidos cancelados permanecem cancelados; o retorno cria somente o novo pedido informado |
| Esquecer meu acesso neste aparelho | Remover o vínculo de acesso. Não apagar cadastro, histórico ou apresentações; sem vínculo válido, procurar o anfitrião para retornar ao cadastro conhecido |
| Retirada pelo anfitrião | Impedir reativação pelo próprio participante; retorno depende do anfitrião |
| Outro aparelho ou acesso expirado | Retorno pelo anfitrião, sem associar pessoas automaticamente por nome ou mesa |
| Sessão encerrada | Impedir retorno e novos pedidos; permitir leitura própria enquanto o acesso permanecer válido |

Manter a validade de 24 horas a partir da emissão, sem renovação silenciosa ao sair ou voltar. A saída voluntária deixa de significar revogação; esquecer o acesso e a retirada pelo anfitrião continuam exigindo controle de credencial. O acesso nunca concede permissões administrativas.

## Implementação autorizada

1. Backend: distinguir saída voluntária e retirada pelo anfitrião de forma persistente; ajustar permissões da credencial conforme o estado. Preservar o tratamento já existente de convocação, pedidos e histórico.
2. Retorno: operação atômica com identificador de retentativa, reutilizando participante, registrando nova chegada e criando uma única nova música. Validar a sessão e o direito de retornar dentro do mesmo bloqueio transacional usado pelo palco.
3. Frontend: separar as ações de sair, voltar com nova música e esquecer acesso; mostrar a situação fora da fila e orientar quando o retorno depender do anfitrião. Atualizar outras abas pela consulta periódica existente.
4. Auditoria e testes: identificar ator e motivo da saída/retorno; testar concorrência, limites de acesso e persistência. A migration V6 registra o motivo de saída da credencial e as operações de retorno, preservando V1–V5.
5. Validação: compilação e testes sem serviços pelo agente; verificação com PostgreSQL e ensaios com serviços independentes/Docker executados pelo responsável na IDE.

Credenciais revogadas pela versão anterior não devem ser recuperadas pelo nome ou reativadas silenciosamente. Para esses cadastros, o anfitrião continua sendo o caminho de retorno.

## Critérios de aceite da evolução

- Sair durante uma convocação resolve a desistência, cancela pedidos não atendidos e preserva histórico e contagens.
- Após saída voluntária, recarregar ou abrir outra aba no mesmo navegador permite consultar a própria situação e solicitar retorno com credencial válida.
- Enquanto estiver fora, não receber sugestões nem conseguir adicionar pedidos pelo fluxo comum.
- Retorno sem música, com acesso expirado ou com sessão encerrada é recusado sem alterar chegada ou criar pedido.
- Retorno válido reutiliza o cadastro, preserva apresentações e recebe nova chegada; pedidos cancelados não reaparecem.
- Retentativas e dois retornos concorrentes não duplicam pedido nem alteram a chegada duas vezes.
- Concorrência com retirada pelo anfitrião ou encerramento da sessão não permite retorno indevido.
- Retirada pelo anfitrião impede retorno autônomo, inclusive em outras abas com acesso antigo.
- Esquecer o acesso remove o vínculo sem apagar histórico ou afetar o login do anfitrião.
- Reinício do backend preserva a distinção entre saída voluntária e retirada pelo anfitrião.
- Testar no navegador local e via Docker; acesso por aparelho físico e AWS seguem fora desta autorização.

## Detalhes operacionais implementados

- Saída de uma participação ativa habilita retorno autônomo. Se a pessoa sair enquanto pausada, suspensa ou inativa, manter leitura própria, mas exigir liberação pelo anfitrião, preservando as regras de pausa/faltas. Retorno autônomo preserva a sequência de faltas existente.
- Esquecer o acesso é permitido fora da fila ou após encerramento da sessão. Durante participação ativa, sair primeiro para não deixar uma participação elegível sem controle pelo aparelho.
- Saída voluntária retorna o estado próprio atualizado sem apagar o cookie. Esquecimento é uma operação separada que revoga a credencial e apaga o cookie.
- Retorno e retirada/encerramento usam o mesmo bloqueio da sessão. O estado da sessão é consultado depois de obter o bloqueio; uma retirada ou encerramento já confirmado impede o retorno que estava aguardando.
- Retentativas de retorno reapresentam o identificador da operação. Repetir uma operação antiga depois de outra saída não pode reativar a pessoa novamente.
