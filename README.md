# Codex Hub 0.13.0

Codex Hub é um ambiente visual local para usar o Codex em atividades pessoais e empresariais sem depender do terminal. Ele conversa diretamente com o `codex app-server`, preservando autenticação, histórico, streaming, ferramentas e aprovações do Codex.

## Recursos

- vários chats independentes executando ao mesmo tempo;
- interface de conversa simples, limpa e familiar, com navegação lateral e compositor fixo;
- visualização focada em um chat ou grade opcional para acompanhar vários chats simultaneamente;
- estúdio de aparência com cores, fonte instalada personalizada, tamanho do texto, escala, arredondamento e cinco texturas opcionais;
- layouts prontos e totalmente editáveis: Simples, Terminal Linux, CMD, Terminal iOS, Hermes e OpenClaw;
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

## Comandos, skills e contexto

Digite `/` no compositor para abrir a central de comandos. Os comandos executáveis pelo Hub aparecem como **HUB**; comandos exclusivos do Codex CLI ou do aplicativo Desktop continuam disponíveis como referência e são identificados como **CLI** ou **DESKTOP**, sem simular uma execução que o App Server não ofereça.

Digite `$` ou use **Skills** para consultar o catálogo real do Codex no workspace atual. O Hub carrega primeiro apenas nome, descrição e caminho e só envia o `SKILL.md` escolhido na próxima mensagem. Isso mantém a descoberta rápida sem inserir todas as instruções no contexto de cada turno.

O botão **Contexto** mostra o consumo real de tokens reportado pelo App Server, permite anexar arquivos do workspace com busca segura e oferece compactação manual ou automática. Skills e arquivos selecionados valem apenas para a próxima mensagem e são limpos depois do envio para não repetir custo de contexto por acidente.

Enquanto uma tarefa estiver executando, o botão de envio continua disponível. A mensagem entra na fila visível do painel e o Hub usa `turn/steer` para acrescentá-la ao turno ativo. Se não houver mais um turno ativo quando ela chegar, a fila preserva a mensagem e abre o próximo turno automaticamente.

## Proteções da versão 0.13

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

A auditoria registra horário, tipo de evento, método e identificadores técnicos. Ela não registra prompts, respostas, comandos completos, conteúdo de arquivos nem credenciais.

## Permissões e Full access

Digite `/permission` para escolher o alcance dos próximos turnos:

- **Somente leitura**: sandbox de leitura e aprovações sob demanda;
- **Workspace**: leitura e escrita limitadas ao workspace aprovado, com aprovações sob demanda;
- **Full access**: sandbox irrestrito e sem solicitações de aprovação do Codex.

Na primeira vez que `/permission` for aberto em um computador novo, o Hub solicita a criação de um código local de 6 a 12 dígitos. Ele armazena somente uma derivação `scrypt`, nunca devolve o código ao navegador ou ao Git e concede a autorização apenas à sessão autenticada por 8 horas. Cinco falhas consecutivas bloqueiam novas tentativas por 15 minutos. Revogar ou deixar a autorização expirar bloqueia imediatamente novos turnos em conversas elevadas; retome-as em Workspace ou autorize novamente.

Esse código protege a interface do Hub contra uso casual não autorizado. Ele não protege contra alguém que já possua acesso administrativo ao Windows ou aos arquivos locais. Full access deve ser habilitado somente em computadores e tarefas confiáveis.

## Como usar no Pinokio

1. Abra o Pinokio e selecione **Codex Hub**.
2. Na primeira execução, clique em **Instalar Codex Hub**.
3. Clique em **Iniciar**.
4. Abra **Codex Hub** quando o item aparecer no menu.
5. Selecione um workspace e crie quantos painéis precisar.

Cada painel representa um thread independente. Uma tarefa pode continuar executando enquanto você trabalha em outro painel.

Abra **Configurações → Aparência** para escolher um layout pronto ou criar o seu. A prévia e a interface mudam em tempo real; **Salvar** mantém o tema neste navegador e fechar a janela cancela alterações ainda não salvas. As texturas são leves e feitas em CSS, sem canvas animado no plano de fundo.

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

## Instalar em outro computador

1. Confirme a autorização da empresa antes de usar o notebook corporativo.
2. Instale Pinokio, Node.js 20 ou superior, pnpm e Codex CLI pelos canais aprovados.
3. No Pinokio, abra **Discover/Download** e informe `https://github.com/skrtt777/codex-hub.git`.
4. Autorize o GitHub no computador quando o repositório privado solicitar autenticação.
5. Abra **Codex Hub** e execute **Instalar Codex Hub**.
6. Clique em **Iniciar** e faça login no Codex usando a conta permitida para aquele equipamento.
7. Abra `/permission` e crie o código local daquele computador.
8. Cadastre novamente somente os workspaces autorizados naquele computador.

Para receber versões futuras, pare o Hub, clique em **Atualizar** no Pinokio e inicie novamente. O `update.js` usa atualização Git somente por avanço direto (`git pull --ff-only`) e reinstala as dependências declaradas.

O repositório não contém `app/data`, `logs`, `app/node_modules`, `.codex`, tokens, cookies, código de Full access ou arquivos de credenciais. Cada instalação começa com configuração de segurança e workspaces independentes.

O estado visual de painéis fica no armazenamento local do navegador. O histórico real continua sendo administrado pelo Codex.

## Desenvolvimento e validação

Dentro da pasta `app`:

```powershell
pnpm install
pnpm run check
pnpm start
```

O processo imprime uma URL como `http://127.0.0.1:42003`. A porta pode ser definida em `PORT`; quando omitida, o sistema escolhe uma porta livre.

Para executar o teste de segurança e concorrência contra uma instância iniciada:

```powershell
$env:HUB_WS_URL = "ws://127.0.0.1:42003/ws"
pnpm run smoke
```

O teste valida sessão, origem, CSRF, allowlist RPC, workspaces, dois threads simultâneos e isolamento entre clientes.

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
│   ├── package.json
│   ├── server.js
│   └── smoke-test.js
├── install.js           instala dependências
├── start.js             inicia e captura a URL local
├── update.js            atualiza dependências
├── reset.js             remove apenas dependências locais
├── pinokio.js           menu dinâmico
└── pinokio.json         metadados
```

## Referência técnica

O protocolo, o ciclo de vida e a incorporação de mensagens em turnos ativos são baseados no [Codex App Server](https://learn.chatgpt.com/docs/app-server). As aprovações e o sandbox seguem o modelo de [permissões do Codex](https://learn.chatgpt.com/docs/permissions). O navegador escolhe apenas um perfil nominal; o servidor deriva e impõe a política efetiva.
