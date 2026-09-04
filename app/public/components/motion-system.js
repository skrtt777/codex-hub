(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const state = { hidden: document.hidden, reduced: reducedMotion.matches };

  function motionEnabled() {
    return !state.hidden && !state.reduced;
  }

  function runBootSequence() {
    const overlay = document.querySelector("#boot-sequence");
    const label = document.querySelector("#boot-status");
    if (!overlay) return;
    const seen = sessionStorage.getItem("codex-hub-boot-seen-v1") === "true";
    if (seen || state.reduced) {
      overlay.remove();
      return;
    }
    const phases = [
      [120, "Inicializando runtime"],
      [430, "Carregando workspace"],
      [760, "Conectando contexto"],
      [1030, "Sincronizando memória"],
      [1320, "Sistema pronto"]
    ];
    for (const [delay, copy] of phases) window.setTimeout(() => { if (label) label.textContent = copy; }, delay);
    window.setTimeout(() => {
      overlay.classList.add("complete");
      sessionStorage.setItem("codex-hub-boot-seen-v1", "true");
      window.setTimeout(() => overlay.remove(), 360);
    }, 1540);
  }

  class AmbientField {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas?.getContext("2d", { alpha: true });
      this.points = [];
      this.frame = 0;
      this.lastFrame = 0;
      if (!this.context) return;
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(document.documentElement);
      this.resize();
      this.frame = requestAnimationFrame((time) => this.draw(time));
    }

    resize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.35);
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(72, Math.max(28, Math.round(width * height / 28000)));
      this.points = Array.from({ length: count }, (_, index) => ({
        x: (index * 197.3 % width),
        y: (index * 89.7 % height),
        speed: 0.025 + (index % 5) * 0.009,
        size: index % 11 === 0 ? 1.2 : 0.65,
        alpha: 0.08 + (index % 7) * 0.014
      }));
    }

    draw(time) {
      this.frame = requestAnimationFrame((next) => this.draw(next));
      if (!motionEnabled() || time - this.lastFrame < 42) return;
      this.lastFrame = time;
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.context.clearRect(0, 0, width, height);
      for (const point of this.points) {
        point.y -= point.speed;
        if (point.y < -4) point.y = height + 4;
        this.context.beginPath();
        this.context.fillStyle = `rgba(0, 229, 255, ${point.alpha})`;
        this.context.arc(point.x, point.y, point.size, 0, Math.PI * 2);
        this.context.fill();
      }
    }
  }

  function attachTilt(element) {
    if (!element || element.dataset.tiltReady) return;
    element.dataset.tiltReady = "true";
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frame = 0;
    const animate = () => {
      currentX += (targetX - currentX) * 0.11;
      currentY += (targetY - currentY) * 0.11;
      element.style.setProperty("--tilt-x", `${currentX.toFixed(2)}deg`);
      element.style.setProperty("--tilt-y", `${currentY.toFixed(2)}deg`);
      if (Math.abs(targetX - currentX) > 0.02 || Math.abs(targetY - currentY) > 0.02) frame = requestAnimationFrame(animate);
      else frame = 0;
    };
    const queue = () => { if (!frame && motionEnabled()) frame = requestAnimationFrame(animate); };
    element.addEventListener("pointermove", (event) => {
      if (!motionEnabled()) return;
      const rect = element.getBoundingClientRect();
      targetY = ((event.clientX - rect.left) / rect.width - 0.5) * 2.2;
      targetX = ((event.clientY - rect.top) / rect.height - 0.5) * -2.2;
      queue();
    });
    element.addEventListener("pointerleave", () => { targetX = 0; targetY = 0; queue(); });
  }

  function launchCommandPulse(button, core) {
    if (!button || !core || !motionEnabled()) return;
    const start = button.getBoundingClientRect();
    const end = core.getBoundingClientRect();
    const pulse = document.createElement("i");
    pulse.className = "command-transmission-pulse";
    const fromX = start.left + start.width * 0.5;
    const fromY = start.top + start.height * 0.5;
    const toX = end.left + end.width * 0.5;
    const toY = end.top + end.height * 0.5;
    pulse.style.left = `${fromX}px`;
    pulse.style.top = `${fromY}px`;
    document.body.append(pulse);
    pulse.animate([
      { transform: "translate(-50%, -50%) scale(.5)", opacity: 0 },
      { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.14 },
      { transform: `translate(calc(${toX - fromX}px - 50%), calc(${toY - fromY}px - 50%)) scale(.2)`, opacity: 0 }
    ], { duration: 620, easing: "cubic-bezier(.2,.8,.2,1)" }).finished.finally(() => pulse.remove());
  }

  document.addEventListener("visibilitychange", () => { state.hidden = document.hidden; });
  reducedMotion.addEventListener?.("change", (event) => { state.reduced = event.matches; });
  document.addEventListener("DOMContentLoaded", () => {
    runBootSequence();
    new AmbientField(document.querySelector("#ambient-canvas"));
  });

  window.CodexMotion = { state, enabled: motionEnabled, attachTilt, launchCommandPulse };
})();
