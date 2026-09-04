(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const COLORS = {
    idle: [0, 230, 118], thinking: [0, 229, 255], executing: [0, 255, 102],
    waiting: [255, 197, 61], error: [255, 82, 82], completed: [92, 255, 170], offline: [90, 106, 102]
  };

  class AICoreVisual {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext("2d", { alpha: true });
      this.mode = "idle";
      this.visible = true;
      this.pulses = [];
      this.rotation = 0;
      this.lastFrame = 0;
      this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas.parentElement);
      this.intersectionObserver = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; }, { rootMargin: "80px" });
      this.intersectionObserver.observe(canvas);
      canvas.parentElement.addEventListener("pointermove", (event) => this.onPointer(event));
      canvas.parentElement.addEventListener("pointerleave", () => { this.pointer.tx = 0; this.pointer.ty = 0; });
      this.resize();
      this.frame = requestAnimationFrame((time) => this.draw(time));
    }

    onPointer(event) {
      if (!window.CodexMotion?.enabled()) return;
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.tx = ((event.clientX - rect.left) / rect.width - 0.5) * 10;
      this.pointer.ty = ((event.clientY - rect.top) / rect.height - 0.5) * 7;
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      this.width = Math.max(1, rect.width);
      this.height = Math.max(1, rect.height);
      this.canvas.width = Math.round(this.width * ratio);
      this.canvas.height = Math.round(this.height * ratio);
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    setState(mode) {
      const next = COLORS[mode] ? mode : "idle";
      if (this.mode !== next && next === "completed") this.pulse("completed");
      this.mode = next;
    }

    pulse(type = this.mode) {
      this.pulses.push({ born: performance.now(), color: COLORS[type] || COLORS.executing });
      if (this.pulses.length > 8) this.pulses.shift();
    }

    lineRing(cx, cy, radius, rotation, color, alpha, segments = 12) {
      const ctx = this.context;
      ctx.strokeStyle = `rgba(${color.join(",")},${alpha})`;
      ctx.lineWidth = 1;
      for (let index = 0; index < segments; index++) {
        const start = rotation + index / segments * TAU;
        const length = TAU / segments * (index % 3 === 0 ? 0.52 : 0.27);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, start + length);
        ctx.stroke();
      }
    }

    draw(time) {
      this.frame = requestAnimationFrame((next) => this.draw(next));
      if (!this.visible || document.hidden || time - this.lastFrame < 20) return;
      this.lastFrame = time;
      const ctx = this.context;
      const width = this.width;
      const height = this.height;
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      const motion = window.CodexMotion?.enabled() !== false;
      const color = COLORS[this.mode] || COLORS.idle;
      const speed = !motion ? 0 : this.mode === "executing" ? 0.022 : this.mode === "thinking" ? 0.015 : this.mode === "waiting" ? 0.006 : 0.0035;
      this.rotation += speed;
      this.pointer.x += (this.pointer.tx - this.pointer.x) * 0.055;
      this.pointer.y += (this.pointer.ty - this.pointer.y) * 0.055;
      const cx = width * 0.5 + this.pointer.x;
      const cy = height * 0.48 + this.pointer.y;
      const radius = Math.min(width, height) * 0.235;

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2.45);
      glow.addColorStop(0, `rgba(${color.join(",")},.19)`);
      glow.addColorStop(.42, `rgba(${color.join(",")},.055)`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      for (let lane = -2; lane <= 2; lane++) {
        ctx.beginPath();
        const baseline = cy + lane * 12;
        for (let x = 0; x <= width; x += 5) {
          const distance = Math.abs(x - cx) / Math.max(1, width * .5);
          const wave = Math.sin(x * .026 + this.rotation * (lane % 2 ? 18 : -14) + lane) * (7 + (1 - distance) * 18);
          const y = baseline + wave * Math.max(.18, 1 - distance * 1.2);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${lane % 2 ? "0,229,255" : color.join(",")},${.08 + (2 - Math.abs(lane)) * .035})`;
        ctx.lineWidth = lane === 0 ? 1.2 : .7;
        ctx.stroke();
      }

      this.lineRing(cx, cy, radius * 1.75, this.rotation * .38, color, .19, 18);
      this.lineRing(cx, cy, radius * 1.46, -this.rotation * .62, [0, 229, 255], .2, 14);
      this.lineRing(cx, cy, radius * 1.18, this.rotation, color, .38, 10);
      this.lineRing(cx, cy, radius * .9, -this.rotation * 1.35, [170, 255, 224], .32, 8);

      for (let index = 0; index < 30; index++) {
        const ring = index % 3;
        const orbit = radius * (1.08 + ring * .25);
        const angle = index / 30 * TAU + this.rotation * (ring % 2 ? -1.1 : .72);
        const x = cx + Math.cos(angle) * orbit;
        const y = cy + Math.sin(angle) * orbit * .56;
        const active = (index + Math.floor(time / 180)) % 13 === 0 && this.mode !== "idle";
        ctx.fillStyle = `rgba(${color.join(",")},${active ? .95 : .2})`;
        ctx.beginPath();
        ctx.arc(x, y, active ? 2.2 : .85, 0, TAU);
        ctx.fill();
      }

      this.pulses = this.pulses.filter((pulse) => {
        const age = (time - pulse.born) / 850;
        if (age >= 1) return false;
        ctx.strokeStyle = `rgba(${pulse.color.join(",")},${(1 - age) * .6})`;
        ctx.lineWidth = 1.5 * (1 - age);
        ctx.beginPath();
        ctx.arc(cx, cy, radius * (.65 + age * 1.9), 0, TAU);
        ctx.stroke();
        return true;
      });

      const packets = this.mode === "executing" ? 7 : this.mode === "thinking" ? 4 : 1;
      for (let index = 0; index < packets; index++) {
        const progress = ((time * .00018 * (this.mode === "executing" ? 2.2 : 1) + index / packets) % 1);
        const x = width * progress;
        const y = cy + Math.sin(progress * TAU * 2 + index) * 21;
        ctx.fillStyle = `rgba(${index % 2 ? "0,229,255" : color.join(",")},${this.mode === "idle" ? .2 : .85})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fillRect(x, y, 5, 1.5);
        ctx.shadowBlur = 0;
      }
    }

    destroy() {
      cancelAnimationFrame(this.frame);
      this.resizeObserver.disconnect();
      this.intersectionObserver.disconnect();
    }
  }

  window.AICoreVisual = AICoreVisual;
})();
