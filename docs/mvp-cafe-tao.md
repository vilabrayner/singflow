# MVP — piloto no Café Tão

Meta solicitada: pronto para teste na quarta-feira, 11/11/2026, pela manhã (America/Recife). O horário de 9h foi proposto como referência; ainda não confirmado. Este plano não constitui garantia de prazo nem autorização de implementação ou publicação.

## Decisões aprovadas

A [ADR 004](decisions/004-participation-and-repeat-suggestions.md) define prioridade, sugestões sem pedido, faltas, saída e retorno. A inscrição assistida foi aprovada como fluxo principal do MVP:

1. Anfitrião procura cadastro existente antes de inscrever.
2. Para nova pessoa, coleta nome, primeira música e mesa opcional.
3. O servidor registra a participação e o pedido, identificando o anfitrião como ator.
4. Novas músicas são coletadas pelo anfitrião e adicionadas à mesma participação.
5. O app gerencia a fila com a mesma justiça aplicada a quem entrou pelo celular.
6. Sem novo pedido, o app sugere “música a escolher” para aprovação; o anfitrião coleta a escolha.
7. Anfitrião registra conclusão, falta, pausa, saída e retorno conforme as regras aprovadas.

O evento deve poder funcionar inteiramente por inscrições assistidas. Não exigir QR Code, conta ou aparelho do participante nesse fluxo. Transferência posterior para o celular fica fora do MVP. Nome e mesa não são credenciais e não identificam unicamente uma pessoa.

## Recorte proposto para revisão

- Um anfitrião autenticado e uma sessão de karaokê.
- Cadastro assistido e check-in autônomo por link/QR Code.
- Pedido simples com música e artista, sem catálogo híbrido completo.
- Sugestão por pessoa, com pedido ou com música a escolher.
- Confirmação, conclusão, pausa, faltas, saída e reativação.
- Histórico mínimo, persistência e proteção contra duplicação de operações.

O formato exato da música/artista e as validações serão fechados antes da implementação. O detalhamento assistido aprovado não aprova automaticamente todo esse recorte.

Para caber no piloto, foram propostas para depois: cadastro público de anfitriões, recuperação de senha, catálogo híbrido completo, painel exclusivo do músico e instalação PWA. Consultas periódicas podem atender à atualização inicial, deixando WebSocket para um incremento seguinte. Esses cortes e essa estratégia ainda precisam de aprovação.

## Etapas propostas

| Prazo de referência | Entrega | Aceite |
| --- | --- | --- |
| Segunda, 09/11, à noite | Fechar regras, acesso do anfitrião, sessão e participação | Criar sessão, inscrever/listar/sair, com persistência e autorização |
| Terça, 10/11, pela manhã | Pedidos, sugestões e operação do palco | Simular várias rodadas com três participantes, incluindo repetição sem pedido |
| Terça, à tarde | Telas e ambiente acessível por celular | Operar anfitrião e participantes em aparelhos distintos; fluxo assistido completo |
| Terça, à noite | Ensaio e congelamento de escopo | Exercitar faltas, desistência, reconexão e cliques duplicados |
| Quarta, 11/11, pela manhã | Corrigir bloqueadores e preparar operação | Acesso conferido, versão identificada, dados preservados e roteiro disponível |

A conclusão depende do fechamento do escopo, hospedagem e execução das etapas. Revisar o cronograma diante de bloqueadores; não tratar os marcos como entregas já realizadas.

## Ensaio obrigatório do fluxo assistido

- Inscrever três pessoas de mesas diferentes apenas pelo painel do anfitrião.
- Encontrar cadastro existente e adicionar músicas sem duplicar participação.
- Concluir uma rodada e verificar ordem e contagens.
- Ficar sem pedidos e aprovar oportunidade com música a escolher.
- Registrar primeira e segunda faltas, respeitando a rodada entre tentativas.
- Registrar pausa, saída e reativação, preservando histórico.
- Misturar participantes assistidos e autônomos, sem preferência pela origem.
- Repetir uma ação e verificar que não duplica pedido, convocação ou conclusão.

## Pendências para autorizar implementação

- Aprovar o recorte completo, cortes, limites das entregas e horário final.
- Definir acesso inicial do anfitrião e identidade de quem usa check-in autônomo.
- Confirmar proposta de uma convocação em andamento e ordem de pedidos por criação.
- Detalhar duração/retomada de pausa, reservas, rodada e sequência de faltas após reativação, conforme pontos abertos da ADR 004.
- Escolher hospedagem HTTPS acessível pelos aparelhos, PostgreSQL persistente e estratégia de backup. Publicação exige aprovação própria.

O responsável inicia, reinicia e encerra serviços pelo terminal da IDE. O agente deve solicitar essas ações quando forem necessárias, sem gerenciar os serviços automaticamente. Commits e push exigem autorização separada.

## Atualização — primeira entrega autorizada

O responsável autorizou acesso provisionado do anfitrião, criar/abrir/encerrar sessão, inscrição assistida com primeira música, busca e novos pedidos no mesmo cadastro, lista por check-in e saída. Hospedagem será escolhida depois dos testes locais, tanto com serviços independentes como com imagens Docker. O [roteiro local](local-mvp-testing.md) registra escopo implementado, verificações e pendências. Os demais fluxos seguem sujeitos a revisão e autorização.

## Aceite da primeira entrega

Responsável confirmou teste completo com serviços independentes e Docker, com persistência após reinício. Registro em [Aceite 001](acceptance/001-assisted-flow.md). A próxima entrega está em [revisão de fila e palco](stage-review.md); ainda não foi autorizada sua implementação.

## Aceite de fila e palco e próxima revisão

O responsável confirmou roteiro de fila e palco com serviços independentes e Docker, incluindo reinício com convocação ativa e espera de rodada; ver [Aceite 002](acceptance/002-stage-flow.md). A [revisão do participante pelo celular](participant-review.md) está preparada, sem autorização de implementação. Hospedagem e exposição de rede continuam pendentes.
