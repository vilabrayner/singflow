# Ensaio — fila sugerida e operação do palco

Estado: implementação e testes automatizados aprovados; aceite manual confirmado pelo responsável em serviços independentes e Docker, incluindo reinício. Registro em [Aceite 002](acceptance/002-stage-flow.md).

## Atualizar o ambiente

O responsável gerencia serviços pela IDE. O agente não deve iniciar, reiniciar nem encerrar os serviços.

Com serviços independentes: reinicie o backend pela IDE para aplicar V3 e confira que o frontend carregou a versão atual. V1 e V2 foram preservadas; os cadastros, pedidos e saídas do ensaio anterior permanecem. `SingflowApplicationLocal` continua lendo `.env`.

Para testar Docker, o responsável executa na raiz:

```sh
docker compose up -d --build
```

Use http://127.0.0.1:4200/anfitriao no modo independente ou http://127.0.0.1:8081/anfitriao no Docker. Bancos desses modos continuam separados. Faça cada ensaio em uma sessão nova para comparar resultados; não apague os dados existentes.

## Comportamento entregue

- Uma convocação em andamento por sessão. Aprovação disponível para a primeira sugestão; não há ultrapassagem manual com motivo nesta versão.
- Uma posição por pessoa, com pedido pendente mais antigo (desempate por ID) ou “música a escolher”.
- Prioridade: menos apresentações, evitar repetir imediatamente entre empatados, pedido elegível e ordem de chegada.
- Conclusão consome o pedido e incrementa apresentações uma única vez. Sem pedido, exigir música antes de concluir; a escolha fica no histórico, sem pedido fictício.
- Falta confirmada pelo anfitrião; recusa pausa sem falta; cancelamento por engano não penaliza.
- Primeira falta cria espera persistida pelos demais elegíveis daquele momento. Conclusão, falta ou recusa resolvem uma oportunidade; sair/pausar deixa de bloquear. Novas inscrições não ampliam a espera.
- Se não havia outros elegíveis, “Liberar segunda tentativa” depende do anfitrião, sem apagar a primeira falta.
- Segunda falta consecutiva inativa e suspende pedidos. Reativação renova a ordem de chegada e zera faltas, preservando apresentações e devolvendo pedidos suspensos a pendentes.
- Retomar pausa preserva chegada, pedidos e faltas; retorno após saída não restaura pedidos cancelados.
- Saída durante convocação registra desistência e cancela a reserva, preservando histórico.
- Encerramento da sessão fica bloqueado enquanto existir convocação ativa.

As sugestões são uma visão do estado atual, não uma programação de várias rodadas futuras. As próximas oportunidades são recalculadas após cada ação. Outro navegador pode tornar a tela desatualizada; use “Atualizar” antes de confirmar. O servidor rejeita conflitos em vez de selecionar outra pessoa silenciosamente.

## Roteiro A — justiça e repetições

1. Crie e abra sessão nova. Inscreva Ana, Bruno e Carla, nessa ordem, com uma música cada; acrescente uma segunda música para Ana.
2. Confira primeira sugestão Ana. Clique “Aprovar e convocar” e confirme.
3. Tente encerrar a sessão: deve ser impedido enquanto houver convocação.
4. Conclua Ana. Bruno e Carla devem ter prioridade pela menor contagem, mesmo com outro pedido de Ana.
5. Conclua Bruno e Carla. Ana volta com sua segunda música.
6. Após consumir os pedidos, o app continua sugerindo pessoas com “música a escolher”.
7. Convoque uma delas. Tente concluir sem informar música: deve pedir o título. Informe a música e conclua. Não deve surgir pedido artificial.
8. Confira histórico e contagens. Somente conclusão aumenta apresentações.

## Roteiro B — faltas e rodada

1. Em sessão nova com Ana, Bruno e Carla, convoque Ana e registre falta com confirmação.
2. Ana aguarda duas oportunidades. Não deve aparecer na sugestão enquanto aguarda.
3. Convoque Bruno e marque “Agora não quer cantar”. Bruno fica pausado, sem falta; a espera de Ana cai para uma oportunidade.
4. Inscreva Daniel. Ele não aumenta o conjunto de espera já registrado.
5. Conclua a oportunidade de Carla. Ana volta a ficar elegível, mantendo uma falta.
6. Quando Ana for a próxima, confirme nova convocação e registre falta. Fica inativa, com duas faltas e pedidos suspensos.
7. Clique “Reativar participante”. Confira nova ordem de chegada, faltas zeradas e apresentações preservadas.
8. Retome Bruno e confira preservação de sua ordem de chegada.

## Roteiro C — pessoa sozinha, desistência e engano

1. Sessão nova com uma pessoa: registre primeira falta. O app não deve chamá-la automaticamente de novo.
2. Use “Liberar segunda tentativa”; permanece uma falta, e a pessoa só é convocada após nova aprovação.
3. Cancele uma convocação por engano: pedido volta a pendente, sem nova falta nem apresentação.
4. Faça nova convocação e conclua: aumenta apresentações e zera faltas.
5. Convoque outra vez e registre a saída da pessoa pelo cadastro. A convocação fica como desistência e deixa de estar ativa.
6. Reative o cadastro conhecido. Apresentações permanecem; pedidos cancelados não voltam.

## Roteiro D — duas abas e reinício

1. Abra a mesma sessão em duas abas. Confirme a mesma sugestão em ambas: só uma convocação deve ficar ativa; a outra operação é rejeitada ou reconhecida como retentativa, sem duplicação.
2. Conclua pela primeira aba e tente registrar falta pela aba antiga: o segundo resultado deve ser rejeitado.
3. Deixe uma convocação ativa e reinicie o backend pela IDE. A convocação deve reaparecer após login/atualização.
4. Deixe uma pessoa aguardando rodada após primeira falta e reinicie. Confira falta e número de oportunidades restantes preservados.
5. Repita o roteiro no Docker usando `docker compose restart backend` no terminal da IDE.
6. Depois de resolver a convocação atual, encerre a sessão. Histórico permanece legível; comandos de palco ficam bloqueados.

## Implementação e testes

V3 acrescenta estados e contadores, ordem atual de chegada, convocações, exclusão de duas convocações simultâneas por índice parcial e espera por rodada. Estado e auditoria são persistidos na mesma transação com bloqueio da sessão. O módulo `stage` usa APIs dos módulos existentes; eventos síncronos verificam fechamento e tratam saída, sem dependências cíclicas.

Validações desta entrega:

- Responsável executou `./mvnw -B verify` e informou `BUILD SUCCESS`; relatórios locais confirmam 24 testes backend sem falhas, erros ou ignorados (12 de integração, 5 de ordenação, 6 de configuração local e 1 de arquitetura).
- Cinco testes de configuração do frontend aprovados.
- Doze testes Playwright aprovados em desktop/celular com respostas de API simuladas no frontend já iniciado pelo responsável.
- Build Angular aprovado, com aviso de pacote inicial aproximadamente 529 kB contra referência de 500 kB; orçamento não foi aumentado.
- Imagens backend e frontend atualizadas com sucesso, sem iniciar os serviços.
- Conferência visual com dados simulados em desktop e celular, sem transbordamento horizontal.
- Aceite manual e persistência de palco após reinício confirmados pelo responsável nos dois modos; ver Aceite 002.

Não há WebSocket, PWA, check-in autônomo, catálogo híbrido ou painel exclusivo do músico nesta entrega.
