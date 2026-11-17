# Edição de música em uma única modal

A modal administrativa apresenta Dados, Cifra, Spotify e YouTube. As abas contêm
apenas ícones, centralizados em áreas de 20 × 20 px como no catálogo. Cifra usa o
símbolo aprovado (`cifra-club-icon.png`) como máscara CSS para herdar a cor do
tema. Rótulos acessíveis identificam as abas sem texto visual.

## Layout e interação

- Mesma estrutura fullscreen com bordas visíveis do seletor de músicas.
- Abas com divisórias retas e arredondamento somente nas extremidades superiores.
- Conteúdo central no ScrollArea do PrimeNG, com a sombra compartilhada do catálogo.
- Rodapé fixo com apenas **Salvar** e **Fechar**.
- Parágrafos redundantes removidos; permanecem rótulos, erros e estados úteis de busca.
- Campo de link compartilhado com x para limpar e botão de abertura externa com
  `fa-up-right-from-square`. A limpeza é apenas um rascunho até salvar.
- Cifra e streaming não são mais itens do menu. O menu mantém aprovação, rejeição,
  unificação e histórico. O cadastro inicial de música mantém o fluxo de criação.

## Salvamento e consultas

`POST /api/admin/catalog/songs/{id}/details` recebe versão, título, artista,
tom original e um mapa de referências. Uma transação reutiliza os serviços de
catálogo, cifra e streaming, incluindo suas validações, permissões e auditoria.
Se qualquer etapa falhar, nenhum campo ou auditoria parcial é persistido.
Referências não visitadas permanecem preservadas. Um campo vazio remove o vínculo.
Uma gravação sem alterações é permitida e não gera alterações artificiais.

O frontend mantém os rascunhos dos links fora dos editores, preservando-os ao
alternar abas. URL inválida desabilita Salvar em todas as abas. Conflito ou erro
mantém a modal e o rascunho. O salvamento envia uma única requisição e não consulta
provedores externos. Referências existentes e rascunhos reabertos não disparam
buscas; pesquisas explícitas e reaproveitamento de sugestões permanecem disponíveis.

## Validação

- Build do frontend concluído e nove testes sem banco do backend passaram.
- `CanonicalMusicIntegrationTests`: **BUILD SUCCESS** informado pelo responsável,
  incluindo gravação conjunta, rollback com URL inválida, remoção, preservação de
  vínculos não visitados, ausência de alterações, conflito, admin e CSRF.
- 36 testes Playwright passaram em desktop e mobile com APIs simuladas nas suítes
  catálogo, cifra, streaming, enriquecimento e edição unificada.
- Medições conferem os ícones em 20 × 20 px centralizados e o rodapé imóvel durante
  a rolagem. Captura mobile conferida visualmente.
- Preferência pessoal do músico mantém seu fluxo independente e foi validada.
- Sem migrations novas, commit ou deploy.

## Ensaio manual

Reiniciar o backend pela IDE para carregar o endpoint. Abrir uma música, alterar
tom, cifra e streaming em abas diferentes, limpar um link e conferir os rascunhos
ao voltar às abas. Salvar uma única vez e reabrir para conferir os valores. Fechar
sem salvar deve descartar as alterações locais.
