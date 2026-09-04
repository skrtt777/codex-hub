(() => {
  const CHANNEL = "codex-hub:ai-companion";
  const VALID_EVENTS = new Set([
    "ai:idle",
    "ai:thinking",
    "ai:processing",
    "ai:coding",
    "ai:searching",
    "ai:reading",
    "ai:tool",
    "ai:memory",
    "ai:success",
    "ai:warning",
    "ai:error",
    "ai:approval",
    "ai:offline",
    "user:typing",
    "user:message",
    "user:activity",
    "ui:look"
  ]);

  function emit(type, detail = {}) {
    if (!VALID_EVENTS.has(type)) return false;
    window.dispatchEvent(new CustomEvent(CHANNEL, {
      detail: {
        ...detail,
        type,
        timestamp: performance.now()
      }
    }));
    return true;
  }

  window.AICompanionBus = Object.freeze({
    channel: CHANNEL,
    events: Object.freeze([...VALID_EVENTS]),
    emit,
    lookAt(target, detail = {}) {
      return emit("ui:look", { ...detail, target });
    }
  });
})();
