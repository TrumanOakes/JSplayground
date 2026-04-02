const DEFAULT_STATE = {
  devices: [],
  entities: new Map(), // alias -> { entityType, fields }
  lastOps: [],
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) node.append(child);
  return node;
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export class PreviewPanel {
  constructor(rootEl, { onParameterChange } = {}) {
    this.rootEl = rootEl;
    this.onParameterChange = onParameterChange || (() => {});
    this.state = {
      devices: DEFAULT_STATE.devices.slice(),
      entities: new Map(DEFAULT_STATE.entities),
      lastOps: [],
    };
  }

  reset() {
    this.state.devices = [];
    this.state.entities = new Map();
    this.state.lastOps = [];
    this.render();
  }

  applyOps(ops = []) {
    this.state.lastOps = Array.isArray(ops) ? ops : [];

    for (const op of this.state.lastOps) {
      if (!op || typeof op !== "object") continue;
      if (op.op === "ensureEntity") {
        const alias = op.alias || op.entityAlias;
        const entityType = op.entityType;
        if (!alias || !entityType) continue;
        if (!this.state.entities.has(alias)) {
          this.state.entities.set(alias, { entityType, fields: {} });
        }
        // Treat any non-tonematrix entity as a "device" for visualization.
        if (entityType !== "tonematrix") {
          if (!this.state.devices.some((d) => d.alias === alias)) {
            this.state.devices.push({
              alias,
              name: alias,
              type: entityType,
            });
          }
        }
      }
      if (op.op === "updateField") {
        const alias = op.entityAlias;
        const field = op.field;
        if (!alias || !field) continue;
        const entry = this.state.entities.get(alias) || { entityType: "unknown", fields: {} };
        entry.fields[field] = op.value;
        this.state.entities.set(alias, entry);
      }
    }

    this.render();
  }

  render() {
    if (!this.rootEl) return;
    this.rootEl.innerHTML = "";

    const entities = Array.from(this.state.entities.entries()).map(([alias, v]) => ({
      alias,
      entityType: v.entityType,
      fields: v.fields || {},
    }));

    const toneMatrices = entities.filter((e) => e.entityType === "tonematrix");

    const header = el("div", { class: "preview-header" }, [
      el("div", { class: "preview-title", text: "Simulation" }),
      el("div", { class: "preview-subtitle", text: "Visualizes SDK actions captured from your code." }),
    ]);

    const sections = [header];

    if (this.state.devices.length) {
      const devicesSection = el("section", { class: "preview-section" }, [
        el("div", { class: "preview-section-title", text: "Devices" }),
        el(
          "div",
          { class: "preview-cards" },
          this.state.devices.map((d) =>
            el("div", { class: "preview-card" }, [
              el("div", { class: "preview-card-title", text: d.name || d.alias }),
              el("div", { class: "preview-card-meta", text: d.type || "device" }),
            ]),
          ),
        ),
      ]);
      sections.push(devicesSection);
    }

    if (toneMatrices.length) {
      const toneMatrixSection = el("section", { class: "preview-section" }, [
        el("div", { class: "preview-section-title", text: "Tone matrix" }),
        el(
          "div",
          { class: "preview-stack" },
          toneMatrices.map((tm) => this.renderToneMatrix(tm)),
        ),
      ]);
      sections.push(toneMatrixSection);
    }

    const paramsNode = this.renderParameters(entities);
    if (paramsNode) {
      const parametersSection = el("section", { class: "preview-section" }, [
        el("div", { class: "preview-section-title", text: "Parameters" }),
        paramsNode,
      ]);
      sections.push(parametersSection);
    }

    const opsNode = this.renderOpsList();
    if (opsNode) {
      const opsSection = el("section", { class: "preview-section" }, [
        el("div", { class: "preview-section-title", text: "Last apply ops" }),
        opsNode,
      ]);
      sections.push(opsSection);
    }

    this.rootEl.append(...sections);
  }

  renderToneMatrix(tm) {
    const posX = tm.fields?.positionX;
    const posY = tm.fields?.positionY;

    const grid = el("div", { class: "tm-grid", "aria-label": `Tone matrix ${tm.alias}` });
    for (let i = 0; i < 64; i++) {
      grid.append(el("div", { class: "tm-cell" }));
    }

    return el("div", { class: "preview-card" }, [
      el("div", { class: "preview-card-title", text: tm.alias }),
      el("div", { class: "preview-card-meta", text: `tonematrix · positionX=${posX ?? "—"} · positionY=${posY ?? "—"}` }),
      grid,
    ]);
  }

  renderParameters(entities) {
    const rows = [];
    for (const e of entities) {
      const fields = e.fields || {};
      for (const [key, value] of Object.entries(fields)) {
        if (typeof value !== "number") continue;
        rows.push({ alias: e.alias, field: key, value });
      }
    }

    if (!rows.length) {
      return null;
    }

    const list = el("div", { class: "preview-params" });
    for (const row of rows.slice(0, 20)) {
      const input = el("input", {
        type: "range",
        min: "0",
        max: "2000",
        value: String(clampNumber(row.value, 0, 2000)),
        oninput: (ev) => {
          const next = clampNumber(ev.target.value, 0, 2000);
          this.onParameterChange({ entityAlias: row.alias, field: row.field, value: next });
        },
      });
      list.append(
        el("div", { class: "preview-param" }, [
          el("div", { class: "preview-param-label", text: `${row.alias}.${row.field}` }),
          el("div", { class: "preview-param-value", text: String(row.value) }),
          input,
        ]),
      );
    }
    return list;
  }

  renderOpsList() {
    if (!this.state.lastOps.length) {
      return null;
    }
    const ul = el("ul", { class: "preview-ops" });
    for (const op of this.state.lastOps.slice(-30)) {
      ul.append(el("li", { text: JSON.stringify(op) }));
    }
    return ul;
  }
}

