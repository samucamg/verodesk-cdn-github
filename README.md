# Serverless CDN Orchestrator

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=flat-square&logo=github&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green.svg)

> 🚀 Um orquestrador de CDN serverless e edge-native. Ele transforma um repositório GitHub em uma origem de arquivos, usa Cloudflare Workers para a API e o gerenciamento, Cloudflare D1 para metadados e Cloudflare Pages para a interface web. Os arquivos podem ser consumidos globalmente pela CDN do jsDelivr e pela infraestrutura da Cloudflare.

## Índice

- [Visão geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Pré-requisitos](#pré-requisitos)
- [Instalação pelo navegador](#instalação-pelo-navegador-recomendada)
- [Passo 1: preparar o GitHub](#passo-1-preparar-o-github)
- [Passo 2: criar e preparar o D1](#passo-2-criar-e-preparar-o-d1)
- [Passo 3: implantar o Worker](#passo-3-implantar-o-worker-backend)
- [Passo 4: implantar o Pages](#passo-4-implantar-o-pages-frontend)
- [Primeiro acesso](#primeiro-acesso)
- [Configuração e segurança](#configuração-e-segurança)
- [URLs de CDN](#urls-de-cdn)
- [Domínio personalizado](#domínio-personalizado)
- [Diagnóstico](#diagnóstico)
- [Desenvolvimento local](#desenvolvimento-local-opcional)

---

## Visão geral

O **Serverless CDN Orchestrator** permite administrar arquivos estáticos em um repositório GitHub por uma interface web protegida. O backend executa em Cloudflare Workers, registra metadados no Cloudflare D1 e usa a API GitHub para criar, atualizar ou remover arquivos na origem configurada. O frontend é entregue pelo Cloudflare Pages.

O desenho separa três responsabilidades:

- 🗂️ **GitHub:** origem persistente para imagens e demais assets publicados.
- ⚙️ **Cloudflare Worker:** API segura que valida o token de upload, comunica-se com GitHub e acessa o banco D1.
- 🖥️ **Cloudflare Pages:** painel visual que consome a API do Worker.
- 🗄️ **Cloudflare D1:** banco SQL serverless que guarda os dados e metadados necessários ao sistema.
- 🌍 **jsDelivr e Cloudflare:** entrega global dos arquivos por CDN, de acordo com a URL consumida e a visibilidade do repositório.

> 💡 O fluxo recomendado é totalmente pelo navegador. Você não precisa instalar Node.js, Wrangler, Git ou usar `git clone` para colocar uma instância no ar.

## Arquitetura

```text
Administrador no navegador
          |
          v
Cloudflare Pages (painel web)
          |
          | WORKER_API_URL + UPLOAD_TOKEN
          v
Cloudflare Worker (API e autenticação)
          |                         |
          | GitHub API              | binding DB
          v                         v
Repositório de assets          Cloudflare D1
          |
          v
GitHub raw / jsDelivr CDN / URLs públicas
```

## Pré-requisitos

Antes de começar, tenha:

1. Uma conta no [GitHub](https://github.com/signup).
2. Uma conta na [Cloudflare](https://dash.cloudflare.com/sign-up).
3. Um repositório GitHub que será usado exclusivamente ou principalmente para armazenar seus arquivos de CDN.
4. Um **Personal Access Token** do GitHub autorizado para ler e escrever no repositório de assets.
5. Cerca de 10 a 20 minutos para concluir as duas implantações: Worker e Pages.

> 📌 Uma conta GitHub é obrigatória porque o backend utiliza a API GitHub e porque o deploy conectado ao Git cria implantações a partir de um repositório. O repositório de assets pode ser público ou privado, mas a estratégia de URL e acesso muda conforme essa escolha.

---

## Instalação pelo navegador (recomendada)

A implantação completa possui quatro etapas, todas realizadas na interface Cloudflare e GitHub:

1. Fazer um fork deste projeto para sua conta GitHub.
2. Criar o repositório que receberá as imagens e outros arquivos.
3. Criar e inicializar o banco Cloudflare D1.
4. Conectar o fork duas vezes no Cloudflare: uma vez como **Worker** para o backend e outra vez como **Pages** para o frontend.

> ⚠️ **Não confunda o fork do sistema com o repositório de assets.** O fork contém o código do Worker e do painel. O repositório de assets é o destino onde suas imagens, arquivos e conteúdo de CDN serão armazenados.

### Implantação em um clique

Se este repositório possuir um botão **Deploy to Cloudflare** configurado, ele pode acelerar a criação do Worker e de bindings descritos no arquivo de configuração. Ainda assim, este projeto possui uma arquitetura com **duas aplicações**:

- um **Worker** para backend, API GitHub e binding D1;
- um projeto **Pages** para a interface visual.

Portanto, depois de qualquer implantação automatizada do Worker, você ainda deve confirmar os secrets, vincular o banco D1 correto, executar o `schema.sql` e publicar o Pages com `WORKER_API_URL` configurada. O botão não deve ser interpretado como substituto dessas validações.

Para criar um botão no seu fork, substitua `SEU_USUARIO` e o nome do repositório nesta URL:

```md
[![Implantar no Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/SEU_USUARIO/cdn-manager-worker)
```

---

## Passo 1: preparar o GitHub

### 1.1 Fazer fork do projeto

1. Abra o repositório deste projeto no GitHub.
2. Clique em **Fork**.
3. Selecione sua conta GitHub como destino.
4. Mantenha o fork como público ou privado de acordo com sua política de acesso.
5. Aguarde a criação do repositório na sua conta.

O fork será conectado ao Cloudflare para criar o Worker e o Pages. Não é necessário cloná-lo localmente para este guia.

### 1.2 Criar o repositório de assets

Crie um segundo repositório para seus arquivos:

1. No GitHub, clique em **New repository**.
2. Defina um nome explícito, por exemplo `minha-cdn-assets`.
3. Escolha a visibilidade desejada.
4. Clique em **Create repository**.

O nome criado será usado posteriormente como `GITHUB_REPO`. Se o repositório for `minha-cdn-assets` e seu usuário for `meuusuario`, os valores serão:

```text
GITHUB_USER=meuusuario
GITHUB_REPO=minha-cdn-assets
```

> 🌐 Para consumir arquivos diretamente pela CDN pública do jsDelivr, o repositório normalmente precisa estar publicamente acessível. Avalie a visibilidade e nunca publique conteúdo confidencial, dados pessoais, backups ou chaves de API nesse repositório.

### 1.3 Criar o token de acesso do GitHub

O Worker precisa de um token que possa criar e atualizar arquivos no repositório de assets.

**Opção recomendada: fine-grained Personal Access Token**

1. No GitHub, abra **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**.
2. Clique em **Generate new token**.
3. Defina um nome identificável, como `cdn-manager-worker`.
4. Escolha uma data de expiração adequada.
5. Em **Repository access**, selecione somente o repositório de assets criado na etapa anterior.
6. Em **Repository permissions**, conceda **Contents: Read and write**.
7. Gere o token e copie-o imediatamente para um gerenciador de senhas.

**Alternativa compatível: classic Personal Access Token**

Se o projeto exigir token clássico, gere um token em **Tokens (classic)** com o escopo `repo`. Esse escopo é mais amplo; prefira o token fine-grained limitado a um único repositório quando o fluxo do projeto for compatível.

> 🔒 O GitHub mostra o token completo apenas uma vez. Guarde-o em local seguro. Ele será cadastrado no Cloudflare como `GITHUB_TOKEN`; não o coloque em commits, arquivos `.env` enviados ao GitHub, capturas de tela ou código do frontend.

---

## Passo 2: criar e preparar o D1

O D1 é o banco SQL serverless do projeto. O Worker precisa de um binding chamado exatamente `DB` para acessá-lo.

### 2.1 Criar o banco

1. Acesse o [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Abra **Workers & Pages**.
3. Procure a área de armazenamento, bancos de dados ou **D1 SQL Database**.
4. Clique em **Create database**.
5. Informe um nome descritivo, por exemplo:

```text
cdn-manager-db
```

6. Clique em **Create**.
7. Abra o banco recém-criado e registre o nome e o ID do banco para referência administrativa.

### 2.2 Executar o schema.sql pelo Dashboard

1. No repositório do fork, localize o arquivo `schema.sql`.
2. Abra o arquivo e copie todo o seu conteúdo.
3. No Cloudflare Dashboard, abra o banco D1 criado.
4. Acesse a aba **Console**.
5. Cole integralmente o conteúdo de `schema.sql`.
6. Clique em **Execute**.
7. Confirme que o console não exibiu erro SQL.

> ✅ Execute o schema antes de usar o painel. Sem as tabelas e índices do `schema.sql`, o Worker pode responder com erros de banco ou falhar ao listar e registrar assets.

### 2.3 Verificação rápida

No console do D1, execute uma consulta simples compatível com o schema do projeto, por exemplo uma consulta de listagem em uma tabela criada pelo arquivo. A tabela exata depende do `schema.sql`; não invente nomes de tabelas se o arquivo usar outra estrutura.

---

## Passo 3: implantar o Worker (backend)

O Worker é a API do sistema. Ele guarda os secrets, valida o `UPLOAD_TOKEN`, conversa com a API GitHub e usa o binding D1.

### 3.1 Conectar o fork ao Cloudflare

1. No Cloudflare Dashboard, abra **Workers & Pages**.
2. Clique em **Create application**.
3. Escolha o fluxo de criação/importação de **Worker** a partir de um repositório Git.
4. Conecte sua conta GitHub caso seja solicitado.
5. Selecione o **fork deste projeto**, e não o repositório de assets.
6. Escolha a branch de produção, normalmente `main`.
7. Avance para a tela de configuração.

O Cloudflare lê a configuração do repositório. Revise os valores detectados antes de implantar.

### 3.2 Configurar variáveis e secrets

Na área de **Settings** → **Variables and Secrets** do Worker, configure os valores abaixo. Marque tokens e senhas como **secret**.

| Nome | Tipo recomendado | Exemplo | Finalidade |
|---|---|---|---|
| `GITHUB_USER` | Variável | `meuusuario` | Seu nome de usuário ou organização no GitHub |
| `GITHUB_REPO` | Variável | `minha-cdn-assets` | Repositório que armazenará os arquivos |
| `GITHUB_TOKEN` | Secret | Token GitHub | Permite ao Worker criar, alterar e ler conteúdo via API GitHub |
| `UPLOAD_TOKEN` | Secret | Token aleatório longo | Senha de acesso ao painel e às operações protegidas |

Crie um `UPLOAD_TOKEN` longo, aleatório e exclusivo. Recomenda-se no mínimo 24 caracteres, com letras maiúsculas, minúsculas, números e símbolos. Exemplo de formato — **não reutilize este valor**:

```text
T9!cdnQm7Vx#4Ra2Lp8Zk6HwD
```

No Linux, macOS ou WSL, você pode gerar um token localmente:

```bash
openssl rand -base64 32 | tr -d '\n'
```

### 3.3 Vincular o D1 ao Worker

Ainda nas configurações do Worker:

1. Abra **Bindings**.
2. Clique em **Add binding**.
3. Selecione **D1 database**.
4. No nome da variável ou binding, digite exatamente:

```text
DB
```

5. Selecione o banco `cdn-manager-db` — ou o nome que você criou.
6. Salve e faça o deploy da alteração.

> ⚠️ O nome do binding deve ser `DB`. Alterá-lo para outro nome faz com que o código que espera `env.DB` não encontre o banco.

### 3.4 Implantar e copiar a URL

Clique em **Deploy** ou **Save and Deploy**. Ao terminar, o Cloudflare fornecerá uma URL semelhante a:

```text
https://cdn-manager-worker.SEUSUBDOMINIO.workers.dev
```

Copie a URL completa **sem adicionar uma barra `/` ao final**. Ela será usada no Pages como `WORKER_API_URL`.

> 📌 Guarde essa URL. Não use a URL do Pages nesta etapa; o Pages ainda será criado no passo seguinte.

---

## Passo 4: implantar o Pages (frontend)

O Pages entrega a interface gráfica. Ele deve apontar para a URL do Worker criada no passo anterior.

### 4.1 Criar o projeto Pages

1. No Cloudflare Dashboard, abra **Workers & Pages**.
2. Clique em **Create application**.
3. Escolha a aba **Pages**.
4. Selecione **Import an existing Git repository** ou **Connect to Git**.
5. Escolha novamente o **fork deste projeto**.
6. Selecione a branch de produção, normalmente `main`.

### 4.2 Configurações de build

Preencha os campos conforme a estrutura deste projeto:

| Campo do Cloudflare Pages | Valor |
|---|---|
| Framework preset | `None` |
| Build command | `bash build.sh` |
| Build output directory | `public` |
| Production branch | `main` ou a branch principal efetivamente usada no fork |

O comando `bash build.sh` prepara os arquivos do frontend e o diretório `public` é o conteúdo estático que será publicado pelo Pages. Não altere esses valores sem revisar primeiro o arquivo `build.sh` e a estrutura do projeto.

### 4.3 Configurar WORKER_API_URL

Antes de implantar, abra a área de variáveis de ambiente avançadas e adicione:

| Variável | Valor |
|---|---|
| `WORKER_API_URL` | URL do Worker copiada no Passo 3, sem `/` ao final |

Exemplo correto:

```text
WORKER_API_URL=https://cdn-manager-worker.SEUSUBDOMINIO.workers.dev
```

Exemplo incorreto:

```text
WORKER_API_URL=https://cdn-manager-worker.SEUSUBDOMINIO.workers.dev/
```

> ⚠️ `WORKER_API_URL` deve apontar para o **Worker**, não para a URL `.pages.dev` do frontend. Se apontar para o Pages, o painel tentará chamar a si mesmo e as operações da API falharão.

### 4.4 Publicar o painel

1. Clique em **Save and Deploy**.
2. Aguarde o log de build concluir sem erros.
3. Copie a URL publicada, normalmente no formato:

```text
https://NOME-DO-PROJETO.pages.dev
```

4. Abra a URL no navegador.

---

## Primeiro acesso

1. Acesse a URL `.pages.dev` criada pelo Cloudflare Pages.
2. Informe o valor de `UPLOAD_TOKEN` quando o painel solicitar autenticação.
3. Faça um upload de teste com um arquivo não confidencial.
4. Verifique no GitHub se o arquivo foi criado no repositório de assets correto.
5. Copie a URL pública ou URL de CDN gerada pelo painel e teste-a em uma aba anônima do navegador.

> ✅ Se o upload chegar ao repositório correto e a URL abrir o arquivo esperado, Worker, D1, GitHub e Pages estão integrados corretamente.

---

## Configuração e segurança

### Proteção de credenciais

| Credencial | Onde deve ficar | Onde nunca deve ficar |
|---|---|---|
| `GITHUB_TOKEN` | Secret do Cloudflare Worker e gerenciador de senhas | Frontend, Git, README, logs e screenshots |
| `UPLOAD_TOKEN` | Secret do Cloudflare Worker e gerenciador de senhas | Frontend público, Git, README e URLs |
| `WORKER_API_URL` | Variável de build do Cloudflare Pages | Pode ser pública; não é uma credencial |

### Rotação de tokens

Se um token foi exposto:

1. Revogue o token GitHub imediatamente e crie outro com acesso mínimo.
2. Gere um novo `UPLOAD_TOKEN`.
3. Atualize os secrets do Worker.
4. Faça deploy da nova configuração.
5. Atualize os usuários, integrações ou navegadores autorizados.
6. Revise o repositório de assets e o histórico de atividade GitHub.

### Repositório público ou privado

- **Público:** mais simples para distribuição por CDN pública e leitura sem autenticação. Não use para arquivos privados.
- **Privado:** protege a leitura no GitHub, mas pode impedir ou alterar o comportamento de serviços de CDN públicos. Planeje uma camada autenticada de entrega se os arquivos forem sigilosos.

### Boas práticas de conteúdo

- Não envie arquivos contendo segredos, dados pessoais, backups de banco ou conteúdo confidencial.
- Use nomes de arquivos previsíveis e diretórios organizados, por exemplo `images/2026/08/banner.webp`.
- Defina política de limpeza para versões antigas e arquivos sem uso.
- Revise limites de armazenamento, tamanho de arquivo e termos de uso do GitHub e da CDN escolhida antes de usar o sistema como armazenamento de alto volume.

---

## URLs de CDN

Depois de enviar um arquivo, a forma de consumo depende da estratégia do projeto e da visibilidade do repositório.

### URL raw do GitHub

O GitHub permite acessar conteúdo bruto de um repositório. É útil para inspeção e desenvolvimento, mas não deve ser tratado automaticamente como uma CDN dedicada de alto volume.

Estrutura ilustrativa:

```text
https://raw.githubusercontent.com/USUARIO/REPOSITORIO/BRANCH/caminho/do/arquivo.png
```

### URL jsDelivr

Para repositórios públicos suportados pelo jsDelivr, uma URL típica usa a seguinte estrutura:

```text
https://cdn.jsdelivr.net/gh/USUARIO/REPOSITORIO@BRANCH/caminho/do/arquivo.png
```

Exemplo ilustrativo:

```text
https://cdn.jsdelivr.net/gh/meuusuario/minha-cdn-assets@main/images/logo.webp
```

> ⚠️ Para conteúdo que deve permanecer imutável, prefira referenciar uma tag ou commit em vez de uma branch móvel, quando a sua estratégia de publicação permitir. Isso evita que o mesmo endereço entregue um arquivo alterado posteriormente.

---

## Domínio personalizado

Você pode adicionar domínios próprios aos dois componentes:

| Componente | Exemplo | Uso |
|---|---|---|
| Cloudflare Worker | `api.cdn.seudominio.com` | API de upload, gerenciamento e autenticação |
| Cloudflare Pages | `cdn.seudominio.com` | Painel administrativo web |

### Configurar no Cloudflare

1. Garanta que o domínio esteja no Cloudflare e com DNS gerenciado pela Cloudflare.
2. Abra o Worker ou projeto Pages desejado em **Workers & Pages**.
3. Abra **Custom Domains** ou **Triggers**, conforme a tela do produto.
4. Clique em **Add Custom Domain**.
5. Informe o subdomínio desejado e conclua o fluxo.
6. Se você alterar o domínio do Worker, atualize `WORKER_API_URL` no projeto Pages e faça um novo deploy do Pages.

---

## Diagnóstico

### Checklist pós-implantação

- [ ] O `schema.sql` foi executado no banco D1 correto.
- [ ] O Worker possui o binding D1 chamado exatamente `DB`.
- [ ] `GITHUB_USER` e `GITHUB_REPO` apontam para o repositório de assets correto.
- [ ] `GITHUB_TOKEN` está cadastrado como secret e tem permissão de escrita no repositório.
- [ ] `UPLOAD_TOKEN` está cadastrado como secret e não foi exposto no frontend.
- [ ] `WORKER_API_URL` usa a URL do Worker sem barra final.
- [ ] O Pages foi publicado com `bash build.sh` e diretório `public`.
- [ ] Um upload de teste cria o arquivo no repositório de assets.

### Problemas comuns

| Sintoma | Causa provável | Como corrigir |
|---|---|---|
| O painel abre, mas o upload falha | `WORKER_API_URL` está incorreta ou o Worker não foi implantado | Confirme a URL do Worker, sem `/` final, e faça novo deploy do Pages |
| Erro de autenticação GitHub | Token expirado, sem permissão ou repositório errado | Gere/atualize o token com acesso ao repositório e atualize `GITHUB_TOKEN` |
| Erro de banco ou tabela inexistente | `schema.sql` não foi executado ou binding está errado | Execute o schema no D1 e confirme o binding `DB` |
| Worker não encontra o banco | Binding foi criado com nome diferente de `DB` | Edite o binding e use exatamente `DB` |
| Upload aparece em outro repositório | `GITHUB_USER` ou `GITHUB_REPO` contém valor incorreto | Corrija as variáveis no Worker e faça deploy |
| Pages falha no build | Comando ou diretório de saída não correspondem ao projeto | Use `bash build.sh` e `public`; consulte os logs de build |
| Arquivo não abre pelo jsDelivr | Repositório/branch/caminho inválido ou conteúdo privado | Revise a URL, visibilidade e disponibilidade do repositório |
| Página pede token continuamente | `UPLOAD_TOKEN` informado não coincide com o secret do Worker | Atualize o secret ou use o token correto |

---

## Desenvolvimento local (opcional)

Esta seção é somente para quem pretende alterar o código. Ela não é necessária para a instalação pelo navegador.

### Pré-requisitos locais

- Node.js 18 ou superior
- npm
- Git
- Wrangler CLI
- Credenciais Cloudflare e GitHub para ambiente de desenvolvimento

### Preparar o projeto

```bash
git clone https://github.com/SEU_USUARIO/cdn-manager-worker.git
cd cdn-manager-worker
npm install
```

Configure as variáveis locais sem publicar segredos. Use arquivos ignorados pelo Git e siga o contrato de bindings e variáveis do projeto.

### Validação antes de publicar alterações

```bash
npm run build
npx tsc --noEmit
git diff --check
git status
```

> 🧪 Mudanças no `schema.sql`, nos bindings D1, nas variáveis de ambiente ou no contrato de API devem ser testadas em ambiente de desenvolvimento antes de chegar à produção.

---

## Licença

Este projeto é disponibilizado sob a licença definida no arquivo [LICENSE](LICENSE), quando presente no repositório.
