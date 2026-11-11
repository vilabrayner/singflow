# Busca compartilhada de músicas

Configurar `LASTFM_API_KEY` no ambiente do backend (no Render, em Environment; localmente no `.env` carregado pelo launcher local). Reiniciar o backend pela IDE após configurar. Não colocar a chave no frontend ou versionar o segredo. Nenhuma migration necessária.

O componente compartilhado consulta GET `/api/public/songs/search?q=...`, após 3 caracteres e 400 ms sem digitar. Retorna no máximo 10 títulos/artistas via Last.fm `track.search`. Selecionar mantém título/artista separados no pedido existente. Digitação livre envia somente o título; editar uma seleção limpa o artista anterior.

Aplicado a primeira música e novos pedidos do anfitrião/participante, retorno à fila e definição de música na convocação. Falha, falta de chave ou nenhum resultado permite texto livre. Respostas antigas são descartadas. A busca não cadastra nem aprova músicas em um catálogo.

O backend usa HTTPS, tempos máximos de conexão/leitura, cache de até 200 buscas por cinco minutos e limite global de 120 consultas externas por minuto por instância. O endpoint é público para permitir a primeira inscrição sem conta. Não retorna dados pessoais, URLs nem credenciais do provedor. Esse limite inicial é compartilhado; pode precisar de ajuste conforme o uso real.

Ensaio: digitar 2 caracteres (sem consulta); digitar 3 e selecionar resultado; editar seleção e verificar artista limpo; enviar texto não encontrado; simular indisponibilidade e continuar; repetir nos formulários móveis e nos diálogos do anfitrião. Verificar navegação por teclado e limite de 10 sugestões.

## Validação automatizada

Compilação frontend de produção aprovada (avisos existentes de orçamento e CommonJS preservados). Backend: 19 testes sem banco aprovados, incluindo quatro da integração Last.fm e limites de módulos. Regressão de interface: 90 testes aprovados com API simulada; após o ajuste final de Escape, quatro testes focados aprovados em desktop/mobile, cobrindo seleção, texto livre, falha do provedor, respostas antigas, limite de dez itens e teclado dentro da modal.

Pendente: verificação completa backend pelo responsável e ensaio real após configurar a chave. Nenhuma chamada ao Last.fm com chave real foi executada nesta implementação.
