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

## Etapa 2 — Primeiro incremento funcional: acesso e inscrição assistida (implementado; aceite pendente)

Escopo proposto: autenticação do anfitrião, criar/abrir/encerrar sessão, entrada por link/QR Code, check-in, inscrição assistida pelo anfitrião e lista de participantes por chegada. Incluir “Sair da sessão”, encerrando a participação no servidor e limpando o vínculo no navegador, sem apagar histórico. O check-in deve informar a possibilidade de novas oportunidades mesmo sem pedido.

Aceite proposto:

- Dados persistem após reinício.
- Permissões impedem acesso administrativo a sessões de outro anfitrião.
- Check-in tem ordem definida pelo servidor e desempate determinístico.
- Inscrição assistida coleta nome e mesa opcional; primeira música é integrada ao módulo de pedidos, sem criar novo cadastro a cada escolha.
- O fluxo assistido não depende de celular do participante, não muda a justiça da fila e registra o anfitrião como ator.
- Saída encerra a participação e preserva histórico, sem afetar identidades de outros papéis.
- Sessão encerrada bloqueia novos check-ins.
- Testes de domínio, API e PostgreSQL cobrem o fluxo, com instruções reproduzíveis.

Entrega autorizada: acesso provisionado do anfitrião, sessão e participação assistida com primeira música, novos pedidos, busca e saída. Imagens Docker preparadas para teste local; hospedagem adiada por decisão do responsável. Check-in autônomo, retorno, fila e convocações não fazem parte desta entrega. Validação e roteiro em [Teste local](local-mvp-testing.md).

## Etapa 2B — Solicitações e fila sugerida (a revisar)

Escopo proposto: catálogo base, pedidos autônomos e assistidos no mesmo cadastro e motor de sugestões, incluindo repetições com “música a escolher” sem pedido existente. Aplicar a [ADR 004](decisions/004-participation-and-repeat-suggestions.md).

Aceite:

- Prioridade por apresentações concluídas, depois existência de pedido elegível e depois check-in.
- Múltiplos pedidos são balanceados por pessoa.
- Sugestões sem pedidos não criam solicitações fictícias nem contam como apresentações.
- Somente elegíveis recebem sugestões; sugestão não confirma convocação.
- Interface informa a justificativa e permite revisão pelo anfitrião.

Antes de implementar: definir projeção/reservas, proteção contra repetição imediata, limites e ordem de pedidos e representação das apresentações concluídas nesse incremento.

## Etapa 3 — Operação do palco e auditoria

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

Antes de iniciar: detalhar transições conforme ADR 004, retomada de pausas/pedidos, sequência de faltas na reativação, rodada e quantidade de convocações simultâneas.

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
