export const templates = {
  offline: `// ==========================================
// TEMPLATE: OFFLINE MODE (WITH NEXUS UI)
// ==========================================
// Offline mode uses a local (unsynced) document. We use NexusUI to draw controls.

console.log("--- Loading Offline Template ---");

// 1. Spawn a Heisenberg synth in the local engine
let mySynth;
await nexus.modify((t) => {
  // You were right! 'gain' is the correct property.
  mySynth = t.create("heisenberg", { positionX: 100, positionY: 100, gain: 0.7 });
});
console.log("> Synth created in memory.");

// 2. Load the NexusUI Library dynamically (This prevents the ReferenceError)
const NexusModule = await import("https://esm.sh/nexusui");
const NexusLib = NexusModule.default || NexusModule;

// 3. Draw a visual knob on the screen
const uiContainer = document.getElementById("nexus-ui-container");
uiContainer.innerHTML = "<div style='color:#ccc; margin-bottom:10px;'>Synth Gain</div>";

// Use the imported 'NexusLib' to draw the dial
const dial = new NexusLib.Dial(uiContainer, {
  size: [100, 100],
  interaction: "radial",
  mode: "absolute",
  min: 0,
  max: 1,
  value: 0.7,
});

// 4. Bridge the visual knob to the engine
dial.on("change", async (v) => {
  try {
    // Restored to your original, correct code!
    if (mySynth?.fields?.gain) {
      await nexus.modify((t) => t.update(mySynth.fields.gain, v));
      console.log("> Engine gain updated to: " + v.toFixed(2));
    }
  } catch (err) {
    console.warn("Update failed:", err);
  }
});`,

  online: `// ==========================================
// TEMPLATE: CLOUD SYNC & ROUTING
// ==========================================
// 1. Click 'Login' at the top.
// 2. Choose a project (List Projects) or paste a Project UUID.
// 3. Click 'Connect Project'.
// 4. Hit Run, then 'Open Project' to see it in the Studio UI.

console.log("--- Loading Cloud Template ---");

await nexus.modify((t) => {
  const mySynth = t.create("heisenberg", {
    displayName: "Code-Generated Synth",
    positionX: 100,
    positionY: 200,
    gain: 0.7,
  });

  const myDelay = t.create("stompboxDelay", {
    displayName: "Code-Generated Delay",
    positionX: 400,
    positionY: 200,
    mix: 0.6,
    feedbackFactor: 0.4,
  });

  t.create("desktopAudioCable", {
    fromSocket: mySynth.fields.audioOutput.location,
    toSocket: myDelay.fields.audioInput.location,
  });
});

console.log("> Success: Devices spawned and cables routed.");
console.log("> If connected, check your Audiotool Studio tab now!");`,

  cheatsheet: `// ==========================================
// TEMPLATE: SDK CHEAT SHEET
// ==========================================
// Quick vocabulary reference + a live way to discover device knobs.
//
// Pro tip: type t.create(" then press Ctrl+Space to see suggestions.

/*
--- COMMON DEVICES (type keys) ---
Synths:
  - "heisenberg"
  - "bassline"
  - "tonematrix"
  - "machiniste"

Effects:
  - "stompboxDelay"
  - "stompboxReverb"
  - "stompboxChorus"
  - "stompboxCompressor"

Routing:
  - "desktopAudioCable"
  - "desktopNoteCable"

--- COMMON create(...) config keys ---
  - positionX, positionY
  - displayName

--- HOW TO DISCOVER REAL FIELDS / KNOBS ---
Create a device, then inspect its fields:
*/

await nexus.modify((t) => {
  const testDevice = t.create("heisenberg", { positionX: 100, positionY: 100 });
  console.log("Heisenberg entityType:", testDevice.entityType);
  console.log("Top-level field keys:", Object.keys(testDevice.fields));
});`,
};

export const templateMeta = [
  {
    key: "offline",
    pill: "Offline",
    title: "Offline UI (NexusUI)",
    desc: "Draw controls with NexusUI and update the local engine.",
  },
  {
    key: "online",
    pill: "Cloud",
    title: "Cloud Routing (Real Studio)",
    desc: "Spawn devices + route audio; best when connected to a project.",
  },
  {
    key: "cheatsheet",
    pill: "Reference",
    title: "SDK Cheat Sheet",
    desc: "Vocabulary + how to discover fields/knobs.",
  },
];

