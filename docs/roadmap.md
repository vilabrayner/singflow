# Roadmap incremental

Cada etapa exige autorização antes de sua implementação. Documentação representa o plano, não a conclusão dos incrementos.

## Piloto Café Tão

A inscrição assistida pelo anfitrião foi aprovada como fluxo principal, junto ao check-in autônomo. O [plano de MVP](mvp-cafe-tao.md) registra a meta de 11/11/2026 pela manhã e separa o detalhamento aprovado das demais propostas ainda em revisão. Nenhuma implementação é autorizada apenas pelo registro desse plano.

## Etapa 0 — Registro da arquitetura (concluída)

Escopo: README, arquitetura, decisões e este roadmap, preservando arquivos existentes.

Aceite: stack e organização registradas; propostas e questões abertas identificadas; nenhuma alteração no código ou configuração existente.

## Etapa 1 — Fundação técnica (implementada; configuração de licença validada pelo responsável)

Escopo proposto: conferir versões e licenças; configurar Modulith, Flyway e Security; criar base Angular/PrimeNG/Tailwind/PrimeIcons; revisar Compose com PostgreSQL fixado e variáveis de ambiente; preparar verificações e instruções reproduzíveis. Arquivos `.gitignore` e `.env.example` serão propostos nesta etapa. Não versionar segredos.

Aceite:

- Backend compila e seus módulos passam na verificação de arquitetura.
- Flyway inicializa um PostgreSQL vazio; Hibernate valida o esquema.
- Frontend compila e apresenta estrutura responsiva com identidade SingFlow.
- Configuração de desenvolvimento separada de produção, sem credenciais de exemplo de produção.
- README contém comandos efetivamente testados e limitações verificadas.

Revisão concluída: login funcional adiado para o primeiro fluxo; versões fixadas e testes locais aprovados. A configuração da licença foi validada pelo responsável após a revisão do carregamento por ambiente. Resultados e limitações em [Fundação técnica](foundation.md).

## Etapa 2 — Primeiro incremento funcional: acesso e inscrição assistida (aceito em serviços independentes e Docker)

Escopo entregue e aceito: acesso provisionado do anfitrião, criar/abrir/encerrar sessão, inscrição assistida com primeira música, busca, novos pedidos no mesmo cadastro, lista por check-in e saída com cancelamento dos pedidos pendentes e preservação do histórico.

O responsável informou teste completo com serviços independentes e Docker, incluindo persistência após reinício. A verificação backend com PostgreSQL retornou `BUILD SUCCESS`. Evidências e limites em [Aceite 001](acceptance/001-assisted-flow.md).

Check-in autônomo, retorno, fila sugerida e convocações não foram entregues nem aceitos nesta etapa. Hospedagem adiada por decisão do responsável.

## Incremento atual — fila sugerida e palco

A [revisão do próximo incremento](stage-review.md) reúne as propostas das etapas 2B e 3 para o piloto. As regras e o recorte foram aprovados, incluindo o desempate contra repetição imediata; a implementação foi autorizada e concluída, com testes aprovados e aceite manual confirmado nos dois modos, incluindo reinício. Registro em [Aceite 002](acceptance/002-stage-flow.md). Veja [Ensaio de fila e palco](stage-testing.md).

## Etapa 2B — Fila sugerida assistida (aceita em serviços independentes e Docker)

Escopo entregue: motor de sugestões para os participantes assistidos e pedidos em texto livre existentes, incluindo repetições com “música a escolher”. Catálogo base e pedidos autônomos permanecem para outro incremento. Aplicar a [ADR 004](decisions/004-participation-and-repeat-suggestions.md).

Aceite:

- Prioridade por apresentações concluídas, evitar repetição imediata entre empatados, depois existência de pedido elegível e check-in.
- Múltiplos pedidos são balanceados por pessoa.
- Sugestões sem pedidos não criam solicitações fictícias nem contam como apresentações.
- Somente elegíveis recebem sugestões; sugestão não confirma convocação.
- Interface informa a justificativa e permite revisão pelo anfitrião.

Decisões aprovadas em `stage-review.md`: uma posição por pessoa e uma convocação ativa, com reserva do pedido e contagem de conclusões. Aceite manual confirmado pelo responsável nos dois modos.

## Etapa 3 — Operação do palco e auditoria (aceita em serviços independentes e Docker)

Escopo proposto: confirmar convocação, concluir apresentação, tratar cancelamento/ausência e intervenções, recalcular sugestão e registrar auditoria.

Aceite:

- Convocação confirmada não muda com recálculo da sugestão.
- Conclusão repetida não duplica contagem.
- Duas confirmações concorrentes não produzem efeitos duplicados ou estados inválidos.
- Alteração e auditoria crítica são atômicas; intervenção registra motivo.
- Testes verificam retentativas, concorrência e isolamento por sessão.
- Recusa pausa sugestões sem falta; falta é confirmada pelo anfitrião.
- Primeira falta suspende até nova oportunidade após rodada; segunda falta consecutiva inativa e suspende pedidos. Conclusão zera faltas.
- Saída voluntária cancela pedidos pendentes, preserva convocações e sinaliza desistência quando necessário.
- Reativação por ausência tem confirmação do anfitrião, nova posição de chegada e preservação das apresentações.

Transições detalhadas e implementadas conforme revisão aprovada, com testes backend e interface aprovados. Reinício e operação real validados pelo responsável com serviços independentes e Docker.

## Próximo incremento em revisão — participante pelo celular

Recorte proposto: check-in sem conta por link/QR Code, envio e consulta de pedidos próprios, acompanhamento de convocação e saída, preservando o fluxo assistido. A [revisão do participante](participant-review.md) detalha decisões pendentes, credencial separada, duplicidade, privacidade e acesso por aparelho real. Nenhum código desse incremento foi autorizado.

## Etapa 4 — Catálogo híbrido e tempo real

Escopo proposto: sugestões, aprovação/rejeição e notificações WebSocket para os três perfis.

Aceite:

- Sugestão pendente não entra na fila elegível.
- Aprovação/rejeição tem ator e registro auditável.
- Eventos são enviados após commit e assinaturas respeitam autorização.
- Reconexão recupera o estado oficial por REST, inclusive após perda de eventos.

Antes de iniciar: definir responsáveis pela aprovação e escopo de compartilhamento do catálogo entre sessões.

## Etapa 5 — PWA, acessibilidade e publicação

Escopo proposto: instalação, cache seguro da interface, atualização do aplicativo, conexão instável e preparação de implantação.

Aceite:

- Aplicação instalável em ambiente HTTPS compatível.
- Desconexão é visível e não gera confirmação falsa de operações.
- Atualizações de versão e logout não expõem dados em cache a outro usuário.
- Fluxos principais funcionam em tela pequena e por teclado.
- Implantação, migrações, backup e recuperação possuem instruções verificadas.

A escolha do provedor e qualquer publicação serão revisadas separadamente. Commits e push não estão incluídos automaticamente nestas etapas.
