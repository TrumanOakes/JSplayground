import { Ticks } from "@audiotool/nexus/utils";
import { ctx } from "./playgroundContext.js";
import { logToConsole } from "./playgroundConsole.js";

/** abcjs setUpAudio() uses whole-note units for start/duration; match Nexus timeline ticks (see developer.audiotool.com Ticks). */
const MAX_NOTES = 1200;

async function loadAbcjs() {
  const mod = await import("abcjs");
  return mod.default ?? mod;
}

function ensureHeaders(text) {
  const t = (text || "").trim();
  if (!t) return "";
  return /^\s*X:/im.test(t) ? t : `X:1\n${t}`;
}

async function parseAbcForImport(abcText) {
  const raw = ensureHeaders(abcText);
  if (!raw) throw new Error("Paste ABC first.");
  const abcjs = await loadAbcjs();
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
        positionTicks: Math.round(ev.start * Ticks.SemiBreve),
        durationTicks: Math.max(1, Math.round(ev.duration * Ticks.SemiBreve)),
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
  return { notes, title, maxEndTicks };
}

/**
 * @param {{ useHeisenberg?: boolean }} [options]
 * - useHeisenberg: use the Heisenberg synth instead of Gakki. Avoids the large piano soundfont
 *   download so playback can start almost immediately (timbre is a synth, not a sampled piano).
 * When useHeisenberg is false, an existing Gakki in the project is reused when possible so repeat
 * imports do not trigger another long soundfont load.
 */
export async function importAbcTextIntoNexus(nexus, abcText, options = {}) {
  const useHeisenberg = Boolean(options.useHeisenberg);
  if (!nexus) throw new Error("No nexus document available.");
  const parsed = await parseAbcForImport(abcText);
  let audioRouted = false;
  await nexus.modify((t) => {
    const coll = t.create("noteCollection", {});
    const player = getOrCreateAbcPlayer(t, parsed, useHeisenberg);
    const track = t.create("noteTrack", {
      player: player.location,
      orderAmongTracks: nextTrackOrderAmong(t),
      isEnabled: true,
    });
    const dur = Math.max(Ticks.SemiBreve, parsed.maxEndTicks + Ticks.Beat * 2);
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
    // Cable after the note track exists so Studio/sync can line up strips (Stagebox inputs).
    audioRouted = cablePlayerToMixerIfNeeded(t, player);
    bumpProjectDurationIfNeeded(t, dur + Ticks.Beat * 8);
  });
  return { ...parsed, audioRouted };
}

/** Extend `config.durationTicks` if the project end is before the clip (transport can appear stuck at 0). */
function bumpProjectDurationIfNeeded(t, minDurationTicks) {
  const min = Math.max(minDurationTicks, Ticks.SemiBreve * 4);
  for (const cfg of t.entities.ofTypes("config").get()) {
    const cur = cfg.fields.durationTicks?.value;
    if (typeof cur === "number" && cur < min) {
      t.update(cfg.fields.durationTicks, min);
    }
  }
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

/**
 * Repeat ABC imports reuse the same Gakki/Heisenberg; its output may already be cabled into a
 * minimixer while mainOut → Stagebox was never added (or was broken). Repair that path.
 * @returns {boolean} false only when a Playground-style minimixer bridge is incomplete and no free strip exists
 */
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
    const stageIn = resolveFreeStageOrCentroidAudioInput(t);
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

/** Stagebox strips and Centroid channels with no incoming desktop cable. */
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

/** Stagebox/Centroid strips, then minimixer channel — first socket with no incoming cable (for wiring a device into a mini path). */
function resolveFreeMixerAudioInput(t) {
  const stageOrCentroid = resolveFreeStageOrCentroidAudioInput(t);
  if (stageOrCentroid) return stageOrCentroid;
  for (const mm of t.entities.ofTypes("minimixer").get()) {
    for (const key of ["channel1", "channel2", "channel3", "channel4"]) {
      const loc = mm.fields[key]?.fields?.audioInput?.location;
      if (loc && t.entities.pointingTo.locations(loc).get().length === 0) return loc;
    }
  }
  return null;
}

/** Last resort: synth → MiniMixer ch1 → first free Stagebox/Centroid strip (or any strip if all busy). */
function bridgePlayerViaMinimixer(t, player) {
  const outLoc = player.fields?.audioOutput?.location;
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
  const stageIn = resolveFreeStageOrCentroidAudioInput(t);
  if (stageIn) {
    t.create("desktopAudioCable", {
      fromSocket: miniOut,
      toSocket: stageIn,
    });
    return true;
  }
  return false;
}

/** @returns {boolean} true if output is already cabled or a new cable was created */
function cablePlayerToMixerIfNeeded(t, player) {
  const outLoc = player.fields?.audioOutput?.location;
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

export function syncAbcImportToolbar() {
  const btn = document.getElementById("abc-import-btn");
  if (!btn) return;
  const synced = window.__NEXUS_MODE__ === "synced" && Boolean(ctx.nexus);
  btn.disabled = !synced;
  btn.title = synced
    ? "Import melody from ABC notation into this connected project"
    : "Connect a cloud project first";
}

export function initAbcImport() {
  const modal = document.getElementById("abc-import-modal");
  const openBtn = document.getElementById("abc-import-btn");
  const closeBtn = document.getElementById("abc-import-close-btn");
  const applyBtn = document.getElementById("abc-import-apply-btn");
  const text = document.getElementById("abc-import-textarea");
  const status = document.getElementById("abc-import-status");

  const setStatus = (msg, isErr = false) => {
    if (!status) return;
    status.textContent = msg || "";
    status.style.color = isErr ? "#ef4444" : "var(--text-muted)";
  };

  const open = () => {
    syncAbcImportToolbar();
    if (openBtn?.disabled) {
      logToConsole("Connect Project first, then try Import ABC.", true);
      return;
    }
    if (!modal) return;
    setStatus("");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    text?.focus();
  };

  const close = () => {
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  };

  openBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal?.style.display === "flex") close();
  });

  applyBtn?.addEventListener("click", async () => {
    setStatus("");
    if (window.__NEXUS_MODE__ !== "synced" || !ctx.nexus) {
      setStatus("Connect Project first.", true);
      return;
    }
    try {
      applyBtn.disabled = true;
      const fastSynth = document.getElementById("abc-import-fast-synth")?.checked ?? false;
      const parsed = await importAbcTextIntoNexus(ctx.nexus, text?.value ?? "", {
        useHeisenberg: fastSynth,
      });
      const routeHint = parsed.audioRouted
        ? ""
        : " No auto audio cable — in Studio, connect the instrument’s audio output to a Stagebox/Centroid channel or mixer strip.";
      const transportHint =
        " Playback: in Studio use Return/Enter to play from playhead (Space uses the play marker). If time stays at 0: turn Loop off or widen the loop bracket on the ruler.";
      if (fastSynth) {
        setStatus(
          `Imported ${parsed.notes.length} notes (Heisenberg). Press Play in Studio — synth is usually ready immediately.${routeHint}${transportHint}`,
        );
      } else {
        setStatus(
          `Imported ${parsed.notes.length} notes. First Gakki load can take a while (yellow dots); repeat imports reuse that piano.${routeHint}${transportHint}`,
        );
      }
      logToConsole(
        `ABC import: ${parsed.notes.length} notes.${parsed.audioRouted ? " Audio auto-routed." : " Manual audio routing may be needed."}`,
      );
      close();
    } catch (err) {
      const msg = String(err?.message || err);
      setStatus(msg, true);
      logToConsole(`ABC import failed: ${msg}`, true);
      console.error(err);
    } finally {
      applyBtn.disabled = false;
    }
  });

  syncAbcImportToolbar();
}

