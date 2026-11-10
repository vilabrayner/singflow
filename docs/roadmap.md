# Roadmap incremental

Cada etapa exige autorização antes de sua implementação. Documentação representa o plano, não a conclusão dos incrementos.

## Prioridade de desenvolvimento — atualização de 10/11/2026

O responsável adiou a investigação de hospedagem/deploy para outro chat, mais tarde ou no dia seguinte. AWS, Aiven e orçamento permanecem em avaliação; não criar recursos nem continuar a migração neste trabalho.

Próxima sequência proposta:

1. Revisar a operação atual e desenhar os novos painéis do anfitrião e do participante (etapa 3B).
2. Aprovar o protótipo e autorizar a implementação; entregar anfitrião e participante em incrementos, com acessibilidade e regressão dos fluxos existentes.
3. Revisar e implementar a experiência do músico (etapa 3C).
4. Evoluir catálogo híbrido e tempo real (etapa 4), depois PWA e operação (etapa 5).

O responsável informou ter testado as últimas implementações antes de retomar o deploy. Esse relato não discrimina novamente os modos local e Docker para cada evolução; preservar essa distinção nos registros de validação.

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

## Incremento em validação — participante pelo celular

Recorte proposto: check-in sem conta por link/QR Code, envio e consulta de pedidos próprios, acompanhamento de convocação e saída, preservando o fluxo assistido. A [revisão do participante](participant-review.md) detalha decisões pendentes, credencial separada, duplicidade, privacidade e acesso por aparelho real. Recorte e parâmetros operacionais aprovados; implementação autorizada. O [roteiro de validação](acceptance/003-participant-flow.md) reúne os testes locais e Docker; aceite manual pendente.

### Evolução aprovada — sair e voltar

[Plano de retorno do participante](participant-return-review.md): saída voluntária mantém acesso limitado, retorno exige nova música e nova chegada, preservando apresentações e histórico. Retirada pelo anfitrião impede retorno autônomo. Regras e implementação autorizadas; evolução implementada e testes automatizados aprovados. [Ensaio local/Docker](acceptance/004-participant-return.md) pendente de aceite manual. Mantém o controle do anfitrião sobre pausas e faltas.

## Etapa 3B — Redesenho, acessibilidade e usabilidade dos painéis (dois incrementos do anfitrião implementados)

Etapa solicitada pelo responsável: redesenhar os painéis do anfitrião e do participante, preservando identidade SingFlow, stack e regras de negócio. O [plano de redesenho](panels-redesign.md) detalha os fluxos e critérios de acessibilidade, com referência WCAG 2.2 AA.

Entregas: diagnóstico das telas atuais, wireframes responsivos, protótipo para aprovação e, após autorização, implementação incremental e validação. No anfitrião, priorizar operação de palco e inscrição assistida; no participante, situação atual, nova música, chamada e saída/retorno.

Aceite: tarefas principais claras em desktop e celular, operação por teclado, foco e contraste verificados, rótulos e mensagens acessíveis, atualização sem interromper preenchimento e regressão das regras existentes. Avaliação automática acompanhada de verificação manual e evidências. O [desenho do anfitrião](host-redesign-approved.md), com 17 telas (00–16), foi aprovado em 10/11/2026. Os desenhos do participante e do músico também foram aprovados na conversa. O [incremento 01 do anfitrião](host-redesign-increment-01.md), autorizado em 10/11/2026, entrega base visual, login e sessões, com aceite manual confirmado. O [incremento 02](host-redesign-increment-02.md) entrega participantes e palco, com aceite manual pendente. Demais incrementos exigem autorização específica; a aprovação visual não altera regras de negócio.

Padrão transversal autorizado em 10/11/2026: [menus flutuantes e diálogos de confirmação](interaction-patterns.md) compartilhados entre os painéis.

## Etapa 3C — Experiência do músico (proposta a revisar)

Definir acesso e permissões do músico e a informação necessária durante o evento. Proposta inicial: sessão e convocação confirmada em destaque, música/artista e estado atualizado, sem expor ações administrativas do anfitrião. Definir com o responsável quais ações, se houver, pertencem a esse perfil antes de implementar.

Aceite a detalhar: informação consistente com a convocação oficial, privacidade e autorização por perfil, estados de conexão compreensíveis e interface acessível. Pode começar com consultas REST e receber WebSocket na etapa 4; não depende de aprovar todo o catálogo para revisar esse painel.

## Etapa 4 — Catálogo híbrido e tempo real

Escopo proposto: sugestões, aprovação/rejeição e notificações WebSocket para os três perfis.

Aceite:

- Sugestão pendente não entra na fila elegível.
- Aprovação/rejeição tem ator e registro auditável.
- Eventos são enviados após commit e assinaturas respeitam autorização.
- Reconexão recupera o estado oficial por REST, inclusive após perda de eventos.

Antes de iniciar: definir responsáveis pela aprovação e escopo de compartilhamento do catálogo entre sessões.

## Etapa 5 — PWA e preparação de publicação

Escopo proposto: instalação, cache seguro da interface, atualização do aplicativo, conexão instável e preparação de implantação. A acessibilidade começa na etapa 3B e continua como requisito transversal. A execução da hospedagem permanece adiada para outro chat conforme a decisão atual do responsável.

Aceite:

- Aplicação instalável em ambiente HTTPS compatível.
- Desconexão é visível e não gera confirmação falsa de operações.
- Atualizações de versão e logout não expõem dados em cache a outro usuário.
- Fluxos principais funcionam em tela pequena e por teclado.
- Implantação, migrações, backup e recuperação possuem instruções verificadas.

A escolha do provedor e qualquer publicação serão revisadas separadamente. Commits e push não estão incluídos automaticamente nestas etapas.
