(function () {
  "use strict";

  const visuals = new Map();
  const startedAt = new Map();
  let approvalCount = 0;
  let historyCount = 0;
  let latency = 0;

  function text(panel, selector, value) {
    const node = panel.querySelector(selector);
    if (node && node.textContent !== String(value)) node.textContent = value;
  }

  function percentValue(chat) {
    const usage = chat.tokenUsage;
    const used = Number(usage?.last?.totalTokens || usage?.last?.inputTokens || 0);
    const limit = Number(usage?.modelContextWindow || 0);
    return limit ? Math.min(100, Math.max(0, used / limit * 100)) : 0;
  }

  function formatTokens(value) {
    const number = Number(value) || 0;
    if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
    if (number >= 1_000) return `${(number / 1_000).toFixed(number > 99_999 ? 0 : 1)}K`;
    return number ? String(number) : "—";
  }

  function elapsedCopy(milliseconds) {
    const total = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  }

  function stateFor(chat) {
    if (chat.status === "error") return "error";
    if (chat.waitingApproval) return "waiting";
    if (chat.status !== "busy") return chat.justCompleted ? "completed" : "idle";
    const entry = chat.timeline.at(-1);
    const title = String(entry?.title || "").toLowerCase();
    if (/comando|arquivo|tool|ferramenta|execu|browser|navegador/.test(title)) return "executing";
    return "thinking";
  }

  function agentFor(chat) {
    const entry = chat.timeline.at(-1);
    const title = String(entry?.title || "").toLowerCase();
    if (/plano|racioc/.test(title)) return "planner";
    if (/pesquisa|context|imagem|parser/.test(title)) return "parser";
    if (/comando|arquivo|tool|ferramenta|execu/.test(title)) return "executor";
    if (/valid|teste|review|revis/.test(title)) return "validator";
    if (entry?.kind === "assistant") return "reporter";
    return "core";
  }

  function sourceForPhase(phase) {
    if (phase === "receive") return "context";
    if (phase === "respond") return "history";
    if (phase === "execute") return "files";
    if (phase === "error") return "repository";
    return "knowledge";
  }

  function attach(panel, chatId) {
    const existing = visuals.get(chatId);
    existing?.core.destroy();
    existing?.memory.destroy();
    const item = {
      panel,
      core: new window.AICoreVisual(panel.querySelector(".ai-core-canvas")),
      memory: new window.MemoryGraph(panel.querySelector(".memory-canvas"), panel.querySelector(".memory-tooltip")),
      lastMode: "idle",
      lastEntryId: null
    };
    visuals.set(chatId, item);
    panel.querySelectorAll(".intel-card, .ai-core-stage").forEach((node) => window.CodexMotion?.attachTilt(node));
    return item;
  }

  function reset() {
    for (const item of visuals.values()) {
      item.core.destroy();
      item.memory.destroy();
    }
    visuals.clear();
  }

  function update(chat, context = {}) {
    const item = visuals.get(chat.id);
    if (!item) return;
    const { panel, core, memory } = item;
    const mode = context.ready === false ? "offline" : stateFor(chat);
    core.setState(mode);
    panel.dataset.coreState = mode;
    text(panel, ".core-state-label", mode.toUpperCase());
    text(panel, ".telemetry-runtime", mode.toUpperCase());
    if (chat.status === "busy" && !startedAt.has(chat.id)) startedAt.set(chat.id, Date.now());
    if (chat.status !== "busy" && startedAt.has(chat.id)) startedAt.delete(chat.id);

    const activities = chat.timeline.filter((entry) => entry.kind === "activity");
    const completed = activities.filter((entry) => /conclu|complete|success|done/i.test(String(entry.status || ""))).length;
    const total = activities.length;
    const progress = total ? Math.min(96, Math.round(completed / total * 100)) : chat.status === "idle" && chat.timeline.length ? 100 : 0;
    text(panel, ".steps-completed", `${completed} / ${total}`);
    text(panel, ".execution-progress", `${progress}%`);
    panel.querySelector(".core-stat-right .stat-progress u")?.style.setProperty("width", `${progress}%`);

    const activeAgent = chat.status === "busy" ? agentFor(chat) : "core";
    panel.querySelectorAll(".agent-node").forEach((node) => {
      const active = node.dataset.agent === activeAgent;
      node.classList.toggle("active", active);
      node.querySelector("small").textContent = active ? (chat.status === "busy" ? "executando" : "disponível") : "aguardando";
    });
    text(panel, ".agents-active", chat.status === "busy" ? "1 / 6" : "0 / 6");

    const usage = chat.tokenUsage;
    const used = Number(usage?.last?.totalTokens || usage?.last?.inputTokens || 0);
    const limit = Number(usage?.modelContextWindow || 0);
    const contextPercent = percentValue(chat);
    text(panel, ".memory-token-copy", `${formatTokens(used)} / ${formatTokens(limit)}`);
    text(panel, ".telemetry-context", `${Math.round(contextPercent)}%`);
    panel.querySelector(".memory-meter u")?.style.setProperty("width", `${contextPercent}%`);
    panel.querySelector(".telemetry-grid > div:first-child u")?.style.setProperty("width", `${contextPercent}%`);
    text(panel, ".telemetry-queue", chat.messageQueue.length);
    text(panel, ".telemetry-events", chat.timeline.length);
    text(panel, ".history-count", `${historyCount} registros`);
    text(panel, ".file-count", `${chat.selectedMentions.length} ativos`);
    text(panel, ".documentation-count", `${chat.selectedSkills.length} fontes`);
    text(panel, ".repository-count", context.workspace ? "1 conectado" : "desconectado");
    text(panel, ".rail-approval-count", approvalCount);
    text(panel, ".rail-approval-copy", approvalCount ? `${approvalCount} aguardando decisão` : "Nenhuma pendência");
    panel.querySelector(".approval-rail-card")?.classList.toggle("has-approvals", approvalCount > 0);
    text(panel, ".latency-value", latency ? `${latency} ms` : "— ms");

    const latest = chat.timeline.at(-1);
    if (latest && latest.id !== item.lastEntryId) {
      item.lastEntryId = latest.id;
      const source = latest.kind === "user" ? "context" : latest.kind === "assistant" ? "history" : /arquivo|comando/i.test(latest.title || "") ? "files" : "knowledge";
      memory.access(source);
      const sourceRow = panel.querySelector(`[data-context-source="${source}"]`);
      sourceRow?.classList.remove("accessed");
      requestAnimationFrame(() => sourceRow?.classList.add("accessed"));
      window.setTimeout(() => sourceRow?.classList.remove("accessed"), 900);
    }
    text(panel, ".memory-state", chat.status === "busy" ? "ACCESS" : "IDLE");
    item.lastMode = mode;
  }

  function signal(chatId, phase) {
    const item = visuals.get(chatId);
    if (!item) return;
    item.core.pulse(phase === "error" ? "error" : phase === "respond" ? "completed" : "executing");
    item.memory.access(sourceForPhase(phase));
  }

  function transmit(chatId) {
    const item = visuals.get(chatId);
    if (!item) return;
    window.CodexMotion?.launchCommandPulse(item.panel.querySelector(".send-button"), item.panel.querySelector(".ai-core-emblem"));
    item.core.pulse("executing");
  }

  function setApprovals(count) {
    approvalCount = Number(count) || 0;
    for (const item of visuals.values()) {
      text(item.panel, ".rail-approval-count", approvalCount);
      text(item.panel, ".rail-approval-copy", approvalCount ? `${approvalCount} aguardando decisão` : "Nenhuma pendência");
      item.panel.querySelector(".approval-rail-card")?.classList.toggle("has-approvals", approvalCount > 0);
    }
  }

  function setHistoryCount(count) {
    historyCount = Number(count) || 0;
    for (const item of visuals.values()) text(item.panel, ".history-count", `${historyCount} registros`);
  }

  function setLatency(value) {
    latency = Number(value) || 0;
    for (const item of visuals.values()) text(item.panel, ".latency-value", latency ? `${latency} ms` : "— ms");
  }

  window.setInterval(() => {
    for (const [chatId, started] of startedAt.entries()) {
      const panel = visuals.get(chatId)?.panel;
      if (panel) text(panel, ".execution-elapsed", elapsedCopy(Date.now() - started));
    }
  }, 1000);

  window.CodexHUD = { attach, reset, update, signal, transmit, setApprovals, setHistoryCount, setLatency };
})();
