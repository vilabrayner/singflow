# Padronização dos painéis de músico e admin

Autorizada e implementada em 14/11/2026. Referência: [padrão atual](../ui/screen-pattern.md). Sem mudanças de backend ou infraestrutura e sem publicação automática.

## Músico

1. Entrar com conta de músico e sessão liberada. Conferir header com sessão e menu, dock Palco/Fila/Histórico e conteúdo sem sobreposição.
2. Em Palco, conferir convocação, confirmação de ida, música/artista e próxima sugestão. Não devem existir ações de gestão do anfitrião.
3. Em Fila, pesquisar uma música no final e conferir que o número continua sendo a posição real. Limpar, rolar, alternar abas e conferir preservação da busca e da rolagem.
4. Em Histórico, conferir nome, música/artista, status à direita e faixa lateral, sem horário.
5. Pelo menu, consultar sessão encerrada dentro do modal e voltar à lista, sem substituir a sessão atual no fundo.
6. Encerrar a sessão ou revogar acesso pelo anfitrião. A consulta atual deve desaparecer e retornar ao card de espera, sem dock.

## Admin

1. Conferir login e logout abaixo do header, com botão de saída direto e acesso administrativo preservado.
2. Alternar Cadastros/Sessões/Catálogo. Filtros, buscas e rolagem devem permanecer; somente o conteúdo central rola.
3. Conferir itens com borda e faixa estática, abrir detalhes e executar aprovação/suspensão com os diálogos existentes.
4. Consultar anfitrião, músicos e fila da sessão; conferir que o acesso como anfitrião continua sendo uma ação explícita.
5. Revisar catálogo e sincronização. Ao sair para outra aba com revisão pendente, mostrar o aviso existente; não encerrar o processamento persistente.
6. Após logout, não reapresentar dados de outra conta.

## Verificação

Build de produção e `npm run format:check` aprovados. Os 68 testes de músico/admin e recarga passaram em desktop e emulação de celular, com API simulada. O build mantém avisos de orçamento de bundle/CSS e dependências CommonJS do QR Code; não foram alterados os limites para ocultá-los.

Na última execução completa: 182 aprovados, dois ignorados no desktop por serem exclusivos de toque e dois timeouts em um cenário existente do anfitrião (desktop/celular). Esse cenário foi repetido isoladamente, sem alteração no código do anfitrião, e passou nos dois projetos. Portanto não registrar a suíte completa como uma única execução sem falhas. Também foi corrigida uma espera no teste existente de revogação do participante: aguardar a conclusão assíncrona antes de conferir o armazenamento. Não houve mudança do comportamento da participação. Cenários incluem desktop, emulação de celular e largura de 320px. Conferência física de Safari/Chrome, teclado virtual, gestos e área segura fica para o responsável. Nenhuma API real é usada pelos testes de interface.
