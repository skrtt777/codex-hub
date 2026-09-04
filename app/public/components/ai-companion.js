const AI_COMPANION_STATES = new Set([
  "idle",
  "typing",
  "messageReceived",
  "thinking",
  "processing",
  "coding",
  "searching",
  "reading",
  "toolCall",
  "memoryAccess",
  "waitingApproval",
  "success",
  "warning",
  "error",
  "sleep",
  "wakeUp",
  "offline"
]);

const AI_COMPANION_EVENT_STATES = {
  "ai:idle": "idle",
  "ai:thinking": "thinking",
  "ai:processing": "processing",
  "ai:coding": "coding",
  "ai:searching": "searching",
  "ai:reading": "reading",
  "ai:tool": "toolCall",
  "ai:memory": "memoryAccess",
  "ai:success": "success",
  "ai:warning": "warning",
  "ai:error": "error",
  "ai:approval": "waitingApproval",
  "ai:offline": "offline",
  "user:typing": "typing",
  "user:message": "messageReceived"
};

const AI_COMPANION_LABELS = {
  idle: "Disponível",
  typing: "Ouvindo você",
  messageReceived: "Comando recebido",
  thinking: "Analisando",
  processing: "Processando",
  coding: "Programando",
  searching: "Pesquisando",
  reading: "Lendo contexto",
  toolCall: "Chamando ferramenta",
  memoryAccess: "Acessando memória",
  waitingApproval: "Aguardando aprovação",
  success: "Tarefa concluída",
  warning: "Atenção necessária",
  error: "Ocorreu um erro",
  sleep: "Em repouso",
  wakeUp: "Reativando",
  offline: "Desconectado"
};

const TRANSIENT_STATES = {
  messageReceived: { duration: 420, fallback: "thinking" },
  toolCall: { duration: 820, fallback: "processing" },
  memoryAccess: { duration: 1050, fallback: "processing" },
  success: { duration: 1100, fallback: "idle" },
  error: { duration: 760, fallback: "idle" },
  wakeUp: { duration: 520, fallback: "idle" }
};

const TRACKING_DISABLED = new Set(["thinking", "processing", "coding", "searching", "reading", "sleep", "offline"]);
const CRITICAL_STATES = new Set(["waitingApproval", "warning", "error", "offline"]);
const LOOK_VECTORS = {
  memory: { x: 2.5, y: -1.6 },
  context: { x: 2.5, y: -1.4 },
  skills: { x: -2.6, y: 1.2 },
  approvals: { x: 3, y: -1.6 },
  error: { x: 2.5, y: 1.5 },
  core: { x: 0, y: -2 },
  clock: { x: 2.8, y: -2 },
  composer: { x: -1.7, y: 1.6 },
  left: { x: -3, y: 0 },
  right: { x: 3, y: 0 },
  up: { x: 0, y: -2 }
};

class AICompanionMachine {
  constructor(owner, initialState = "idle") {
    this.owner = owner;
    this.state = AI_COMPANION_STATES.has(initialState) ? initialState : "idle";
    this.baseState = this.state;
    this.lockUntil = 0;
    this.timer = null;
  }

  transition(nextState, options = {}) {
    const next = AI_COMPANION_STATES.has(nextState) ? nextState : "idle";
    const now = performance.now();
    if (now < this.lockUntil && !options.force && !CRITICAL_STATES.has(next)) {
      this.baseState = next;
      return false;
    }

    window.clearTimeout(this.timer);
    const transient = TRANSIENT_STATES[next];
    if (!transient) this.baseState = next;
    this.state = next;
    this.owner.applyState(next, options.detail || {});

    if (transient) {
      const duration = options.duration || transient.duration;
      this.lockUntil = now + duration;
      if (options.fallback && AI_COMPANION_STATES.has(options.fallback)) this.baseState = options.fallback;
      this.timer = window.setTimeout(() => {
        this.lockUntil = 0;
        const fallback = this.baseState === next ? transient.fallback : this.baseState;
        this.transition(fallback || transient.fallback, { force: true });
      }, duration);
    } else {
      this.lockUntil = 0;
    }
    return true;
  }
}

class AICompanion extends HTMLElement {
  static get observedAttributes() {
    return ["state", "chat-id"];
  }

  constructor() {
    super();
    this.machine = new AICompanionMachine(this, this.getAttribute("state") || "idle");
    this.eye = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.frame = 0;
    this.lookTimer = null;
    this.idleTimer = null;
    this.sleepTimer = null;
    this.lastActivityAt = Date.now();
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.handleBusEvent = (event) => this.onBusEvent(event.detail || {});
    this.handlePointerMove = (event) => this.onPointerMove(event);
    this.handleActivity = () => this.onActivity();
    this.handleVisibility = () => this.onVisibility();
  }

  connectedCallback() {
    if (!this.firstElementChild) this.render();
    this.machine.transition(this.getAttribute("state") || "idle", { force: true });
    const channel = window.AICompanionBus?.channel || "codex-hub:ai-companion";
    window.addEventListener(channel, this.handleBusEvent);
    window.addEventListener("pointermove", this.handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", this.handleActivity, { passive: true });
    window.addEventListener("keydown", this.handleActivity);
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.onVisibility();
    this.scheduleIdleGesture();
    this.scheduleSleep();
  }

  disconnectedCallback() {
    const channel = window.AICompanionBus?.channel || "codex-hub:ai-companion";
    window.removeEventListener(channel, this.handleBusEvent);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerdown", this.handleActivity);
    window.removeEventListener("keydown", this.handleActivity);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    window.cancelAnimationFrame(this.frame);
    window.clearTimeout(this.lookTimer);
    window.clearTimeout(this.idleTimer);
    window.clearTimeout(this.sleepTimer);
  }

  attributeChangedCallback(name, previous, next) {
    if (previous === next || !this.isConnected) return;
    if (name === "state" && next !== this.machine.state) this.machine.transition(next, { force: true });
  }

  belongsTo(detail) {
    const ownChatId = this.getAttribute("chat-id");
    return !detail.chatId || !ownChatId || detail.chatId === ownChatId;
  }

  onBusEvent(detail) {
    if (!this.belongsTo(detail)) return;
    if (detail.type === "user:activity") {
      this.onActivity();
      return;
    }
    if (detail.type === "ui:look") {
      this.lookAt(detail.target, detail.duration);
      return;
    }
    const nextState = AI_COMPANION_EVENT_STATES[detail.type];
    if (!nextState) return;
    this.machine.transition(nextState, {
      detail,
      fallback: detail.fallback,
      duration: detail.duration,
      force: detail.force
    });
  }

  applyState(state, detail = {}) {
    this.dataset.state = state;
    if (this.getAttribute("state") !== state) this.setAttribute("state", state);
    this.setAttribute("role", "img");
    this.setAttribute("aria-label", `Nexo: ${AI_COMPANION_LABELS[state]}`);
    this.title = `Nexo · ${AI_COMPANION_LABELS[state]}`;
    this.toggleAttribute("data-quick-success", Boolean(detail.quick));
    this.toggleAttribute("data-consecutive-error", Number(detail.consecutiveErrors || 0) > 1);
    this.closest("[data-companion-dock]")?.querySelector(".companion-status")?.replaceChildren(AI_COMPANION_LABELS[state]);
    this.dispatchEvent(new CustomEvent("companion:statechange", {
      bubbles: true,
      detail: { state, label: AI_COMPANION_LABELS[state] }
    }));
    if (TRACKING_DISABLED.has(state)) this.resetEyes();
    if (state === "sleep") this.dataset.idleGesture = "none";
    if (state === "waitingApproval") this.lookAt("approvals", 1800);
    if (state === "error") this.lookAt("error", 760);
    if (state === "idle") this.scheduleSleep();
    else window.clearTimeout(this.sleepTimer);
  }

  onActivity() {
    const now = Date.now();
    if (now - this.lastActivityAt < 800 && this.machine.state !== "sleep") return;
    this.lastActivityAt = now;
    if (this.machine.state === "sleep") this.machine.transition("wakeUp", { force: true, fallback: "idle" });
    this.scheduleSleep();
  }

  scheduleSleep() {
    window.clearTimeout(this.sleepTimer);
    if (this.machine.state !== "idle") return;
    this.sleepTimer = window.setTimeout(() => {
      if (this.machine.state === "idle" && Date.now() - this.lastActivityAt >= 180000) {
        this.machine.transition("sleep", { force: true });
      }
    }, 180000);
  }

  scheduleIdleGesture() {
    window.clearTimeout(this.idleTimer);
    const delay = 15000 + Math.round(Math.random() * 25000);
    this.idleTimer = window.setTimeout(() => {
      if (this.machine.state === "idle" && !document.hidden) {
        const gestures = ["left", "right", "up", "antenna"];
        const gesture = gestures[Math.floor(Math.random() * gestures.length)];
        this.dataset.idleGesture = gesture;
        if (gesture !== "antenna") this.lookAt(gesture, 900);
        window.setTimeout(() => {
          if (this.dataset.idleGesture === gesture) this.dataset.idleGesture = "none";
        }, 1000);
      }
      this.scheduleIdleGesture();
    }, delay);
  }

  lookAt(target, duration = 1200) {
    if (this.machine.state === "sleep" || this.machine.state === "offline") return;
    const vector = LOOK_VECTORS[target] || LOOK_VECTORS.core;
    this.dataset.lookTarget = target || "core";
    this.eye.targetX = vector.x;
    this.eye.targetY = vector.y;
    this.animateEyes();
    window.clearTimeout(this.lookTimer);
    this.lookTimer = window.setTimeout(() => {
      delete this.dataset.lookTarget;
      this.eye.targetX = 0;
      this.eye.targetY = 0;
      this.animateEyes();
    }, duration);
  }

  onPointerMove(event) {
    this.onActivity();
    if (this.reducedMotion.matches || TRACKING_DISABLED.has(this.machine.state) || this.dataset.lookTarget) return;
    const bounds = this.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !this.offsetParent) return;
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    this.eye.targetX = Math.max(-3, Math.min(3, ((event.clientX - centerX) / window.innerWidth) * 7));
    this.eye.targetY = Math.max(-2, Math.min(2, ((event.clientY - centerY) / window.innerHeight) * 5));
    this.animateEyes();
  }

  animateEyes() {
    if (this.frame || document.hidden) return;
    const tick = () => {
      this.eye.x += (this.eye.targetX - this.eye.x) * .18;
      this.eye.y += (this.eye.targetY - this.eye.y) * .18;
      this.style.setProperty("--eye-x", `${this.eye.x.toFixed(2)}px`);
      this.style.setProperty("--eye-y", `${this.eye.y.toFixed(2)}px`);
      this.style.setProperty("--head-ry", `${(this.eye.x * .8).toFixed(2)}deg`);
      this.style.setProperty("--head-rx", `${(-this.eye.y).toFixed(2)}deg`);
      this.style.setProperty("--body-r", `${(this.eye.x / 3).toFixed(2)}deg`);
      if (Math.abs(this.eye.targetX - this.eye.x) > .03 || Math.abs(this.eye.targetY - this.eye.y) > .03) {
        this.frame = requestAnimationFrame(tick);
      } else {
        this.frame = 0;
      }
    };
    this.frame = requestAnimationFrame(tick);
  }

  resetEyes() {
    this.eye.targetX = 0;
    this.eye.targetY = 0;
    this.animateEyes();
  }

  onVisibility() {
    this.toggleAttribute("data-paused", document.hidden);
    if (!document.hidden) {
      this.onActivity();
      this.animateEyes();
    } else {
      window.cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  render() {
    this.innerHTML = `
      <svg class="companion-figure" viewBox="0 0 180 190" aria-hidden="true" focusable="false" shape-rendering="geometricPrecision">
        <defs>
          <linearGradient id="nexo-coral" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff9b7c"/><stop offset="1" stop-color="#f16f52"/></linearGradient>
          <linearGradient id="nexo-energy" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#00ff66"/><stop offset="1" stop-color="#00e5ff"/></linearGradient>
        </defs>

        <g class="companion-fx" fill="none">
          <ellipse class="memory-ring" cx="90" cy="69" rx="70" ry="43" />
          <path class="memory-pulse" d="M90 142V24" />
          <path class="head-trace" d="M35 38h110l14 14v55l-14 14H35l-14-14V52z" />
          <path class="visor-scan" d="M35 75h110" />
          <g class="thought-pixels" fill="currentColor"><rect x="147" y="25" width="5" height="5"/><rect x="157" y="16" width="4" height="4"/><rect x="163" y="31" width="3" height="3"/></g>
          <g class="warning-mark" fill="currentColor"><rect x="156" y="39" width="6" height="19"/><rect x="156" y="64" width="6" height="6"/></g>
          <g class="clock-mark"><circle cx="157" cy="47" r="10"/><path d="M157 40v8l5 3"/></g>
        </g>

        <g class="companion-character">
          <g class="companion-antenna">
            <path fill="#303533" d="M85 21h10v17H85z"/>
            <path fill="#464c49" d="M78 32h24v8H78z"/>
            <rect class="antenna-light" x="82" y="8" width="16" height="16" rx="2" fill="url(#nexo-coral)"/>
            <rect x="86" y="5" width="8" height="4" fill="#ffad91"/>
          </g>

          <g class="companion-arm arm-left">
            <path fill="#202523" d="M42 130h-9l-16 22 7 7 18-15z"/>
            <path fill="url(#nexo-coral)" d="M24 147h8v15h-8l-7-7z"/>
          </g>
          <g class="companion-arm arm-right">
            <path fill="#202523" d="M138 130h9l16 22-7 7-18-15z"/>
            <path fill="url(#nexo-coral)" d="M148 147h8l7 8-7 7h-8z"/>
          </g>

          <g class="companion-body">
            <path fill="#161a18" d="M50 122h80l13 22-10 31H47l-10-31z"/>
            <path fill="#303533" d="M57 127h66l9 18-7 22H55l-7-22z"/>
            <g class="chest-code" fill="none" stroke-linecap="square" stroke-width="6">
              <path stroke="url(#nexo-coral)" d="M79 140l-9 9 9 9M105 140l9 9-9 9"/>
              <path class="chest-slash" stroke="url(#nexo-energy)" d="M97 136l-9 27"/>
            </g>
          </g>

          <g class="companion-leg leg-left"><path fill="#202523" d="M55 169h27v13H51v-8z"/><path fill="url(#nexo-coral)" d="M51 179h31v7H51z"/></g>
          <g class="companion-leg leg-right"><path fill="#202523" d="M98 169h27l4 5v8H98z"/><path fill="url(#nexo-coral)" d="M98 179h31v7H98z"/></g>

          <g class="companion-head">
            <g class="companion-ear ear-left"><path fill="#171b19" d="M10 61h17v48H10l-7-9V70z"/><path fill="url(#nexo-coral)" d="M10 70h8v30h-8z"/></g>
            <g class="companion-ear ear-right"><path fill="#171b19" d="M153 61h17l7 9v30l-7 9h-17z"/><path fill="url(#nexo-coral)" d="M162 70h8v30h-8z"/></g>
            <path class="head-shadow" fill="#0d100f" d="M31 34h118l18 18v58l-18 18H31l-18-18V52z"/>
            <path class="head-shell" fill="url(#nexo-coral)" d="M35 38h110l14 14v55l-14 14H35l-14-14V52zm8 13-9 9v39l9 9h94l9-9V60l-9-9z"/>
            <path fill="#343936" d="M43 51h94l9 9v39l-9 9H43l-9-9V60zm7 9-6 6v27l6 6h80l6-6V66l-6-6z"/>
            <path class="companion-visor" fill="#080b0a" d="M50 60h80l6 6v27l-6 6H50l-6-6V66z"/>

            <g class="visor-data" fill="#00e5ff"><rect x="55" y="68" width="11" height="2"/><rect x="113" y="88" width="12" height="2"/><rect x="61" y="91" width="6" height="2"/></g>
            <g class="companion-eyes">
              <g class="companion-eye eye-left" transform="translate(0 0)"><rect class="eye-normal" x="65" y="70" width="9" height="19" rx="2" fill="#ff8a65"/><path class="eye-happy" d="M61 82l8-7 8 7"/><path class="eye-error" d="M62 73l14 14m0-14L62 87"/><path class="eye-sleep" d="M61 82h16"/></g>
              <g class="companion-eye eye-right" transform="translate(0 0)"><rect class="eye-normal" x="106" y="70" width="9" height="19" rx="2" fill="#ff8a65"/><path class="eye-happy" d="M102 82l8-7 8 7"/><path class="eye-error" d="M103 73l14 14m0-14-14 14"/><path class="eye-sleep" d="M102 82h16"/></g>
            </g>
            <g class="companion-mouth" fill="none" stroke="#ff8a65" stroke-linecap="square" stroke-width="4">
              <path class="mouth-normal" d="M82 91l5 5h7l5-5"/>
              <path class="mouth-happy" d="M79 89l7 7h8l7-7"/>
              <path class="mouth-error" d="M82 96l5-5h7l5 5"/>
              <path class="mouth-sleep" d="M85 94h10"/>
            </g>
          </g>
        </g>

        <g class="coding-hologram" fill="none">
          <path class="hologram-panel" d="M39 126h102v38H39z"/>
          <path d="M50 137h36M50 145h59M50 153h43"/>
        </g>
        <g class="tool-packet" fill="currentColor"><rect x="148" y="119" width="9" height="9"/><rect x="160" y="122" width="5" height="5"/></g>
      </svg>`;
  }
}

if (!customElements.get("ai-companion")) customElements.define("ai-companion", AICompanion);
