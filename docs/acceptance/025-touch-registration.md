# Cadastro por toque

- Abrir Participantes > Criar participante no Safari do celular não deve abrir o teclado automaticamente.
- Digitar nome, tocar fora e tocar Primeira música deve focar a música, sem abrir Informações opcionais.
- Informações opcionais só deve expandir quando acionada explicitamente.
- Com teclado físico, ativar Criar participante por Enter deve focar Nome; Tab deve alcançar Primeira música.
- Cancelar ou mudar de aba deve restaurar a área de rolagem interna; header e dock continuam disponíveis.
- Manter rótulos e suporte a leitores de tela.

Os testes de navegador usam API simulada e viewport reduzida. Não reproduzem o teclado nativo do iOS; confirmar a sequência acima em aparelho físico. Não há alteração de backend ou migration.

Validação física: usuário confirmou em 13/11/2026 que a sequência no Safari do celular passou a focar o campo correto. Build de produção concluído; três cenários focados passaram no WebKit móvel emulado e cinco no Chromium (um cenário exclusivamente de toque ignorado no desktop).

## Retorno após salvar

Após salvar participante com música, abrir Fila automaticamente. Testar imediatamente Histórico, Participantes e Fila pelo dock, sem recarregar. A transição remove o foco do formulário, fecha o estado de cadastro e restaura a rolagem do documento e da área interna. Falhas continuam preservando os dados para tentar novamente.

Build concluído; 8 testes focados passaram no Chromium (2 exclusivos de toque ignorados no desktop) e 5 no WebKit móvel emulado. O bloqueio relatado após salvar não foi reproduzido na emulação; confirmar a transição no Safari físico.
