import { codeSamples } from "./codeSamples.js";
import { ctx } from "./playgroundContext.js";
import { logToConsole } from "./playgroundConsole.js";

export function initSamplesGallery() {
  const modal = document.getElementById("samples-modal");
  const openBtn = document.getElementById("browse-samples-btn");
  const closeBtn = document.getElementById("close-samples-btn");

  const open = () => {
    if (!modal) return;
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    closeBtn?.focus?.();
  };
  const close = () => {
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    openBtn?.focus?.();
  };

  openBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal?.style.display === "flex") close();
  });

  // Event delegation keeps sample buttons working after HMR / modal content updates.
  modal?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".load-sample-btn");
    if (!btn) return;
    const key = btn.getAttribute("data-sample");
    if (!key) return;
    if (!codeSamples[key]) {
      logToConsole(`Sample not found: ${key}`, true);
      return;
    }
    if (!ctx.editor) {
      logToConsole("Editor is not ready yet.", true);
      return;
    }
    ctx.editor.setValue(codeSamples[key]);
    const kind =
      btn.getAttribute("data-kind") === "template" ? "Template" : "Sample";
    logToConsole(`Loaded ${kind}: ${key}`);
    close();
  });
}
