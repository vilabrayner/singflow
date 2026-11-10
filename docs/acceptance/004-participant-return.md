# Ensaio — saída voluntária e retorno

Estado: implementação autorizada e concluída; testes automatizados aprovados. Aceite manual integrado pendente.

Regras em [Revisão de saída e retorno](../participant-return-review.md). Este roteiro substitui o comportamento de revogação na saída voluntária descrito originalmente no Aceite 003.

## Preparação

O responsável inicia/reinicia os serviços na IDE. A migration nova é somente a V6; V1–V5 permanecem preservadas. Não executar `repair` nem apagar volumes.

- Serviços independentes: reiniciar `SingflowApplicationLocal` e atualizar o frontend iniciado pela IDE.
- Docker: o responsável executa `docker compose up -d --build` na raiz, usando o volume existente. Não executar `down -v`.
- O teste continua no navegador do computador, sem publicar ou alterar exposição de rede. AWS e aparelho físico permanecem adiados.
- Credenciais já revogadas pela versão anterior continuam revogadas; nesses casos, retornar ao cadastro conhecido pelo anfitrião. Para testar o novo comportamento, usar uma credencial válida e uma nova saída.

## Fluxo principal

1. Abrir uma sessão pelo anfitrião, mostrar o link/QR e fazer check-in pelo participante. Manter outra aba aberta com o mesmo acesso.
2. Concluir uma apresentação pelo anfitrião. Anotar a contagem e a ordem de chegada. Adicionar outra música e confirmar nova convocação.
3. No participante, clicar **Sair da fila** e confirmar. Conferir a convocação resolvida como desistência, pedidos não atendidos cancelados, histórico mantido e ausência da pessoa nas sugestões.
4. A tela deve mostrar **Você está fora da fila**, manter o histórico e oferecer uma nova música para voltar. Não oferecer o envio comum de pedidos. Recarregar e atualizar a outra aba: ambas continuam reconhecendo o mesmo cadastro fora da fila.
5. Informar **Música para voltar** e clicar **Voltar com esta música**. Conferir mesmo participante, mesmas apresentações concluídas, nova ordem de chegada e somente um novo pedido. Pedidos cancelados continuam cancelados.
6. Conferir a justiça da fila: a menor contagem de apresentações continua prioritária; a nova chegada é usada somente nos desempates previstos. Retorno não restaura a posição antiga.
7. Sair e retornar mais uma vez. O prazo de acesso mostrado não deve ser renovado. Em falha de resposta, a retentativa na mesma tela reutiliza o identificador da operação; atualizar antes de interpretar um resultado incerto.

## Controle do anfitrião e limites

8. Com outro participante ativo, registrar saída pelo anfitrião. O acesso do participante deve ser revogado na próxima consulta; ele não consegue retornar sozinho. Reativar pelo anfitrião não recupera a credencial revogada.
9. Repetir a retirada pelo anfitrião quando a pessoa já estiver fora por saída voluntária. Isso também impede o retorno autônomo e revoga o acesso.
10. Pausar, suspender por falta ou inativar um participante pelas regras existentes. Sair dessas situações mantém a possibilidade de leitura, mas não habilita retorno autônomo: o anfitrião continua responsável pela liberação. Sair e voltar não pode apagar a sequência de faltas.
11. Encerrar a sessão com a pessoa fora da fila. Manter leitura própria, sem formulário de retorno ou novos pedidos. Acesso expirado não pode voltar; procurar o anfitrião para preservar o cadastro, sem associação por nome.
12. Reiniciar o backend pela IDE entre saída e retorno. A distinção entre saída voluntária e retirada pelo anfitrião deve persistir. Repetir no Docker.

## Esquecer acesso

13. Fora da fila, clicar **Esquecer meu acesso neste aparelho**. Antes de confirmar, a pessoa mantém seu acesso e pode cancelar a ação.
14. Confirmar: remover o cookie, revogar a credencial e limpar os dados da tela. A outra aba perde o acesso na próxima atualização. Cadastro, músicas e apresentações continuam no histórico do anfitrião; o login dele permanece válido.
15. Para evitar deixar uma pessoa ativa sem controle do próprio acesso, esquecer é oferecido somente fora da fila ou com sessão encerrada. Enquanto estiver participando, sair da fila primeiro. A API também valida essa condição.

## Evidências automatizadas

- Backend: `./mvnw -B verify` retornou `BUILD SUCCESS`, informado pelo responsável após a última alteração. São 35 testes, incluindo concorrência de retorno com retirada/encerramento, duas retentativas simultâneas, preservação de chegada/contagens/histórico, nova música, expiração, CSRF, esquecimento e V6.
- Frontend: 22 testes passaram com API simulada, em desktop/mobile; 5 testes de configuração passaram. Build de produção aprovado, com os mesmos avisos de tamanho inicial e CommonJS do gerador QR já documentados.
- Ensaio integrado local e Docker: pendente do responsável. Testes simulados não substituem este aceite.
