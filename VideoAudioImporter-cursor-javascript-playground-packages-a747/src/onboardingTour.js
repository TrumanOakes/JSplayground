const TOUR_KEY = "pg_onboarding_dismissed_v2";

const steps = [
  {
    id: "appearance",
    target: "#appearance-menu-btn",
    title: "Appearance",
    body: "Use Appearance to switch theme, adjust density, and tune editor font size for your screen.",
  },
  {
    id: "project",
    target: "#top-bar .toolbar-group[aria-label='Project']",
    title: "Project bar",
    body: "Sign in, create or list cloud projects, connect a project, then open Studio when you're ready.",
  },
  {
    id: "editor",
    target: "#editor-js",
    title: "JavaScript editor",
    body: "Load a sample to get started fast, then use Run Code to apply changes and generate UI.",
  },
  {
    id: "canvas",
    target: "#nexus-ui-container",
    title: "UI canvas",
    body: "Your generated dashboard and controls appear here after samples or your code run.",
  },
  {
    id: "terminal",
    target: "#console-output",
    title: "Terminal output",
    body: "Check this panel after each run for logs, status messages, and errors to guide your next edit.",
  },
];

function overlayMarkup() {
  return `
    <div class="pg-tour-backdrop"></div>
    <div class="pg-tour-spotlight" aria-hidden="true"></div>
    <div class="pg-tour-card" role="dialog" aria-modal="true" aria-labelledby="pg-tour-title" aria-describedby="pg-tour-body">
      <div class="pg-tour-meta">
        <span class="pg-tour-kicker">Quick tour</span>
        <span class="pg-tour-progress"></span>
      </div>
      <div class="pg-tour-title-row">
        <h3 id="pg-tour-title" class="pg-tour-title"></h3>
        <button type="button" class="pg-tour-close" aria-label="Dismiss tour">✕</button>
      </div>
      <p id="pg-tour-body" class="pg-tour-body"></p>
      <div class="pg-tour-footer">
        <button type="button" class="pg-tour-skip">Skip</button>
        <div class="pg-tour-steps">
          <button type="button" class="pg-tour-prev">Back</button>
          <button type="button" class="pg-tour-next">Next</button>
        </div>
      </div>
    </div>
  `;
}

function ensureOverlay(forceRebuild = false) {
  let overlay = document.getElementById("pg-tour-overlay");

  if (overlay && !forceRebuild) {
    const ok =
      overlay.querySelector(".pg-tour-card") &&
      overlay.querySelector(".pg-tour-spotlight") &&
      overlay.querySelector(".pg-tour-skip") &&
      overlay.querySelector(".pg-tour-close");
    if (ok) return overlay;
  }

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "pg-tour-overlay";
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = overlayMarkup();
  return overlay;
}

function positionCard(card, targetEl) {
  const rect = targetEl.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const margin = 14;

  let top = rect.bottom + margin;
  if (top + cardRect.height > window.innerHeight - 16) {
    top = rect.top - cardRect.height - margin;
  }

  let left = rect.left;
  if (left + cardRect.width > window.innerWidth - 16) {
    left = window.innerWidth - cardRect.width - 16;
  }

  card.style.top = `${Math.max(16, top)}px`;
  card.style.left = `${Math.max(16, left)}px`;
}

function positionSpotlight(spotlight, targetEl) {
  const rect = targetEl.getBoundingClientRect();
  const pad = rect.height > 260 || rect.width > 520 ? 3 : 8;
  const top = Math.max(6, rect.top - pad);
  const left = Math.max(6, rect.left - pad);
  const right = Math.min(window.innerWidth - 6, rect.right + pad);
  const bottom = Math.min(window.innerHeight - 6, rect.bottom + pad);

  spotlight.style.top = `${top}px`;
  spotlight.style.left = `${left}px`;
  spotlight.style.width = `${Math.max(12, right - left)}px`;
  spotlight.style.height = `${Math.max(12, bottom - top)}px`;
}

export function startOnboardingTour(fromUserClick = false) {
  try {
    if (!fromUserClick && localStorage.getItem(TOUR_KEY) === "1") return;
  } catch {
    // ignore storage errors
  }

  const overlay = ensureOverlay(true);
  const card = overlay.querySelector(".pg-tour-card");
  const spotlight = overlay.querySelector(".pg-tour-spotlight");
  const titleEl = overlay.querySelector(".pg-tour-title");
  const bodyEl = overlay.querySelector(".pg-tour-body");
  const progressEl = overlay.querySelector(".pg-tour-progress");
  const skipBtn = overlay.querySelector(".pg-tour-skip");
  const prevBtn = overlay.querySelector(".pg-tour-prev");
  const nextBtn = overlay.querySelector(".pg-tour-next");
  const closeBtn = overlay.querySelector(".pg-tour-close");

  let idx = 0;

  const syncLayout = () => {
    const step = steps[idx];
    const target = document.querySelector(step.target);
    if (!target) return;
    positionSpotlight(spotlight, target);
    positionCard(card, target);
  };

  function endTour() {
    window.removeEventListener("resize", syncLayout);
    window.removeEventListener("scroll", syncLayout, true);
    window.removeEventListener("keydown", onKeyDown);
    overlay.classList.remove("pg-tour-visible");
    spotlight.style.top = "0px";
    spotlight.style.left = "0px";
    spotlight.style.width = "0px";
    spotlight.style.height = "0px";
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // ignore
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape") endTour();
    if (event.key === "ArrowRight") {
      if (idx + 1 < steps.length) showStep(idx + 1);
      else endTour();
    }
    if (event.key === "ArrowLeft" && idx > 0) {
      showStep(idx - 1);
    }
  }

  function showStep(i, retries = 0) {
    const step = steps[i];
    const target = document.querySelector(step.target);

    if (!target && retries < 10) {
      setTimeout(() => showStep(i, retries + 1), 100);
      return;
    }

    if (!target) {
      if (i + 1 < steps.length) return showStep(i + 1);
      return endTour();
    }

    idx = i;
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    progressEl.textContent = `${idx + 1} of ${steps.length}`;
    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === steps.length - 1 ? "Finish" : "Next";
    overlay.classList.add("pg-tour-visible");

    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    setTimeout(syncLayout, 220);
  }

  skipBtn.onclick = endTour;
  closeBtn.onclick = endTour;
  prevBtn.onclick = () => idx > 0 && showStep(idx - 1);
  nextBtn.onclick = () => (idx + 1 < steps.length ? showStep(idx + 1) : endTour());

  window.addEventListener("resize", syncLayout);
  window.addEventListener("scroll", syncLayout, true);
  window.addEventListener("keydown", onKeyDown);
  showStep(0);
}

export function initOnboardingTour() {
  const autoStart = () => startOnboardingTour(false);
  if (document.readyState === "complete") autoStart();
  else window.addEventListener("load", autoStart, { once: true });

  const tourBtn = document.getElementById("take-tour-btn");
  if (tourBtn) {
    tourBtn.addEventListener("click", () => {
      try {
        localStorage.removeItem(TOUR_KEY);
      } catch {
        // ignore
      }
      startOnboardingTour(true);
    });
  }
}

