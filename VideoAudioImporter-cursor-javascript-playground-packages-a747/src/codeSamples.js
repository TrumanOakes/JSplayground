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

  nexusDialGain: `// ==========================================
// SAMPLE: NEXUSUI DIAL CONTROLS SYNTH GAIN
// ==========================================
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
};

