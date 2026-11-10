# Redesenho do anfitrião — incremento 01

Implementação autorizada em 10/11/2026: base visual compartilhada, login e telas de sessão. Aceite manual confirmado pelo responsável em 10/11/2026: “Validado esse começo do anfitriao, pode seguir com a sequencia”. A sequência está no [incremento 02](host-redesign-increment-02.md).

## Entregue

- Cabeçalho SingFlow, cartões e indicadores de estado reutilizáveis em `frontend/src/app/shared/components`, com cores, dimensões e controles comuns em `shared/styles/panels.css`.
- Login centralizado, rótulos explícitos, mensagem de e-mail inválido, mostrar/ocultar senha e mensagens de erro.
- Cartão inicial, formulário de criação com cancelamento e rascunho com abertura explícita.
- Sessão aberta com nome, estado e opções compactas. Sem participantes, cartão para iniciar a inscrição assistida; compartilhamento por link/QR Code em seção expansível.
- Seleção inicial da primeira sessão aberta retornada pela API; na ausência dela, primeiro rascunho. Sessões anteriores e criação de outra sessão continuam acessíveis nas opções da conta.
- Encerramento com confirmação, preservando a rejeição do backend quando há convocação ativa. Sessões encerradas mantêm consulta e oferecem criação de nova sessão.
- Foco após criação, seleção e cancelamento; Escape nas opções da conta/sessão; atalho para pular direto ao conteúdo. Controles principais com altura mínima de 48 px, formulários com texto de 16 px e preferência por movimento reduzido.

## Limites deste incremento

Participantes cadastrados e palco conservam a organização anterior, integrada ao novo cabeçalho. O redesenho completo desses fluxos será um próximo incremento com autorização própria. Não foram implementados exclusão de rascunho, reordenação manual, contatos opcionais, confirmação de ida ou painel do músico. Backend, migrations e serviços não foram alterados.

A identidade compartilhada passa a orientar os próximos painéis; não significa que participante e músico já tenham sido redesenhados no Angular. Os mockups desses painéis foram aprovados na conversa; suas implementações dependem de autorização.

## Verificação

A compilação de produção passou, com aviso de pacote inicial acima da meta de 500 kB e avisos de dependências CommonJS usadas pelo QR Code. Não foram ampliados os limites para esconder esses avisos.

Passaram 30 testes de navegador (15 cenários em desktop e celular), 5 testes de configuração, verificação de formatação e `git diff --check`. Os testes de navegador usam API simulada e executam em desktop e celular; cobrem login, criação/abertura, cancelamentos, opções, encerramento rejeitado/aceito, sessões anteriores, inscrição assistida, palco, compartilhamento e participante. Não comprovam integração com banco nem conformidade integral de acessibilidade.

## Roteiro de aceite local

Com os serviços iniciados pelo responsável pela IDE:

1. Abrir `/anfitriao`, entrar e conferir o cartão inicial ou a sessão aberta existente.
2. Nas opções da conta, criar outra sessão; cancelar e conferir o retorno à sessão anterior.
3. Criar um rascunho, conferir nome/estado e abrir explicitamente.
4. Na sessão vazia, iniciar e cancelar uma inscrição; depois inscrever uma pessoa com música.
5. Conferir os fluxos existentes de fila e palco e o compartilhamento por link/QR Code.
6. Nas opções da sessão, testar o cancelamento da confirmação de encerramento. Encerrar apenas uma sessão de ensaio que possa ser fechada definitivamente.
7. Conferir as sessões anteriores e sair da conta. Repetir o essencial no celular e com teclado.

Os testes automatizados não alteram dados reais; esse roteiro manual opera a sessão selecionada. O responsável mantém o controle da inicialização e encerramento dos serviços.

## Capturas da implementação

Imagens do Angular com API simulada, verificadas visualmente em 10/11/2026.

- [Login no celular](design/host/increment-01/login-mobile.png)
- [Rascunho no celular](design/host/increment-01/rascunho-mobile.png)
- [Sessão aberta no celular](design/host/increment-01/sessao-aberta-mobile.png)
- [Sem sessão no desktop](design/host/increment-01/sem-sessao-desktop.png)
