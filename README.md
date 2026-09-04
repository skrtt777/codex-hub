# Codex Hub 0.21.0

Codex Hub é um ambiente visual local para usar o Codex em atividades pessoais e empresariais sem depender do terminal. Ele conversa diretamente com o `codex app-server`, preservando autenticação, histórico, streaming, ferramentas e aprovações do Codex.

## Recursos

- vários chats independentes executando ao mesmo tempo;
- shell terminal reconstruído a partir da composição pública do Claude Code: barra mínima, bloco de sessão, transcrição operacional, prompt delimitado e rodapé técnico, com código próprio e o AI Companion original Nexo;
- visualização focada em um chat ou grade opcional para acompanhar vários chats simultaneamente;
- estúdio de aparência com cores, fonte instalada personalizada, tamanho do texto, escala, arredondamento e cinco texturas opcionais;
- layouts prontos e totalmente editáveis: Codex Terminal, Simples, Terminal Linux, CMD, Terminal iOS, Hermes e OpenClaw;
- controle de navegador por chat e sessões temporárias de Computer Use no Windows, com parada de emergência e auditoria;
- workspaces aprovados por pasta, com troca rápida de contexto;
- histórico e retomada de conversas existentes;
- carregamento paginado de conversas grandes e do histórico lateral, evitando travamentos por excesso de memória;
- streaming de respostas, comandos e alterações;
- interrupção individual de cada chat;
- fila por chat: mensagens enviadas durante uma execução são incorporadas ao turno ativo e, se ele terminar antes, iniciam automaticamente o próximo turno;
- central de aprovações e perguntas do Codex;
- centro `/permission` com modos Somente leitura, Workspace e Full access protegido;
- auditoria local de eventos de segurança;
- layout responsivo para desktop, notebook, tablet e celular.
- animações curtas ligadas a estados reais e respeito automático a `prefers-reduced-motion`;
- Nexo reage ao foco do compositor, análise, processamento, programação, busca, leitura, ferramentas, memória, aprovações, conclusão, erro e desconexão, pausando automaticamente quando a aba fica oculta.
- Memory Engine local com escopos de usuário, workspace e organização, proveniência, retenção, busca, versionamento e exclusão auditável;
- Centro de Inteligência com pacotes oficiais de Microsoft Fabric e Power BI fixados por revisão;
- MCP Control Center com Power BI, Fabric, Power Platform e Azure, leitura por padrão e registro pelo CLI oficial do Codex;
- política empresarial local para papéis, retenção, telemetria e aprovações de escrita.

## AI Companion Nexo

O Nexo vive em um dock responsivo ao lado do compositor. O personagem é um SVG original segmentado em cabeça, visor, olhos, boca, antena, corpo, braços e pernas; o ícone estático mantém os mesmos elementos e fundo transparente. A implementação usa Web Component e eventos nativos, sem vídeo, GIF, React, Rive ou dependências adicionais.

O frontend traduz somente eventos operacionais seguros do App Server para o barramento `AICompanionBus`: início do turno, tipo de ferramenta, deltas de execução, busca, leitura, acesso a contexto, aprovação, conclusão e erro. O componente possui sua própria máquina de estados e não conhece regras de chat, RPC ou permissões. Eye tracking é limitado a 3 px no eixo X e 2 px no eixo Y; animações param com a aba oculta, respeitam `prefers-reduced-motion` e o modo de repouso é ativado após três minutos sem atividade.

## Shell Claude Code

A composição visual principal fica isolada em `public/claude-code-shell.css`. Ela substitui o dashboard anterior por um viewport de terminal contínuo, mantém drawers para chats e aprovações e reaproveita os contratos DOM já conectados ao App Server. Nenhum código do Claude Code é incorporado; a implementação visual do Hub é própria e preserva todas as funções existentes.

## Comandos, skills e contexto

Digite `/` no compositor para abrir a central de comandos. Os comandos executáveis pelo Hub aparecem como **HUB**; comandos exclusivos do Codex CLI ou do aplicativo Desktop continuam disponíveis como referência e são identificados como **CLI** ou **DESKTOP**, sem simular uma execução que o App Server não ofereça. Os atalhos `/explicar`, `/refatorar`, `/testar`, `/documentar`, `/segurança` e `/deploy` transformam ações recorrentes em instruções completas e verificáveis.

Use **Ctrl+K** para pesquisar em uma única central por chats abertos, comandos, arquivos e contexto, skills, agentes, configurações e workspaces. A seleção pode ser operada com setas, Enter e Esc.

Digite `$` ou use **Skills** para consultar o catálogo real do Codex no workspace atual. O Hub carrega primeiro apenas nome, descrição e caminho e só envia o `SKILL.md` escolhido na próxima mensagem. Isso mantém a descoberta rápida sem inserir todas as instruções no contexto de cada turno.

O botão **Contexto** mostra o consumo real de tokens reportado pelo App Server, permite anexar arquivos do workspace com busca segura e oferece compactação manual ou automática. Skills e arquivos selecionados valem apenas para a próxima mensagem e são limpos depois do envio para não repetir custo de contexto por acidente.

Enquanto uma tarefa estiver executando, o botão de envio continua disponível. A mensagem entra na fila visível do painel e o Hub usa `turn/steer` para acrescentá-la ao turno ativo. Se não houver mais um turno ativo quando ela chegar, a fila preserva a mensagem e abre o próximo turno automaticamente.

## Centro de Inteligência

Abra **Inteligência** na barra lateral ou use `/memory`, `/knowledge`, `/mcp` e `/enterprise`.

O Memory Engine grava eventos append-only em `app/data/memory/events.jsonl`. As memórias possuem escopo, tipo, fonte, sensibilidade, confiança, retenção e versão. `/remember <informação>` salva um fato no workspace e `/forget <id>` o remove. Até cinco registros relevantes são recuperados por turno; o conteúdo entra como referência não confiável, nunca como instrução privilegiada. Memórias restritas não são injetadas automaticamente, e padrões reconhecíveis de senhas, tokens e chaves privadas são recusados.

Knowledge Packs podem usar uma pasta aprovada ou instalar, sob demanda, fontes de uma allowlist oficial. A instalação usa clone seletivo, registra o commit exato e mantém o conteúdo em `app/data`, fora do Git. A busca é local, limitada e cacheada. Os pacotes iniciais são [Microsoft Skills for Fabric](https://github.com/microsoft/skills-for-fabric) e [Fabric MCP Server](https://github.com/microsoft/mcp/tree/main/servers/Fabric.Mcp.Server).

O MCP Control Center administra [Power BI Modeling MCP](https://github.com/microsoft/powerbi-modeling-mcp), Fabric Knowledge, Power Platform CLI e Azure MCP. Ao ativar, o Hub usa `codex mcp add` com um nome `codex-hub-*`; ao desativar, remove somente esse registro. **Recarregar conectores** reinicia apenas a ponte do Codex e é recusado enquanto houver um turno ativo.

Como a edição local não consegue interceptar todas as operações dentro de um processo MCP, a política empresarial bloqueia conectores com escrita por padrão. Para liberá-los, o administrador precisa desativar conscientemente esse bloqueio e ativar Full access. Isso não substitui permissões de menor privilégio no serviço Microsoft.

O Power BI Modeling MCP permanece uma integração opcional instalada pelo cliente. Sua versão preview exige aceite explícito e não deve ser redistribuída como parte de uma oferta comercial sem permissão da Microsoft. Consulte [EULA](https://github.com/microsoft/powerbi-modeling-mcp/blob/main/EULA.txt) e `THIRD_PARTY_NOTICES.md`.

## Proteções da versão 0.21

- servidor restrito a `127.0.0.1`;
- sessão local aleatória em cookie `HttpOnly` e `SameSite=Strict`;
- validação de `Host` e `Origin` nas conexões HTTP e WebSocket;
- proteção CSRF nas operações que alteram configuração;
- allowlist dos métodos RPC aceitos pelo navegador;
- isolamento de threads, notificações e aprovações por cliente conectado;
- limite de mensagens, operações pendentes e tamanho de payload;
- política de sandbox e aprovação derivada exclusivamente no servidor a partir do modo selecionado;
- acesso somente ao workspace aprovado e seus descendentes;
- bloqueio da aprovação de uma unidade inteira, como `C:\` ou `F:\`;
- auditoria com retenção padrão de 30 dias.
- conectores MCP em leitura por padrão, com elevação condicionada a Full access;
- fontes de conhecimento remoto limitadas a repositórios oficiais allowlisted;
- rejeição de segredos na memória e tratamento de memórias recuperadas como dados não confiáveis.

A auditoria registra horário, tipo de evento, método e identificadores técnicos. Ela não registra prompts, respostas, comandos completos, conteúdo de arquivos nem credenciais.

## Permissões e Full access

Digite `/permission` para escolher o alcance dos próximos turnos:

- **Somente leitura**: sandbox de leitura e aprovações sob demanda;
- **Workspace**: leitura e escrita limitadas ao workspace aprovado, com aprovações sob demanda;
- **Full access**: sandbox irrestrito; comandos e alterações rotineiras são liberados automaticamente, enquanto rede, credenciais, exclusões, publicação, novas raízes e formulários externos continuam exigindo decisão explícita.

Na primeira vez que `/permission` for aberto em um computador novo, o Hub solicita a criação de um código local de 6 a 12 dígitos. Ele armazena somente uma derivação `scrypt`, nunca devolve o código ao navegador ou ao Git e concede a autorização apenas à sessão autenticada por 8 horas. Cinco falhas consecutivas bloqueiam novas tentativas por 15 minutos. Revogar ou deixar a autorização expirar bloqueia imediatamente novos turnos em conversas elevadas; retome-as em Workspace ou autorize novamente.

A central de aprovações entende os formatos atuais e legados do App Server. Solicitações MCP de formulário ou URL oferecem **Aceitar**, **Recusar** e **Cancelar**; quando há campos, o Hub valida e envia os valores estruturados exigidos pela integração.

Esse código protege a interface do Hub contra uso casual não autorizado. Ele não protege contra alguém que já possua acesso administrativo ao Windows ou aos arquivos locais. Full access deve ser habilitado somente em computadores e tarefas confiáveis.

## Como usar no Pinokio

1. Abra o Pinokio e selecione **Codex Hub**.
2. Na primeira execução, clique em **Instalar Codex Hub**.
3. Clique em **Iniciar**.
4. Abra **Codex Hub** quando o item aparecer no menu.
5. Selecione um workspace e crie quantos painéis precisar.

Cada painel representa um thread independente. Uma tarefa pode continuar executando enquanto você trabalha em outro painel.

Abra **Configurações → Aparência** para escolher um layout pronto ou criar o seu. A prévia e a interface mudam em tempo real; **Salvar** mantém o tema neste navegador e fechar a janela cancela alterações ainda não salvas. As texturas continuam leves. O preset Codex Terminal usa a composição de terminal com o mascote Nexo, sem vídeo, WebGL ou animações contínuas que disputem recursos com o Codex.

## Navegador e controle do computador

Cada chat possui três alcances:

- **CHAT**: conversa, arquivos, código e ferramentas normais do Codex;
- **WEB**: abre o Brave por Playwright MCP para navegação e interação com páginas, sem extensão;
- **PC**: ativa o Computer Use oficial para aplicativos gráficos do Windows.

O modo PC exige duas condições independentes: uma autorização local válida por uma sessão de trabalho de 8 horas e o servidor nativo do Computer Use conectado no Codex Desktop. O painel mostra esses estados separadamente e bloqueia o envio em modo PC quando o canal nativo do Windows está desconectado. A autorização não é salva ao fechar o Hub, não é compartilhada com outros navegadores e pode ser revogada por **Parada imediata**, que também interrompe os chats ativos daquele cliente. Ações sensíveis continuam exigindo confirmação no momento da execução.

O modo WEB usa o plugin pessoal **Brave Playwright** e uma pasta de perfil dedicada em `.codex/browser-profiles/brave-playwright`. Esse perfil preserva logins feitos na janela gerenciada, mas não acessa cookies, abas ou extensões do perfil pessoal do Brave. Em outro computador, instale esse plugin e ajuste o caminho do executável do Brave quando necessário. Para o modo PC, habilite o plugin oficial **Computer Use** no Codex. Se uma política empresarial ou MDM bloquear o recurso, o Hub o mostrará como indisponível e não tentará contornar a restrição.

## Workspaces

O Hub autoriza automaticamente apenas:

- a própria pasta da aplicação, como **Codex Hub**;
- `F:\Bot_HLL2.0`, como **Central 2RB**, quando ela existir;
- pastas configuradas pelo administrador em `HUB_WORKSPACE_PATHS`.

Outras pastas devem ser cadastradas em **Workspace → adicionar**. O caminho precisa ser absoluto, existir e não pode ser a raiz de uma unidade. Workspaces adicionados ficam em `app/data/config.json` e podem ser removidos pela interface.

## Uso pessoal e empresarial no mesmo Hub

Não existem duas edições separadas. A separação é feita por workspace e por conversa:

- cadastre projetos pessoais e corporativos como workspaces distintos;
- abra um chat novo ao mudar de projeto ou finalidade;
- use **Somente leitura** para auditorias, consultas e máquinas mais restritas;
- revise cada aprovação antes de permitir gravação, execução externa ou acesso adicional;
- nunca misture código, credenciais ou dados da empresa em um workspace pessoal.

O Hub melhora o controle técnico, mas não substitui as políticas da empresa. Em um notebook corporativo, instale somente com autorização de TI/Segurança e verifique regras de software, IA generativa, propriedade intelectual, retenção, telemetria, rede e classificação de dados.

“Somente nesta máquina” descreve a persistência do Hub. Quando uma memória ou trecho de conhecimento é usado em uma resposta, esse trecho é enviado ao modelo configurado no Codex e segue os termos e controles dessa conta. Não armazene dados cuja política proíba esse processamento.

## Instalar em outro computador

> **Importante:** o Codex Hub é um aplicativo Pinokio. Não cole o link em **Ask Pinokio → Tasks → Download**. Essa tela aceita pacotes de prompt com `task.md` e rejeitará corretamente este repositório de aplicativo.

1. Confirme a autorização da empresa antes de usar o notebook corporativo.
2. Instale Pinokio, Node.js 20 ou superior, pnpm e Codex CLI pelos canais aprovados.
3. Na área de **aplicativos** do Pinokio, abra **Discover/Download** e informe `https://github.com/skrtt777/codex-hub.git`.
4. Autorize o GitHub no computador quando o repositório privado solicitar autenticação.
5. Abra **Codex Hub** e execute **Instalar Codex Hub**.
6. Clique em **Iniciar** e faça login no Codex usando a conta permitida para aquele equipamento.
7. Abra `/permission` e crie o código local daquele computador.
8. Cadastre novamente somente os workspaces autorizados naquele computador.

Como alternativa, abra o terminal integrado do Pinokio e execute:

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git --hostname github.com
pterm download https://github.com/skrtt777/codex-hub.git codex-hub
```

Depois, atualize a página inicial do Pinokio e abra **Codex Hub**. O download correto ficará em `PINOKIO_HOME/api/codex-hub`; pastas `PINOKIO_HOME/tasks/t*` pertencem ao instalador de templates e não devem ser usadas para iniciar o Hub.

Para receber versões futuras, pare o Hub, clique em **Atualizar** no Pinokio e inicie novamente. O `update.js` usa atualização Git somente por avanço direto (`git pull --ff-only`) e reinstala as dependências declaradas.

O repositório não contém `app/data`, `logs`, `app/node_modules`, `.codex`, tokens, cookies, código de Full access ou arquivos de credenciais. Cada instalação começa com configuração de segurança e workspaces independentes.

O estado visual de painéis fica no armazenamento local do navegador. O histórico real continua sendo administrado pelo Codex.

## Desenvolvimento e validação

Dentro da pasta `app`:

```powershell
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run smoke
pnpm start
```

O processo imprime uma URL como `http://127.0.0.1:42003`. A porta pode ser definida em `PORT`; quando omitida, o sistema escolhe uma porta livre.

`pnpm run smoke` cria uma instância temporária em uma porta livre, usa uma pasta de dados descartável, valida também a primeira configuração do Full access e encerra tudo ao terminar. Ele não altera `app/data` nem exige que o Hub já esteja aberto.

Para executar a mesma suíte contra uma instância que já esteja iniciada:

```powershell
$env:HUB_WS_URL = "ws://127.0.0.1:42003/ws"
pnpm run smoke:connected
```

O teste valida sessão, origem, CSRF, allowlist RPC, workspaces, Full access e revogação, fila em turno ativo, catálogo de skills, contexto, histórico paginado, dois threads simultâneos, isolamento entre clientes e os contratos funcionais do novo shell desktop. Recursos opcionais de navegador e Computer Use são exercitados quando estiverem instalados, sem fazer uma instalação básica falhar quando não estiverem disponíveis.

## API HTTP local

### Saúde pública

`GET /api/health` informa versão, disponibilidade do Codex e proteções ativas, sem expor dados privados.

```javascript
const health = await fetch("http://127.0.0.1:42003/api/health").then((res) => res.json());
console.log(health.codexReady);
```

```python
import requests

health = requests.get("http://127.0.0.1:42003/api/health", timeout=5).json()
print(health["codexReady"])
```

```bash
curl http://127.0.0.1:42003/api/health
```

### Endpoints autenticados

- `GET /api/session`: cria ou renova a sessão e entrega o token CSRF ao frontend de mesma origem;
- `GET /api/workspaces`: lista workspaces aprovados;
- `GET /api/permissions`: informa o estado da autorização elevada da sessão;
- `POST /api/permissions/full-access/setup`: configura o código local somente quando ainda não existe um;
- `POST /api/permissions/full-access`: valida o código e autoriza Full access temporariamente;
- `DELETE /api/permissions/full-access`: revoga Full access da sessão;
- `POST /api/workspaces`: adiciona uma pasta aprovada;
- `DELETE /api/workspaces/:id`: remove um workspace personalizado;
- `POST /api/path/validate`: valida uma pasta local;
- `GET /api/audit?limit=200`: consulta a auditoria local.
- `GET|POST /api/memories`: busca ou cria memórias;
- `PATCH|DELETE /api/memories/:id`: altera ou remove uma memória;
- `GET /api/memories/export`: exporta memórias visíveis em JSON;
- `GET|POST /api/knowledge-packs[/...]`: lista, instala e configura fontes oficiais;
- `POST /api/knowledge-packs/search`: pesquisa as fontes conectadas;
- `GET|POST /api/mcp/connectors[/...]`: lista, registra e remove conectores;
- `GET /api/mcp/connectors/:id/snippet`: gera configuração equivalente para inspeção;
- `POST /api/codex/restart`: recarrega a ponte quando não há turnos ativos;
- `GET|PUT /api/enterprise/policy`: consulta ou altera a política local.

Operações de escrita exigem o cookie da sessão e o cabeçalho `X-Codex-Hub-CSRF`. A API foi desenhada para a interface local do Hub, não para exposição na rede.

## Ponte WebSocket

A interface usa `ws://127.0.0.1:PORT/ws`. O upgrade exige cookie de sessão e `Origin` local válido. A mensagem RPC do navegador tem o formato:

```json
{
  "type": "rpc",
  "requestId": "cliente-1",
  "method": "thread/list",
  "params": { "limit": 20 }
}
```

As respostas usam `rpcResult`, notificações usam `notification` e solicitações de aprovação usam `serverRequest`. O navegador não acessa diretamente o processo do Codex.

## Estrutura

```text
codex-hub/
├── app/                 aplicação Node.js e interface web
│   ├── data/            configuração e auditoria locais, não portáveis
│   ├── public/
│   ├── approval-policy.js       política segura de autoaprovação
│   ├── approval-policy.test.js  testes unitários da política
│   ├── memory-store.js          memória persistente e recuperação
│   ├── knowledge-packs.js       fontes Microsoft allowlisted
│   ├── mcp-control.js           registro e governança MCP
│   ├── enterprise-policy.js     papéis e política local
│   ├── package.json
│   ├── server.js
│   ├── smoke-runner.js   inicia e limpa o ambiente de teste isolado
│   └── smoke-test.js     suíte funcional e de segurança
├── install.js           instala dependências
├── start.js             inicia e captura a URL local
├── update.js            atualiza dependências
├── reset.js             remove apenas dependências locais
├── pinokio.js           menu dinâmico
└── pinokio.json         metadados
```

## Referência técnica

O protocolo, o ciclo de vida e a incorporação de mensagens em turnos ativos são baseados no [Codex App Server](https://learn.chatgpt.com/docs/app-server). As aprovações e o sandbox seguem o modelo de [permissões do Codex](https://learn.chatgpt.com/docs/permissions). O navegador escolhe apenas um perfil nominal; o servidor deriva e impõe a política efetiva.

Consulte também `SECURITY.md`, `THIRD_PARTY_NOTICES.md` e `docs/ENTERPRISE-READINESS.md` antes de distribuir o produto a uma organização.
