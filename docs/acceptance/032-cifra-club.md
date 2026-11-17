# Aceite 032 — Cifra Club

## Preparação e validação

Reiniciar o backend pela IDE para aplicar a V20; atualizar o frontend. Não há chave externa. A flag `SINGFLOW_CIFRA_SEARCH_ENABLED` vale no backend e no Compose local. Não houve publicação neste incremento.

O responsável executou `./mvnw -B verify` com **BUILD SUCCESS**, incluindo PostgreSQL temporário. Os testes cobrem referência oficial, isolamento pessoal, reutilização entre sessões, reset, autorização, CSRF, URLs, controle de versão, concorrência e unificação com alternativas. O provedor é simulado nos testes.

## Ensaio integrado

1. Admin → Catálogo → informações da música → opções → Cifra Club. Conferir a sugestão principal, abrir para revisar e salvar a referência oficial. Abrir/pesquisar não deve salvar nada.
2. Músico aprovado com acesso à sessão: no palco/fila, tocar no ícone para abrir a cifra oficial. A busca permite escolher outra versão e salvar somente para seu perfil.
3. Entrar com outro músico: deve continuar usando a referência oficial. Reutilizar a música em outra sessão autorizada com o primeiro músico: sua preferência deve aparecer.
4. Usar “Usar referência do catálogo”: o link efetivo deve voltar à referência oficial atual.
5. Desativar a busca externa e reiniciar pela IDE: conferir mensagem de indisponibilidade e salvar um link manual válido. URL externa ao Cifra Club deve ser rejeitada.
6. Unificar músicas com escolhas pessoais diferentes: conferir as alternativas preservadas e escolher explicitamente qual manter. A música definitiva conserva os vínculos.
7. Revogar acesso do músico: novas consultas/gravações daquela sessão devem ser recusadas.

O botão de abrir a cifra usa `frontend/public/icons/cifra-club-icon.png`: PNG de 96 × 96 px, exibido a 24 × 24 px, preto uniforme com recortes e fundo transparentes, com nome acessível no link. O SVG fornecido permanece disponível em `frontend/public/icons/cifra-club.svg`. Conferir toque e rolagem no celular físico; testes emulados não substituem esse aceite.


### Tom ao abrir a cifra

No palco e na fila do músico, o link de navegação recebe `keyShape` apenas se houver tom original válido e alteração inteira diferente de zero. O índice absoluto começa em A=0, Bb=1, B=2, C=3, Db=4, D=5, Eb=6, E=7, F=8, F#=9, G=10, Ab=11, conforme tabela conferida pelo responsável. Exemplos: D −2 → C (`3`); C +2 → D (`5`). Sem os dois dados, remove-se `keyShape` inclusive se já existir no link salvo. Outros parâmetros e a versão da cifra permanecem; o catálogo e a preferência pessoal não são modificados. O parâmetro codifica a altura da nota, sem adicionar parâmetro de modo maior/menor. Conferir manualmente a abertura na página externa. Sem migration nova.


## Economia de consultas ao abrir a cifra

O diálogo administrativo reutiliza a referência oficial. O diálogo do músico
reutiliza a preferência pessoal ou, na ausência dela, a referência oficial.
Quando já existe esse vínculo, abrir o diálogo não consulta sugestões nem
pesquisa no CifraClub. A pesquisa explícita continua disponível para trocar a
versão, assim como a edição manual do link e a restauração da referência oficial.

Sem vínculo, o comportamento anterior permanece: o admin tenta reaproveitar
sugestões preparadas antes da pesquisa externa; o músico pode buscar a cifra.
O processamento automático no backend já ignora músicas com cifra oficial.

Validação: build do frontend concluído; 14 testes Playwright de cifra e
enriquecimento passaram em desktop e mobile, com APIs simuladas. A regressão
cobre abertura com referência oficial/pessoal sem busca e pesquisa explícita para
troca. Sem migration nova.
