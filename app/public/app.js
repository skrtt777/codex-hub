"use strict";

const CLIENT_VERSION = "0.20.2";
const STORAGE_KEY = "codex-hub-state-v2";
const LEGACY_STORAGE_KEY = "codex-hub-state-v1";
const CHAT_LIMIT = 8;
const MESSAGE_QUEUE_LIMIT = 20;
const TIMELINE_RENDER_LIMIT = 180;
const COMMAND_OUTPUT_LIMIT = 64 * 1024;
const HARNESS_IDENTITY = {
  name: "Codex Hub",
  prompt: "nexo@hub:~$",
  status: "NEXO ONLINE"
};

const FONT_STACKS = {
  system: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  cascadia: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
  sfmono: '"SFMono-Regular", "SF Mono", Menlo, Monaco, monospace',
  courier: '"Courier New", Courier, monospace',
  plex: '"IBM Plex Mono", "Cascadia Code", Consolas, monospace'
};

const THEME_PRESETS = {
  core: { preset: "core", font: "cascadia", customFont: "", fontSize: 16, scale: 100, radius: 4, texture: "none", textureOpacity: 0, background: "#05343c", sidebar: "#062d34", surface: "#0a3d45", text: "#adc1c2", muted: "#557b80", accent: "#e66f51" },
  clean: { preset: "clean", font: "system", customFont: "", fontSize: 15, scale: 100, radius: 12, texture: "none", textureOpacity: 0, background: "#111111", sidebar: "#0b0b0b", surface: "#1c1c1c", text: "#ededed", muted: "#999999", accent: "#8d8dff" },
  linux: { preset: "linux", font: "cascadia", customFont: "", fontSize: 14, scale: 100, radius: 4, texture: "scanlines", textureOpacity: 10, background: "#050805", sidebar: "#030503", surface: "#0b140b", text: "#c8facc", muted: "#6fa976", accent: "#64ff7b" },
  cmd: { preset: "cmd", font: "cascadia", customFont: "", fontSize: 14, scale: 100, radius: 0, texture: "none", textureOpacity: 0, background: "#0c0c0c", sidebar: "#050505", surface: "#111111", text: "#cccccc", muted: "#808080", accent: "#16c60c" },
  ios: { preset: "ios", font: "sfmono", customFont: "", fontSize: 15, scale: 100, radius: 16, texture: "grain", textureOpacity: 8, background: "#0b0d12", sidebar: "#101218", surface: "#171a21", text: "#f4f5f7", muted: "#8e8e93", accent: "#0a84ff" },
  hermes: { preset: "hermes", font: "plex", customFont: "IBM Plex Mono", fontSize: 14, scale: 102, radius: 11, texture: "grid", textureOpacity: 16, background: "#17100b", sidebar: "#0f0b08", surface: "#21170f", text: "#efe6d4", muted: "#b89f79", accent: "#f2be57" },
  openclaw: { preset: "openclaw", font: "cascadia", customFont: "Cascadia Code", fontSize: 15, scale: 102, radius: 14, texture: "dots", textureOpacity: 16, background: "#07131b", sidebar: "#051018", surface: "#0f1a24", text: "#edf8ff", muted: "#98b3bc", accent: "#ff6a4d", terminal: { primary: "#6fffe9", secondary: "#91aeb7", warning: "#ffbf69", danger: "#ff6a4d", info: "#8db7ff" } }
};

const TEXTURES = new Set(["none", "grain", "grid", "scanlines", "dots"]);

const SLASH_COMMANDS = [
  { name: "/new", description: "Criar um novo chat no mesmo workspace.", action: "new", support: "hub" },
  { name: "/clear", description: "Começar um chat limpo sem apagar o histórico anterior.", action: "new", support: "hub" },
  { name: "/rename", description: "Renomear a conversa atual.", action: "rename", support: "hub", argument: "novo nome" },
  { name: "/compact", description: "Compactar o contexto e liberar espaço para continuar.", action: "compact", support: "hub" },
  { name: "/context", description: "Abrir uso de tokens, arquivos, skills e compactação automática.", action: "context", support: "hub" },
  { name: "/skills", description: "Pesquisar e anexar skills instaladas neste workspace.", action: "skills", support: "hub" },
  { name: "/mention", description: "Pesquisar e anexar um arquivo ou pasta do workspace.", action: "mention", support: "hub" },
  { name: "/status", description: "Exibir estado, workspace e capacidade de contexto do chat.", action: "status", support: "hub" },
  { name: "/copy", description: "Copiar a última resposta concluída do Codex.", action: "copy", support: "hub" },
  { name: "/diff", description: "Pedir ao Codex uma leitura das alterações atuais do Git.", action: "diff", support: "hub" },
  { name: "/review", description: "Iniciar revisão das alterações não commitadas.", action: "review", support: "hub" },
  { name: "/fork", description: "Criar uma ramificação independente deste chat.", action: "fork", support: "hub" },
  { name: "/plan", description: "Alternar o modo de planejamento para as próximas tarefas.", action: "plan", support: "hub" },
  { name: "/stop", description: "Interromper a execução ativa deste chat.", action: "stop", support: "hub" },
  { name: "/resume", description: "Abrir o histórico para retomar outra conversa.", action: "resume", support: "hub" },
  { name: "/side", description: "Abrir um chat lateral sem perder o atual.", action: "side", support: "hub" },
  { name: "/btw", description: "Abrir um chat lateral sem perder o atual.", action: "side", support: "hub" },
  { name: "/approve", description: "Abrir as aprovações pendentes.", action: "approvals", support: "hub" },
  { name: "/permission", description: "Escolher Somente leitura, Workspace ou Full access.", action: "permissions", support: "hub", argument: "read-only | workspace | full" },
  { name: "/permissions", description: "Abrir o centro de permissões do Hub.", action: "permissions", support: "hub" },
  { name: "/theme", description: "Abrir temas, fontes, cores e texturas do Hub.", action: "settings", support: "hub" },
  { name: "/exit", description: "Fechar o painel de chat atual.", action: "exit", support: "hub" },
  { name: "/quit", description: "Fechar o painel de chat atual.", action: "exit", support: "hub" },
  { name: "/init", description: "Solicitar a criação de um AGENTS.md para o workspace.", action: "init", support: "hub" },
  { name: "/help", description: "Mostrar todos os comandos e atalhos disponíveis.", action: "commands", support: "hub" },
  { name: "/explicar", description: "Explicar com clareza o código ou contexto atual.", action: "prompt", support: "hub", prompt: "Explique com clareza o código ou contexto atual, destacando decisões e pontos importantes." },
  { name: "/refatorar", description: "Refatorar preservando comportamento e contratos.", action: "prompt", support: "hub", prompt: "Refatore a implementação atual preservando comportamento, contratos e testes. Valide as mudanças." },
  { name: "/testar", description: "Executar os testes relevantes e investigar falhas.", action: "prompt", support: "hub", prompt: "Execute os testes relevantes deste workspace, investigue qualquer falha e apresente o resultado." },
  { name: "/documentar", description: "Atualizar documentação relevante do projeto.", action: "prompt", support: "hub", prompt: "Documente as mudanças e os fluxos relevantes deste projeto de forma clara e verificável." },
  { name: "/segurança", description: "Revisar riscos e controles de segurança.", action: "prompt", support: "hub", prompt: "Faça uma revisão de segurança focada nas mudanças atuais. Priorize riscos concretos e correções verificáveis." },
  { name: "/deploy", description: "Preparar e validar o fluxo de implantação.", action: "prompt", support: "hub", prompt: "Prepare o projeto para implantação, valide pré-requisitos e não publique nada sem autorização explícita." },
  { name: "/model", description: "Escolher o modelo ativo da sessão.", support: "cli" },
  { name: "/reasoning", description: "Escolher o esforço de raciocínio.", support: "desktop" },
  { name: "/fast", description: "Alternar o tier Fast quando o modelo oferecer suporte.", support: "cli" },
  { name: "/personality", description: "Escolher o estilo de comunicação.", support: "cli" },
  { name: "/goal", description: "Criar ou gerenciar um objetivo persistente.", support: "cli" },
  { name: "/ide", description: "Adicionar arquivos abertos e seleção do IDE.", support: "cli" },
  { name: "/keymap", description: "Configurar atalhos do TUI.", support: "cli" },
  { name: "/vim", description: "Alternar o modo Vim no compositor do TUI.", support: "cli" },
  { name: "/setup-default-sandbox", description: "Configurar o sandbox elevado no Windows.", support: "cli" },
  { name: "/sandbox-add-read-dir", description: "Dar leitura a um diretório extra no sandbox.", support: "cli" },
  { name: "/agent", description: "Alternar entre threads de agentes auxiliares.", support: "cli" },
  { name: "/subagents", description: "Listar, acompanhar e alternar agentes auxiliares.", support: "cli" },
  { name: "/apps", description: "Explorar apps e conectores.", support: "cli" },
  { name: "/plugins", description: "Explorar e gerenciar plugins.", support: "cli" },
  { name: "/hooks", description: "Visualizar e gerenciar hooks.", support: "cli" },
  { name: "/archive", description: "Arquivar a sessão e sair.", support: "cli" },
  { name: "/delete", description: "Excluir permanentemente a sessão.", support: "cli" },
  { name: "/experimental", description: "Alternar recursos experimentais.", support: "cli" },
  { name: "/memories", description: "Configurar uso e geração de memórias.", support: "cli" },
  { name: "/import", description: "Importar configuração e chats de outros agentes.", support: "cli" },
  { name: "/feedback", description: "Enviar feedback e diagnósticos.", support: "cli" },
  { name: "/logout", description: "Sair da conta do Codex.", support: "cli" },
  { name: "/mcp", description: "Listar servidores e ferramentas MCP.", support: "cli" },
  { name: "/ps", description: "Listar terminais executando em segundo plano.", support: "cli" },
  { name: "/app", description: "Continuar a sessão no aplicativo desktop.", support: "cli" },
  { name: "/raw", description: "Alternar o modo de scrollback bruto do terminal.", support: "cli" },
  { name: "/usage", description: "Exibir uso de tokens e limites da conta.", support: "cli" },
  { name: "/debug-config", description: "Exibir diagnóstico das camadas de configuração.", support: "cli" },
  { name: "/statusline", description: "Configurar os campos da linha de status.", support: "cli" },
  { name: "/title", description: "Configurar o título da janela do terminal.", support: "cli" },
  { name: "/pets", description: "Escolher ou ocultar um pet do terminal.", support: "cli" },
  { name: "/pet", description: "Escolher ou ocultar um pet do terminal.", support: "cli" },
  { name: "/cloud", description: "Executar o chat na nuvem quando disponível.", support: "desktop" },
  { name: "/cloud-environment", description: "Escolher o ambiente de execução na nuvem.", support: "desktop" },
  { name: "/ide-context", description: "Adicionar arquivos abertos e a selecao do IDE.", support: "desktop" },
  { name: "/local", description: "Voltar o chat para o workspace local.", support: "desktop" },
  { name: "/project", description: "Escolher um projeto para novos chats.", support: "desktop" },
  { name: "/worktree", description: "Executar o chat em uma nova worktree Git.", support: "desktop" }
];

const CONTEXT_COMPACT_DEFAULT = 82;

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function validColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
}

function normalizeAppearance(source = {}) {
  const requestedPreset = Object.hasOwn(THEME_PRESETS, source.preset) ? source.preset : source.preset === "custom" ? "custom" : "core";
  const base = requestedPreset === "custom" ? THEME_PRESETS.clean : THEME_PRESETS[requestedPreset];
  const font = Object.hasOwn(FONT_STACKS, source.font) ? source.font : base.font;
  return {
    preset: requestedPreset,
    font,
    customFont: String(source.customFont || "").slice(0, 80),
    fontSize: clampNumber(source.fontSize, 12, 22, base.fontSize),
    scale: clampNumber(source.scale, 80, 125, base.scale),
    radius: clampNumber(source.radius, 0, 24, base.radius),
    texture: TEXTURES.has(source.texture) ? source.texture : base.texture,
    textureOpacity: clampNumber(source.textureOpacity, 0, 30, base.textureOpacity),
    background: validColor(source.background, base.background),
    sidebar: validColor(source.sidebar, base.sidebar),
    surface: validColor(source.surface, base.surface),
    text: validColor(source.text, base.text),
    muted: validColor(source.muted, base.muted),
    accent: validColor(source.accent, base.accent)
  };
}

const elements = {
  sidebar: document.querySelector("#sidebar"),
  sidebarScrim: document.querySelector("#sidebar-scrim"),
  mobileMenu: document.querySelector("#mobile-menu"),
  sidebarClose: document.querySelector("#sidebar-close"),
  connectionCard: document.querySelector("#connection-card"),
  connectionTitle: document.querySelector("#connection-title"),
  connectionCopy: document.querySelector("#connection-copy"),
  workspaceSelect: document.querySelector("#workspace-select"),
  addWorkspace: document.querySelector("#add-workspace"),
  removeWorkspace: document.querySelector("#remove-workspace"),
  newChat: document.querySelector("#new-chat"),
  openChatList: document.querySelector("#open-chat-list"),
  historyList: document.querySelector("#history-list"),
  refreshHistory: document.querySelector("#refresh-history"),
  board: document.querySelector("#workspace-board"),
  chatTemplate: document.querySelector("#chat-template"),
  approvalButton: document.querySelector("#approval-button"),
  approvalCount: document.querySelector("#approval-count"),
  approvalDrawer: document.querySelector("#approval-drawer"),
  approvalList: document.querySelector("#approval-list"),
  closeApprovals: document.querySelector("#close-approvals"),
  drawerScrim: document.querySelector("#drawer-scrim"),
  workspaceModal: document.querySelector("#workspace-modal"),
  workspaceForm: document.querySelector("#workspace-form"),
  workspaceName: document.querySelector("#workspace-name"),
  workspacePath: document.querySelector("#workspace-path"),
  workspaceError: document.querySelector("#workspace-error"),
  openSettings: document.querySelector("#open-settings"),
  settingsModal: document.querySelector("#settings-modal"),
  restoreChats: document.querySelector("#restore-chats"),
  openPermissions: document.querySelector("#open-permissions"),
  settingsPermissionSummary: document.querySelector("#settings-permission-summary"),
  permissionModal: document.querySelector("#permission-modal"),
  permissionModeButtons: document.querySelectorAll("[data-permission-mode]"),
  fullAccessGate: document.querySelector("#full-access-gate"),
  fullAccessTitle: document.querySelector("#full-access-title"),
  fullAccessCopy: document.querySelector("#full-access-copy"),
  fullAccessUnlock: document.querySelector("#full-access-unlock"),
  fullAccessActive: document.querySelector("#full-access-active"),
  fullAccessCodeLabel: document.querySelector("#full-access-code-label"),
  fullAccessCode: document.querySelector("#full-access-code"),
  fullAccessConfirmWrap: document.querySelector("#full-access-confirm-wrap"),
  fullAccessConfirm: document.querySelector("#full-access-confirm"),
  unlockFullAccess: document.querySelector("#unlock-full-access"),
  revokeFullAccess: document.querySelector("#revoke-full-access"),
  fullAccessCountdown: document.querySelector("#full-access-countdown"),
  fullAccessError: document.querySelector("#full-access-error"),
  exportAudit: document.querySelector("#export-audit"),
  saveSettings: document.querySelector("#save-settings"),
  resetAppearance: document.querySelector("#reset-appearance"),
  themePresetGrid: document.querySelector("#theme-preset-grid"),
  themePresetButtons: document.querySelectorAll("[data-theme-preset]"),
  themeFont: document.querySelector("#theme-font"),
  themeCustomFont: document.querySelector("#theme-custom-font"),
  themeFontSize: document.querySelector("#theme-font-size"),
  themeFontSizeValue: document.querySelector("#theme-font-size-value"),
  themeScale: document.querySelector("#theme-scale"),
  themeScaleValue: document.querySelector("#theme-scale-value"),
  themeRadius: document.querySelector("#theme-radius"),
  themeRadiusValue: document.querySelector("#theme-radius-value"),
  themeTexture: document.querySelector("#theme-texture"),
  themeTextureOpacity: document.querySelector("#theme-texture-opacity"),
  themeTextureOpacityValue: document.querySelector("#theme-texture-opacity-value"),
  themeBackground: document.querySelector("#theme-background"),
  themeSidebar: document.querySelector("#theme-sidebar"),
  themeSurface: document.querySelector("#theme-surface"),
  themeText: document.querySelector("#theme-text"),
  themeMuted: document.querySelector("#theme-muted"),
  themeAccent: document.querySelector("#theme-accent"),
  themePreview: document.querySelector("#theme-preview"),
  controlButton: document.querySelector("#control-button"),
  commandCenterButton: document.querySelector("#command-center-button"),
  controlModal: document.querySelector("#control-modal"),
  controlSessionCopy: document.querySelector("#control-session-copy"),
  browserControlStatus: document.querySelector("#browser-control-status"),
  computerControlStatus: document.querySelector("#computer-control-status"),
  controlCountdown: document.querySelector("#control-countdown"),
  enableComputerControl: document.querySelector("#enable-computer-control"),
  emergencyStop: document.querySelector("#emergency-stop"),
  browserCapability: document.querySelector("#browser-capability"),
  computerCapability: document.querySelector("#computer-capability"),
  securityBadge: document.querySelector("#security-badge"),
  activeChatCount: document.querySelector("#active-chat-count"),
  systemClock: document.querySelector("#system-clock"),
  nexusField: document.querySelector("#nexus-field"),
  nexusTelemetry: document.querySelector("#nexus-telemetry"),
  nexusMode: document.querySelector("#nexus-mode"),
  missionDeck: document.querySelector("#mission-deck"),
  missionStatus: document.querySelector("#mission-status"),
  missionTitle: document.querySelector("#mission-title"),
  missionContext: document.querySelector("#mission-context"),
  missionEventCopy: document.querySelector("#mission-event-copy"),
  missionFocus: document.querySelector("#mission-focus"),
  memorySphere: document.querySelector("#memory-sphere"),
  memoryAccessLabel: document.querySelector("#memory-access-label"),
  version: document.querySelector("#version")
};

const stored = readStoredState();
const state = {
  socket: null,
  reconnectTimer: null,
  connecting: false,
  csrf: null,
  ready: false,
  requestSequence: 0,
  pendingRpc: new Map(),
  workspaces: [],
  selectedWorkspaceId: stored.selectedWorkspaceId || null,
  activeChatId: null,
  chats: [],
  history: [],
  historyCursor: null,
  loadingHistory: false,
  historyError: null,
  approvals: new Map(),
  skillsByCwd: new Map(),
  skillsLoading: new Map(),
  control: {
    capabilities: {
      browser: false,
      browserProvider: null,
      browserName: null,
      browserExtensionRequired: false,
      browserProfile: null,
      computer: false,
      computerInstalled: false,
      computerNativeConfigured: false,
      computerNativeConnected: false,
      computerSessionMinutes: 480
    },
    computerEnabledUntil: 0
  },
  layout: [3, 4, 5, 6].includes(stored.uiVersion) && stored.layout === "grid" ? "grid" : "focus",
  settings: {
    permissionMode: ["read-only", "workspace", "full"].includes(stored.settings?.permissionMode)
      ? stored.settings.permissionMode
      : stored.settings?.readOnly === true ? "read-only" : "workspace",
    restoreChats: stored.settings?.restoreChats !== false
  },
  permission: { configured: false, active: false, expiresAt: 0, lockedUntil: 0, remainingAttempts: 5, durationMinutes: 480 },
  appearance: normalizeAppearance(Number(stored.uiVersion || 0) < 6 && (!stored.appearance || stored.appearance.preset === "core") ? THEME_PRESETS.core : stored.appearance)
};

let appearanceDraft = null;

function appearanceFontStack(appearance) {
  const fallback = FONT_STACKS[appearance.font] || FONT_STACKS.system;
  const custom = String(appearance.customFont || "").replace(/["'\\]/g, "").trim();
  return custom ? `"${custom}", ${fallback}` : fallback;
}

function applyAppearance(source) {
  const appearance = normalizeAppearance(source);
  const root = document.documentElement;
  root.style.setProperty("--bg", appearance.background);
  root.style.setProperty("--bg-primary", appearance.background);
  root.style.setProperty("--bg-secondary", appearance.sidebar);
  root.style.setProperty("--sidebar", appearance.sidebar);
  root.style.setProperty("--surface", appearance.surface);
  root.style.setProperty("--text", appearance.text);
  root.style.setProperty("--muted", appearance.muted);
  root.style.setProperty("--accent", appearance.accent);
  root.style.setProperty("--green", appearance.accent);
  root.style.setProperty("--green-bright", appearance.accent);
  root.style.setProperty("--blue", appearance.accent);
  root.style.setProperty("--vibe-core", appearance.accent);
  root.style.setProperty("--vibe-veil", `color-mix(in srgb, ${appearance.accent} 11%, transparent)`);
  root.style.setProperty("--vibe-frame", `color-mix(in srgb, ${appearance.accent} 22%, transparent)`);
  root.style.setProperty("--vibe-glow", `0 0 40px color-mix(in srgb, ${appearance.accent} 16%, transparent)`);
  root.style.setProperty("--radius", `${appearance.radius}px`);
  root.style.setProperty("--font-family", appearanceFontStack(appearance));
  root.style.setProperty("--scaled-font-size", `${appearance.fontSize * appearance.scale / 100}px`);
  root.style.setProperty("--texture-opacity", `${appearance.textureOpacity / 100}`);
  root.style.setProperty("--harness-name", `"${HARNESS_IDENTITY.name}"`);
  root.style.setProperty("--terminal-primary", appearance.terminal?.primary || "#6fffe9");
  root.style.setProperty("--terminal-secondary", appearance.terminal?.secondary || appearance.muted);
  root.style.setProperty("--terminal-warning", appearance.terminal?.warning || "#ffbf69");
  root.style.setProperty("--terminal-danger", appearance.terminal?.danger || appearance.accent);
  root.style.setProperty("--terminal-info", appearance.terminal?.info || "#8db7ff");
  document.body.dataset.texture = appearance.texture;
  document.body.dataset.theme = appearance.preset;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", appearance.background);
}

function syncAppearanceControls(source) {
  const appearance = normalizeAppearance(source);
  elements.themeFont.value = appearance.font;
  elements.themeCustomFont.value = appearance.customFont;
  elements.themeFontSize.value = appearance.fontSize;
  elements.themeFontSizeValue.textContent = `${appearance.fontSize}px`;
  elements.themeScale.value = appearance.scale;
  elements.themeScaleValue.textContent = `${appearance.scale}%`;
  elements.themeRadius.value = appearance.radius;
  elements.themeRadiusValue.textContent = `${appearance.radius}px`;
  elements.themeTexture.value = appearance.texture;
  elements.themeTextureOpacity.value = appearance.textureOpacity;
  elements.themeTextureOpacityValue.textContent = `${appearance.textureOpacity}%`;
  elements.themeBackground.value = appearance.background;
  elements.themeSidebar.value = appearance.sidebar;
  elements.themeSurface.value = appearance.surface;
  elements.themeText.value = appearance.text;
  elements.themeMuted.value = appearance.muted;
  elements.themeAccent.value = appearance.accent;
  elements.themePreview.dataset.texture = appearance.texture;
  elements.themePresetButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.themePreset === appearance.preset);
  });
}

function readAppearanceControls(preset = "custom") {
  return normalizeAppearance({
    preset,
    font: elements.themeFont.value,
    customFont: elements.themeCustomFont.value,
    fontSize: elements.themeFontSize.value,
    scale: elements.themeScale.value,
    radius: elements.themeRadius.value,
    texture: elements.themeTexture.value,
    textureOpacity: elements.themeTextureOpacity.value,
    background: elements.themeBackground.value,
    sidebar: elements.themeSidebar.value,
    surface: elements.themeSurface.value,
    text: elements.themeText.value,
    muted: elements.themeMuted.value,
    accent: elements.themeAccent.value
  });
}

function setAppearanceDraft(source) {
  appearanceDraft = normalizeAppearance(source);
  syncAppearanceControls(appearanceDraft);
  applyAppearance(appearanceDraft);
}

function openAppearanceSettings() {
  appearanceDraft = normalizeAppearance(state.appearance);
  elements.restoreChats.checked = state.settings.restoreChats;
  syncAppearanceControls(appearanceDraft);
  elements.settingsModal.returnValue = "";
  elements.settingsModal.showModal();
}

function permissionLabel(mode = state.settings.permissionMode) {
  if (mode === "read-only") return "Somente leitura";
  if (mode === "full") return "Full access";
  return "Workspace";
}

function fullAccessIsActive() {
  return Boolean(state.permission.active && Number(state.permission.expiresAt) > Date.now());
}

function formatPermissionCountdown(milliseconds) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${String(minutes).padStart(2, "0")}min` : `${minutes}min`;
}

function updatePermissionUI() {
  const active = fullAccessIsActive();
  const needsSetup = !state.permission.configured;
  const lockedRemaining = Math.max(0, Number(state.permission.lockedUntil) - Date.now());
  elements.permissionModeButtons.forEach((button) => button.classList.toggle("active", button.dataset.permissionMode === state.settings.permissionMode));
  if (elements.settingsPermissionSummary) {
    elements.settingsPermissionSummary.textContent = state.settings.permissionMode === "full" && active
      ? `Full access · ${formatPermissionCountdown(state.permission.expiresAt - Date.now())}`
      : `${permissionLabel()} · aprovações ${state.settings.permissionMode === "read-only" ? "ativas" : "sob demanda"}`;
  }
  if (!elements.fullAccessGate) return;
  elements.fullAccessUnlock.hidden = active;
  elements.fullAccessActive.hidden = !active;
  elements.fullAccessConfirmWrap.hidden = !needsSetup;
  elements.fullAccessCodeLabel.textContent = needsSetup ? "Criar código deste computador" : "Código de autorização";
  elements.unlockFullAccess.textContent = needsSetup ? "Criar e autorizar" : "Autorizar";
  elements.fullAccessTitle.textContent = active ? "Full access autorizado" : needsSetup ? "Primeira configuração" : lockedRemaining ? "Temporariamente bloqueado" : "Código necessário";
  elements.fullAccessCopy.textContent = active
    ? "A autorização vale apenas nesta sessão local do navegador e pode ser revogada a qualquer momento."
    : needsSetup
      ? "Defina um código numérico de 6 a 12 dígitos para proteger o Full access somente neste computador. O Git nunca recebe esse código."
    : lockedRemaining
      ? `Novas tentativas serão liberadas em ${formatPermissionCountdown(lockedRemaining)}.`
      : "A sessão dura 8 horas. Enquanto estiver ativa, comandos, arquivos, rede e permissões adicionais não pedem nova confirmação.";
  elements.fullAccessCode.disabled = Boolean(lockedRemaining);
  elements.fullAccessConfirm.disabled = Boolean(lockedRemaining);
  elements.unlockFullAccess.disabled = Boolean(lockedRemaining);
  elements.fullAccessCountdown.textContent = active ? formatPermissionCountdown(state.permission.expiresAt - Date.now()) : "Inativo";
}

function applyPermissionState(permission) {
  state.permission = { ...state.permission, ...(permission || {}) };
  if (state.settings.permissionMode === "full" && !fullAccessIsActive()) {
    state.settings.permissionMode = "workspace";
    for (const chat of state.chats) if (chat.status !== "busy") chat.attached = false;
    persistState();
  }
  updatePermissionUI();
}

function setPermissionMode(mode, { quiet = false } = {}) {
  const normalized = ["read-only", "workspace", "full"].includes(mode) ? mode : "workspace";
  if (normalized === "full" && !fullAccessIsActive()) {
    elements.fullAccessError.textContent = state.permission.configured ? "Informe o código para ativar Full access." : "Crie o código de Full access deste computador.";
    elements.fullAccessCode?.focus();
    return false;
  }
  if (state.chats.some((chat) => chat.status === "busy")) {
    if (!quiet) showToast("Aguarde os turnos ativos terminarem antes de mudar a permissão.");
    return false;
  }
  state.settings.permissionMode = normalized;
  for (const chat of state.chats) chat.attached = false;
  elements.fullAccessError.textContent = "";
  updatePermissionUI();
  persistState();
  if (!quiet) showToast(`${permissionLabel(normalized)} será usado nos próximos turnos.`);
  return true;
}

function openPermissionCenter(requestedMode = null) {
  const aliases = { read: "read-only", readonly: "read-only", safe: "read-only", workspace: "workspace", full: "full", "full-access": "full" };
  const mode = aliases[String(requestedMode || "").toLowerCase()] || requestedMode;
  elements.fullAccessError.textContent = "";
  elements.fullAccessCode.value = "";
  elements.fullAccessConfirm.value = "";
  updatePermissionUI();
  elements.permissionModal.returnValue = "";
  elements.permissionModal.showModal();
  if (["read-only", "workspace", "full"].includes(mode)) setPermissionMode(mode);
}

async function refreshPermissionState() {
  const response = await apiFetch("/api/permissions", { cache: "no-store" });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Não foi possível carregar as permissões.");
  applyPermissionState(result.permission);
}

async function unlockFullAccess() {
  const code = elements.fullAccessCode.value.trim();
  if (!code) {
    elements.fullAccessError.textContent = "Informe o código de autorização.";
    return;
  }
  const needsSetup = !state.permission.configured;
  const confirmation = elements.fullAccessConfirm.value.trim();
  if (needsSetup && code !== confirmation) {
    elements.fullAccessError.textContent = "A confirmação do código não corresponde.";
    return;
  }
  elements.unlockFullAccess.disabled = true;
  elements.fullAccessError.textContent = "Verificando…";
  try {
    const response = await apiFetch(needsSetup ? "/api/permissions/full-access/setup" : "/api/permissions/full-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(needsSetup ? { code, confirmation } : { code })
    });
    const result = await response.json();
    applyPermissionState(result.permission);
    if (!response.ok || !result.ok) throw new Error(result.error || "A autorização foi recusada.");
    elements.fullAccessCode.value = "";
    elements.fullAccessConfirm.value = "";
    elements.fullAccessError.textContent = "";
    setPermissionMode("full", { quiet: true });
    showToast(needsSetup ? "Código local criado e Full access autorizado por 8 horas." : "Full access autorizado por 8 horas.");
  } catch (error) {
    elements.fullAccessCode.value = "";
    elements.fullAccessConfirm.value = "";
    elements.fullAccessError.textContent = error.message;
  } finally {
    updatePermissionUI();
  }
}

async function revokeFullAccess() {
  try {
    const response = await apiFetch("/api/permissions/full-access", { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Não foi possível revogar o acesso.");
    applyPermissionState(result.permission);
    setPermissionMode("workspace", { quiet: true });
    showToast("Full access revogado. O Hub voltou ao modo Workspace.");
  } catch (error) {
    elements.fullAccessError.textContent = error.message;
  }
}

// Visual adapters consume the same operational events as the functional UI.
// They remain optional so a graphics failure can never interrupt a Codex turn.
const memorySphere = {
  start() {},
  setState() {},
  access() {}
};
const nexus = {
  start() {},
  setSnapshot() {},
  ping() {}
};

function syncNexus() {
  const busy = state.chats.filter((chat) => chat.status === "busy").length;
  document.body.dataset.nexusState = !state.ready ? "offline" : busy ? "thinking" : "ready";
  if (elements.nexusMode) {
    elements.nexusMode.textContent = !state.ready
      ? "Campo aguardando Codex"
      : busy
        ? `${busy} sinal${busy > 1 ? "is" : ""} em processamento`
        : `${state.chats.length} nó${state.chats.length === 1 ? "" : "s"} sincronizado${state.chats.length === 1 ? "" : "s"}`;
  }
  nexus.setSnapshot(state.chats, state.ready);
}

const MISSION_PHASES = ["receive", "context", "execute", "respond"];

function currentMissionChat() {
  const busy = state.chats
    .filter((chat) => chat.status === "busy")
    .sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));
  return busy[0]
    || state.chats.find((chat) => chat.id === state.activeChatId)
    || [...state.chats].sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0))[0]
    || null;
}

function missionPhaseFor(chat) {
  if (!chat || chat.status !== "busy") return "idle";
  const entry = chat.timeline.at(-1);
  if (!entry || entry.kind === "user") return "receive";
  if (entry.kind === "assistant") return "respond";
  const title = String(entry.title || "").toLowerCase();
  if (/plano|racioc|pesquisa|imagem|context/.test(title)) return "context";
  if (/comando|arquivo|ferramenta|agente|navegador|tool/.test(title)) return "execute";
  return "context";
}

const COMPANION_STATE_LABELS = {
  idle: "disponível",
  typing: "ouvindo você",
  thinking: "analisando",
  processing: "processando",
  coding: "programando",
  searching: "pesquisando",
  reading: "lendo contexto",
  waitingApproval: "aguardando aprovação",
  success: "concluído",
  warning: "atenção necessária",
  error: "atenção",
  offline: "desconectado"
};

const COMPANION_EVENT_BY_STATE = {
  idle: "ai:idle",
  typing: "user:typing",
  thinking: "ai:thinking",
  processing: "ai:processing",
  coding: "ai:coding",
  searching: "ai:searching",
  reading: "ai:reading",
  waitingApproval: "ai:approval",
  success: "ai:success",
  warning: "ai:warning",
  error: "ai:error",
  offline: "ai:offline"
};

function companionStateForChat(chat) {
  if (!state.ready) return "offline";
  if (chat.status === "error") return "error";
  if (chat.waitingApproval) return "waitingApproval";
  if (chat.justCompleted) return "success";
  if (chat.companionWorkState) return chat.companionWorkState;
  if (chat.status === "busy") {
    const phase = missionPhaseFor(chat);
    if (phase === "execute") return "coding";
    if (phase === "respond") return "processing";
    return "thinking";
  }
  if (chat.companionInputActive) return "typing";
  return "idle";
}

function emitCompanionEvent(chat, type, detail = {}) {
  window.AICompanionBus?.emit(type, { chatId: chat.id, ...detail });
}

function lookCompanionAt(chat, target, duration = 1200) {
  window.AICompanionBus?.lookAt(target, { chatId: chat.id, duration });
}

function syncCompanion(chat, panel = chatElement(chat), force = false) {
  if (!panel) return;
  const companionState = companionStateForChat(chat);
  const companions = panel.querySelectorAll("ai-companion");
  companions.forEach((companion) => companion.setAttribute("chat-id", chat.id));
  const requiresSync = force || Boolean(chat.companionTransitionDetail) || [...companions].some((companion) => companion.dataset.syncedBaseState !== companionState);
  companions.forEach((companion) => { companion.dataset.syncedBaseState = companionState; });
  panel.dataset.companionState = companionState;
  if (requiresSync) {
    emitCompanionEvent(chat, COMPANION_EVENT_BY_STATE[companionState] || "ai:idle", {
      consecutiveErrors: chat.companionErrorCount || 0,
      ...(chat.companionTransitionDetail || {})
    });
    chat.companionTransitionDetail = null;
  }
  const status = panel.querySelector(".status-chip b");
  if (status) status.textContent = `Nexo · ${COMPANION_STATE_LABELS[companionState]}`;
}

function scheduleCompanionSettle(chat) {
  window.clearTimeout(chat.companionSettleTimer);
  chat.companionSettleTimer = window.setTimeout(() => {
    if (chat.status !== "idle") return;
    chat.justCompleted = false;
    updateChat(chat);
  }, 1100);
}

function companionStateForItem(item) {
  const type = String(item?.type || "");
  const descriptor = `${item?.tool || ""} ${item?.server || ""} ${item?.command || ""}`.toLowerCase();
  if (type === "webSearch" || /search|find|grep|glob|pesquis/.test(descriptor)) return "searching";
  if (type === "imageView" || /read|open|view|get-content|cat\s/.test(descriptor)) return "reading";
  if (type === "contextCompaction") return "memoryAccess";
  if (["commandExecution", "fileChange"].includes(type)) return "coding";
  if (["mcpToolCall", "dynamicToolCall", "collabAgentToolCall"].includes(type)) return "processing";
  if (["agentMessage", "subAgentActivity"].includes(type)) return "processing";
  return "thinking";
}

function startCompanionItem(chat, item) {
  if (!item) return;
  const nextState = companionStateForItem(item);
  chat.companionActiveItems.set(item.id || `ephemeral-${Date.now()}`, nextState);
  chat.companionWorkState = nextState === "memoryAccess" ? "thinking" : nextState;
  if (nextState === "memoryAccess") emitCompanionEvent(chat, "ai:memory", { fallback: "thinking" });
  else if (["commandExecution", "fileChange", "mcpToolCall", "dynamicToolCall", "collabAgentToolCall"].includes(item.type)) {
    emitCompanionEvent(chat, "ai:tool", { fallback: nextState, toolKind: item.type });
  }
  syncCompanion(chat);
}

function completeCompanionItem(chat, item) {
  if (item?.id) chat.companionActiveItems.delete(item.id);
  const remaining = [...chat.companionActiveItems.values()];
  chat.companionWorkState = remaining.at(-1) || (chat.status === "busy" ? "thinking" : null);
  syncCompanion(chat);
}

function startCompanionTurn(chat) {
  chat.companionTurnStartedAt = Date.now();
  window.clearTimeout(chat.companionLongTurnTimer);
  chat.companionLongTurnTimer = window.setTimeout(() => {
    if (chat.status === "busy") lookCompanionAt(chat, "clock", 1100);
  }, 60_000);
}

function finishCompanionTurn(chat, succeeded) {
  window.clearTimeout(chat.companionLongTurnTimer);
  const elapsed = chat.companionTurnStartedAt ? Date.now() - chat.companionTurnStartedAt : null;
  chat.companionTurnStartedAt = 0;
  chat.companionActiveItems.clear();
  chat.companionWorkState = null;
  if (succeeded) {
    chat.companionErrorCount = 0;
    chat.companionTransitionDetail = { quick: elapsed !== null && elapsed < 3000, duration: 1100, fallback: "idle" };
  } else {
    chat.companionErrorCount = (chat.companionErrorCount || 0) + 1;
    chat.companionTransitionDetail = { consecutiveErrors: chat.companionErrorCount, duration: 760, fallback: "idle" };
  }
}

function memoryPhaseForEntry(entry) {
  if (!entry) return "context";
  if (entry.kind === "user") return "receive";
  if (entry.kind === "assistant") return "respond";
  if (entry.kind === "error") return "error";
  const title = String(entry.title || "").toLowerCase();
  return /comando|arquivo|ferramenta|agente|navegador|tool/.test(title) ? "execute" : "context";
}

function missionEventFor(chat) {
  if (!chat) return "Sistema pronto para receber instruções";
  if (chat.status === "error") return chat.error || "O nó requer atenção";
  const entry = chat.timeline.at(-1);
  if (!entry) return "Canal isolado pronto para transmissão";
  if (entry.kind === "user") return "Instrução recebida e encaminhada ao Codex";
  if (entry.kind === "assistant") return entry.streaming ? "Resposta sendo sintetizada em tempo real" : "Resposta consolidada no contexto";
  if (entry.kind === "error") return entry.text || "Interrupção detectada";
  return `${entry.title || "Atividade"}${entry.status ? ` · ${entry.status}` : ""}`;
}

function syncMissionDeck() {
  if (!elements.missionDeck) return;
  const chat = currentMissionChat();
  const busyCount = state.chats.filter((item) => item.status === "busy").length;
  const phase = !state.ready ? "offline" : missionPhaseFor(chat);
  const workspace = chat ? workspaceForChat(chat) : selectedWorkspace();
  const mode = chat?.controlMode === "computer" ? "PC" : chat?.controlMode === "browser" ? "WEB" : "CHAT";

  document.body.dataset.missionPhase = phase;
  elements.missionDeck.dataset.active = busyCount ? "true" : "false";
  elements.missionDeck.dataset.error = chat?.status === "error" ? "true" : "false";
  memorySphere.setState(busyCount > 0, phase);
  elements.missionStatus.textContent = !state.ready
    ? "DESCONECTADO"
    : busyCount
      ? `${busyCount} CHAT${busyCount > 1 ? "S" : ""} EM EXECUÇÃO`
      : "PRONTO";
  elements.missionTitle.textContent = chat?.title || "Codex disponível";
  elements.missionContext.textContent = chat
    ? `${workspace?.name || "Workspace"} · ${mode} · ${chat.status === "busy" ? "processando" : chat.status === "error" ? "atenção" : "em espera"}`
    : "Aguardando mensagem";
  elements.missionEventCopy.textContent = missionEventFor(chat);
  elements.missionFocus.disabled = !chat;
  elements.missionFocus.dataset.chatId = chat?.id || "";

  const activeIndex = MISSION_PHASES.indexOf(phase);
  elements.missionDeck.querySelectorAll("[data-mission-phase]").forEach((node, index) => {
    node.classList.toggle("active", index === activeIndex);
    node.classList.toggle("complete", activeIndex >= 0 && index < activeIndex);
  });
}

function readStoredState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistState() {
  const chats = state.settings.restoreChats
    ? state.chats.slice(0, CHAT_LIMIT).map((chat) => ({
        id: chat.id,
        threadId: chat.threadId,
        title: chat.title,
        cwd: chat.cwd,
        workspaceId: chat.workspaceId,
        controlMode: chat.controlMode === "computer" ? "code" : chat.controlMode,
        planMode: chat.planMode,
        autoCompact: chat.autoCompact,
        compactThreshold: chat.compactThreshold
      }))
    : [];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      uiVersion: 6,
      selectedWorkspaceId: state.selectedWorkspaceId,
      chats,
      layout: state.layout,
      settings: state.settings,
      appearance: state.appearance
    }));
  } catch (error) {
    console.warn("Não foi possível salvar as preferências locais do Hub.", error);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  let region = document.querySelector("#toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = message;
  region.append(toast);
  setTimeout(() => toast.remove(), 4200);
}

function renderRichText(value) {
  const text = String(value || "");
  const pieces = text.split("```");
  return pieces.map((piece, index) => {
    if (index % 2 === 1) {
      const cleaned = piece.replace(/^\w+\n/, "");
      return `<pre><code>${escapeHtml(cleaned.trim())}</code></pre>`;
    }
    let safe = escapeHtml(piece);
    safe = safe.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return safe
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`)
      .join("");
  }).join("");
}

function shortPath(value) {
  const text = String(value || "");
  if (text.length <= 42) return text;
  return `…${text.slice(-39)}`;
}

function relativeTime(timestampSeconds) {
  if (!timestampSeconds) return "";
  const delta = Math.max(0, Date.now() - timestampSeconds * 1000);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(timestampSeconds * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function workspaceForChat(chat) {
  return state.workspaces.find((workspace) => workspace.id === chat.workspaceId)
    || workspaceForPath(chat.cwd)
    || { id: "unknown", name: "Pasta local", path: chat.cwd || "" };
}

function normalizedPath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
}

function workspaceForPath(value) {
  const candidate = normalizedPath(value);
  return state.workspaces
    .slice()
    .sort((a, b) => b.path.length - a.path.length)
    .find((workspace) => {
      const root = normalizedPath(workspace.path);
      return candidate === root || candidate.startsWith(`${root}/`);
    });
}

function selectedWorkspace() {
  return state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId)
    || state.workspaces[0]
    || null;
}

function mergeWorkspaces(detected = []) {
  const byPath = new Map();
  for (const workspace of detected) {
    if (!workspace || !workspace.path) continue;
    const key = normalizedPath(workspace.path);
    if (!byPath.has(key)) byPath.set(key, workspace);
  }
  state.workspaces = [...byPath.values()];
  if (!state.selectedWorkspaceId || !state.workspaces.some((item) => item.id === state.selectedWorkspaceId)) {
    state.selectedWorkspaceId = state.workspaces[0]?.id || null;
  }
  renderWorkspaceSelect();
}

function renderWorkspaceSelect() {
  elements.workspaceSelect.innerHTML = state.workspaces.length
    ? state.workspaces.map((workspace) => (
        `<option value="${escapeHtml(workspace.id)}">${workspace.managed ? "◆ " : ""}${escapeHtml(workspace.name)} — ${escapeHtml(shortPath(workspace.path))}</option>`
      )).join("")
    : `<option value="">Adicione uma pasta autorizada</option>`;
  if (state.selectedWorkspaceId) elements.workspaceSelect.value = state.selectedWorkspaceId;
  elements.workspaceSelect.disabled = state.workspaces.length === 0;
  elements.newChat.disabled = state.workspaces.length === 0;
  const current = selectedWorkspace();
  elements.removeWorkspace.disabled = !current || current.managed;
  elements.removeWorkspace.title = current?.managed ? "Workspace gerenciado pelo sistema" : "Remover workspace autorizado";
}

function setConnectionStatus(kind, title, copy) {
  elements.connectionCard.classList.remove("online", "error");
  if (kind) elements.connectionCard.classList.add(kind);
  elements.connectionTitle.textContent = title;
  elements.connectionCopy.textContent = copy;
}

function updateSessionReadouts() {
  if (elements.activeChatCount) {
    elements.activeChatCount.textContent = String(state.chats.length).padStart(2, "0");
    elements.activeChatCount.dataset.busy = String(state.chats.filter((chat) => chat.status === "busy").length);
  }
  syncNexus();
  syncMissionDeck();
}

function computerControlAuthorized() {
  return state.control.computerEnabledUntil > Date.now();
}

function computerControlActive() {
  return Boolean(state.control.capabilities.computerNativeConnected) && computerControlAuthorized();
}

function formatSessionDuration(totalMinutes) {
  const minutes = Math.max(1, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${minutes} min`;
  return remainder ? `${hours}h ${remainder}min` : `${hours}h`;
}

function updateControlUI() {
  const browserReady = Boolean(state.control.capabilities.browser);
  const computerInstalled = state.control.capabilities.computerInstalled ?? Boolean(state.control.capabilities.computer);
  const computerReady = Boolean(state.control.capabilities.computerNativeConnected ?? state.control.capabilities.computer);
  const computerConfigured = Boolean(state.control.capabilities.computerNativeConfigured);
  const authorized = computerControlAuthorized();
  const active = computerControlActive();
  const remaining = Math.max(0, state.control.computerEnabledUntil - Date.now());
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  document.body.dataset.computerControl = active ? "active" : "locked";
  elements.browserCapability?.classList.toggle("available", browserReady);
  elements.computerCapability?.classList.toggle("available", computerInstalled);
  elements.computerCapability?.classList.toggle("active", active);
  if (elements.browserControlStatus) {
    elements.browserControlStatus.textContent = browserReady
      ? `${state.control.capabilities.browserName || "Brave"} · Playwright direto`
      : "Plugin Brave Playwright não instalado";
  }
  if (elements.computerControlStatus) {
    elements.computerControlStatus.textContent = !computerInstalled
      ? "Componente não instalado"
      : !computerReady
        ? authorized ? "Autorizado · serviço nativo desconectado" : computerConfigured ? "Serviço nativo desconectado" : "Servidor nativo não configurado"
        : active ? "Pronto para controlar" : "Bloqueado por padrão";
  }
  if (elements.controlCountdown) elements.controlCountdown.textContent = authorized ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} autorizadas` : "Inativa";
  if (elements.controlSessionCopy) {
    elements.controlSessionCopy.textContent = active
      ? `PC pronto · ${formatSessionDuration(Math.ceil(remaining / 60000))}`
      : authorized
        ? `8h autorizadas · serviço desconectado`
        : computerReady ? "Serviço nativo pronto" : computerInstalled ? "Computer Use desconectado" : browserReady ? "Navegador pronto" : "Controle indisponível";
  }
  if (elements.enableComputerControl) {
    elements.enableComputerControl.disabled = !computerInstalled;
    const sessionDuration = formatSessionDuration(state.control.capabilities.computerSessionMinutes);
    elements.enableComputerControl.textContent = authorized ? `Renovar por ${sessionDuration}` : `Autorizar por ${sessionDuration}`;
  }
  if (elements.emergencyStop) elements.emergencyStop.disabled = !active && !state.chats.some((chat) => chat.status === "busy");
  document.querySelectorAll('[data-control-mode="browser"]').forEach((button) => button.disabled = !browserReady);
  document.querySelectorAll('[data-control-mode="computer"]').forEach((button) => button.classList.toggle("locked", !active));
}

function sendControlAction(action) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    showToast("O Hub ainda está conectando.");
    return;
  }
  state.socket.send(JSON.stringify({ type: "controlSession", action }));
}

function selectChatControlMode(chat, mode) {
  if (mode === "browser" && !state.control.capabilities.browser) {
    elements.controlModal?.showModal();
    return;
  }
  if (mode === "computer" && !computerControlActive()) {
    elements.controlModal?.showModal();
    return;
  }
  chat.controlMode = mode;
  persistState();
  updateChat(chat);
}

function updateSystemClock() {
  if (!elements.systemClock) return;
  elements.systemClock.textContent = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

async function refreshSession() {
  const response = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
  const result = await response.json();
  if (!response.ok || !result.ok || !result.csrf) throw new Error(result.error || "Não foi possível criar a sessão local.");
  state.csrf = result.csrf;
  return result;
}

async function apiFetch(url, options = {}, retry = true) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (state.csrf) headers.set("X-Codex-Hub-Session", state.csrf);
  if (method !== "GET" && method !== "HEAD") headers.set("X-Codex-Hub-CSRF", state.csrf || "");
  const response = await fetch(url, { ...options, method, headers, credentials: "same-origin" });
  if (response.status === 401 && retry) {
    await refreshSession();
    return apiFetch(url, options, false);
  }
  return response;
}

async function connect() {
  if (state.connecting || state.socket?.readyState === WebSocket.OPEN) return;
  state.connecting = true;
  clearTimeout(state.reconnectTimer);
  setConnectionStatus("", "Conectando", "Abrindo canal local");
  try {
    await refreshSession();
  } catch (error) {
    state.connecting = false;
    setConnectionStatus("error", "Sessão indisponível", error.message);
    state.reconnectTimer = setTimeout(connect, 2000);
    return;
  }
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${scheme}://${location.host}/ws`, ["codex-hub-v1", `codex-hub-auth.${state.csrf}`]);
  state.socket = socket;

  socket.addEventListener("open", () => {
    state.connecting = false;
    setConnectionStatus("", "Canal conectado", "Aguardando Codex App Server");
  });

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    handleBridgeMessage(message);
  });

  socket.addEventListener("close", () => {
    if (state.socket !== socket) return;
    state.socket = null;
    state.connecting = false;
    state.ready = false;
    for (const chat of state.chats) chat.attached = false;
    setConnectionStatus("error", "Desconectado", "Tentando reconectar…");
    rejectPendingRpc("Conexão com o Hub foi interrompida.");
    state.reconnectTimer = setTimeout(connect, 1600);
  });

  socket.addEventListener("error", () => {
    if (state.socket !== socket) return;
    state.connecting = false;
    setConnectionStatus("error", "Falha local", "Não foi possível abrir o canal");
    if (socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) socket.close();
  });
}

function handleBridgeMessage(message) {
  if (message.type === "hello") {
    const serverVersion = String(message.version || CLIENT_VERSION);
    elements.version.textContent = `v${serverVersion}`;
    if (reloadForServerVersion(serverVersion)) return;
    elements.securityBadge.textContent = message.security?.authenticated ? "Proteção ativa" : "Proteção parcial";
    elements.securityBadge.classList.toggle("secure", Boolean(message.security?.authenticated));
    if (message.control?.capabilities) state.control.capabilities = message.control.capabilities;
    state.control.computerEnabledUntil = Number(message.control?.computerEnabledUntil) || 0;
    if (message.permission) applyPermissionState(message.permission);
    updateControlUI();
    if (Array.isArray(message.workspaces)) mergeWorkspaces(message.workspaces);
    setReady(Boolean(message.codexReady));
    return;
  }

  if (message.type === "bridgeStatus") {
    setReady(Boolean(message.ready), message.error);
    return;
  }

  if (message.type === "controlState") {
    if (message.capabilities) state.control.capabilities = message.capabilities;
    state.control.computerEnabledUntil = Number(message.computerEnabledUntil) || 0;
    updateControlUI();
    for (const chat of state.chats) updateChat(chat);
    return;
  }

  if (message.type === "permissionState") {
    applyPermissionState(message.permission);
    for (const chat of state.chats) updateChat(chat);
    return;
  }

  if (message.type === "controlStopped") {
    state.control.computerEnabledUntil = 0;
    updateControlUI();
    showToast(message.interrupted ? `${message.interrupted} execução interrompida.` : "Controle do computador bloqueado.");
    return;
  }

  if (message.type === "rpcResult") {
    const pending = state.pendingRpc.get(message.requestId);
    if (!pending) return;
    state.pendingRpc.delete(message.requestId);
    clearTimeout(pending.timeout);
    if (message.error) pending.reject(new Error(message.error.message || "Erro do Codex App Server"));
    else pending.resolve(message.result);
    return;
  }

  if (message.type === "notification") {
    handleCodexNotification(message.method, message.params || {});
    return;
  }

  if (message.type === "serverRequest") {
    state.approvals.set(String(message.requestId), message);
    const approvalChat = findChatByThread(message.params?.threadId);
    if (approvalChat) {
      approvalChat.waitingApproval = true;
      updateChat(approvalChat);
    }
    renderApprovals();
    openApprovalDrawer();
    return;
  }

  if (message.type === "serverRequestResolved") {
    state.approvals.delete(String(message.requestId));
    for (const chat of state.chats) {
      chat.waitingApproval = [...state.approvals.values()].some((request) => request.params?.threadId === chat.threadId);
      updateChat(chat);
    }
    renderApprovals();
    return;
  }

  if (message.type === "bridgeLog" && message.level === "error") {
    setConnectionStatus("error", "Codex indisponível", message.message || "Erro no processo local");
    return;
  }

  if (message.type === "clientError") {
    setConnectionStatus("error", "Operação bloqueada", message.message || "O Hub recusou uma operação insegura.");
  }
}

function reloadForServerVersion(serverVersion) {
  if (!serverVersion || serverVersion === CLIENT_VERSION) return false;
  const reloadKey = `codex-hub-version-reload:${serverVersion}`;
  try {
    if (sessionStorage.getItem(reloadKey)) return false;
    sessionStorage.setItem(reloadKey, "1");
  } catch {
    // A recarga ainda pode ser feita quando o armazenamento da sessao estiver bloqueado.
  }
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("appVersion", serverVersion);
  window.location.replace(nextUrl);
  return true;
}

function setReady(ready, error) {
  const changed = state.ready !== ready;
  state.ready = ready;
  if (ready) {
    setConnectionStatus("online", "Codex disponível", "Sessão local protegida e isolada");
    if (changed) {
      loadHistory();
      hydrateRestoredChats();
    }
  } else {
    setConnectionStatus(error ? "error" : "", error ? "Codex indisponível" : "Inicializando", error || "Carregando contexto e ferramentas");
  }
  for (const chat of state.chats) updateChat(chat);
}

function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!state.ready || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
      reject(new Error("O Codex ainda não está pronto."));
      return;
    }
    const requestId = `hub-${Date.now()}-${++state.requestSequence}`;
    const timeout = setTimeout(() => {
      state.pendingRpc.delete(requestId);
      reject(new Error(`Tempo esgotado ao executar ${method}.`));
    }, 90000);
    state.pendingRpc.set(requestId, { resolve, reject, timeout, startedAt: performance.now() });
    state.socket.send(JSON.stringify({ type: "rpc", requestId, method, params }));
  });
}

function rejectPendingRpc(message) {
  for (const pending of state.pendingRpc.values()) {
    clearTimeout(pending.timeout);
    pending.reject(new Error(message));
  }
  state.pendingRpc.clear();
}

function makeChat(source = {}) {
  const workspace = state.workspaces.find((item) => item.id === source.workspaceId)
    || workspaceForPath(source.cwd)
    || selectedWorkspace();
  return {
    id: source.id || crypto.randomUUID(),
    threadId: source.threadId || null,
    title: source.title || "Novo chat",
    cwd: source.cwd || workspace?.path || "",
    workspaceId: source.workspaceId || workspace?.id || null,
    controlMode: ["browser", "computer"].includes(source.controlMode) ? source.controlMode : "code",
    planMode: source.planMode === true,
    autoCompact: source.autoCompact !== false,
    compactThreshold: clampNumber(source.compactThreshold, 70, 95, CONTEXT_COMPACT_DEFAULT),
    selectedSkills: [],
    selectedMentions: [],
    tokenUsage: null,
    compacting: false,
    lastCompactedAt: 0,
    commandView: null,
    commandSelection: 0,
    contextFileQuery: "",
    fileSearchResults: [],
    fileSearchSequence: 0,
    fileSearchTimer: null,
    status: "idle",
    error: null,
    waitingApproval: false,
    justCompleted: false,
    companionInputActive: false,
    companionSettleTimer: null,
    companionWorkState: null,
    companionActiveItems: new Map(),
    companionErrorCount: 0,
    companionTurnStartedAt: 0,
    companionLongTurnTimer: null,
    companionContextWarning: false,
    companionTransitionDetail: null,
    currentTurnId: null,
    attached: false,
    hydrated: false,
    hydrating: false,
    historyCursor: null,
    loadingOlder: false,
    lastActivityAt: Number(source.lastActivityAt) || Date.now(),
    timeline: [],
    messageQueue: [],
    queueDraining: false
  };
}

function addChat(source = {}, focus = true) {
  if (!source.cwd && !selectedWorkspace()) {
    elements.workspaceError.textContent = "Adicione uma pasta autorizada antes de abrir um chat.";
    elements.workspaceModal.showModal();
    return null;
  }
  if (state.chats.length >= CHAT_LIMIT) {
    const removable = state.chats.find((chat) => chat.status !== "busy");
    if (removable) state.chats = state.chats.filter((chat) => chat.id !== removable.id);
    else return null;
  }
  const chat = makeChat(source);
  state.chats.push(chat);
  state.activeChatId = chat.id;
  persistState();
  renderBoard();
  if (focus) requestAnimationFrame(() => chatElement(chat)?.querySelector("textarea")?.focus());
  return chat;
}

function closeChat(chatId) {
  const chat = state.chats.find((item) => item.id === chatId);
  if (!chat || chat.status === "busy") return;
  state.chats = state.chats.filter((item) => item.id !== chatId);
  if (state.activeChatId === chatId) state.activeChatId = state.chats[0]?.id || null;
  if (!state.chats.length) addChat();
  else {
    persistState();
    renderBoard();
  }
}

function chatElement(chat) {
  return elements.board.querySelector(`[data-chat-id="${CSS.escape(chat.id)}"]`);
}

function activateChat(chat, focusComposer = false) {
  if (!chat) return;
  state.activeChatId = chat.id;
  for (const panel of elements.board.querySelectorAll(".chat-panel")) {
    panel.classList.toggle("active", panel.dataset.chatId === chat.id);
  }
  renderOpenChats();
  syncMissionDeck();
  persistState();
  if (focusComposer) requestAnimationFrame(() => chatElement(chat)?.querySelector("textarea")?.focus());
}

function renderOpenChats() {
  if (!elements.openChatList) return;
  const renderKey = state.chats.map((chat) => [chat.id, chat.title, chat.status, chat.id === state.activeChatId].join(":" )).join("|");
  if (elements.openChatList.dataset.renderKey === renderKey) return;
  elements.openChatList.dataset.renderKey = renderKey;
  elements.openChatList.innerHTML = state.chats.map((chat) => {
    const active = chat.id === state.activeChatId ? " active" : "";
    return `<button class="open-chat-item ${escapeHtml(chat.status)}${active}" type="button" data-open-chat-id="${escapeHtml(chat.id)}"><strong>${escapeHtml(chat.title)}</strong><span class="open-chat-state" aria-hidden="true"></span></button>`;
  }).join("");
  for (const button of elements.openChatList.querySelectorAll("[data-open-chat-id]")) {
    button.addEventListener("click", () => {
      const chat = state.chats.find((item) => item.id === button.dataset.openChatId);
      activateChat(chat, true);
      closeSidebar();
    });
  }
}

function renderBoard() {
  if (!state.chats.some((chat) => chat.id === state.activeChatId)) {
    state.activeChatId = state.chats.at(-1)?.id || null;
  }
  elements.board.classList.toggle("grid-layout", state.layout === "grid");
  elements.board.classList.toggle("focus-layout", state.layout === "focus");
  elements.board.innerHTML = "";
  for (const chat of state.chats) {
    const panel = elements.chatTemplate.content.firstElementChild.cloneNode(true);
    panel.dataset.chatId = chat.id;
    panel.classList.toggle("active", chat.id === state.activeChatId);
    const titleInput = panel.querySelector(".chat-title-input");
    const textarea = panel.querySelector("textarea");

    titleInput.addEventListener("change", () => {
      chat.title = titleInput.value.trim() || "Novo chat";
      persistState();
      renderOpenChats();
      renderHistory();
      if (chat.threadId && state.ready) {
        rpc("thread/name/set", { threadId: chat.threadId, name: chat.title }).catch(() => {});
      }
    });

    panel.querySelector(".chat-close").addEventListener("click", () => closeChat(chat.id));
    panel.querySelector(".chat-refresh").addEventListener("click", () => hydrateChat(chat, true));
    panel.querySelector(".load-older-button").addEventListener("click", () => loadOlderTurns(chat));
    panel.querySelector(".send-button").addEventListener("click", () => sendChat(chat));
    panel.querySelector(".stop-button").addEventListener("click", () => interruptChat(chat));
    panel.querySelector(".open-approval-rail")?.addEventListener("click", openApprovalDrawer);
    panel.querySelectorAll("[data-quick-command]").forEach((button) => {
      button.addEventListener("click", () => executeSlashCommand(chat, button.dataset.quickCommand));
    });
    panel.querySelectorAll("[data-control-mode]").forEach((button) => {
      button.addEventListener("click", () => selectChatControlMode(chat, button.dataset.controlMode));
    });
    panel.addEventListener("focusin", () => {
      state.activeChatId = chat.id;
      renderOpenChats();
      syncMissionDeck();
    });
    panel.addEventListener("pointerdown", () => {
      state.activeChatId = chat.id;
      renderOpenChats();
      syncMissionDeck();
    });
    panel.querySelectorAll("[data-composer-tool]").forEach((button) => {
      button.addEventListener("click", () => openCommandCenter(chat, button.dataset.composerTool));
      button.addEventListener("pointerenter", () => lookCompanionAt(chat, button.dataset.composerTool === "skills" ? "skills" : "context"));
    });
    panel.querySelectorAll(".open-approval-rail, .inspector-approval").forEach((button) => {
      button.addEventListener("pointerenter", () => lookCompanionAt(chat, "approvals"));
    });
    panel.querySelector(".context-card")?.addEventListener("pointerenter", () => lookCompanionAt(chat, "memory"));
    panel.addEventListener("companion:statechange", (event) => {
      panel.dataset.companionState = event.detail.state;
      const status = panel.querySelector(".status-chip b");
      if (status) status.textContent = `Nexo · ${String(event.detail.label || "disponível").toLowerCase()}`;
    });
    panel.querySelector(".command-center-close").addEventListener("click", () => closeCommandCenter(chat));
    panel.querySelector(".command-search").addEventListener("input", (event) => {
      chat.commandSelection = 0;
      renderCommandCenter(chat, event.target.value);
    });
    panel.querySelector(".command-search").addEventListener("keydown", (event) => handleCommandCenterKeydown(chat, event));
    textarea.addEventListener("focus", () => {
      lookCompanionAt(chat, "composer", 900);
    });
    textarea.addEventListener("blur", () => {
      chat.companionInputActive = false;
      syncCompanion(chat, panel);
    });
    textarea.addEventListener("input", () => {
      handleComposerInput(chat, textarea);
      const wasTyping = chat.companionInputActive;
      chat.companionInputActive = Boolean(textarea.value);
      if (chat.companionInputActive && !wasTyping) emitCompanionEvent(chat, "user:typing");
      syncCompanion(chat, panel);
    });
    textarea.addEventListener("keydown", (event) => handleComposerKeydown(chat, textarea, event));

    elements.board.append(panel);
    updateChat(chat);
  }
  renderOpenChats();
  updateSessionReadouts();
}

function updateChat(chat) {
  const panel = chatElement(chat);
  if (!panel) return;
  panel.classList.toggle("busy", chat.status === "busy");
  panel.classList.toggle("error", chat.status === "error");
  panel.classList.toggle("ready", chat.status === "idle" && state.ready);
  panel.classList.toggle("active", chat.id === state.activeChatId);
  panel.dataset.controlMode = chat.controlMode;
  updateSessionReadouts();
  renderOpenChats();

  const titleInput = panel.querySelector(".chat-title-input");
  if (document.activeElement !== titleInput) titleInput.value = chat.title;
  const workspace = workspaceForChat(chat);
  const statusCopy = chat.status === "busy" ? "executando" : chat.status === "error" ? "atenção" : chat.threadId ? "pronto" : "novo";
  panel.querySelector(".chat-meta").textContent = `${workspace.name} · ${statusCopy}`;
  panel.querySelector(".workspace-chip").textContent = shortPath(chat.cwd);
  const inspectorState = panel.querySelector(".inspector-state");
  if (inspectorState) {
    inspectorState.textContent = chat.status === "busy"
      ? "Codex está trabalhando"
      : chat.status === "error"
        ? "A sessão requer atenção"
        : state.ready ? "Pronta para trabalhar" : "Conectando ao Codex";
  }
  const inspectorApproval = panel.querySelector(".inspector-approval small");
  if (inspectorApproval) {
    inspectorApproval.textContent = state.approvals.size
      ? `${state.approvals.size === 1 ? "1 solicitação" : `${state.approvals.size} solicitações`} aguardando`
      : "Nenhuma solicitação pendente";
  }
  panel.querySelectorAll("[data-control-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.controlMode === chat.controlMode);
  });
  panel.querySelector(".send-button").disabled = !state.ready || !chat.cwd || chat.messageQueue.length >= MESSAGE_QUEUE_LIMIT;
  panel.querySelector(".send-button").title = chat.status === "busy" ? "Adicionar ao turno ativo" : "Enviar";
  panel.querySelector(".send-button").setAttribute("aria-label", chat.status === "busy" ? "Adicionar mensagem à fila" : "Enviar mensagem");
  panel.querySelector("textarea").disabled = !chat.cwd;
  const historyPageBar = panel.querySelector(".history-page-bar");
  const loadOlderButton = panel.querySelector(".load-older-button");
  historyPageBar.hidden = !chat.historyCursor;
  loadOlderButton.disabled = chat.loadingOlder;
  loadOlderButton.textContent = chat.loadingOlder ? "Carregando…" : "Carregar mensagens anteriores";

  const stream = panel.querySelector(".chat-stream");
  const wasNearBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 120;
  patchTimeline(chat, stream);
  if (wasNearBottom || chat.status === "busy") stream.scrollTop = stream.scrollHeight;
  updateComposerContext(chat);
  renderMessageQueue(chat);
  updateControlUI();
  syncCompanion(chat, panel);
}

function htmlElement(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

function patchTimeline(chat, stream) {
  const simpleState = chat.hydrating && !chat.timeline.length ? "hydrating" : !chat.timeline.length ? "empty" : "timeline";
  if (simpleState !== "timeline") {
    if (stream.dataset.timelineState !== simpleState) stream.innerHTML = renderTimeline(chat);
    stream.dataset.timelineState = simpleState;
    return;
  }

  if (stream.dataset.timelineState !== "timeline") stream.innerHTML = "";
  stream.dataset.timelineState = "timeline";
  const hiddenCount = Math.max(0, chat.timeline.length - TIMELINE_RENDER_LIMIT);
  const visible = hiddenCount ? chat.timeline.slice(-TIMELINE_RENDER_LIMIT) : chat.timeline;
  const visibleIds = new Set(visible.map((entry) => String(entry.id)));
  let limitNotice = stream.querySelector(".timeline-limit");

  if (hiddenCount) {
    const copy = `${hiddenCount} atividades antigas foram recolhidas para manter o painel rápido.`;
    if (!limitNotice) {
      limitNotice = document.createElement("div");
      limitNotice.className = "timeline-limit";
      stream.prepend(limitNotice);
    }
    if (limitNotice.textContent !== copy) limitNotice.textContent = copy;
  } else {
    limitNotice?.remove();
  }

  stream.querySelectorAll(".timeline-item[data-entry-id]").forEach((node) => {
    if (!visibleIds.has(node.dataset.entryId)) node.remove();
  });

  for (const entry of visible) {
    const id = String(entry.id);
    const revision = String(entry.revision || 0);
    let node = stream.querySelector(`.timeline-item[data-entry-id="${CSS.escape(id)}"]`);
    if (!node) {
      stream.append(htmlElement(renderTimelineEntry(entry, chat)));
      continue;
    }
    if (node.dataset.revision === revision) continue;

    if (entry.kind === "user" || entry.kind === "assistant") {
      const bubble = node.querySelector(".message-bubble");
      if (bubble) {
        bubble.innerHTML = renderRichText(entry.text || (entry.streaming ? "Pensando" : ""));
        bubble.classList.toggle("typing-cursor", Boolean(entry.streaming));
        node.classList.toggle("streaming", Boolean(entry.streaming));
        node.classList.toggle("running", Boolean(entry.streaming));
        node.classList.toggle("completed", !entry.streaming);
        node.dataset.revision = revision;
        continue;
      }
    }

    node.replaceWith(htmlElement(renderTimelineEntry(entry, chat)));
  }
}

function renderTimeline(chat) {
  if (chat.hydrating && !chat.timeline.length) {
    return `<div class="empty-chat"><div class="empty-chat-content"><div class="empty-symbol">↻</div><h3>Recuperando conversa</h3><p>Carregando o histórico preservado pelo Codex.</p></div></div>`;
  }
  if (!chat.timeline.length) {
    const workspace = workspaceForChat(chat);
    return `<div class="empty-chat"><div class="terminal-welcome companion-welcome"><div><span class="empty-kicker">CODEX HUB <b>v0.20.2</b></span><h3>Olá, eu sou o Nexo.</h3><p>Estou conectado ao workspace ${escapeHtml(workspace.name)} e acompanharei a atividade desta sessão.</p><div class="empty-coordinates"><span>/help para comandos</span><span>Ctrl+K para buscar</span></div></div></div></div>`;
  }
  const hiddenCount = Math.max(0, chat.timeline.length - TIMELINE_RENDER_LIMIT);
  const visible = hiddenCount ? chat.timeline.slice(-TIMELINE_RENDER_LIMIT) : chat.timeline;
  const notice = hiddenCount
    ? `<div class="timeline-limit">${hiddenCount} atividades antigas foram recolhidas para manter o painel rápido.</div>`
    : "";
  return `${notice}${visible.map((entry) => renderTimelineEntry(entry, chat)).join("")}`;
}

function renderTimelineEntry(entry, chat) {
  const revision = escapeHtml(entry.revision || 0);
  const stateClass = timelineStateClass(entry);
  const time = escapeHtml(formatTimelineTime(entry.createdAt));
  const agent = escapeHtml(timelineAgent(entry));
  if (entry.kind === "user" || entry.kind === "assistant") {
    const label = entry.kind === "user" ? "COMANDO" : "RESPOSTA";
    const cursor = entry.streaming ? " typing-cursor" : "";
    return `<div class="timeline-item ${entry.kind} ${stateClass}${entry.streaming ? " streaming" : ""}" data-entry-id="${escapeHtml(entry.id)}" data-revision="${revision}"><time class="timeline-time">${time}</time><div class="timeline-label">${label}<b>${agent}</b></div><div class="message-bubble${cursor}">${renderRichText(entry.text || (entry.streaming ? "Sintetizando resposta…" : ""))}</div></div>`;
  }

  if (entry.kind === "error") {
    return `<div class="timeline-item failed" data-entry-id="${escapeHtml(entry.id)}" data-revision="${revision}"><time class="timeline-time">${time}</time><div class="timeline-label">ERRO<b>Codex Core</b></div><div class="activity-card error"><strong>Não foi possível continuar</strong><p>${escapeHtml(entry.text)}</p></div></div>`;
  }

  const title = escapeHtml(entry.title || "Atividade");
  const status = escapeHtml(entry.status || "");
  const details = entry.details ? `<pre>${escapeHtml(entry.details)}</pre>` : "";
  const duration = entry.startedAt && entry.completedAt ? `<b>${Math.max(0, Math.round((entry.completedAt - entry.startedAt) / 100) / 10)}s</b>` : `<b>${agent}</b>`;
  return `<div class="timeline-item activity ${stateClass}" data-entry-id="${escapeHtml(entry.id)}" data-revision="${revision}"><time class="timeline-time">${time}</time><div class="timeline-label">${title}${duration}</div><details class="activity-card" ${entry.open ? "open" : ""}><summary><span>${title}</span><span class="activity-status">${status}</span></summary>${entry.text ? `<p>${escapeHtml(entry.text)}</p>` : ""}${details}</details></div>`;
}

function formatTimelineTime(timestamp) {
  if (!Number(timestamp)) return "--:--";
  return new Date(Number(timestamp)).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function timelineStateClass(entry) {
  if (entry.kind === "error") return "failed";
  if (entry.streaming) return "running";
  const status = String(entry.status || "").toLowerCase();
  if (/fail|erro|recus|cancel/.test(status)) return "failed";
  if (/aguard|pend|queued|fila/.test(status)) return "waiting";
  if (/execut|process|progress|running|start|ativ/.test(status)) return "running";
  if (/conclu|complete|success|done|atualizado/.test(status)) return "completed";
  return entry.kind === "user" ? "completed" : "queued";
}

function timelineAgent(entry) {
  if (entry.kind === "user") return "Operador";
  if (entry.kind === "assistant") return "Reporter";
  const title = String(entry.title || "").toLowerCase();
  if (/plano|análise|context|pesquisa/.test(title)) return "Planner";
  if (/comando|arquivo|tool|ferramenta|navegador/.test(title)) return "Executor";
  if (/valid|teste|revis/.test(title)) return "Validator";
  if (/agente/.test(title)) return "Orchestrator";
  return "Codex Core";
}

function autoSizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
}

function chatSkillsKey(chat) {
  return String(chat?.cwd || "").toLowerCase();
}

function skillsForChat(chat) {
  return state.skillsByCwd.get(chatSkillsKey(chat)) || [];
}

async function loadSkillsForChat(chat, forceReload = false) {
  if (!chat?.cwd || !state.ready) return [];
  const key = chatSkillsKey(chat);
  if (!forceReload && state.skillsByCwd.has(key)) return skillsForChat(chat);
  if (!forceReload && state.skillsLoading.has(key)) return state.skillsLoading.get(key);
  const loading = rpc("skills/list", { cwds: [chat.cwd], forceReload })
    .then((result) => {
      const entry = Array.isArray(result?.data) ? result.data.find((item) => String(item.cwd).toLowerCase() === key) || result.data[0] : null;
      const skills = (Array.isArray(entry?.skills) ? entry.skills : [])
        .filter((skill) => skill.enabled !== false && skill.name && skill.path)
        .sort((left, right) => String(left.displayName || left.name).localeCompare(String(right.displayName || right.name), "pt-BR"));
      state.skillsByCwd.set(key, skills);
      return skills;
    })
    .catch((error) => {
      showToast(`Skills indisponíveis: ${error.message}`);
      return [];
    })
    .finally(() => state.skillsLoading.delete(key));
  state.skillsLoading.set(key, loading);
  return loading;
}

function commandCenterElements(chat) {
  const panel = chatElement(chat);
  return {
    panel,
    center: panel?.querySelector(".composer-command-center"),
    title: panel?.querySelector(".command-center-title"),
    search: panel?.querySelector(".command-search"),
    content: panel?.querySelector(".command-center-content")
  };
}

function closeCommandCenter(chat) {
  const { center } = commandCenterElements(chat);
  if (center) center.hidden = true;
  chat.commandView = null;
  chat.commandSelection = 0;
}

function openCommandCenter(chat, view = "commands", query = "", focusSearch = true) {
  const { center, search } = commandCenterElements(chat);
  if (!center) return;
  chat.commandView = ["all", "commands", "skills", "context"].includes(view) ? view : "commands";
  chat.commandSelection = 0;
  lookCompanionAt(chat, chat.commandView === "skills" ? "skills" : chat.commandView === "context" ? "memory" : "composer", 1200);
  center.hidden = false;
  search.value = query;
  renderCommandCenter(chat, query);
  if (chat.commandView === "skills") {
    loadSkillsForChat(chat).then(() => {
      if (chat.commandView === "skills") renderCommandCenter(chat, search.value);
    });
  }
  if (chat.commandView === "all") {
    loadSkillsForChat(chat).then(() => {
      if (chat.commandView === "all") renderCommandCenter(chat, search.value);
    });
  }
  if (focusSearch && chat.commandView !== "context") requestAnimationFrame(() => search.focus());
}

function commandMatches(command, query) {
  const normalized = String(query || "").trim().toLowerCase().replace(/^\//, "");
  if (!normalized) return true;
  return [command.name, ...(command.aliases || []), command.description]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function filteredCommands(query) {
  return SLASH_COMMANDS.filter((command) => commandMatches(command, query))
    .sort((left, right) => Number(right.support === "hub") - Number(left.support === "hub"));
}

function filteredSkills(chat, query) {
  const normalized = String(query || "").trim().toLowerCase().replace(/^\$/, "");
  return skillsForChat(chat).filter((skill) => !normalized || [skill.name, skill.displayName, skill.description, skill.shortDescription]
    .filter(Boolean).join(" ").toLowerCase().includes(normalized));
}

function commandSupportLabel(support) {
  if (support === "hub") return "HUB";
  if (support === "desktop") return "DESKTOP";
  return "CLI";
}

function contextUsage(chat) {
  const usage = chat.tokenUsage;
  const used = Number(usage?.last?.totalTokens || usage?.last?.inputTokens || 0);
  const windowSize = Number(usage?.modelContextWindow || 0);
  const percent = windowSize ? Math.min(100, Math.max(0, used / windowSize * 100)) : 0;
  return { used, windowSize, percent };
}

function formatTokens(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 100_000 ? 0 : 1)}k`;
  return String(number);
}

function renderCommandList(chat, query) {
  const commands = filteredCommands(query);
  if (!commands.length) return '<div class="command-empty"><strong>Nenhum comando encontrado</strong><span>Tente outro termo.</span></div>';
  return `<div class="command-list">${commands.map((command, index) => `
    <button class="command-option${index === chat.commandSelection ? " active" : ""}" type="button" data-command-name="${escapeHtml(command.name)}" data-selectable-index="${index}">
      <span class="command-glyph">/</span><span><strong>${escapeHtml(command.name.slice(1))}</strong><small>${escapeHtml(command.description)}</small>${command.aliases?.length ? `<em>${escapeHtml(command.aliases.join(" · "))}</em>` : ""}</span><b data-support="${escapeHtml(command.support)}">${commandSupportLabel(command.support)}</b>
    </button>`).join("")}</div>`;
}

function renderSkillsList(chat, query) {
  const loading = state.skillsLoading.has(chatSkillsKey(chat));
  const skills = filteredSkills(chat, query);
  if (loading && !skills.length) return '<div class="command-empty"><strong>Carregando skills…</strong><span>Lendo apenas o catálogo deste workspace.</span></div>';
  if (!skills.length) return '<div class="command-empty"><strong>Nenhuma skill encontrada</strong><span>Use atualizar para reler as skills instaladas.</span><button type="button" data-refresh-skills>Atualizar catálogo</button></div>';
  return `<div class="skills-intro"><span>${skills.length} skills disponíveis</span><button type="button" data-refresh-skills>Atualizar</button></div><div class="command-list">${skills.map((skill, index) => {
    const selected = chat.selectedSkills.some((item) => item.path === skill.path);
    const label = skill.displayName || skill.name;
    return `<button class="command-option skill-option${index === chat.commandSelection ? " active" : ""}${selected ? " selected" : ""}" type="button" data-skill-index="${index}" data-selectable-index="${index}"><span class="skill-glyph" style="--skill-color:${escapeHtml(skill.brandColor || "var(--accent)")}">$</span><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(skill.shortDescription || skill.description || "Workflow especializado")}</small><em>${escapeHtml(skill.scope || "user")}${skill.pluginId ? ` · ${escapeHtml(skill.pluginId)}` : ""}</em></span><b>${selected ? "ADICIONADA" : "USAR"}</b></button>`;
  }).join("")}</div>`;
}

function renderGlobalCommandList(chat, query) {
  const normalized = String(query || "").trim().toLowerCase();
  let optionIndex = 0;
  const match = (...values) => !normalized || values.filter(Boolean).join(" ").toLowerCase().includes(normalized);
  const actions = [
    { id: "new", name: "Novo chat", detail: "Criar um canal no workspace selecionado", glyph: "+" },
    { id: "context", name: "Arquivos e contexto", detail: "Pesquisar arquivos, skills e uso de tokens", glyph: "◎" },
    { id: "approvals", name: "Aprovações", detail: `${state.approvals.size} solicitações aguardando`, glyph: "◇" },
    { id: "control", name: "Centro de Controle", detail: "Navegador, PC e sessão local", glyph: "⌘" },
    { id: "settings", name: "Configurações", detail: "Tema, tipografia, segurança e restauração", glyph: "⚙" }
  ].filter((action) => match(action.name, action.detail));
  const chats = state.chats.filter((item) => match(item.title, item.cwd)).slice(0, 6);
  const workspaces = state.workspaces.filter((item) => match(item.name, item.path)).slice(0, 5);
  const commands = filteredCommands(normalized).slice(0, normalized ? 10 : 6);
  const skills = filteredSkills(chat, normalized).slice(0, 5);
  const section = (title, body) => body ? `<section class="global-command-section"><h4>${title}</h4>${body}</section>` : "";
  const actionHtml = actions.map((action) => `<button class="command-option${optionIndex === chat.commandSelection ? " active" : ""}" type="button" data-command-action="${action.id}" data-selectable-index="${optionIndex++}"><span class="command-glyph">${action.glyph}</span><span><strong>${escapeHtml(action.name)}</strong><small>${escapeHtml(action.detail)}</small></span><b>HUB</b></button>`).join("");
  const chatHtml = chats.map((item) => `<button class="command-option${optionIndex === chat.commandSelection ? " active" : ""}" type="button" data-command-chat="${escapeHtml(item.id)}" data-selectable-index="${optionIndex++}"><span class="command-glyph">#</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(shortPath(item.cwd))}</small></span><b>${item.status === "busy" ? "ATIVO" : "CHAT"}</b></button>`).join("");
  const workspaceHtml = workspaces.map((item) => `<button class="command-option${optionIndex === chat.commandSelection ? " active" : ""}" type="button" data-command-workspace="${escapeHtml(item.id)}" data-selectable-index="${optionIndex++}"><span class="command-glyph">◇</span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.path)}</small></span><b>WORKSPACE</b></button>`).join("");
  const commandHtml = commands.map((command) => `<button class="command-option${optionIndex === chat.commandSelection ? " active" : ""}" type="button" data-command-name="${escapeHtml(command.name)}" data-selectable-index="${optionIndex++}"><span class="command-glyph">/</span><span><strong>${escapeHtml(command.name)}</strong><small>${escapeHtml(command.description)}</small></span><b>${commandSupportLabel(command.support)}</b></button>`).join("");
  const skillHtml = skills.map((skill) => `<button class="command-option${optionIndex === chat.commandSelection ? " active" : ""}" type="button" data-global-skill-path="${escapeHtml(skill.path)}" data-selectable-index="${optionIndex++}"><span class="skill-glyph">$</span><span><strong>${escapeHtml(skill.displayName || skill.name)}</strong><small>${escapeHtml(skill.shortDescription || skill.description || "Workflow especializado")}</small></span><b>SKILL</b></button>`).join("");
  return [section("AÇÕES", actionHtml), section("CHATS", chatHtml), section("WORKSPACES", workspaceHtml), section("SKILLS", skillHtml), section("COMANDOS E AGENTES", commandHtml)].join("") || '<div class="command-empty"><strong>Nada encontrado</strong><span>Pesquise chats, comandos, arquivos, skills, agentes, configurações ou workspaces.</span></div>';
}

function localAbsolutePath(file) {
  const value = String(file?.path || "");
  if (/^[a-z]:[\\/]/i.test(value) || value.startsWith("/")) return value;
  const root = String(file?.root || "");
  const separator = root.includes("\\") ? "\\" : "/";
  return `${root.replace(/[\\/]$/, "")}${separator}${value.replace(/^[\\/]/, "")}`;
}

function renderContextManager(chat) {
  const usage = contextUsage(chat);
  const contextItems = [
    ...chat.selectedSkills.map((skill, index) => `<button type="button" data-remove-skill="${index}" title="Remover skill"><b>$</b>${escapeHtml(skill.displayName || skill.name)}<span>×</span></button>`),
    ...chat.selectedMentions.map((file, index) => `<button type="button" data-remove-mention="${index}" title="Remover arquivo"><b>@</b>${escapeHtml(file.name)}<span>×</span></button>`)
  ];
  const fileResults = chat.fileSearchResults.length
    ? `<div class="context-file-results">${chat.fileSearchResults.slice(0, 12).map((file, index) => `<button type="button" data-file-result="${index}"><b>${file.match_type === "directory" ? "DIR" : "ARQ"}</b><span><strong>${escapeHtml(file.file_name)}</strong><small>${escapeHtml(file.path)}</small></span><i>+</i></button>`).join("")}</div>`
    : chat.contextFileQuery ? '<div class="context-file-empty">Nenhum arquivo correspondente.</div>' : "";
  return `<div class="context-manager">
    <section class="context-overview"><div class="context-ring" style="--context-percent:${usage.percent.toFixed(1)}%"><strong>${usage.windowSize ? `${Math.round(usage.percent)}%` : "—"}</strong><small>contexto</small></div><div><span>Janela da conversa</span><strong>${usage.windowSize ? `${formatTokens(usage.used)} de ${formatTokens(usage.windowSize)} tokens` : "Aguardando a primeira resposta"}</strong><small>O Hub usa a telemetria real do App Server, não uma estimativa por caracteres.</small></div></section>
    <section class="context-automation"><label><span><strong>Compactação automática</strong><small>Resume o histórico quando o limite escolhido for atingido.</small></span><input class="auto-compact-toggle" type="checkbox" ${chat.autoCompact ? "checked" : ""}></label><label class="context-threshold"><span>Compactar em <output>${chat.compactThreshold}%</output></span><input type="range" min="70" max="95" step="1" value="${chat.compactThreshold}"></label><button class="compact-now" type="button" ${chat.compacting || chat.status === "busy" ? "disabled" : ""}>${chat.compacting ? "Compactando…" : "Compactar agora"}</button></section>
    <section class="context-selected"><div><strong>Contexto da próxima mensagem</strong><small>É limpo após o envio para evitar repetir tokens.</small></div><div class="context-selected-list">${contextItems.join("") || "<span>Nenhuma skill ou arquivo selecionado.</span>"}</div></section>
    <section class="context-file-search"><div><strong>Adicionar arquivo</strong><small>A busca fica restrita ao workspace aprovado.</small></div><label><span>@</span><input type="search" value="${escapeHtml(chat.contextFileQuery || "")}" placeholder="Pesquisar arquivo ou pasta…" autocomplete="off"></label>${fileResults}</section>
  </div>`;
}

function renderCommandCenter(chat, query = "") {
  const { center, title, search, content } = commandCenterElements(chat);
  if (!center || center.hidden || !content) return;
  const view = chat.commandView || "commands";
  title.textContent = view === "all" ? "Central de Comando" : view === "skills" ? "Skills" : view === "context" ? "Contexto" : "Comandos";
  search.hidden = view === "context";
  search.closest("label").hidden = view === "context";
  search.placeholder = view === "all" ? "Chats, comandos, arquivos, skills, agentes…" : "Pesquisar comandos…";
  if (view === "all") content.innerHTML = renderGlobalCommandList(chat, query);
  if (view === "commands") content.innerHTML = renderCommandList(chat, query);
  if (view === "skills") content.innerHTML = renderSkillsList(chat, query);
  if (view === "context") content.innerHTML = renderContextManager(chat);

  content.querySelectorAll("[data-command-name]").forEach((button) => button.addEventListener("click", () => {
    const command = SLASH_COMMANDS.find((item) => item.name === button.dataset.commandName);
    if (command) executeSlashCommand(chat, command.name);
  }));
  content.querySelectorAll("[data-command-chat]").forEach((button) => button.addEventListener("click", () => {
    const target = state.chats.find((item) => item.id === button.dataset.commandChat);
    closeCommandCenter(chat);
    if (target) activateChat(target, true);
  }));
  content.querySelectorAll("[data-global-skill-path]").forEach((button) => button.addEventListener("click", () => {
    const skill = skillsForChat(chat).find((item) => item.path === button.dataset.globalSkillPath);
    if (skill) selectSkill(chat, skill);
  }));
  content.querySelectorAll("[data-command-workspace]").forEach((button) => button.addEventListener("click", () => {
    state.selectedWorkspaceId = button.dataset.commandWorkspace;
    renderWorkspaceSelect();
    persistState();
    closeCommandCenter(chat);
    showToast("Workspace selecionado para novos chats.");
  }));
  content.querySelectorAll("[data-command-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.commandAction;
    closeCommandCenter(chat);
    if (action === "new") addChat();
    if (action === "context") openCommandCenter(chat, "context", "", false);
    if (action === "approvals") openApprovalDrawer();
    if (action === "control") { updateControlUI(); elements.controlModal?.showModal(); }
    if (action === "settings") openAppearanceSettings();
  }));
  content.querySelectorAll("[data-skill-index]").forEach((button) => button.addEventListener("click", () => {
    const skill = filteredSkills(chat, search.value)[Number(button.dataset.skillIndex)];
    if (skill) selectSkill(chat, skill);
  }));
  content.querySelectorAll("[data-refresh-skills]").forEach((button) => button.addEventListener("click", () => {
    button.disabled = true;
    loadSkillsForChat(chat, true).then(() => renderCommandCenter(chat, search.value));
  }));
  content.querySelectorAll("[data-remove-skill]").forEach((button) => button.addEventListener("click", () => {
    chat.selectedSkills.splice(Number(button.dataset.removeSkill), 1);
    updateComposerContext(chat);
    renderCommandCenter(chat);
  }));
  content.querySelectorAll("[data-remove-mention]").forEach((button) => button.addEventListener("click", () => {
    chat.selectedMentions.splice(Number(button.dataset.removeMention), 1);
    updateComposerContext(chat);
    renderCommandCenter(chat);
  }));
  const autoCompact = content.querySelector(".auto-compact-toggle");
  autoCompact?.addEventListener("change", () => {
    chat.autoCompact = autoCompact.checked;
    persistState();
  });
  const threshold = content.querySelector(".context-threshold input");
  threshold?.addEventListener("input", () => {
    chat.compactThreshold = Number(threshold.value);
    content.querySelector(".context-threshold output").textContent = `${chat.compactThreshold}%`;
    persistState();
  });
  content.querySelector(".compact-now")?.addEventListener("click", () => compactChat(chat));
  const fileSearch = content.querySelector(".context-file-search input");
  fileSearch?.addEventListener("input", () => queueContextFileSearch(chat, fileSearch.value));
  content.querySelectorAll("[data-file-result]").forEach((button) => button.addEventListener("click", () => {
    const file = chat.fileSearchResults[Number(button.dataset.fileResult)];
    if (file) selectMention(chat, file);
  }));
}

function selectableOptions(chat) {
  return Array.from(commandCenterElements(chat).content?.querySelectorAll("[data-selectable-index]") || []);
}

function moveCommandSelection(chat, delta) {
  const options = selectableOptions(chat);
  if (!options.length) return;
  chat.commandSelection = (chat.commandSelection + delta + options.length) % options.length;
  options.forEach((button, index) => button.classList.toggle("active", index === chat.commandSelection));
  options[chat.commandSelection]?.scrollIntoView({ block: "nearest" });
}

function chooseCommandSelection(chat) {
  selectableOptions(chat)[chat.commandSelection]?.click();
}

function handleCommandCenterKeydown(chat, event) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveCommandSelection(chat, event.key === "ArrowDown" ? 1 : -1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    chooseCommandSelection(chat);
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeCommandCenter(chat);
    chatElement(chat)?.querySelector("textarea")?.focus();
  }
}

function handleComposerInput(chat, textarea) {
  autoSizeTextarea(textarea);
  const value = textarea.value;
  if (/^\/[^\s]*$/.test(value)) {
    openCommandCenter(chat, "commands", value.slice(1), false);
  } else if (/^\$[^\s]*$/.test(value)) {
    openCommandCenter(chat, "skills", value.slice(1), false);
  } else if (["commands", "skills"].includes(chat.commandView)) {
    closeCommandCenter(chat);
  }
}

function handleComposerKeydown(chat, textarea, event) {
  const centerOpen = !commandCenterElements(chat).center?.hidden;
  if (centerOpen && ["all", "commands", "skills"].includes(chat.commandView)) {
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      moveCommandSelection(chat, event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
      event.preventDefault();
      chooseCommandSelection(chat);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeCommandCenter(chat);
      return;
    }
  }
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendChat(chat);
  }
}

function clearComposer(chat) {
  const textarea = chatElement(chat)?.querySelector("textarea");
  if (!textarea) return;
  textarea.value = "";
  chat.companionInputActive = false;
  autoSizeTextarea(textarea);
  syncCompanion(chat);
}

function selectSkill(chat, skill) {
  const existing = chat.selectedSkills.findIndex((item) => item.path === skill.path);
  if (existing >= 0) chat.selectedSkills.splice(existing, 1);
  else chat.selectedSkills.push({ name: skill.name, displayName: skill.displayName, path: skill.path });
  clearComposer(chat);
  updateComposerContext(chat);
  closeCommandCenter(chat);
  emitCompanionEvent(chat, "ai:memory", { fallback: companionStateForChat(chat) });
  chatElement(chat)?.querySelector("textarea")?.focus();
}

function selectMention(chat, file) {
  const mention = { name: file.file_name || file.path, path: localAbsolutePath(file) };
  if (!chat.selectedMentions.some((item) => item.path.toLowerCase() === mention.path.toLowerCase())) chat.selectedMentions.push(mention);
  chat.fileSearchResults = [];
  chat.contextFileQuery = "";
  updateComposerContext(chat);
  renderCommandCenter(chat);
  emitCompanionEvent(chat, "ai:memory", { fallback: companionStateForChat(chat) });
}

function queueContextFileSearch(chat, query) {
  chat.contextFileQuery = String(query || "").slice(0, 180);
  clearTimeout(chat.fileSearchTimer);
  const sequence = ++chat.fileSearchSequence;
  if (!chat.contextFileQuery.trim()) {
    chat.fileSearchResults = [];
    renderCommandCenter(chat);
    return;
  }
  chat.fileSearchTimer = setTimeout(async () => {
    try {
      const result = await rpc("fuzzyFileSearch", { query: chat.contextFileQuery, roots: [chat.cwd] });
      if (sequence !== chat.fileSearchSequence) return;
      chat.fileSearchResults = Array.isArray(result?.files) ? result.files : [];
      renderCommandCenter(chat);
      requestAnimationFrame(() => {
        const input = commandCenterElements(chat).content?.querySelector(".context-file-search input");
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
    } catch (error) {
      if (sequence === chat.fileSearchSequence) showToast(error.message);
    }
  }, 220);
}

function updateComposerContext(chat) {
  const panel = chatElement(chat);
  if (!panel) return;
  const usage = contextUsage(chat);
  const meter = panel.querySelector(".context-meter-mini u");
  if (meter) meter.style.width = `${usage.percent}%`;
  const percent = panel.querySelector(".context-percent");
  if (percent) percent.textContent = usage.windowSize ? `${Math.round(usage.percent)}%` : "—";
  panel.querySelectorAll(".skill-count").forEach((skillCount) => {
    skillCount.textContent = chat.selectedSkills.length;
    skillCount.hidden = !chat.selectedSkills.length;
  });
  const list = panel.querySelector(".context-chip-list");
  if (!list) return;
  const chips = [
    ...(chat.planMode ? [{ type: "plan", label: "Plano na próxima tarefa" }] : []),
    ...chat.selectedSkills.map((item, index) => ({ type: "skill", index, label: `$${item.displayName || item.name}` })),
    ...chat.selectedMentions.map((item, index) => ({ type: "mention", index, label: `@${item.name}` }))
  ];
  list.innerHTML = chips.map((chip) => `<button type="button" data-chip-type="${chip.type}" data-chip-index="${chip.index ?? ""}">${escapeHtml(chip.label)}<span>×</span></button>`).join("");
  list.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.chipType === "plan") chat.planMode = false;
    if (button.dataset.chipType === "skill") chat.selectedSkills.splice(Number(button.dataset.chipIndex), 1);
    if (button.dataset.chipType === "mention") chat.selectedMentions.splice(Number(button.dataset.chipIndex), 1);
    persistState();
    updateComposerContext(chat);
  }));
}

async function compactChat(chat, automatic = false) {
  if (chat.compacting || chat.status === "busy" || !state.ready) return;
  try {
    await ensureAttached(chat);
    chat.compacting = true;
    chat.status = "busy";
    chat.companionWorkState = "processing";
    emitCompanionEvent(chat, "ai:memory", { fallback: "processing" });
    chat.lastCompactedAt = Date.now();
    chat.compactionEntryId = `context-compact-${Date.now()}`;
    upsertTimeline(chat, { id: chat.compactionEntryId, kind: "activity", title: "Otimização de contexto", text: automatic ? "Limite automático atingido." : "Compactação solicitada.", status: "compactando", open: true });
    closeCommandCenter(chat);
    updateChat(chat);
    await rpc("thread/compact/start", { threadId: chat.threadId });
  } catch (error) {
    chat.compacting = false;
    chat.status = "error";
    chat.error = error.message;
    finishCompanionTurn(chat, false);
    upsertTimeline(chat, { id: `compact-error-${Date.now()}`, kind: "error", text: error.message });
    updateChat(chat);
  }
}

function maybeAutoCompact(chat) {
  const usage = contextUsage(chat);
  if (!chat.autoCompact || !usage.windowSize || usage.percent < chat.compactThreshold || chat.status !== "idle" || chat.compacting) return;
  if (Date.now() - chat.lastCompactedAt < 60_000) return;
  compactChat(chat, true);
}

async function executeSlashCommand(chat, rawCommand) {
  const source = String(rawCommand || "").trim();
  const [token, ...argumentParts] = source.split(/\s+/);
  const normalized = token.toLowerCase();
  const command = SLASH_COMMANDS.find((item) => item.name === normalized || item.aliases?.includes(normalized));
  if (!command) {
    showToast(`Comando desconhecido: ${token}`);
    return true;
  }
  if (command.support !== "hub") {
    showToast(`${command.name} pertence ao ${commandSupportLabel(command.support)} e ainda não possui equivalente seguro no Hub.`);
    openCommandCenter(chat, "commands", command.name.slice(1));
    return true;
  }
  const argument = argumentParts.join(" ").trim();
  clearComposer(chat);
  closeCommandCenter(chat);
  if (command.action === "new" || command.action === "side") addChat({ workspaceId: chat.workspaceId, cwd: chat.cwd });
  if (command.action === "rename") {
    if (!argument) {
      const textarea = chatElement(chat)?.querySelector("textarea");
      textarea.value = "/rename ";
      textarea.focus();
      return true;
    }
    chat.title = argument.slice(0, 120);
    if (chat.threadId) rpc("thread/name/set", { threadId: chat.threadId, name: chat.title }).catch(() => {});
    persistState();
    updateChat(chat);
  }
  if (command.action === "compact") compactChat(chat);
  if (command.action === "context") openCommandCenter(chat, "context");
  if (command.action === "skills") openCommandCenter(chat, "skills");
  if (command.action === "mention") {
    openCommandCenter(chat, "context");
    requestAnimationFrame(() => commandCenterElements(chat).content?.querySelector(".context-file-search input")?.focus());
  }
  if (command.action === "commands") openCommandCenter(chat, "commands");
  if (command.action === "settings") openAppearanceSettings();
  if (command.action === "permissions") openPermissionCenter(argument || null);
  if (command.action === "approvals") openApprovalDrawer();
  if (command.action === "resume") {
    openSidebar();
    elements.refreshHistory.click();
  }
  if (command.action === "stop") interruptChat(chat);
  if (command.action === "exit") closeChat(chat.id);
  if (command.action === "plan") {
    chat.planMode = !chat.planMode;
    persistState();
    updateComposerContext(chat);
    showToast(chat.planMode ? "Modo de plano preparado para a próxima tarefa." : "Modo de plano desativado.");
  }
  if (command.action === "copy") {
    const last = [...chat.timeline].reverse().find((entry) => entry.kind === "assistant" && entry.text);
    if (!last) showToast("Ainda não existe uma resposta concluída para copiar.");
    else navigator.clipboard.writeText(last.text).then(() => showToast("Resposta copiada.")).catch(() => showToast("Não foi possível acessar a área de transferência."));
  }
  if (command.action === "prompt") {
    const textarea = chatElement(chat)?.querySelector("textarea");
    if (textarea) {
      textarea.value = `${command.prompt}${argument ? `\n\nContexto adicional: ${argument}` : ""}`;
      await sendChat(chat, { skipCommand: true });
    }
  }
  if (command.action === "status") {
    openCommandCenter(chat, "context");
    const usage = contextUsage(chat);
    showToast(`${chat.title} · ${usage.windowSize ? `${Math.round(usage.percent)}% do contexto` : "contexto aguardando uso"}`);
  }
  if (command.action === "review") {
    try {
      await ensureAttached(chat);
      chat.status = "busy";
      chat.companionWorkState = "reading";
      startCompanionTurn(chat);
      updateChat(chat);
      await rpc("review/start", { threadId: chat.threadId, target: { type: "uncommittedChanges" }, delivery: "inline" });
    } catch (error) {
      chat.status = "error";
      chat.error = error.message;
      finishCompanionTurn(chat, false);
      updateChat(chat);
    }
  }
  if (command.action === "fork") {
    try {
      await ensureAttached(chat);
      const result = await rpc("thread/fork", { threadId: chat.threadId, cwd: chat.cwd, permissionMode: state.settings.permissionMode });
      addChat({ threadId: result.thread.id, title: `${chat.title} · ramificação`, cwd: chat.cwd, workspaceId: chat.workspaceId });
    } catch (error) {
      showToast(error.message);
    }
  }
  if (command.action === "diff" || command.action === "init") {
    const textarea = chatElement(chat)?.querySelector("textarea");
    textarea.value = command.action === "diff"
      ? "Revise as alterações atuais do Git, incluindo arquivos não rastreados. Resuma os riscos e os próximos passos."
      : "Crie ou atualize o AGENTS.md deste workspace com instruções claras, específicas e verificáveis para trabalhar neste projeto.";
    await sendChat(chat, { skipCommand: true });
  }
  return true;
}

function findChatByThread(threadId) {
  return state.chats.find((chat) => chat.threadId === threadId);
}

function upsertTimeline(chat, entry) {
  const index = chat.timeline.findIndex((item) => item.id === entry.id);
  const revision = index >= 0 ? Number(chat.timeline[index].revision || 0) + 1 : 1;
  if (index >= 0) chat.timeline[index] = { ...chat.timeline[index], ...entry, revision };
  else chat.timeline.push({ ...entry, createdAt: Number(entry.createdAt) || Date.now(), revision });
  chat.lastActivityAt = Date.now();
  if (chat.timeline.length > 400) chat.timeline = chat.timeline.slice(-400);
}

function scheduleChatUpdate(chat) {
  if (chat.renderScheduled) return;
  chat.renderScheduled = true;
  requestAnimationFrame(() => {
    chat.renderScheduled = false;
    updateChat(chat);
  });
}

function appendBoundedOutput(current, delta) {
  const combined = `${current || ""}${delta || ""}`;
  if (combined.length <= COMMAND_OUTPUT_LIMIT) return combined;
  return `[saída anterior recolhida pelo Hub]\n${combined.slice(-COMMAND_OUTPUT_LIMIT)}`;
}

function textFromUserContent(content) {
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (part.type === "text") return part.text || "";
    if (part.type === "image" || part.type === "localImage") return `[Imagem: ${part.path || part.url || "anexo"}]`;
    if (part.type === "audio" || part.type === "localAudio") return `[Áudio: ${part.path || part.url || "anexo"}]`;
    if (part.type === "skill") return "";
    return "";
  }).filter(Boolean).join("\n");
}

function itemToEntry(item) {
  if (!item || !item.type) return null;
  if (item.type === "userMessage") {
    return { id: item.clientId || item.id, serverId: item.id, kind: "user", text: textFromUserContent(item.content) };
  }
  if (item.type === "agentMessage") {
    return { id: item.id, kind: "assistant", text: item.text || "", streaming: false };
  }
  if (item.type === "plan") {
    return { id: item.id, kind: "activity", title: "Plano de trabalho", text: item.text || "", status: "atualizado", open: true };
  }
  if (item.type === "reasoning") {
    return { id: item.id, kind: "activity", title: "Análise operacional", text: (item.summary || []).join("\n"), status: "concluído" };
  }
  if (item.type === "commandExecution") {
    return { id: item.id, kind: "activity", title: "Comando", text: item.command || "", details: item.aggregatedOutput || "", status: item.status || "executando" };
  }
  if (item.type === "fileChange") {
    const changes = (item.changes || []).map((change) => change.path || change.file || JSON.stringify(change)).join("\n");
    return { id: item.id, kind: "activity", title: "Alterações em arquivos", details: changes, status: item.status || "processando" };
  }
  if (item.type === "mcpToolCall") {
    return { id: item.id, kind: "activity", title: `${item.server} · ${item.tool}`, details: JSON.stringify(item.arguments || {}, null, 2), status: item.status || "executando" };
  }
  if (item.type === "dynamicToolCall") {
    return { id: item.id, kind: "activity", title: item.tool || "Ferramenta", details: JSON.stringify(item.arguments || {}, null, 2), status: item.status || "executando" };
  }
  if (item.type === "collabAgentToolCall") {
    return { id: item.id, kind: "activity", title: `Agentes · ${item.tool || "coordenação"}`, text: item.prompt || "", status: item.status || "executando" };
  }
  if (item.type === "subAgentActivity") {
    return { id: item.id, kind: "activity", title: "Agente auxiliar", text: item.agentPath || item.agentThreadId || "", status: item.kind || "ativo" };
  }
  if (item.type === "webSearch") {
    return { id: item.id || crypto.randomUUID(), kind: "activity", title: "Pesquisa na web", status: "concluída" };
  }
  if (item.type === "imageView") {
    return { id: item.id, kind: "activity", title: "Imagem analisada", text: item.path || "", status: "concluído" };
  }
  if (item.type === "contextCompaction") {
    return { id: item.id, kind: "activity", title: "Contexto otimizado", text: "O histórico anterior foi resumido para liberar espaço.", status: "concluído" };
  }
  return null;
}

async function ensureAttached(chat) {
  if (!chat.threadId) {
    const response = await rpc("thread/start", {
      cwd: chat.cwd,
      runtimeWorkspaceRoots: [chat.cwd],
      permissionMode: state.settings.permissionMode,
      experimentalRawEvents: false
    });
    chat.threadId = response.thread.id;
    chat.attached = true;
    chat.hydrated = true;
    persistState();
    loadHistory();
    return;
  }

  if (!chat.attached) {
    const response = await rpc("thread/resume", {
      threadId: chat.threadId,
      cwd: chat.cwd,
      runtimeWorkspaceRoots: [chat.cwd],
      permissionMode: state.settings.permissionMode,
      excludeTurns: true
    });
    chat.threadId = response.thread.id;
    chat.attached = true;
  }
}

function messageInput(message) {
  return [
    { type: "text", text: message.text, text_elements: [] },
    ...message.skills.map((skill) => ({ type: "skill", name: skill.name, path: skill.path })),
    ...message.mentions.map((mention) => ({ type: "mention", name: mention.name, path: mention.path }))
  ];
}

function takeComposerMessage(chat, textarea, text) {
  const message = {
    id: crypto.randomUUID(),
    text,
    skills: [...chat.selectedSkills],
    mentions: [...chat.selectedMentions],
    planMode: chat.planMode,
    status: "queued",
    createdAt: Date.now()
  };
  textarea.value = "";
  chat.selectedSkills = [];
  chat.selectedMentions = [];
  chat.planMode = false;
  autoSizeTextarea(textarea);
  updateComposerContext(chat);
  return message;
}

function renderMessageQueue(chat) {
  const container = chatElement(chat)?.querySelector(".message-queue");
  if (!container) return;
  container.hidden = chat.messageQueue.length === 0;
  container.innerHTML = chat.messageQueue.map((message, index) => {
    const label = message.status === "sending" ? "enviando" : message.status === "error" ? "falhou" : index === 0 ? "próxima" : `fila ${index + 1}`;
    return `<div class="queued-message ${escapeHtml(message.status)}" data-queued-message="${escapeHtml(message.id)}"><b>${index + 1}</b><span title="${escapeHtml(message.text)}">${escapeHtml(message.text)}</span><button type="button" title="${escapeHtml(message.error || `Remover · ${label}`)}" aria-label="Remover mensagem da fila">×</button></div>`;
  }).join("");
  container.querySelectorAll("[data-queued-message] button").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest("[data-queued-message]");
      chat.messageQueue = chat.messageQueue.filter((message) => message.id !== item.dataset.queuedMessage);
      renderMessageQueue(chat);
      updateChat(chat);
      continueMessageQueue(chat);
    });
  });
}

async function dispatchChatMessage(chat, message) {
  const clientUserMessageId = message.id;
  emitCompanionEvent(chat, "user:message", { fallback: "thinking", duration: 420 });
  upsertTimeline(chat, { id: clientUserMessageId, kind: "user", text: message.text });
  if (chat.title === "Novo chat") chat.title = message.text.replace(/\s+/g, " ").slice(0, 48);
  chat.status = "busy";
  chat.justCompleted = false;
  chat.companionInputActive = false;
  chat.companionWorkState = "thinking";
  startCompanionTurn(chat);
  state.activeChatId = chat.id;
  chat.lastActivityAt = Date.now();
  chat.error = null;
  nexus.ping(chat.id, "out");
  memorySphere.access(`${chat.id}:instruction:${clientUserMessageId}`, "receive");
  updateChat(chat);
  persistState();

  try {
    await ensureAttached(chat);
    const response = await rpc("turn/start", {
      threadId: chat.threadId,
      clientUserMessageId,
      permissionMode: state.settings.permissionMode,
      controlMode: chat.controlMode,
      planMode: message.planMode,
      input: messageInput(message)
    });
    chat.currentTurnId = response.turn.id;
    chat.status = response.turn.status === "completed" ? "idle" : "busy";
    chat.justCompleted = response.turn.status === "completed";
    if (chat.justCompleted) finishCompanionTurn(chat, true);
    scheduleChatUpdate(chat);
    if (chat.justCompleted) scheduleCompanionSettle(chat);
    continueMessageQueue(chat);
  } catch (error) {
    chat.status = "error";
    chat.error = error.message;
    finishCompanionTurn(chat, false);
    upsertTimeline(chat, { id: `error-${Date.now()}`, kind: "error", text: error.message });
    updateChat(chat);
  }
}

async function drainMessageQueue(chat) {
  if (chat.queueDraining || chat.status !== "busy" || !chat.currentTurnId || !chat.messageQueue.length) return;
  const message = chat.messageQueue[0];
  if (message.status === "error") return;
  chat.queueDraining = true;
  message.status = "sending";
  renderMessageQueue(chat);
  try {
    await rpc("turn/steer", {
      threadId: chat.threadId,
      expectedTurnId: chat.currentTurnId,
      input: messageInput(message)
    });
    chat.messageQueue.shift();
    showToast("Mensagem adicionada ao turno ativo.");
  } catch (error) {
    if (/turno ativo mudou|não existe um turno ativo/i.test(error.message)) {
      message.status = "queued";
    } else {
      message.status = "error";
      message.error = error.message;
    }
  } finally {
    chat.queueDraining = false;
    renderMessageQueue(chat);
    updateChat(chat);
    continueMessageQueue(chat);
  }
}

function continueMessageQueue(chat) {
  if (chat.queueDraining || !chat.messageQueue.length || chat.messageQueue[0].status === "error") return;
  if (chat.status === "busy") {
    if (chat.currentTurnId) void drainMessageQueue(chat);
    return;
  }
  const next = chat.messageQueue.shift();
  renderMessageQueue(chat);
  void dispatchChatMessage(chat, next);
}

async function sendChat(chat, options = {}) {
  const panel = chatElement(chat);
  const textarea = panel?.querySelector("textarea");
  const text = textarea?.value.trim();
  if (!text || !state.ready) return;
  if (!options.skipCommand && text.startsWith("/")) {
    await executeSlashCommand(chat, text);
    return;
  }
  if (chat.controlMode === "computer" && !computerControlActive()) {
    elements.controlModal?.showModal();
    showToast("Ative uma sessão temporária antes de usar o modo PC.");
    return;
  }
  if (chat.status === "busy" && chat.messageQueue.length >= MESSAGE_QUEUE_LIMIT) {
    showToast(`A fila deste chat atingiu ${MESSAGE_QUEUE_LIMIT} mensagens.`);
    return;
  }
  const message = takeComposerMessage(chat, textarea, text);
  if (chat.status === "busy") {
    chat.messageQueue.push(message);
    renderMessageQueue(chat);
    updateChat(chat);
    continueMessageQueue(chat);
    return;
  }
  await dispatchChatMessage(chat, message);
}

async function interruptChat(chat) {
  if (!chat.threadId || !chat.currentTurnId) return;
  try {
    await rpc("turn/interrupt", { threadId: chat.threadId, turnId: chat.currentTurnId });
  } catch (error) {
    upsertTimeline(chat, { id: `error-${Date.now()}`, kind: "error", text: error.message });
  }
}

function handleCodexNotification(method, params) {
  if (method === "thread/tokenUsage/updated") {
    const chat = findChatByThread(params.threadId || params.conversationId);
    if (!chat) return;
    chat.tokenUsage = params.tokenUsage || null;
    updateComposerContext(chat);
    const usage = contextUsage(chat);
    if (usage.windowSize && usage.percent >= 80 && !chat.companionContextWarning) {
      chat.companionContextWarning = true;
      lookCompanionAt(chat, "context", 1200);
    } else if (usage.percent < 75) {
      chat.companionContextWarning = false;
    }
    if (chat.commandView === "context") renderCommandCenter(chat);
    maybeAutoCompact(chat);
    return;
  }

  if (method === "thread/compacted") {
    const chat = findChatByThread(params.threadId);
    if (!chat) return;
    chat.compacting = false;
    chat.status = "idle";
    chat.companionWorkState = null;
    chat.tokenUsage = null;
    emitCompanionEvent(chat, "ai:memory", { fallback: "idle" });
    if (chat.compactionEntryId) {
      upsertTimeline(chat, { id: chat.compactionEntryId, kind: "activity", title: "Contexto otimizado", text: "Os pontos importantes foram preservados em um resumo compacto.", status: "concluído", open: true });
    }
    showToast("Contexto compactado. A conversa pode continuar com mais espaço.");
    updateChat(chat);
    return;
  }

  if (method === "turn/started") {
    const chat = findChatByThread(params.threadId);
    if (!chat) return;
    chat.currentTurnId = params.turn?.id || null;
    chat.status = "busy";
    chat.companionWorkState = "thinking";
    if (!chat.companionTurnStartedAt || Date.now() - chat.companionTurnStartedAt > 10_000) startCompanionTurn(chat);
    state.activeChatId = chat.id;
    chat.lastActivityAt = Date.now();
    memorySphere.access(`${chat.id}:turn:${chat.currentTurnId || Date.now()}`, "receive");
    updateChat(chat);
    continueMessageQueue(chat);
    return;
  }

  if (method === "turn/completed") {
    const chat = findChatByThread(params.threadId);
    if (!chat) return;
    chat.currentTurnId = null;
    chat.status = params.turn?.status === "failed" ? "error" : "idle";
    chat.justCompleted = chat.status === "idle";
    finishCompanionTurn(chat, chat.status === "idle");
    chat.lastActivityAt = Date.now();
    memorySphere.access(`${chat.id}:result:${params.turn?.id || Date.now()}`, chat.status === "error" ? "error" : "respond");
    nexus.ping(chat.id, "in");
    if (params.turn?.error?.message) {
      upsertTimeline(chat, { id: `turn-error-${params.turn.id}`, kind: "error", text: params.turn.error.message });
    }
    updateChat(chat);
    if (chat.justCompleted) scheduleCompanionSettle(chat);
    persistState();
    loadHistory();
    setTimeout(() => maybeAutoCompact(chat), 80);
    setTimeout(() => continueMessageQueue(chat), 0);
    return;
  }

  if (method === "item/agentMessage/delta") {
    const chat = findChatByThread(params.threadId);
    if (!chat) return;
    const existing = chat.timeline.find((entry) => entry.id === params.itemId);
    if (!existing) {
      nexus.ping(chat.id, "in");
      memorySphere.access(`${chat.id}:response:${params.itemId}`, "respond");
    }
    chat.companionWorkState = "processing";
    upsertTimeline(chat, {
      id: params.itemId,
      kind: "assistant",
      text: `${existing?.text || ""}${params.delta || ""}`,
      streaming: true
    });
    scheduleChatUpdate(chat);
    return;
  }

  if (method === "item/started" || method === "item/completed") {
    const chat = findChatByThread(params.threadId);
    if (!chat) return;
    if (method === "item/started") startCompanionItem(chat, params.item);
    else completeCompanionItem(chat, params.item);
    const entry = itemToEntry(params.item);
    if (entry) {
      if (method === "item/started") entry.startedAt = Date.now();
      if (method === "item/completed") entry.completedAt = Date.now();
      if (method === "item/started") memorySphere.access(`${chat.id}:memory:${entry.id}`, memoryPhaseForEntry(entry));
      if (method === "item/started" && entry.kind === "assistant") entry.streaming = true;
      if (method === "item/completed" && entry.kind === "assistant") entry.streaming = false;
      upsertTimeline(chat, entry);
      scheduleChatUpdate(chat);
    }
    return;
  }

  if (method === "item/commandExecution/outputDelta") {
    const chat = findChatByThread(params.threadId);
    if (!chat) return;
    const existing = chat.timeline.find((entry) => entry.id === params.itemId) || {
      id: params.itemId,
      kind: "activity",
      title: "Comando",
      status: "executando"
    };
    chat.companionWorkState = "coding";
    syncCompanion(chat);
    upsertTimeline(chat, { ...existing, details: appendBoundedOutput(existing.details, params.delta) });
    scheduleChatUpdate(chat);
    return;
  }

  if (method === "thread/name/updated") {
    const chat = findChatByThread(params.threadId);
    if (chat && params.name) {
      chat.title = params.name;
      updateChat(chat);
      persistState();
    }
    return;
  }

  if (method === "error") {
    const chat = findChatByThread(params.threadId);
    if (chat) {
      upsertTimeline(chat, { id: `notification-error-${Date.now()}`, kind: "error", text: params.error?.message || params.message || "Erro inesperado do Codex." });
      chat.status = "error";
      finishCompanionTurn(chat, false);
      memorySphere.access(`${chat.id}:error:${Date.now()}`, "error");
      updateChat(chat);
    }
  }
}

async function hydrateChat(chat, force = false) {
  if (!state.ready || !chat.threadId || chat.hydrating || (chat.hydrated && !force)) return;
  chat.hydrating = true;
  chat.historyCursor = null;
  updateChat(chat);
  try {
    const response = await rpc("thread/read", { threadId: chat.threadId, includeTurns: false });
    const thread = response.thread;
    const page = await rpc("thread/turns/list", {
      threadId: chat.threadId,
      limit: 20,
      sortDirection: "desc",
      itemsView: "full"
    });
    chat.timeline = timelineFromTurns([...(page.data || [])].reverse());
    chat.historyCursor = typeof page.nextCursor === "string" ? page.nextCursor : null;
    chat.cwd = thread.cwd || chat.cwd;
    chat.title = thread.name || thread.preview || chat.title;
    chat.hydrated = true;
    chat.error = null;
  } catch (error) {
    chat.error = error.message;
    if (!chat.timeline.length) upsertTimeline(chat, { id: `hydrate-error-${Date.now()}`, kind: "error", text: error.message });
  } finally {
    chat.hydrating = false;
    updateChat(chat);
    persistState();
  }
}

function timelineFromTurns(turns) {
  const timeline = [];
  const timelineIndexes = new Map();
  for (const turn of turns || []) {
    for (const item of turn.items || []) {
      const entry = itemToEntry(item);
      if (!entry) continue;
      const index = timelineIndexes.get(entry.id);
      if (index !== undefined) timeline[index] = entry;
      else {
        timelineIndexes.set(entry.id, timeline.length);
        timeline.push(entry);
      }
    }
  }
  return timeline;
}

async function loadOlderTurns(chat) {
  if (!state.ready || !chat.threadId || !chat.historyCursor || chat.loadingOlder) return;
  const panel = chatElement(chat);
  const stream = panel?.querySelector(".chat-stream");
  const previousHeight = stream?.scrollHeight || 0;
  const cursor = chat.historyCursor;
  chat.loadingOlder = true;
  updateChat(chat);
  try {
    const page = await rpc("thread/turns/list", {
      threadId: chat.threadId,
      cursor,
      limit: 20,
      sortDirection: "desc",
      itemsView: "full"
    });
    const older = timelineFromTurns([...(page.data || [])].reverse());
    const existingIds = new Set(chat.timeline.map((entry) => String(entry.id)));
    chat.timeline = [...older.filter((entry) => !existingIds.has(String(entry.id))), ...chat.timeline];
    chat.historyCursor = typeof page.nextCursor === "string" ? page.nextCursor : null;
    if (chat.timeline.length >= 380) chat.historyCursor = null;
    chat.error = null;
  } catch (error) {
    chat.error = error.message;
    showToast(`Não foi possível carregar mensagens anteriores: ${error.message}`);
  } finally {
    chat.loadingOlder = false;
    updateChat(chat);
    requestAnimationFrame(() => {
      if (stream) stream.scrollTop += Math.max(0, stream.scrollHeight - previousHeight);
    });
  }
}

function hydrateRestoredChats() {
  for (const chat of state.chats) {
    if (chat.threadId) hydrateChat(chat);
  }
}

async function loadHistory(reset = true) {
  if (!state.ready || state.loadingHistory) return;
  state.loadingHistory = true;
  try {
    const cursor = reset ? null : state.historyCursor;
    const response = await rpc("thread/list", {
      limit: 40,
      sortKey: "recency_at",
      sortDirection: "desc",
      archived: false,
      ...(cursor ? { cursor } : {})
    });
    const incoming = Array.isArray(response.data) ? response.data : [];
    if (reset) state.history = incoming;
    else {
      const knownIds = new Set(state.history.map((thread) => thread.id));
      state.history.push(...incoming.filter((thread) => !knownIds.has(thread.id)));
    }
    state.historyCursor = typeof response.nextCursor === "string" ? response.nextCursor : null;
    state.historyError = null;
  } catch (error) {
    state.historyError = error.message;
    if (!reset) showToast(`Não foi possível carregar mais conversas: ${error.message}`);
  } finally {
    state.loadingHistory = false;
    renderHistory();
  }
}

function renderHistory() {
  if (state.historyError && !state.history.length) {
    elements.historyList.innerHTML = `<div class="sidebar-placeholder">${escapeHtml(state.historyError)}</div>`;
    return;
  }
  if (!state.history.length && !state.loadingHistory) {
    elements.historyList.innerHTML = `<div class="sidebar-placeholder">Nenhuma conversa encontrada.</div>`;
    return;
  }
  const items = state.history.map((thread) => {
    const open = state.chats.some((chat) => chat.threadId === thread.id);
    const title = thread.name || thread.preview || "Conversa sem título";
    return `<button class="history-item${open ? " active" : ""}" type="button" data-thread-id="${escapeHtml(thread.id)}"><strong>${escapeHtml(title)}</strong><span class="history-time">${escapeHtml(relativeTime(thread.recencyAt || thread.updatedAt))}</span><small>${escapeHtml(shortPath(thread.cwd))}</small></button>`;
  }).join("");
  const more = state.historyCursor
    ? `<button class="history-more-button" type="button" ${state.loadingHistory ? "disabled" : ""}>${state.loadingHistory ? "Carregando…" : "Carregar mais conversas"}</button>`
    : "";
  elements.historyList.innerHTML = `${items}${more}`;
  for (const button of elements.historyList.querySelectorAll("[data-thread-id]")) {
    button.addEventListener("click", () => openHistoryThread(button.dataset.threadId));
  }
  elements.historyList.querySelector(".history-more-button")?.addEventListener("click", () => loadHistory(false));
}

function openHistoryThread(threadId) {
  const existing = state.chats.find((chat) => chat.threadId === threadId);
  if (existing) {
    activateChat(existing, true);
    closeSidebar();
    return;
  }
  const thread = state.history.find((item) => item.id === threadId);
  if (!thread) return;
  const workspace = workspaceForPath(thread.cwd);
  if (!workspace) {
    setConnectionStatus("error", "Workspace não autorizado", "Adicione a pasta dessa conversa antes de retomá-la.");
    return;
  }
  const chat = addChat({
    threadId: thread.id,
    title: thread.name || thread.preview || "Conversa",
    cwd: thread.cwd,
    workspaceId: workspace?.id || "unknown"
  }, false);
  if (chat) hydrateChat(chat);
  closeSidebar();
}

function openApprovalDrawer() {
  elements.approvalDrawer.classList.add("open");
  elements.drawerScrim.classList.add("open");
}

function closeApprovalDrawer() {
  elements.approvalDrawer.classList.remove("open");
  elements.drawerScrim.classList.remove("open");
}

function approvalHeading(method) {
  if (method === "item/commandExecution/requestApproval") return "Executar comando";
  if (method === "item/fileChange/requestApproval") return "Alterar arquivos";
  if (method === "execCommandApproval") return "Executar comando";
  if (method === "applyPatchApproval") return "Aplicar alterações";
  if (method === "item/tool/requestUserInput") return "Codex precisa de uma resposta";
  if (method === "item/permissions/requestApproval") return "Permissão adicional";
  if (method === "mcpServer/elicitation/request") return "Solicitação de integração";
  return "Ação pendente";
}

function advertisedCommandDecisions(params) {
  const decisions = Array.isArray(params.availableDecisions) && params.availableDecisions.length
    ? params.availableDecisions
    : ["accept", "acceptForSession", "decline"];
  return decisions;
}

function commandApprovalActions(request) {
  const actions = [];
  for (const decision of advertisedCommandDecisions(request.params || {})) {
    if (decision === "accept") actions.push({ label: "Aprovar uma vez", className: "approve", action: () => respondToServerRequest(request, { decision }) });
    else if (decision === "acceptForSession") actions.push({ label: "Aprovar nesta sessão", className: "approve", action: () => respondToServerRequest(request, { decision }) });
    else if (decision === "decline") actions.push({ label: "Recusar", className: "deny", action: () => respondToServerRequest(request, { decision }) });
    else if (decision === "cancel") actions.push({ label: "Cancelar", className: "deny", action: () => respondToServerRequest(request, { decision }) });
    else if (decision && typeof decision === "object" && decision.acceptWithExecpolicyAmendment) {
      actions.push({ label: "Permitir e lembrar regra", className: "approve", action: () => respondToServerRequest(request, { decision }) });
    } else if (decision && typeof decision === "object" && decision.applyNetworkPolicyAmendment) {
      actions.push({ label: "Aplicar regra de rede", className: "approve", action: () => respondToServerRequest(request, { decision }) });
    }
  }
  if (!actions.some((action) => action.className === "deny")) {
    actions.push({ label: "Cancelar", className: "deny", action: () => respondToServerRequest(request, { decision: "cancel" }) });
  }
  return actions;
}

function appendElicitationField(card, name, schema, required) {
  const label = document.createElement("label");
  label.className = "approval-question";
  const heading = document.createElement("strong");
  heading.textContent = `${schema?.title || name}${required ? " *" : ""}`;
  label.append(heading);
  if (schema?.description) label.append(document.createTextNode(schema.description));

  let control;
  const choices = Array.isArray(schema?.enum)
    ? schema.enum.map((value, index) => ({ value, label: schema.enumNames?.[index] || value }))
    : Array.isArray(schema?.oneOf)
      ? schema.oneOf.map((option) => ({ value: option.const, label: option.title || option.const }))
      : Array.isArray(schema?.items?.enum)
        ? schema.items.enum.map((value) => ({ value, label: value }))
        : Array.isArray(schema?.items?.oneOf)
          ? schema.items.oneOf.map((option) => ({ value: option.const, label: option.title || option.const }))
          : [];

  if (choices.length) {
    control = document.createElement("select");
    control.multiple = schema.type === "array";
    for (const choice of choices) {
      const option = document.createElement("option");
      option.value = String(choice.value);
      option.textContent = String(choice.label);
      if (control.multiple && Array.isArray(schema.default)) option.selected = schema.default.includes(choice.value);
      else if (!control.multiple && schema.default === choice.value) option.selected = true;
      control.append(option);
    }
  } else {
    control = document.createElement("input");
    if (schema?.type === "boolean") {
      control.type = "checkbox";
      control.checked = Boolean(schema.default);
    } else if (schema?.type === "number" || schema?.type === "integer") {
      control.type = "number";
      if (Number.isFinite(schema.minimum)) control.min = String(schema.minimum);
      if (Number.isFinite(schema.maximum)) control.max = String(schema.maximum);
      if (schema.type === "integer") control.step = "1";
      if (Number.isFinite(schema.default)) control.value = String(schema.default);
    } else {
      const formats = { email: "email", uri: "url", date: "date", "date-time": "datetime-local" };
      control.type = schema?.writeOnly || schema?.format === "password" ? "password" : formats[schema?.format] || "text";
      if (Number.isFinite(schema?.minLength)) control.minLength = schema.minLength;
      if (Number.isFinite(schema?.maxLength)) control.maxLength = schema.maxLength;
      if (typeof schema?.default === "string") control.value = schema.default;
    }
  }
  control.dataset.elicitationField = name;
  control.dataset.elicitationType = schema?.type || "string";
  control.dataset.elicitationRequired = String(required);
  control.required = required;
  label.append(control);
  card.append(label);
}

function collectElicitationContent(card) {
  const content = {};
  for (const control of card.querySelectorAll("[data-elicitation-field]")) {
    if (!control.reportValidity()) return null;
    const type = control.dataset.elicitationType;
    if (control.dataset.elicitationRequired !== "true" && type !== "boolean" && !control.value) continue;
    if (type === "boolean") content[control.dataset.elicitationField] = control.checked;
    else if (type === "number" || type === "integer") content[control.dataset.elicitationField] = Number(control.value);
    else if (type === "array") content[control.dataset.elicitationField] = Array.from(control.selectedOptions, (option) => option.value);
    else content[control.dataset.elicitationField] = control.value;
  }
  return content;
}

function appendMcpElicitation(card, request) {
  const params = request.params || {};
  const schema = params.requestedSchema && typeof params.requestedSchema === "object" ? params.requestedSchema : {};
  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  for (const [name, fieldSchema] of Object.entries(properties)) appendElicitationField(card, name, fieldSchema || {}, required.has(name));

  if (params.mode === "url" && /^https?:\/\//i.test(String(params.url || ""))) {
    const link = document.createElement("a");
    link.className = "approval-external-link";
    link.href = params.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Abrir página solicitada";
    card.append(link);
  }

  card.append(makeActionRow([
    {
      label: Object.keys(properties).length ? "Aprovar e enviar" : "Aprovar",
      className: "approve",
      action: () => {
        const content = Object.keys(properties).length ? collectElicitationContent(card) : null;
        if (Object.keys(properties).length && content === null) return;
        respondToServerRequest(request, { action: "accept", content, _meta: params._meta || null });
      }
    },
    { label: "Recusar", className: "deny", action: () => respondToServerRequest(request, { action: "decline", content: null, _meta: params._meta || null }) },
    { label: "Cancelar", className: "deny", action: () => respondToServerRequest(request, { action: "cancel", content: null, _meta: params._meta || null }) }
  ]));
}

function renderApprovals() {
  elements.approvalCount.textContent = String(state.approvals.size);
  elements.approvalButton.classList.toggle("has-approvals", state.approvals.size > 0);
  const requests = [...state.approvals.values()];
  for (const chat of state.chats) {
    chat.waitingApproval = requests.some((request) => {
      const threadId = request.params?.threadId;
      return threadId ? threadId === chat.threadId : chat.id === state.activeChatId;
    });
    syncCompanion(chat);
  }
  if (!state.approvals.size) {
    elements.approvalList.innerHTML = `<div class="sidebar-placeholder">Nenhuma ação aguardando sua decisão.</div>`;
    return;
  }

  elements.approvalList.innerHTML = "";
  for (const request of state.approvals.values()) {
    const card = document.createElement("article");
    card.className = "approval-card";
    card.dataset.requestId = String(request.requestId);
    const params = request.params || {};
    const context = params.reason || params.message || params.cwd || (params.serverName ? `Solicitação de ${params.serverName}` : "Revise os detalhes antes de continuar.");
    const chat = findChatByThread(params.threadId);
    card.innerHTML = `<span class="approval-context">${escapeHtml(chat?.title || "Solicitação local")}</span><h3>${escapeHtml(approvalHeading(request.method))}</h3><p>${escapeHtml(context)}</p>`;

    if (request.method === "item/commandExecution/requestApproval") {
      const pre = document.createElement("pre");
      pre.textContent = params.command || JSON.stringify(params.commandActions || [], null, 2);
      card.append(pre);
      card.append(makeActionRow(commandApprovalActions(request)));
    } else if (request.method === "item/fileChange/requestApproval") {
      card.append(makeActionRow([
        { label: "Aprovar alteração", className: "approve", action: () => respondToServerRequest(request, { decision: "accept" }) },
        { label: "Aprovar nesta sessão", className: "approve", action: () => respondToServerRequest(request, { decision: "acceptForSession" }) },
        { label: "Recusar", className: "deny", action: () => respondToServerRequest(request, { decision: "decline" }) }
      ]));
    } else if (request.method === "item/tool/requestUserInput") {
      const questions = Array.isArray(params.questions) ? params.questions : [];
      for (const question of questions) {
        const label = document.createElement("label");
        label.className = "approval-question";
        const heading = document.createElement("strong");
        heading.textContent = question.header || "Pergunta";
        label.append(heading, document.createTextNode(question.question || ""));
        if (Array.isArray(question.options) && question.options.length) {
          const select = document.createElement("select");
          select.dataset.questionId = question.id;
          for (const option of question.options) {
            const optionElement = document.createElement("option");
            optionElement.value = option.label;
            optionElement.textContent = option.label;
            select.append(optionElement);
          }
          label.append(select);
        } else {
          const input = document.createElement("input");
          input.type = question.isSecret ? "password" : "text";
          input.dataset.questionId = question.id;
          label.append(input);
        }
        card.append(label);
      }
      card.append(makeActionRow([
        {
          label: "Responder",
          className: "approve",
          action: () => {
            const answers = {};
            for (const input of card.querySelectorAll("[data-question-id]")) {
              answers[input.dataset.questionId] = { answers: [input.value] };
            }
            respondToServerRequest(request, { answers });
          }
        }
      ]));
    } else if (request.method === "item/permissions/requestApproval") {
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(params.permissions || {}, null, 2);
      card.append(pre);
      const granted = {};
      if (params.permissions?.network) granted.network = params.permissions.network;
      if (params.permissions?.fileSystem) granted.fileSystem = params.permissions.fileSystem;
      card.append(makeActionRow([
        { label: "Aprovar neste turno", className: "approve", action: () => respondToServerRequest(request, { permissions: granted, scope: "turn" }) },
        { label: "Aprovar nesta sessão", className: "approve", action: () => respondToServerRequest(request, { permissions: granted, scope: "session" }) },
        { label: "Recusar", className: "deny", action: () => respondToServerRequest(request, { permissions: { network: { enabled: false }, fileSystem: { read: [], write: [] } }, scope: "turn" }) }
      ]));
    } else if (request.method === "execCommandApproval") {
      const pre = document.createElement("pre");
      pre.textContent = Array.isArray(params.command) ? params.command.join(" ") : String(params.command || "");
      card.append(pre);
      card.append(makeActionRow([
        { label: "Aprovar uma vez", className: "approve", action: () => respondToServerRequest(request, { decision: "approved" }) },
        { label: "Aprovar nesta sessão", className: "approve", action: () => respondToServerRequest(request, { decision: "approved_for_session" }) },
        { label: "Recusar", className: "deny", action: () => respondToServerRequest(request, { decision: { denied: { rejection: "Negado pelo usuário" } } }) }
      ]));
    } else if (request.method === "applyPatchApproval") {
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(params.fileChanges || {}, null, 2);
      card.append(pre);
      card.append(makeActionRow([
        { label: "Aprovar alterações", className: "approve", action: () => respondToServerRequest(request, { decision: "approved" }) },
        { label: "Aprovar nesta sessão", className: "approve", action: () => respondToServerRequest(request, { decision: "approved_for_session" }) },
        { label: "Recusar", className: "deny", action: () => respondToServerRequest(request, { decision: { denied: { rejection: "Negado pelo usuário" } } }) }
      ]));
    } else if (request.method === "mcpServer/elicitation/request") {
      appendMcpElicitation(card, request);
    } else {
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(params, null, 2);
      card.append(pre);
      card.append(makeActionRow([
        { label: "Cancelar", className: "deny", action: () => respondToServerRequest(request, null, { code: -32001, message: "Cancelado pelo usuário" }) }
      ]));
    }

    elements.approvalList.append(card);
  }
}

function makeActionRow(actions) {
  const row = document.createElement("div");
  row.className = "approval-actions";
  for (const item of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    if (item.className) button.classList.add(item.className);
    button.addEventListener("click", item.action);
    row.append(button);
  }
  return row;
}

function respondToServerRequest(request, result, error) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
  state.socket.send(JSON.stringify({ type: "serverResponse", requestId: request.requestId, result, error }));
  state.approvals.delete(String(request.requestId));
  renderApprovals();
}

function openSidebar() {
  elements.sidebar.classList.add("open");
  elements.sidebarScrim.classList.add("open");
}

function closeSidebar() {
  elements.sidebar.classList.remove("open");
  elements.sidebarScrim.classList.remove("open");
}

async function addWorkspace(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    elements.workspaceModal.close();
    return;
  }
  const name = elements.workspaceName.value.trim();
  const workspacePath = elements.workspacePath.value.trim();
  elements.workspaceError.textContent = "";
  try {
    const response = await apiFetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, path: workspacePath })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Pasta inválida.");
    mergeWorkspaces(result.workspaces);
    state.selectedWorkspaceId = result.workspace.id;
    renderWorkspaceSelect();
    persistState();
    elements.workspaceForm.reset();
    elements.workspaceModal.close();
  } catch (error) {
    elements.workspaceError.textContent = error.message;
  }
}

async function removeCurrentWorkspace() {
  const workspace = selectedWorkspace();
  if (!workspace || workspace.managed) return;
  if (state.chats.some((chat) => chat.status === "busy" && workspaceForChat(chat).id === workspace.id)) {
    setConnectionStatus("error", "Workspace em uso", "Interrompa os chats ativos antes de remover a pasta.");
    return;
  }
  if (!window.confirm(`Remover a autorização para “${workspace.name}”? As conversas do Codex não serão apagadas.`)) return;
  try {
    const response = await apiFetch(`/api/workspaces/${encodeURIComponent(workspace.id)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Não foi possível remover o workspace.");
    state.chats = state.chats.filter((chat) => workspaceForChat(chat).id !== workspace.id || chat.status === "busy");
    mergeWorkspaces(result.workspaces);
    state.selectedWorkspaceId = state.workspaces[0]?.id || null;
    if (!state.chats.length && state.workspaces.length) state.chats.push(makeChat());
    renderWorkspaceSelect();
    renderBoard();
    persistState();
  } catch (error) {
    setConnectionStatus("error", "Falha ao remover", error.message);
  }
}

async function exportAuditLog() {
  try {
    const response = await apiFetch("/api/audit?limit=1000", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível exportar a auditoria.");
    const blob = new Blob([`${JSON.stringify(result, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `codex-hub-auditoria-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    setConnectionStatus("error", "Auditoria indisponível", error.message);
  }
}

async function migrateLegacyWorkspaces() {
  const legacy = Array.isArray(stored.customWorkspaces) ? stored.customWorkspaces : [];
  for (const workspace of legacy) {
    if (!workspace?.name || !workspace?.path) continue;
    try {
      await apiFetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspace.name, path: workspace.path })
      });
    } catch {
      // An unavailable legacy path can be added again manually later.
    }
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

function restoreSavedChats() {
  const savedChats = state.settings.restoreChats && Array.isArray(stored.chats) ? stored.chats : [];
  for (const saved of savedChats.slice(0, CHAT_LIMIT)) {
    if (!saved || !saved.id || !saved.cwd || !workspaceForPath(saved.cwd)) continue;
    state.chats.push(makeChat(saved));
  }
  if (!state.chats.length) state.chats.push(makeChat());
  state.activeChatId = state.chats.at(-1)?.id || null;
  renderBoard();
}

function applyLayout(layout) {
  state.layout = layout;
  document.querySelectorAll("[data-layout]").forEach((button) => {
    button.classList.toggle("active", button.dataset.layout === layout);
  });
  elements.board.classList.toggle("grid-layout", layout === "grid");
  elements.board.classList.toggle("focus-layout", layout === "focus");
  if (layout === "focus") activateChat(state.chats.find((chat) => chat.id === state.activeChatId) || state.chats.at(-1));
  persistState();
}

function bindEvents() {
  elements.workspaceSelect.addEventListener("change", () => {
    state.selectedWorkspaceId = elements.workspaceSelect.value;
    renderWorkspaceSelect();
    persistState();
  });
  elements.newChat.addEventListener("click", () => {
    addChat();
    closeSidebar();
  });
  elements.addWorkspace.addEventListener("click", () => {
    elements.workspaceError.textContent = "";
    elements.workspaceModal.showModal();
  });
  elements.removeWorkspace.addEventListener("click", removeCurrentWorkspace);
  elements.workspaceForm.addEventListener("submit", addWorkspace);
  elements.refreshHistory.addEventListener("click", loadHistory);
  elements.approvalButton.addEventListener("click", openApprovalDrawer);
  elements.closeApprovals.addEventListener("click", closeApprovalDrawer);
  elements.drawerScrim.addEventListener("click", closeApprovalDrawer);
  elements.mobileMenu.addEventListener("click", openSidebar);
  elements.sidebarClose.addEventListener("click", closeSidebar);
  elements.sidebarScrim.addEventListener("click", closeSidebar);
  elements.openSettings.addEventListener("click", openAppearanceSettings);
  elements.openPermissions?.addEventListener("click", () => {
    elements.settingsModal.close();
    openPermissionCenter();
  });
  elements.permissionModeButtons.forEach((button) => {
    button.addEventListener("click", () => setPermissionMode(button.dataset.permissionMode));
  });
  elements.unlockFullAccess?.addEventListener("click", unlockFullAccess);
  elements.fullAccessCode?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      unlockFullAccess();
    }
  });
  elements.fullAccessConfirm?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      unlockFullAccess();
    }
  });
  elements.revokeFullAccess?.addEventListener("click", revokeFullAccess);
  elements.themePresetButtons.forEach((button) => {
    button.addEventListener("click", () => setAppearanceDraft(THEME_PRESETS[button.dataset.themePreset]));
  });
  const appearanceControls = [
    elements.themeFont,
    elements.themeCustomFont,
    elements.themeFontSize,
    elements.themeScale,
    elements.themeRadius,
    elements.themeTexture,
    elements.themeTextureOpacity,
    elements.themeBackground,
    elements.themeSidebar,
    elements.themeSurface,
    elements.themeText,
    elements.themeMuted,
    elements.themeAccent
  ];
  appearanceControls.forEach((control) => {
    control.addEventListener("input", () => setAppearanceDraft(readAppearanceControls()));
    control.addEventListener("change", () => setAppearanceDraft(readAppearanceControls()));
  });
  elements.resetAppearance.addEventListener("click", () => setAppearanceDraft(THEME_PRESETS.core));
  elements.settingsModal.addEventListener("close", () => {
    if (elements.settingsModal.returnValue !== "default") applyAppearance(state.appearance);
    appearanceDraft = null;
  });
  elements.controlButton?.addEventListener("click", () => {
    updateControlUI();
    elements.controlModal?.showModal();
  });
  elements.commandCenterButton?.addEventListener("click", () => {
    const chat = state.chats.find((item) => item.id === state.activeChatId) || state.chats.at(-1);
    if (chat) openCommandCenter(chat, "all");
  });
  elements.missionFocus?.addEventListener("click", () => {
    const chat = state.chats.find((item) => item.id === elements.missionFocus.dataset.chatId);
    if (chat) activateChat(chat);
    const panel = chat && chatElement(chat);
    if (!panel) return;
    panel.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    panel.classList.remove("mission-highlight");
    requestAnimationFrame(() => panel.classList.add("mission-highlight"));
    window.setTimeout(() => panel.classList.remove("mission-highlight"), 1400);
  });
  elements.enableComputerControl?.addEventListener("click", () => sendControlAction("enableComputer"));
  elements.emergencyStop?.addEventListener("click", () => {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
    state.socket.send(JSON.stringify({ type: "emergencyStop" }));
  });
  elements.exportAudit.addEventListener("click", exportAuditLog);
  elements.saveSettings.addEventListener("click", () => {
    state.settings.restoreChats = elements.restoreChats.checked;
    state.appearance = normalizeAppearance(appearanceDraft || state.appearance);
    applyAppearance(state.appearance);
    persistState();
  });
  document.querySelectorAll("[data-layout]").forEach((button) => {
    button.addEventListener("click", () => applyLayout(button.dataset.layout));
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      const chat = state.chats.find((item) => item.id === state.activeChatId) || state.chats.at(-1);
      if (chat) openCommandCenter(chat, "all");
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
      event.preventDefault();
      addChat();
    }
    if (event.key === "Escape") {
      closeApprovalDrawer();
      closeSidebar();
    }
  });
}

async function bootstrap() {
  applyAppearance(state.appearance);
  nexus.start();
  memorySphere.start();
  bindEvents();
  updateSystemClock();
  window.setInterval(updateSystemClock, 15000);
  updateControlUI();
  window.setInterval(updateControlUI, 1000);
  updatePermissionUI();
  window.setInterval(updatePermissionUI, 1000);
  applyLayout(state.layout);
  renderApprovals();
  try {
    await refreshSession();
    await refreshPermissionState();
    await migrateLegacyWorkspaces();
    const response = await apiFetch("/api/workspaces", { cache: "no-store" });
    const result = await response.json();
    mergeWorkspaces(Array.isArray(result.workspaces) ? result.workspaces : []);
  } catch (error) {
    mergeWorkspaces([]);
    setConnectionStatus("error", "Inicialização protegida falhou", error.message);
  }
  restoreSavedChats();
  connect();
}

bootstrap();
