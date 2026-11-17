# Loading padrão de tela inteira

A abordagem local foi substituída por uma única máscara do BlockUI com
ProgressSpinner, montada no app root. Foram removidos a diretiva local, os
atributos nos cards e os wrappers na modal de edição da música. A geometria das
telas permanece independente do indicador.

## Comportamento

- Exibição imediata com mínimo visual de **300 ms**.
- Uma máscara para todas as operações bloqueantes simultâneas.
- Encerramento em sucesso, erro, timeout ou cancelamento.
- CSRF e gravação formam uma operação contínua; geração de QR inclui a imagem.
- Polling de palco, participante, músico, sessões do admin, sincronização e vínculo
  por QR não exibe a máscara.
- Autocomplete e buscas por digitação no catálogo não bloqueiam o campo.
- Carga inicial do catálogo, acesso, consultas explícitas e salvamentos usam a máscara.
- Consultas de letra e referências aceitam cancelamento ao destruir o componente.
- Sem mudança no backend, migrations, commit ou deploy.

## Validação focada

Build concluído. Os 40 testes focados de loading, edição de música, letras e busca
passaram em desktop e mobile, com APIs simuladas. Cobrem máscara do tamanho do
viewport, uma única instância, concorrência, falhas, cancelamento de letra, polling
silencioso e digitação durante consultas pendentes. Captura mobile conferida.

A regressão completa passou pelos 262 cenários cadastrados: 249 passaram na
primeira rodada e dois foram ignorados. Os testes de interação direta por mouse,
teclado e rolagem foram ajustados para aguardar a máscara inicial; na repetição
das cinco suítes afetadas passaram 73, com dois ignorados. O último cenário
mobile parava porque a notificação de pendências cobria a aba: o teste agora
confere e fecha o aviso antes de retornar à sincronização. A repetição desse
cenário passou em desktop e mobile. Ao final, todos os 260 cenários executáveis
foram validados. Formatação dos arquivos conferida.

## Ensaio manual

Recarregar a página para remover a estrutura anterior. Abrir painel ou consultar
uma referência: o fundo inteiro deve escurecer sem mover cards. Digitar em uma
busca de música: o input deve continuar disponível e não aparecer máscara global.
Aguardar atualizações automáticas: não deve haver bloqueio. Após erro, a máscara
deve sumir e a mensagem permanecer acessível.
