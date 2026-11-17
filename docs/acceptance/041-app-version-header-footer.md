# Versão 0.1.0-beta.1 e rodapé comum do header

## Escopo

- Frontend, lock npm e artefato Maven alinhados em `0.1.0-beta.1`.
- Rodapé reutilizável nos menus de anfitrião, participante, músico e admin.
- Conteúdo do menu rola com versão sempre visível; preservar altura do header.
- Versão estática no artefato, lida do package.json pelo componente comum.
- Menu do admin substitui o botão direto de sair, mantendo o logout acessível.
- Dockerfile do backend copia o JAR versionado sem fixar a versão no nome.
- Sem commit, push, tag/release, publicação de imagens ou implantação nesta etapa.

## Validação

Build frontend e `./mvnw -B -DskipTests package` concluídos. Os 19 testes de
configuração passaram, incluindo coerência da versão frontend/lock/backend.
Os 58 cenários de contas, navegação e padronização foram validados em desktop e
mobile: 56 passaram na rodada principal; os oito cenários dos quatro headers
passaram na repetição com viewport menor para forçar a rolagem do menu longo.
Incluem logout do admin pelo menu, texto de versão nos quatro painéis, altura do
header preservada, rodapé fixo e retorno de foco ao fechar. `git diff --check`
sem erros. O build mantém os avisos existentes de orçamento de bundle/CSS e
CommonJS do QR Code.

## Ensaio

Recarregar o frontend. Em cada painel autenticado, abrir o menu do header e
conferir o rodapé Versão 0.1.0-beta.1. No anfitrião com várias sessões, abrir a
lista e rolar: o rodapé deve permanecer visível. Fechar com Escape deve devolver
o foco ao botão. No admin, a saída fica dentro do menu Opções da administração.
