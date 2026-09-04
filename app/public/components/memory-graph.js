(function () {
  "use strict";

  const NODES = [
    ["knowledge", "Memória", -1.1, -.8, .65], ["workspace", "Workspace", 1.15, -.68, .45],
    ["files", "Arquivos", -1.35, .55, -.35], ["repository", "Repositório", 1.25, .65, -.2],
    ["documentation", "Documentação", -.35, 1.15, .55], ["history", "Histórico", .4, -1.2, -.55],
    ["context", "Contexto", .95, .12, 1.05]
  ];

  class MemoryGraph {
    constructor(canvas, tooltip) {
      this.canvas = canvas;
      this.tooltip = tooltip;
      this.context = canvas.getContext("2d", { alpha: true });
      this.rotation = { x: -.22, y: .3, tx: -.22, ty: .3 };
      this.velocity = { x: 0, y: 0 };
      this.pulses = [];
      this.projected = [];
      this.hovered = null;
      this.visible = true;
      this.lastFrame = 0;
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas.parentElement);
      this.intersectionObserver = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; });
      this.intersectionObserver.observe(canvas);
      canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
      canvas.addEventListener("pointerleave", () => this.pointerLeave());
      this.resize();
      this.frame = requestAnimationFrame((time) => this.draw(time));
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

    rotate(point) {
      const [x, y, z] = point;
      const cy = Math.cos(this.rotation.y); const sy = Math.sin(this.rotation.y);
      const cx = Math.cos(this.rotation.x); const sx = Math.sin(this.rotation.x);
      const x1 = x * cy - z * sy; const z1 = x * sy + z * cy;
      return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
    }

    project(point) {
      const [x, y, z] = this.rotate(point);
      const scale = Math.min(this.width, this.height) * .2 * (2.8 / (3.1 + z));
      return { x: this.width * .5 + x * scale, y: this.height * .48 + y * scale, z, scale };
    }

    pointerMove(event) {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (window.CodexMotion?.enabled()) {
        this.rotation.ty = .3 + (x / rect.width - .5) * .5;
        this.rotation.tx = -.22 + (y / rect.height - .5) * -.32;
      }
      const closest = this.projected.reduce((best, node) => {
        const distance = Math.hypot(node.x - x, node.y - y);
        return distance < (best?.distance ?? 16) ? { ...node, distance } : best;
      }, null);
      this.hovered = closest?.key || null;
      if (this.tooltip) {
        this.tooltip.hidden = !closest;
        if (closest) {
          this.tooltip.textContent = closest.label;
          this.tooltip.style.left = `${closest.x}px`;
          this.tooltip.style.top = `${closest.y}px`;
        }
      }
    }

    pointerLeave() {
      this.hovered = null;
      if (this.tooltip) this.tooltip.hidden = true;
    }

    access(key = "context") {
      const node = NODES.find(([id]) => id === key) || NODES.find(([id]) => key.includes(id)) || NODES[6];
      this.pulses.push({ key: node[0], born: performance.now() });
      if (this.pulses.length > 8) this.pulses.shift();
    }

    drawCube(ctx, time) {
      const vertices = [];
      for (const x of [-.42, .42]) for (const y of [-.42, .42]) for (const z of [-.42, .42]) vertices.push(this.project([x, y, z]));
      const edges = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
      ctx.strokeStyle = "rgba(0,229,255,.32)";
      ctx.lineWidth = .8;
      for (const [a,b] of edges) { ctx.beginPath(); ctx.moveTo(vertices[a].x, vertices[a].y); ctx.lineTo(vertices[b].x, vertices[b].y); ctx.stroke(); }
      const center = this.project([0,0,0]);
      const glow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 34);
      glow.addColorStop(0, `rgba(0,255,102,${.28 + Math.sin(time * .002) * .04})`);
      glow.addColorStop(1, "rgba(0,255,102,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(center.x, center.y, 34, 0, Math.PI * 2); ctx.fill();
      return center;
    }

    draw(time) {
      this.frame = requestAnimationFrame((next) => this.draw(next));
      if (!this.visible || document.hidden || time - this.lastFrame < 26) return;
      this.lastFrame = time;
      const ctx = this.context;
      ctx.clearRect(0, 0, this.width, this.height);
      if (window.CodexMotion?.enabled()) this.rotation.ty += .0008;
      this.rotation.x += (this.rotation.tx - this.rotation.x) * .035;
      this.rotation.y += (this.rotation.ty - this.rotation.y) * .035;
      const center = this.drawCube(ctx, time);
      this.projected = NODES.map(([key, label, x, y, z]) => ({ key, label, ...this.project([x, y, z]) })).sort((a,b) => a.z - b.z);
      for (const node of this.projected) {
        const activePulse = this.pulses.find((pulse) => pulse.key === node.key && time - pulse.born < 900);
        const related = this.hovered === node.key;
        ctx.strokeStyle = related ? "rgba(0,229,255,.72)" : "rgba(0,255,102,.15)";
        ctx.lineWidth = related ? 1.2 : .65;
        ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.lineTo(node.x, node.y); ctx.stroke();
        const radius = activePulse || related ? 4.2 : 2.2;
        ctx.fillStyle = activePulse ? "#ffffff" : related ? "#00e5ff" : "#00e676";
        ctx.shadowBlur = activePulse || related ? 12 : 4; ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        if (activePulse) {
          const progress = Math.min(1, (time - activePulse.born) / 760);
          const x = node.x + (center.x - node.x) * progress;
          const y = node.y + (center.y - node.y) * progress;
          ctx.fillStyle = "#baffdd"; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
        }
      }
      this.pulses = this.pulses.filter((pulse) => time - pulse.born < 900);
    }

    destroy() {
      cancelAnimationFrame(this.frame);
      this.resizeObserver.disconnect();
      this.intersectionObserver.disconnect();
    }
  }

  window.MemoryGraph = MemoryGraph;
})();
