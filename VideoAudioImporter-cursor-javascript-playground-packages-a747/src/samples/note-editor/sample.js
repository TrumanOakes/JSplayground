const LS_KEY = "playground-note-editor-v1";
const PITCH_MIN = 59;
const PITCH_COUNT = 16;
const TOTAL_BEATS = 16;
const PAD_L = 72;
const PAD_T = 26;
const PAD_R = 10;
const PAD_B = 8;
const RESIZE_HANDLE = 10;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiLabel(m) {
  const o = Math.floor(m / 12) - 1;
  return NOTE_NAMES[((m % 12) + 12) % 12] + o;
}

function uid() {
  return "n_" + Math.random().toString(36).slice(2, 11);
}

/** @type {{ id: string, pitch: number, startBeat: number, durationBeats: number }[]} */
let notes = [];
let selectedId = null;
/** @type {{ mode: string, noteId: string, mx0: number, my0: number, s0: number, d0: number, p0: number } | null} */
let drag = null;

const canvas = document.getElementById("ne-canvas");
const jsonTa = document.getElementById("ne-json");
const timelineBody = document.getElementById("ne-timeline-body");
const panelGrid = document.getElementById("ne-panel-grid");
const panelTimeline = document.getElementById("ne-panel-timeline");
const btnGrid = document.getElementById("ne-btn-grid");
const btnTimeline = document.getElementById("ne-btn-timeline");

if (!canvas || !jsonTa) {
  throw new Error("Note editor markup missing.");
}

const ctx = canvas.getContext("2d");

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.notes)) {
      notes = data.notes.filter(
        (n) =>
          n &&
          typeof n.id === "string" &&
          typeof n.pitch === "number" &&
          typeof n.startBeat === "number" &&
          typeof n.durationBeats === "number",
      );
    }
  } catch (_) {
    /* ignore */
  }
}

function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ version: 1, notes }));
  } catch (_) {
    /* ignore */
  }
}

function snapBeat(v) {
  const s = Math.round(v * 4) / 4;
  return Math.max(0, Math.min(TOTAL_BEATS - 0.25, s));
}

function snapPitch(p) {
  return Math.max(PITCH_MIN, Math.min(PITCH_MIN + PITCH_COUNT - 1, Math.round(p)));
}

function layoutMetrics() {
  const w = canvas.width;
  const h = canvas.height;
  const innerW = w - PAD_L - PAD_R;
  const innerH = h - PAD_T - PAD_B;
  const pxPerBeat = innerW / TOTAL_BEATS;
  const pxPerPitch = innerH / PITCH_COUNT;
  return { w, h, innerW, innerH, pxPerBeat, pxPerPitch };
}

function draw() {
  const { w, h, innerW, innerH, pxPerBeat, pxPerPitch } = layoutMetrics();
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#0b1220";
  ctx.fillRect(PAD_L, PAD_T, innerW, innerH);

  ctx.strokeStyle = "#243247";
  ctx.lineWidth = 1;
  for (let b = 0; b <= TOTAL_BEATS; b++) {
    const x = PAD_L + b * pxPerBeat;
    ctx.beginPath();
    ctx.moveTo(x, PAD_T);
    ctx.lineTo(x, PAD_T + innerH);
    ctx.stroke();
  }
  for (let r = 0; r <= PITCH_COUNT; r++) {
    const y = PAD_T + r * pxPerPitch;
    ctx.beginPath();
    ctx.moveTo(PAD_L, y);
    ctx.lineTo(PAD_L + innerW, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#9db5d0";
  const labelEvery = pxPerPitch < 14 ? 2 : 1;
  const axisFontPx = pxPerPitch < 12 ? 10 : 11;
  ctx.font = `${axisFontPx}px ui-sans-serif, system-ui, sans-serif`;
  for (let b = 0; b < TOTAL_BEATS; b++) {
    ctx.fillText(String(b), PAD_L + b * pxPerBeat + 3, PAD_T - 8);
  }
  for (let r = 0; r < PITCH_COUNT; r++) {
    if (r % labelEvery !== 0) continue;
    const pitch = PITCH_MIN + PITCH_COUNT - 1 - r;
    ctx.fillText(midiLabel(pitch), 4, PAD_T + r * pxPerPitch + 12);
  }

  for (const n of notes) {
    const row = PITCH_MIN + PITCH_COUNT - 1 - n.pitch;
    const x = PAD_L + n.startBeat * pxPerBeat;
    const y = PAD_T + row * pxPerPitch + 1;
    const nw = Math.max(4, n.durationBeats * pxPerBeat - 2);
    const nh = pxPerPitch - 2;
    const isSel = n.id === selectedId;
    ctx.fillStyle = isSel ? "#33b6a8" : "#238c7d";
    ctx.globalAlpha = 0.88;
    ctx.fillRect(x, y, nw, nh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isSel ? "#e6eef8" : "#152032";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, nw, nh);
  }
}

function hitTest(mx, my) {
  const { innerW, innerH, pxPerBeat, pxPerPitch } = layoutMetrics();
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    const row = PITCH_MIN + PITCH_COUNT - 1 - n.pitch;
    const x = PAD_L + n.startBeat * pxPerBeat;
    const y = PAD_T + row * pxPerPitch + 1;
    const nw = Math.max(4, n.durationBeats * pxPerBeat - 2);
    const nh = pxPerPitch - 2;
    if (mx >= x && mx <= x + nw && my >= y && my <= y + nh) {
      if (mx >= x + nw - RESIZE_HANDLE) {
        return { kind: "resize", note: n };
      }
      return { kind: "move", note: n };
    }
  }
  if (mx >= PAD_L && mx <= PAD_L + innerW && my >= PAD_T && my <= PAD_T + innerH) {
    const beat = (mx - PAD_L) / pxPerBeat;
    const row = Math.floor((my - PAD_T) / pxPerPitch);
    const pitch = PITCH_MIN + PITCH_COUNT - 1 - row;
    return { kind: "empty", beat, pitch };
  }
  return null;
}

function syncJson() {
  jsonTa.value = JSON.stringify({ version: 1, notes }, null, 2);
  saveState();
}

function commitNoteState() {
  draw();
  syncJson();
  renderTimeline();
}

function renderTimeline() {
  if (!timelineBody) return;
  timelineBody.replaceChildren();
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
  if (!sorted.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.className = "ne-empty-row";
    td.colSpan = 5;
    td.textContent = "No notes yet. Add notes in Grid view to list them here.";
    tr.appendChild(td);
    timelineBody.appendChild(tr);
    return;
  }
  sorted.forEach((n, idx) => {
    const tr = document.createElement("tr");
    const tdIdx = document.createElement("td");
    tdIdx.textContent = String(idx + 1);
    const tdPitch = document.createElement("td");
    tdPitch.textContent = n.pitch + " (" + midiLabel(n.pitch) + ")";
    const tdStart = document.createElement("td");
    tdStart.textContent = String(n.startBeat);
    const tdDur = document.createElement("td");
    tdDur.textContent = String(n.durationBeats);
    const tdAct = document.createElement("td");
    const rm = document.createElement("button");
    rm.type = "button";
    rm.textContent = "Remove";
    const id = n.id;
    rm.addEventListener("click", () => {
      notes = notes.filter((x) => x.id !== id);
      if (selectedId === id) selectedId = null;
      commitNoteState();
    });
    tdAct.appendChild(rm);
    tr.append(tdIdx, tdPitch, tdStart, tdDur, tdAct);
    timelineBody.appendChild(tr);
  });
}

function applyJsonFromTextarea() {
  const text = jsonTa.value.trim();
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.notes)) {
    throw new Error('JSON must include a "notes" array.');
  }
  notes = data.notes.map((n) => ({
    id: typeof n.id === "string" ? n.id : uid(),
    pitch: snapPitch(Number(n.pitch)),
    startBeat: snapBeat(Number(n.startBeat)),
    durationBeats: Math.max(0.25, snapBeat(Number(n.durationBeats) || 0.25)),
  }));
  selectedId = null;
  commitNoteState();
}

function resizeCanvas() {
  const wrap = canvas.parentElement;
  if (!wrap) return;
  const w = Math.max(160, Math.floor(wrap.clientWidth));
  const h = Math.max(100, Math.floor(wrap.clientHeight));
  if (canvas.width === w && canvas.height === h) {
    draw();
    return;
  }
  canvas.width = w;
  canvas.height = h;
  draw();
}

function clientToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    mx: (e.clientX - rect.left) * scaleX,
    my: (e.clientY - rect.top) * scaleY,
  };
}

canvas.addEventListener("mousedown", (e) => {
  const { mx, my } = clientToCanvas(e);
  const hit = hitTest(mx, my);
  if (!hit) return;
  if (hit.kind === "empty") {
    const startBeat = snapBeat(hit.beat);
    const pitch = snapPitch(hit.pitch);
    const n = { id: uid(), pitch, startBeat, durationBeats: 1 };
    notes.push(n);
    selectedId = n.id;
    draw();
    requestAnimationFrame(() => {
      syncJson();
      renderTimeline();
    });
    return;
  }
  const n = hit.note;
  selectedId = n.id;
  drag = {
    mode: hit.kind === "resize" ? "resize" : "move",
    noteId: n.id,
    mx0: mx,
    my0: my,
    s0: n.startBeat,
    d0: n.durationBeats,
    p0: n.pitch,
  };
  draw();
  syncJson();
});

window.addEventListener("mousemove", (e) => {
  if (!drag) return;
  const { mx, my } = clientToCanvas(e);
  const n = notes.find((x) => x.id === drag.noteId);
  if (!n) {
    drag = null;
    return;
  }
  const { pxPerBeat, pxPerPitch } = layoutMetrics();
  if (drag.mode === "move") {
    const dxBeats = (mx - drag.mx0) / pxPerBeat;
    const dyPitch = (drag.my0 - my) / pxPerPitch;
    n.startBeat = snapBeat(drag.s0 + dxBeats);
    n.pitch = snapPitch(drag.p0 + dyPitch);
  } else {
    const dxBeats = (mx - drag.mx0) / pxPerBeat;
    n.durationBeats = Math.max(0.25, snapBeat(drag.d0 + dxBeats));
    const end = n.startBeat + n.durationBeats;
    if (end > TOTAL_BEATS) {
      n.durationBeats = Math.max(0.25, TOTAL_BEATS - n.startBeat);
    }
  }
  draw();
});

window.addEventListener("mouseup", () => {
  if (drag) {
    drag = null;
    syncJson();
    renderTimeline();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  const t = e.target;
  if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
  if (!selectedId) return;
  e.preventDefault();
  notes = notes.filter((x) => x.id !== selectedId);
  selectedId = null;
  commitNoteState();
});

document.getElementById("ne-btn-clear")?.addEventListener("click", () => {
  notes = [];
  selectedId = null;
  commitNoteState();
});

document.getElementById("ne-btn-copy")?.addEventListener("click", async () => {
  syncJson();
  try {
    await navigator.clipboard.writeText(jsonTa.value);
    console.log("JSON copied to clipboard.");
  } catch (err) {
    console.warn("Clipboard unavailable", err);
  }
});

document.getElementById("ne-btn-apply")?.addEventListener("click", () => {
  try {
    applyJsonFromTextarea();
    console.log("Applied JSON.");
  } catch (err) {
    console.error(String(err));
  }
});

function setView(mode) {
  const isGrid = mode === "grid";
  if (panelGrid) {
    panelGrid.hidden = !isGrid;
    panelGrid.style.display = isGrid ? "flex" : "none";
  }
  if (panelTimeline) {
    panelTimeline.hidden = isGrid;
    panelTimeline.style.display = isGrid ? "none" : "flex";
  }
  btnGrid?.classList.toggle("active", isGrid);
  btnTimeline?.classList.toggle("active", !isGrid);
  if (isGrid) {
    resizeCanvas();
  } else {
    renderTimeline();
  }
}

btnGrid?.addEventListener("click", () => setView("grid"));
btnTimeline?.addEventListener("click", () => setView("timeline"));

window.addEventListener("resize", () => {
  if (panelGrid && !panelGrid.hidden) resizeCanvas();
});

const canvasWrap = canvas.parentElement;
if (canvasWrap && typeof ResizeObserver !== "undefined") {
  let roScheduled = false;
  const ro = new ResizeObserver(() => {
    if (!panelGrid || panelGrid.hidden) return;
    if (roScheduled) return;
    roScheduled = true;
    requestAnimationFrame(() => {
      roScheduled = false;
      resizeCanvas();
    });
  });
  ro.observe(canvasWrap);
}

loadState();
syncJson();
renderTimeline();
setView("grid");
requestAnimationFrame(() => {
  resizeCanvas();
  requestAnimationFrame(resizeCanvas);
});
