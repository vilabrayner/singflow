# Recuperação por QR de qualquer origem de inscrição

## Alteração

A restrição `ASSISTED` foi removida da elegibilidade do QR individual no backend
e no painel do anfitrião. O mesmo mecanismo de convite atende `SELF` e
`ASSISTED`, mantendo sessão aberta, participante presente e autorização do gestor.
O botão primário **Gerar QR Code de recuperação** fica visível diretamente na
modal quando há vínculo anterior, sem menu intermediário.

A confirmação continua revogando o vínculo anterior, sem criar participante ou
alterar origem, ordem, pedidos, histórico ou convocação. Convites duram cinco
minutos, têm uso único e a emissão não revoga antecipadamente o celular anterior.
Não há migration, alteração de dados de ensaio ou deploy.

## Ensaio

1. Entrar pelo QR geral no celular e cadastrar nome e música.
2. No anfitrião, abrir Participantes: o inscrito pelo celular também tem QR
   individual; nos detalhes, o menu contém Acesso pelo celular.
3. Abrir Acesso pelo celular e tocar em Gerar QR Code de recuperação.
4. Acessar o novo link no navegador/endereço onde se perdeu o acesso e confirmar.
5. Conferir mesmos pedidos, chegada e convocação, sem duplicata; adicionar música.
6. Conferir que o convite usado e o acesso antigo não dão mais acesso.

O QR depende da URL pública correta no backend (`SINGFLOW_PUBLIC_APP_URL`). Após
mudança de IP local, configurar essa origem e reiniciar o backend pela IDE.

## Validação

Frontend e backend compilaram. Os 22 testes de interface de participação passaram
em desktop e mobile com API simulada, incluindo QR nas duas origens, recuperação
pela lista/detalhes, uso único e troca explícita de vínculo. O responsável executou
`./mvnw -B -Dtest=SingflowApplicationTests test`: **BUILD SUCCESS**, incluindo o
novo resgate de inscrição SELF, proteção CSRF, permissões, preservação da convocação,
revogação, saída e encerramento. `git diff --check` sem erros. O build mantém os
avisos existentes de orçamento de bundle/CSS e CommonJS de QR Code.


## Ação de recuperação visível

A geração do QR de recuperação passou ao botão primário da modal quando já
existe vínculo. O menu que continha apenas essa ação foi removido. Após gerar,
o botão primário é Copiar link; emitir continua sem revogar o acesso anterior.
Build frontend concluído. Vinte cenários passaram na rodada completa; os dois
cenários de resgate SELF foram adaptados ao botão direto e passaram na repetição
em desktop e mobile. O backend não foi alterado neste ajuste visual.
