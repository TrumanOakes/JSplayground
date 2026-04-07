import { templates } from "./templates.js";

export const codeSamples = {
  starterChain: `// ==========================================
// SAMPLE: HEISENBERG → DELAY (AUDIO CABLE)
// ==========================================
console.log("--- Loading sample: Heisenberg → Delay ---");

await nexus.modify((t) => {
  const synth = t.create("heisenberg", {
    displayName: "Sample Synth",
    positionX: 100,
    positionY: 160,
    gain: 0.7,
  });

  const delay = t.create("stompboxDelay", {
    displayName: "Sample Delay",
    positionX: 420,
    positionY: 160,
    mix: 0.45,
    feedbackFactor: 0.35,
  });

  t.create("desktopAudioCable", {
    fromSocket: synth.fields.audioOutput.location,
    toSocket: delay.fields.audioInput.location,
  });
});

console.log("> Done: wired synth output into delay input.");`,

  seqToDrums: `// ==========================================
// SAMPLE: TONEMATRIX → MACHINISTE (NOTE CABLE)
// ==========================================
console.log("--- Loading sample: ToneMatrix → Machiniste ---");

await nexus.modify((t) => {
  const drums = t.create("machiniste", {
    displayName: "Sample Drums",
    positionX: 520,
    positionY: 140,
  });

  const seq = t.create("tonematrix", {
    displayName: "Sample Sequencer",
    positionX: 140,
    positionY: 140,
  });

  t.create("desktopNoteCable", {
    fromSocket: seq.fields.noteOutput.location,
    toSocket: drums.fields.notesInput.location,
  });
});

console.log("> Done: wired ToneMatrix noteOutput into Machiniste notesInput.");`,

  mixerMelody: `// ==========================================
// SAMPLE: HEISENBERG + MIXER + SHORT MELODY (audible in Studio)
// ==========================================
// Heisenberg loads fast (no soundfont). Audio must reach the Stagebox/mixer.
// 1) Connect a cloud project (recommended)  2) Run  3) Open Studio → Press Play

console.log("--- Loading sample: Heisenberg → mixer + melody ---");

const BEAT = 3840;
const SEMI = 15360;

function sortedMixerChannels(t) {
  return [...t.entities.ofTypes("mixerChannel").get()].sort((a, b) => {
    const oa = a.fields.displayParameters?.fields?.orderAmongStrips?.value ?? 0;
    const ob = b.fields.displayParameters?.fields?.orderAmongStrips?.value ?? 0;
    return oa - ob;
  });
}

function sortedCentroidChannels(t) {
  return [...t.entities.ofTypes("centroidChannel").get()].sort((a, b) => {
    const oa = a.fields.orderAmongChannels?.value ?? 0;
    const ob = b.fields.orderAmongChannels?.value ?? 0;
    return oa - ob;
  });
}

function resolveFreeStageOrCentroidAudioInput(t) {
  for (const ch of sortedMixerChannels(t)) {
    const loc = ch.fields.audioInput?.location;
    if (loc && t.entities.pointingTo.locations(loc).get().length === 0) return loc;
  }
  for (const ch of sortedCentroidChannels(t)) {
    const loc = ch.fields.audioInput?.location;
    if (loc && t.entities.pointingTo.locations(loc).get().length === 0) return loc;
  }
  return null;
}

function resolveStageOrCentroidAudioInputEvenIfBusy(t) {
  const free = resolveFreeStageOrCentroidAudioInput(t);
  if (free) return free;
  for (const ch of sortedMixerChannels(t)) {
    const loc = ch.fields.audioInput?.location;
    if (loc) return loc;
  }
  for (const ch of sortedCentroidChannels(t)) {
    const loc = ch.fields.audioInput?.location;
    if (loc) return loc;
  }
  return null;
}

function resolveStageOrCentroidAudioInputEvenIfBusy(t) {
  const free = resolveFreeStageOrCentroidAudioInput(t);
  if (free) return free;
  for (const ch of sortedMixerChannels(t)) {
    const loc = ch.fields.audioInput?.location;
    if (loc) return loc;
  }
  for (const ch of sortedCentroidChannels(t)) {
    const loc = ch.fields.audioInput?.location;
    if (loc) return loc;
  }
  return null;
}

function resolveStageOrCentroidAudioInputEvenIfBusy(t) {
  const free = resolveFreeStageOrCentroidAudioInput(t);
  if (free) return free;
  const mixer = sortedMixerChannels(t);
  for (const ch of mixer) {
    const loc = ch.fields.audioInput?.location;
    if (loc) return loc;
  }
  const centroid = sortedCentroidChannels(t);
  for (const ch of centroid) {
    const loc = ch.fields.audioInput?.location;
    if (loc) return loc;
  }
  return null;
}

function resolveStageOrCentroidAudioInputEvenIfBusy(t) {
  const free = resolveFreeStageOrCentroidAudioInput(t);
  if (free) return free;
  const mixer = sortedMixerChannels(t);
  for (const ch of mixer) {
    const loc = ch.fields.audioInput?.location;
    if (loc) return loc;
  }
  const centroid = sortedCentroidChannels(t);
  for (const ch of centroid) {
    const loc = ch.fields.audioInput?.location;
    if (loc) return loc;
  }
  return null;
}

function resolveFreeMixerAudioInput(t) {
  const direct = resolveFreeStageOrCentroidAudioInput(t);
  if (direct) return direct;
  for (const mm of t.entities.ofTypes("minimixer").get()) {
    for (const key of ["channel1", "channel2", "channel3", "channel4"]) {
      const loc = mm.fields[key]?.fields?.audioInput?.location;
      if (loc && t.entities.pointingTo.locations(loc).get().length === 0) return loc;
    }
  }
  return null;
}

function audioSocketHasCable(t, loc) {
  if (!loc) return false;
  return t.entities.pointingTo.locations(loc).get().length > 0;
}

function minimixerOwningChannelInput(t, channelInputLoc) {
  if (!channelInputLoc) return null;
  for (const mm of t.entities.ofTypes("minimixer").get()) {
    for (const key of ["channel1", "channel2", "channel3", "channel4"]) {
      const loc = mm.fields[key]?.fields?.audioInput?.location;
      if (loc && loc.equals(channelInputLoc)) return mm;
    }
  }
  return null;
}

function completeHalfMinimixerBridgeIfNeeded(t, audioOutLoc) {
  if (!audioOutLoc) return true;
  const pointing = t.entities.pointingTo.locations(audioOutLoc).get();
  let sawMinimixerDownstream = false;
  let couldNotFinish = false;
  for (const ent of pointing) {
    if (ent.entityType !== "desktopAudioCable") continue;
    const toLoc = ent.fields.toSocket?.value;
    if (!toLoc) continue;
    const mm = minimixerOwningChannelInput(t, toLoc);
    if (!mm) continue;
    sawMinimixerDownstream = true;
    const mainOut = mm.fields.mainOutput?.location;
    if (!mainOut) continue;
    if (audioSocketHasCable(t, mainOut)) continue;
    const stageIn = resolveStageOrCentroidAudioInputEvenIfBusy(t);
    if (!stageIn) {
      couldNotFinish = true;
      continue;
    }
    t.create("desktopAudioCable", {
      fromSocket: mainOut,
      toSocket: stageIn,
    });
  }
  if (sawMinimixerDownstream && couldNotFinish) return false;
  return true;
}

function bridgeSynthViaMinimixer(t, synth) {
  const outLoc = synth.fields?.audioOutput?.location;
  if (!outLoc || audioSocketHasCable(t, outLoc)) return true;
  const mini = t.create("minimixer", {
    displayName: "Playground route",
    positionX: 400,
    positionY: 200,
    gain: 1,
  });
  t.create("desktopAudioCable", {
    fromSocket: outLoc,
    toSocket: mini.fields.channel1.fields.audioInput.location,
  });
  const miniOut = mini.fields.mainOutput.location;
  const stageIn = resolveStageOrCentroidAudioInputEvenIfBusy(t);
  if (stageIn) {
    t.create("desktopAudioCable", {
      fromSocket: miniOut,
      toSocket: stageIn,
    });
    return true;
  }
  return false;
}

function routeSynthToMixer(t, synth) {
  const outLoc = synth.fields?.audioOutput?.location;
  if (!outLoc) return false;
  if (audioSocketHasCable(t, outLoc)) {
    return completeHalfMinimixerBridgeIfNeeded(t, outLoc);
  }
  const inLoc = resolveFreeMixerAudioInput(t);
  if (inLoc) {
    t.create("desktopAudioCable", {
      fromSocket: outLoc,
      toSocket: inLoc,
    });
    return true;
  }
  return bridgeSynthViaMinimixer(t, synth);
}

function nextTrackOrderAmong(t) {
  const types = ["noteTrack", "patternTrack", "audioTrack", "automationTrack"];
  let max = -1;
  for (const ty of types) {
    for (const e of t.entities.ofTypes(ty).get()) {
      const v = e.fields.orderAmongTracks?.value;
      if (typeof v === "number" && v > max) max = v;
    }
  }
  return max + 1;
}

await nexus.modify((t) => {
  const synth = t.create("heisenberg", {
    displayName: "Playground Melody",
    positionX: 140,
    positionY: 200,
    gain: 0.75,
    playModeIndex: 3,
  });

  const coll = t.create("noteCollection", {});
  const track = t.create("noteTrack", {
    player: synth.location,
    orderAmongTracks: nextTrackOrderAmong(t),
    isEnabled: true,
  });

  const phrase = [
    { pitch: 60, at: 0 },
    { pitch: 64, at: BEAT },
    { pitch: 67, at: 2 * BEAT },
    { pitch: 72, at: 3 * BEAT },
  ];

  const regionDur = Math.max(SEMI, 4 * BEAT + BEAT);
  t.create("noteRegion", {
    collection: coll.location,
    track: track.location,
    region: {
      positionTicks: 0,
      durationTicks: regionDur,
      loopOffsetTicks: 0,
      loopDurationTicks: regionDur,
      collectionOffsetTicks: 0,
      displayName: "C arpeggio",
      isEnabled: true,
    },
  });

  const noteLen = Math.floor(BEAT * 0.82);
  for (const { pitch, at } of phrase) {
    t.create("note", {
      collection: coll.location,
      positionTicks: at,
      durationTicks: Math.max(360, noteLen),
      pitch,
      velocity: 0.85,
    });
  }

  const ok = routeSynthToMixer(t, synth);
  if (ok) console.log("> Audio routed toward Stagebox (direct or via MiniMixer bridge).");
  else console.warn("> Could not reach Stagebox — connect synth (or MiniMixer) OUT in Studio.");

  const minProjLen = Math.max(regionDur + BEAT * 8, SEMI * 4);
  for (const cfg of t.entities.ofTypes("config").get()) {
    const cur = cfg.fields.durationTicks?.value;
    if (typeof cur === "number" && cur < minProjLen) {
      t.update(cfg.fields.durationTicks, minProjLen);
    }
  }
});

console.log("> Studio: Return/Enter = play from playhead. If time stays at 0: turn Loop off or extend loop range on ruler.");
`,

  nexusDialGain: `// ==========================================
// SAMPLE: NEXUSUI DIAL CONTROLS SYNTH GAIN
// ==========================================
// Run loads user code with (nexus, Nexus, client) — Nexus is nexusui (see runUserCode.js).
console.log("--- Loading sample: NexusUI Dial → gain ---");

let synth;
await nexus.modify((t) => {
  synth = t.create("heisenberg", {
    displayName: "Dial Synth",
    positionX: 120,
    positionY: 160,
    gain: 0.7,
  });
});

const ui = document.getElementById("nexus-ui-container");
ui.innerHTML = "<div style='font-weight:700; margin-bottom:10px;'>Synth Gain</div>";

const dial = new Nexus.Dial(ui, {
  size: [110, 110],
  interaction: "radial",
  mode: "absolute",
  min: 0,
  max: 1,
  value: 0.7,
});

dial.on("change", async (v) => {
  try {
    await nexus.modify((t) => t.update(synth.fields.gain, v));
    console.log("> gain:", v.toFixed(2));
  } catch (err) {
    console.warn("Update failed:", err);
  }
});`,

  offlineDashboard: `// ==========================================
// SAMPLE: MINI SYNTH DASHBOARD (OFFLINE)
// ==========================================
console.log("--- Loading sample: Mini Synth Dashboard ---");

// 1) Spawn an offline synth + reverb, and wire them
await nexus.modify((t) => {
  const synth = t.create("heisenberg", { positionX: 120, positionY: 120, gain: 0.7 });
  const reverb = t.create("stompboxReverb", { positionX: 420, positionY: 120, mix: 0.45 });

  t.create("desktopAudioCable", {
    fromSocket: synth.fields.audioOutput.location,
    toSocket: reverb.fields.audioInput.location,
  });
});
console.log("> Headless synth + reverb ready.");

// 2) Build a tiny dashboard UI
const ui = document.getElementById("nexus-ui-container");
ui.innerHTML = \`
  <div style="font-weight:900; margin-bottom:14px; color: var(--text);">Mini Synth Dashboard</div>
  <div style="
    display:flex;
    justify-content:center;
    align-items:flex-end;
    background: rgba(255,255,255,0.05); /* Adjusted slightly for dark/light theme compat */
    padding: 16px;
    border-radius: 14px;
    border: 1px solid var(--border);
  ">
    <div id="piano-container"></div>
  </div>
\`;

// 3) Dynamically load NexusUI (The Fix!)
const NexusModule = await import("https://esm.sh/nexusui");
const NexusLib = NexusModule.default || NexusModule;

// 4) NexusUI piano (slider temporarily removed)
const piano = new NexusLib.Piano("#piano-container", {
  size: [320, 110],
  mode: "button",
  lowNote: 48,
  highNote: 60,
});

// 5) Piano key feedback (UI-only demo)
piano.on("change", (note) => {
  if (note?.state) {
    console.log("> piano note on:", note.note);
  }
});

console.log("> Dashboard rendered. Click piano keys.");`,

  offlineSynthDelayPlayground: `// ==========================================
// SAMPLE: OFFLINE SYNTH + DELAY PLAYGROUND
// ==========================================
console.log("--- Loading sample: Offline Synth + Delay Playground ---");

let synth;
let delay;

await nexus.modify((t) => {
  synth = t.create("heisenberg", {
    displayName: "Offline Synth",
    positionX: 120,
    positionY: 170,
    gain: 0.7,
  });

  delay = t.create("stompboxDelay", {
    displayName: "Offline Delay",
    positionX: 430,
    positionY: 170,
    mix: 0.4,
    feedbackFactor: 0.3,
  });

  t.create("desktopAudioCable", {
    fromSocket: synth.fields.audioOutput.location,
    toSocket: delay.fields.audioInput.location,
  });
});

const ui = document.getElementById("nexus-ui-container");
ui.innerHTML = \`
  <div style="font-weight:900; margin-bottom:12px;">Offline Synth + Delay Playground</div>
  <div style="display:flex; gap:18px; flex-wrap:wrap; justify-content:center;">
    <div><div style="font-size:12px; margin-bottom:6px;">Synth gain</div><div id="pg-gain"></div></div>
    <div><div style="font-size:12px; margin-bottom:6px;">Delay mix</div><div id="pg-mix"></div></div>
    <div><div style="font-size:12px; margin-bottom:6px;">Feedback</div><div id="pg-feedback"></div></div>
  </div>
\`;

const gainDial = new Nexus.Dial("#pg-gain", { size: [96, 96], min: 0, max: 1, value: 0.7 });
const mixDial = new Nexus.Dial("#pg-mix", { size: [96, 96], min: 0, max: 1, value: 0.4 });
const feedbackDial = new Nexus.Dial("#pg-feedback", { size: [96, 96], min: 0, max: 0.95, value: 0.3 });

gainDial.on("change", async (v) => {
  await nexus.modify((t) => t.update(synth.fields.gain, v));
  console.log("> gain:", v.toFixed(2));
});

mixDial.on("change", async (v) => {
  await nexus.modify((t) => t.update(delay.fields.mix, v));
  console.log("> delay mix:", v.toFixed(2));
});

feedbackDial.on("change", async (v) => {
  await nexus.modify((t) => t.update(delay.fields.feedbackFactor, v));
  console.log("> feedback:", v.toFixed(2));
});

console.log("> Offline routing ready. Tweak dials and run again to reset scene.");`,

  offlinePianoPresets: `// ==========================================
// SAMPLE: OFFLINE PIANO + PRESET BUTTONS
// ==========================================
console.log("--- Loading sample: Offline Piano + Presets ---");

let synth;
let reverb;
await nexus.modify((t) => {
  synth = t.create("heisenberg", {
    displayName: "Preset Synth",
    positionX: 120,
    positionY: 150,
    gain: 0.68,
  });
  reverb = t.create("stompboxReverb", {
    displayName: "Preset Reverb",
    positionX: 420,
    positionY: 150,
    mix: 0.38,
  });
  t.create("desktopAudioCable", {
    fromSocket: synth.fields.audioOutput.location,
    toSocket: reverb.fields.audioInput.location,
  });
});

const ui = document.getElementById("nexus-ui-container");
ui.innerHTML = \`
  <div style="font-weight:900; margin-bottom:12px;">Offline Piano + Presets</div>
  <div id="preset-row" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;"></div>
  <div id="piano-wrap"></div>
\`;

const presets = [
  { id: "pluck", label: "Pluck", gain: 0.55, reverbMix: 0.18 },
  { id: "pad", label: "Pad", gain: 0.62, reverbMix: 0.58 },
  { id: "lead", label: "Lead", gain: 0.78, reverbMix: 0.24 },
  { id: "ambient", label: "Ambient", gain: 0.5, reverbMix: 0.75 },
];

const row = document.getElementById("preset-row");
for (const p of presets) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = p.label;
  btn.style.cssText = "padding:7px 12px; border-radius:10px; border:1px solid var(--border); background:rgba(255,255,255,0.8); cursor:pointer;";
  btn.addEventListener("click", async () => {
    await nexus.modify((t) => {
      t.update(synth.fields.gain, p.gain);
      t.update(reverb.fields.mix, p.reverbMix);
    });
    console.log(\`> preset: \${p.label} (gain=\${p.gain.toFixed(2)}, reverb=\${p.reverbMix.toFixed(2)})\`);
  });
  row.appendChild(btn);
}

const piano = new Nexus.Piano("#piano-wrap", {
  size: [360, 120],
  mode: "button",
  lowNote: 48,
  highNote: 72,
});

piano.on("change", (note) => {
  if (note?.state) console.log("> note on:", note.note);
});

console.log("> Use preset buttons, then play keys.");`,

  abcVisualizer: `// ==========================================
// SAMPLE: ABC VISUALIZER + IMPORT (Gakki or fast Heisenberg)
// ==========================================
// 1) Paste ABC
// 2) Render score in the UI panel
// 3) (Synced project only) Import notes — optional “fast synth” skips piano soundfont load

console.log("--- Loading sample: ABC Visualizer + Import ---");

// Nexus timeline ticks (@audiotool/nexus utils.Ticks — https://developer.audiotool.com/js-package-documentation/variables/utils.Ticks.html)
const NEXUS_TICKS_BEAT = 3840;
const NEXUS_TICKS_SEMIBREVE = 15360;
const MAX_NOTES = 1200;

const abcjsMod = await import("https://esm.sh/abcjs");
const abcjs = abcjsMod.default ?? abcjsMod;

const ui = document.getElementById("nexus-ui-container");
ui.innerHTML = \`
  <div style="font-weight:900; margin-bottom:10px;">ABC Visualizer + Import</div>
  <p style="margin:0 0 10px; color: var(--text-muted); font-size:12px;">
    Render notation live. Import requires a synced cloud project.
  </p>
  <textarea id="abc-source" spellcheck="false" style="
    width:100%; min-height:140px; resize:vertical; padding:10px; border-radius:10px;
    border:1px solid var(--border); background:#ffffff; color:#111111;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  ">X:1
T:Twinkle fragment
M:4/4
L:1/8
Q:1/4=100
K:C
CC GG | AA G2 |</textarea>
  <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
    <button id="abc-render" type="button" style="padding:8px 12px;">Render score</button>
    <button id="abc-import" type="button" style="padding:8px 12px;">Import to project</button>
  </div>
  <div id="abc-status" style="margin-top:8px; font-size:12px; color: var(--text-muted);"></div>
  <div id="abc-paper" style="margin-top:12px; padding:10px; border:1px solid var(--border); border-radius:10px; overflow:auto;"></div>
\`;

const sourceEl = document.getElementById("abc-source");
const statusEl = document.getElementById("abc-status");
const paperEl = document.getElementById("abc-paper");
const renderBtn = document.getElementById("abc-render");
const importBtn = document.getElementById("abc-import");

function isSyncedCloud() {
  return (
    !!nexus &&
    typeof nexus.start === "function" &&
    typeof nexus.stop === "function"
  );
}

function setStatus(msg, isErr = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isErr ? "#ef4444" : "var(--text-muted)";
}

function ensureHeaders(text) {
  const t = (text || "").trim();
  if (!t) return "";
  return /^\\s*X:/im.test(t) ? t : "X:1\\n" + t;
}

function parseAbc(abcText) {
  const raw = ensureHeaders(abcText);
  if (!raw) throw new Error("Paste ABC first.");

  const tunes = abcjs.parseOnly(raw, {});
  const tune = tunes?.[0];
  if (!tune) throw new Error("Could not parse ABC tune.");
  const audio = tune.setUpAudio({});

  const notes = [];
  for (const track of audio.tracks || []) {
    for (const ev of track) {
      if (ev.cmd !== "note" || typeof ev.pitch !== "number" || ev.duration <= 0) continue;
      notes.push({
        pitch: Math.max(0, Math.min(127, ev.pitch)),
        positionTicks: Math.round(ev.start * NEXUS_TICKS_SEMIBREVE),
        durationTicks: Math.max(1, Math.round(ev.duration * NEXUS_TICKS_SEMIBREVE)),
        velocity: typeof ev.volume === "number" ? Math.min(1, Math.max(0.05, ev.volume / 127)) : 0.78,
      });
      if (notes.length >= MAX_NOTES) break;
    }
    if (notes.length >= MAX_NOTES) break;
  }
  notes.sort((a, b) => a.positionTicks - b.positionTicks || a.pitch - b.pitch);
  if (!notes.length) throw new Error("No notes parsed from ABC.");

  const title = (tune.metaText?.title && String(tune.metaText.title).trim()) || "ABC import";
  const maxEndTicks = notes.reduce((m, n) => Math.max(m, n.positionTicks + n.durationTicks), 0);
  return { raw, notes, title, maxEndTicks };
}

function nextTrackOrderAmong(t) {
  const types = ["noteTrack", "patternTrack", "audioTrack", "automationTrack"];
  let max = -1;
  for (const ty of types) {
    for (const e of t.entities.ofTypes(ty).get()) {
      const v = e.fields.orderAmongTracks?.value;
      if (typeof v === "number" && v > max) max = v;
    }
  }
  return max + 1;
}

function sortedMixerChannels(t) {
  return [...t.entities.ofTypes("mixerChannel").get()].sort((a, b) => {
    const oa = a.fields.displayParameters?.fields?.orderAmongStrips?.value ?? 0;
    const ob = b.fields.displayParameters?.fields?.orderAmongStrips?.value ?? 0;
    return oa - ob;
  });
}

function sortedCentroidChannels(t) {
  return [...t.entities.ofTypes("centroidChannel").get()].sort((a, b) => {
    const oa = a.fields.orderAmongChannels?.value ?? 0;
    const ob = b.fields.orderAmongChannels?.value ?? 0;
    return oa - ob;
  });
}

function resolveFreeStageOrCentroidAudioInput(t) {
  for (const ch of sortedMixerChannels(t)) {
    const loc = ch.fields.audioInput?.location;
    if (loc && t.entities.pointingTo.locations(loc).get().length === 0) return loc;
  }
  for (const ch of sortedCentroidChannels(t)) {
    const loc = ch.fields.audioInput?.location;
    if (loc && t.entities.pointingTo.locations(loc).get().length === 0) return loc;
  }
  return null;
}

function resolveStageOrCentroidAudioInputEvenIfBusy(t) {
  const free = resolveFreeStageOrCentroidAudioInput(t);
  if (free) return free;
  for (const ch of sortedMixerChannels(t)) {
    const loc = ch.fields.audioInput?.location;
    if (loc) return loc;
  }
  for (const ch of sortedCentroidChannels(t)) {
    const loc = ch.fields.audioInput?.location;
    if (loc) return loc;
  }
  return null;
}

function resolveFreeMixerAudioInput(t) {
  const direct = resolveFreeStageOrCentroidAudioInput(t);
  if (direct) return direct;
  for (const mm of t.entities.ofTypes("minimixer").get()) {
    for (const key of ["channel1", "channel2", "channel3", "channel4"]) {
      const loc = mm.fields[key]?.fields?.audioInput?.location;
      if (loc && t.entities.pointingTo.locations(loc).get().length === 0) return loc;
    }
  }
  return null;
}

function audioSocketHasCable(t, loc) {
  if (!loc) return false;
  return t.entities.pointingTo.locations(loc).get().length > 0;
}

function minimixerOwningChannelInput(t, channelInputLoc) {
  if (!channelInputLoc) return null;
  for (const mm of t.entities.ofTypes("minimixer").get()) {
    for (const key of ["channel1", "channel2", "channel3", "channel4"]) {
      const loc = mm.fields[key]?.fields?.audioInput?.location;
      if (loc && loc.equals(channelInputLoc)) return mm;
    }
  }
  return null;
}

function completeHalfMinimixerBridgeIfNeeded(t, audioOutLoc) {
  if (!audioOutLoc) return true;
  const pointing = t.entities.pointingTo.locations(audioOutLoc).get();
  let sawMinimixerDownstream = false;
  let couldNotFinish = false;
  for (const ent of pointing) {
    if (ent.entityType !== "desktopAudioCable") continue;
    const toLoc = ent.fields.toSocket?.value;
    if (!toLoc) continue;
    const mm = minimixerOwningChannelInput(t, toLoc);
    if (!mm) continue;
    sawMinimixerDownstream = true;
    const mainOut = mm.fields.mainOutput?.location;
    if (!mainOut) continue;
    if (audioSocketHasCable(t, mainOut)) continue;
    const stageIn = resolveStageOrCentroidAudioInputEvenIfBusy(t);
    if (!stageIn) {
      couldNotFinish = true;
      continue;
    }
    t.create("desktopAudioCable", {
      fromSocket: mainOut,
      toSocket: stageIn,
    });
  }
  if (sawMinimixerDownstream && couldNotFinish) return false;
  return true;
}

function bridgePlayerViaMinimixer(t, player) {
  const outLoc = player.fields?.audioOutput?.location;
  if (!outLoc) return false;
  // If already wired into something, try to repair a half-bridge (minimixer mainOut not reaching Stagebox).
  if (audioSocketHasCable(t, outLoc)) {
    return completeHalfMinimixerBridgeIfNeeded(t, outLoc);
  }
  const mini = t.create("minimixer", {
    displayName: "Playground route",
    positionX: 400,
    positionY: 200,
    gain: 1,
  });
  t.create("desktopAudioCable", {
    fromSocket: outLoc,
    toSocket: mini.fields.channel1.fields.audioInput.location,
  });
  const miniOut = mini.fields.mainOutput.location;
  const stageIn = resolveStageOrCentroidAudioInputEvenIfBusy(t);
  if (stageIn) {
    t.create("desktopAudioCable", {
      fromSocket: miniOut,
      toSocket: stageIn,
    });
    return true;
  }
  return false;
}

function cablePlayerToMixerIfNeeded(t, player) {
  const outLoc = player.fields?.audioOutput?.location;
  if (!outLoc) return false;
  // For ABC sample imports we prefer a consistent, visible routing chain:
  // instrument → minimixer ("Playground route") → Stagebox/Centroid.
  return bridgePlayerViaMinimixer(t, player);
}

function getOrCreateAbcPlayer(t, parsed, useHeisenberg) {
  const kind = useHeisenberg ? "heisenberg" : "gakki";
  const label =
    parsed.title.slice(0, 52) || (useHeisenberg ? "ABC (synth)" : "ABC (piano)");
  const existing = t.entities.ofTypes(kind).get();
  if (existing.length > 0) return existing[0];
  return t.create(kind, {
    displayName: label,
    positionX: 160,
    positionY: 220,
    gain: 0.78,
  });
}

function renderScore() {
  try {
    const raw = ensureHeaders(sourceEl.value);
    if (!raw) throw new Error("Paste ABC first.");
    paperEl.innerHTML = "";
    abcjs.renderAbc("abc-paper", raw, { responsive: "resize" });
    setStatus("Score rendered.");
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

renderBtn.addEventListener("click", renderScore);
renderScore();

function syncImportButtonState() {
  const ok = isSyncedCloud();
  importBtn.disabled = false;
  importBtn.title = ok
    ? "Import ABC notes into synced cloud project"
    : "Import into current engine (offline unless connected)";
  if (!ok) setStatus("Not synced: import goes to offline engine only.");
}
syncImportButtonState();
const statusTimer = setInterval(syncImportButtonState, 1000);
window.addEventListener(
  "beforeunload",
  () => {
    clearInterval(statusTimer);
  },
  { once: true },
);

importBtn.addEventListener("click", async () => {
  try {
    const activeNexus = window.__NEXUS_INSTANCE__ || nexus;
    if (window.__NEXUS_MODE__ !== "synced" || !activeNexus || typeof activeNexus.modify !== "function") {
      throw new Error("Connect Project first. Sample import writes to synced project only.");
    }
    setStatus("Importing...");
    const parsed = parseAbc(sourceEl.value);
    const useHeisenberg = false;
    let audioRouted = false;
    await activeNexus.modify((t) => {
      const coll = t.create("noteCollection", {});
      const player = getOrCreateAbcPlayer(t, parsed, useHeisenberg);
      const track = t.create("noteTrack", {
        player: player.location,
        orderAmongTracks: nextTrackOrderAmong(t),
        isEnabled: true,
      });
      const dur = Math.max(NEXUS_TICKS_SEMIBREVE, parsed.maxEndTicks + NEXUS_TICKS_BEAT * 2);
      t.create("noteRegion", {
        collection: coll.location,
        track: track.location,
        region: {
          positionTicks: 0,
          durationTicks: dur,
          loopOffsetTicks: 0,
          loopDurationTicks: dur,
          collectionOffsetTicks: 0,
          displayName: parsed.title.slice(0, 80),
          isEnabled: true,
        },
      });
      for (const n of parsed.notes) {
        t.create("note", {
          collection: coll.location,
          positionTicks: n.positionTicks,
          durationTicks: n.durationTicks,
          pitch: n.pitch,
          velocity: n.velocity,
        });
      }
      audioRouted = cablePlayerToMixerIfNeeded(t, player);
      const minProjLen = Math.max(dur + NEXUS_TICKS_BEAT * 8, NEXUS_TICKS_SEMIBREVE * 4);
      for (const cfg of t.entities.ofTypes("config").get()) {
        const cur = cfg.fields.durationTicks?.value;
        if (typeof cur === "number" && cur < minProjLen) {
          t.update(cfg.fields.durationTicks, minProjLen);
        }
      }
    });
    const routeHint = audioRouted
      ? ""
      : " No auto audio cable — connect the instrument output to Stagebox/Centroid/minimixer in Studio.";
    const transportHint =
      " If playhead stays at 0: use Return (not only Space), turn Loop off, or widen loop on ruler.";
    if (useHeisenberg) {
      setStatus("Imported (Heisenberg)." + routeHint + transportHint);
    } else {
      setStatus(
        "Imported (Gakki). First load may show yellow dots; repeat imports reuse the piano." +
          routeHint +
          transportHint,
      );
    }
    console.log(
      "> ABC sample import complete (" +
        parsed.notes.length +
        " notes)." +
        (audioRouted ? " Audio routed." : " Manual audio cable may be needed."),
    );
  } catch (err) {
    setStatus(String(err?.message || err), true);
    console.warn("ABC import failed:", err?.stack || err);
  }
});`,

  /** Full editor starters (same source as `templates.js`). */
  templateOffline: templates.offline,
  templateOnline: templates.online,
  templateCheatsheet: templates.cheatsheet,
};

