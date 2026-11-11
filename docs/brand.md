# Identidade visual SingFlow

Referência aprovada pelo responsável: **Brand Board SingFlow em Roxo Vibrante.png**. A assinatura combina microfone inclinado, três pessoas, seta de avanço, raios amarelos e a escrita SingFlow (Sing em azul-marinho, Flow em roxo). Tipografia do sistema: Manrope. Paleta: `#0B1E3F`, `#7C3AED`, `#FBBF24`, `#F4F6FA`.

Como não havia arquivo vetorial ou PNG isolado, as versões de aplicação foram preparadas com a ferramenta de imagens a partir do brand board. São derivados rasterizados, e não arquivos vetoriais originais; substituir pelos arquivos oficiais quando estiverem disponíveis.

- `frontend/public/brand/singflow-logo.png`: matriz rasterizada da assinatura horizontal, sem slogan e com fundo transparente, para superfícies claras. Preservada em alta resolução; não usada diretamente pelo cabeçalho.
- `frontend/public/brand/singflow-logo-{144,288,432}.webp`: versões WebP com compressão sem perdas, redimensionadas para 144 × 48, 288 × 96 e 432 × 144 px. O componente usa `srcset` de densidade (1×/2×/3×) e dimensões de layout de 144 × 48 px, para evitar o download da matriz e o aviso NG0913 de imagem superdimensionada.
- `frontend/public/brand/singflow-icon.png`: símbolo em quadrado azul-marinho com cantos arredondados, usado como ícone de atalho.
- `frontend/public/brand/singflow-icon-negative.png`: versão negativa, com símbolo branco sobre azul-marinho, usada como favicon.
- `BrandLogo`, em `shared/components/brand-logo.ts`, é a aplicação compartilhada pelos cabeçalhos público e dos painéis. O link ao redor fornece o nome acessível “SingFlow, início”. Não substituir a marca por um PrimeIcon de microfone genérico. Ícones funcionais de microfone nas ações e cards continuam indicando funções do sistema.

Preservar proporções e respiro. No cabeçalho, não incluir o slogan para manter a leitura no celular. Os arquivos são locais, sem dependência de URL externa. A capa de portfólio foi refeita com a variante da marca para fundo escuro; as telas da capa são mockups ilustrativos, não capturas do app.
