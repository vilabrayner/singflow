# Sessão no header do anfitrião — 13/11/2026

## Layout aprovado

Logo à esquerda, nome da sessão alinhado à direita antes do menu da conta, todos na mesma linha e sem aumentar a altura do header. Nome com largura flexível, reticências e title com texto completo; tamanho compacto com espaçamento normal entre letras. Header compartilhado das demais experiências preservado.

Card da sessão removido das abas Fila, Participantes, Histórico e Músicos. As abas começam diretamente pelo seu conteúdo dentro da ScrollArea existente. Telas de criação, início e rascunho mantêm seus cards.

## Menu comum

- Sessão atual: nome completo, status textual e ações Atualizar sessão e Encerrar sessão (quando disponível).
- Trocar sessão abre a lista das sessões abertas; histórico e rascunhos continuam acessíveis separadamente.
- Criar outra sessão e sair da conta preservados.
- Atualizar fecha o menu e mantém a aba. Encerrar fecha o menu e abre a confirmação original; cancelar restaura foco no acionador do header.
- Após encerramento continua a regra de selecionar outra sessão aberta ou mostrar Vamos começar.
- SpeedDial experimental preservado como componente compartilhado, sem uso no antigo card removido.

## Validação

Conferir nomes longos e header em 320/390px e desktop; trocar abas sem repetir o card; abrir status completo no menu; atualizar; alternar sessões abertas/histórico/rascunhos; cancelar e confirmar encerramento; fechar menu com Escape preservando rolagem e foco. Testes usam API simulada, sem mudanças de backend ou migration.

Build final aprovado. Na regressão de 156 cenários, 154 passaram e dois testes administrativos precisaram usar o novo botão Trocar sessão. Após essa atualização e o refinamento tipográfico, os 14 cenários relacionados passaram em desktop e celular, incluindo os dois administrativos e largura de 320px. Conferência visual mobile realizada.
