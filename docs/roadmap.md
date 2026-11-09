# Roadmap incremental

Cada etapa exige autorização antes de sua implementação. Documentação representa o plano, não a conclusão dos incrementos.

## Etapa 0 — Registro da arquitetura (concluída)

Escopo: README, arquitetura, decisões e este roadmap, preservando arquivos existentes.

Aceite: stack e organização registradas; propostas e questões abertas identificadas; nenhuma alteração no código ou configuração existente.

## Etapa 1 — Fundação técnica (implementada; chave Community pendente)

Escopo proposto: conferir versões e licenças; configurar Modulith, Flyway e Security; criar base Angular/PrimeNG/Tailwind/PrimeIcons; revisar Compose com PostgreSQL fixado e variáveis de ambiente; preparar verificações e instruções reproduzíveis. Arquivos `.gitignore` e `.env.example` serão propostos nesta etapa. Não versionar segredos.

Aceite:

- Backend compila e seus módulos passam na verificação de arquitetura.
- Flyway inicializa um PostgreSQL vazio; Hibernate valida o esquema.
- Frontend compila e apresenta estrutura responsiva com identidade SingFlow.
- Configuração de desenvolvimento separada de produção, sem credenciais de exemplo de produção.
- README contém comandos efetivamente testados e limitações verificadas.

Revisão concluída: login funcional adiado para o primeiro fluxo; versões fixadas e testes locais aprovados. A emissão da chave PrimeUI Community fica com o responsável. Resultados e limitações em [Fundação técnica](foundation.md).

## Etapa 2 — Primeiro incremento funcional: sessão, check-in e fila

Escopo proposto: criar/abrir sessão, identificar participante, registrar check-in, cadastrar música base, registrar solicitação e consultar fila sugerida. Telas mínimas dos três perfis, com permissões no servidor.

Aceite:

- Dados persistem após reinício.
- Menos apresentações concluídas tem prioridade; empate respeita check-in com desempate determinístico.
- Múltiplos pedidos são balanceados segundo política previamente aprovada.
- Não há acesso a dados ou comandos de outra sessão sem permissão.
- Testes de domínio, API e PostgreSQL cobrem o fluxo; teste completo percorre a jornada principal.
- Dados de demonstração e instruções permitem reproduzir o fluxo localmente.

Antes de iniciar: resolver identidade/check-in, limites e ordem dos pedidos, elegibilidade e desempate técnico do check-in.

## Etapa 3 — Operação do palco e auditoria

Escopo proposto: confirmar convocação, concluir apresentação, tratar cancelamento/ausência e intervenções, recalcular sugestão e registrar auditoria.

Aceite:

- Convocação confirmada não muda com recálculo da sugestão.
- Conclusão repetida não duplica contagem.
- Duas confirmações concorrentes não produzem efeitos duplicados ou estados inválidos.
- Alteração e auditoria crítica são atômicas; intervenção registra motivo.
- Testes verificam retentativas, concorrência e isolamento por sessão.

Antes de iniciar: aprovar transições de estado, efeitos de ausências e cancelamentos e quantidade de convocações simultâneas.

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
