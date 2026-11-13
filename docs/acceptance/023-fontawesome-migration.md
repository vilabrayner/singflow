# Migração aprovada para Font Awesome Free — 13/11/2026

O responsável aprovou a tabela de 47 substituições, alterando Mais cantadas para fa-ranking-star, Músico para fa-guitar, Chamar/cantar para fa-bullhorn e Sincronizar para fa-rotate. A tabela atualizada está em [Migração de ícones](../ui/icon-migration-proposal.md).

## Alterações

- Ícones explícitos migrados em anfitrião, participante, músico, administração, cadastro, página inicial e componentes compartilhados.
- Font Awesome Free 7.3.1 fixado no package.json/lockfile. CSS e fontes servidos localmente; não há CDN ou pacote Pro.
- Classes completas passadas ao dock, menus, componentes de catálogo e telas de experiência. Removida concatenação de prefixo pi.
- Classes condicionais de cadastro/revisão migradas; seletores de tamanho/alinhamento aceitam fa-solid, fa-regular e fa-brands. Favoritas usa estrela regular; spinners incluem fa-spin.
- Dependência direta primeicons e seu import CSS removidos. Nenhuma referência a classes pi-* permanece no código do frontend. Pacotes transitivos de ícones SVG requeridos pelo próprio PrimeNG permanecem sob controle da biblioteca.
- Sem alterações de comportamento, permissões, backend ou migrations. Marca e favicon preservados.

## Validação

Build aprovado. Na regressão de 172 cenários, 170 passaram e dois testes de troca musical ainda procuravam o nome de classe anterior. Depois de corrigir os seletores, os dez cenários afetados/de ícones passaram em desktop e celular, incluindo troca musical, classes de catálogo/favoritas/mais cantadas, fontes locais, dock de músicos e convocação. Conferência visual mobile de menu e participante realizada. Metadados do pacote confirmam todos os ícones propostos no conjunto Free.

A migração global foi autorizada expressamente; não foi iniciado/encerrado serviço nem realizado deploy.
