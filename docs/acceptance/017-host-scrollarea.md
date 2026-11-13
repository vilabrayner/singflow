# ScrollArea no anfitrião — 13/11/2026

Implementação autorizada após avaliação do PrimeNG 22.1.4. Usa ScrollArea, não o ScrollPanel descontinuado. Nenhuma dependência nova, mudança de backend ou migration.

## Comportamento

- Logo/header e dock inferior permanecem fixos. Conforme ajuste solicitado durante a implementação, o card da sessão fica dentro da área rolável, junto com o conteúdo da aba.
- Sessões abertas/encerradas usam um viewport PrimeNG ScrollArea. A página não rola; somente o conteúdo central. Login, criação de sessão e rascunho mantêm o fluxo existente.
- Cada aba salva sua posição e a recupera na troca. A posição zera ao selecionar outra sessão ou sair da conta. Atualizações da mesma sessão não reiniciam a rolagem.
- Dock informa sua altura real por ResizeObserver; layout calcula a altura restante com unidade dinâmica do viewport. A área segura inferior do dispositivo é respeitada sem restaurar o padding comum que o responsável retirou do dock.
- Viewport registrado como CdkScrollable permite rolagem automática ao arrastar uma pessoa até a borda. Filtro, convocação fora da vez, pausa/retomada, cadastro e detalhes permanecem iguais.
- Modais continuam com áreas de rolagem próprias. O teste de fechamento de menu agora verifica a posição interna preservada, incluindo o comportamento de foco em toque.

## Ensaio integrado

1. Na Fila, rolar: logo e dock ficam parados; sessão e fila se movem juntos.
2. Trocar para Participantes, rolar e retornar à Fila: conferir posições independentes.
3. Arrastar item até a borda inferior e superior: lista deve acompanhar o gesto sem rolar a página.
4. Abrir/fechar menus e detalhes após rolar: verificar que a posição é preservada.
5. No aparelho real, cadastrar pessoa e abrir o teclado. Conferir que os campos e ações continuam alcançáveis e que o dock não cobre o final.
6. Testar altura reduzida, orientação paisagem, sessão vazia/encerrada, logout e outra sessão.

## Validação

Build aprovado. Os oito cenários iniciais em desktop/mobile passaram, incluindo viewport e página, posições por aba, altura reduzida, menus e arraste com rolagem automática. Cenários de navegador usam API simulada. O teclado virtual e o gesto físico no aparelho continuam sujeitos ao ensaio do responsável.

Regressão completa do frontend: 144 testes de navegador aprovados em desktop e mobile (API simulada).
