# ADR 003 — PrimeNG, Tailwind, PrimeIcons e marca SingFlow

Estado: implementado na fundação técnica.

## Contexto

Precisamos de componentes para formulários, tabelas, filtros e diálogos, além de uma experiência responsiva para participantes. O usuário escolheu começar com PrimeIcons e reavaliar Font Awesome se faltar variedade.

## Decisão

Usar PrimeNG como biblioteca principal, Tailwind para layout e PrimeIcons como catálogo inicial. Propor Aura como base do tema, personalizando tokens com a marca SingFlow. Conferir compatibilidade e licenças das versões e distribuições antes da instalação.

- Azul-marinho: `#0B1E3F`.
- Roxo: `#7C3AED`.
- Amarelo: `#FBBF24`.
- Fundo: `#F4F6FA`.
- Tipografia: Manrope.
- Slogan: “Sua voz no palco, na ordem certa.”

## Consequências

Angular Material não será uma segunda biblioteca padrão. Font Awesome fica como alternativa futura, sem instalação antecipada. Componentes próprios em `shared/` devem representar reutilização real, sem envolver todo componente PrimeNG desnecessariamente. Ícones de ação precisam de rótulos acessíveis. A aplicação usará o arquivo oficial do logotipo quando fornecido; ele não está presente no repositório nesta revisão.

## Revisão — versões Community

O responsável confirmou uso pessoal e escolheu PrimeNG 22 Community com PrimeIcons 8. Essas distribuições usam licença PrimeUI com chave e renovação anual, em vez de MIT. A chave será emitida pelo responsável e fornecida no arquivo de configuração de cada ambiente; não é incluída no repositório. Aura, Tailwind e fonte Manrope local estão configurados. Consulte `docs/foundation.md` para versões e resultados.
