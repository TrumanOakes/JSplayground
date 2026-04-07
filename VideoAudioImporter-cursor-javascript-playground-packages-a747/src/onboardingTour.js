const TOUR_KEY = "pg_onboarding_dismissed_v1";

const steps = [
  {
    id: "project",
    target: "#top-bar .toolbar-group[aria-label='Project']",
    title: "Project bar",
    body: "Log in, list or create cloud projects, connect them, and open Studio.",
  },
  {
    id: "editor",
    target: "#left-pane .pane-header",
    title: "Editor",
    body: "Use Samples to load examples, then Run Code ▷ to apply changes.",
  },
  {
    id: "canvas",
    target: "#right-pane .pane-header:first-of-type",
    title: "UI Canvas",
    body: "Generated dashboards and controls appear here when samples or your code run.",
  },
];

function ensureOverlay() {
  let overlay = document.getElementById("pg-tour-overlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "pg-tour-overlay";
  overlay.innerHTML = `
    <div class="pg-tour-backdrop"></div>
    <div class="pg-tour-card" role="dialog" aria-modal="true" aria-labelledby="pg-tour-title">
      <div class="pg-tour-title-row">
        <h3 id="pg-tour-title" class="pg-tour-title"></h3>
        <button type="button" class="pg-tour-close" aria-label="Dismiss tour">✕</button>
      </div>
      <p class="pg-tour-body"></p>
      <div class="pg-tour-footer">
        <button type="button" class="pg-tour-skip">Skip</button>
        <div class="pg-tour-steps">
          <button type="button" class="pg-tour-prev">Back</button>
          <button type="button" class="pg-tour-next">Next</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function positionCard(card, targetEl) {
  const rect = targetEl.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const margin = 12;

  // Prefer below; if it doesn't fit, flip above.
  let top = rect.bottom + margin;
  if (top + cardRect.height > window.innerHeight) {
    top = rect.top - cardRect.height - margin;
  }

  const left = Math.min(
    window.innerWidth - cardRect.width - 16,
    Math.max(16, rect.left)
  );

  card.style.top = `${Math.max(16, top) + window.scrollY}px`;
  card.style.left = `${left + window.scrollX}px`;
}

export function startOnboardingTour(fromUserClick = false) {
  try {
    if (!fromUserClick && localStorage.getItem(TOUR_KEY) === "1") return;
  } catch {
    // ignore storage errors
  }

  const overlay = ensureOverlay();
  const card = overlay.querySelector(".pg-tour-card");
  const titleEl = overlay.querySelector(".pg-tour-title");
  const bodyEl = overlay.querySelector(".pg-tour-body");
  const skipBtn = overlay.querySelector(".pg-tour-skip");
  const prevBtn = overlay.querySelector(".pg-tour-prev");
  const nextBtn = overlay.querySelector(".pg-tour-next");
  const closeBtn = overlay.querySelector(".pg-tour-close");

  let idx = 0;

  const handleResize = () => {
    const step = steps[idx];
    const target = document.querySelector(step.target);
    if (target) positionCard(card, target);
  };

  function endTour() {
    window.removeEventListener("resize", handleResize);
    overlay.classList.remove("pg-tour-visible");
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // ignore
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
    overlay.classList.add("pg-tour-visible");

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => positionCard(card, target), 260);

    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === steps.length - 1 ? "Done" : "Next";
  }

  skipBtn.onclick = endTour;
  closeBtn.onclick = endTour;
  prevBtn.onclick = () => {
    if (idx > 0) showStep(idx - 1);
  };
  nextBtn.onclick = () => {
    if (idx + 1 < steps.length) showStep(idx + 1);
    else endTour();
  };

  window.addEventListener("resize", handleResize);
  showStep(0);
}

export function initOnboardingTour() {
  window.addEventListener("load", () => startOnboardingTour(false));

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

