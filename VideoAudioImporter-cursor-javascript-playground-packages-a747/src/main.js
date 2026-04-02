import "./style.css";
import "monaco-editor/min/vs/editor/editor.main.css";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import {
  createOfflineDocument,
  createAudiotoolClient,
  getLoginStatus,
} from "@audiotool/nexus";
import * as Nexus from "nexusui";
import { codeSamples } from "./codeSamples.js";
import { templates } from "./templates.js";

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === "javascript" || label === "typescript") {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

const editor = monaco.editor.create(document.getElementById("editor-js"), {
  value: `// ==========================================\n// AUDIOTOOL SDK: STARTER TEMPLATE\n// ==========================================\n// Audiotool is modular! To make a sound, you need an Instrument,\n// and you need to connect it with virtual Audio Cables.\n\nconsole.log(\"--- Loading Starter Template ---\");\n\nawait nexus.modify((t) => {\n  // 1. THE INSTRUMENT\n  // Spawn a Heisenberg Synthesizer and move it to coordinate (100, 200)\n  const mySynth = t.create(\"heisenberg\", {\n    displayName: \"Lead Synth\",\n    positionX: 100,\n    positionY: 200,\n    gain: 0.7,\n  });\n\n  // 2. THE EFFECT\n  // Spawn a Delay Pedal to make the synth echo\n  const myDelay = t.create(\"stompboxDelay\", {\n    displayName: \"Echo Pedal\",\n    positionX: 400,\n    positionY: 200,\n    mix: 0.5,\n  });\n\n  // 3. THE ROUTING (Cables)\n  // Plug a virtual audio cable from the Synth's output into the Delay's input\n  t.create(\"desktopAudioCable\", {\n    fromSocket: mySynth.fields.audioOutput.location,\n    toSocket: myDelay.fields.audioInput.location,\n  });\n});\n\nconsole.log(\"> Success: Synth is wired to the Delay pedal!\");\nconsole.log(\"> Pro tip: Try changing the synth 'gain' or the Delay 'mix' value.\");`,
  language: "javascript",
  theme: "vs",
  automaticLayout: true,
  fontSize: 14,
  minimap: { enabled: false },
});

// ==========================================
// INJECT AUTOCOMPLETE (INTELLISENSE)
// ==========================================
if (!window.__AUDIOTOOL_INTELLISENSE_LOADED__) {
  window.__AUDIOTOOL_INTELLISENSE_LOADED__ = true;
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
    checkJs: true,
    target: monaco.languages.typescript.ScriptTarget.ES2022,
  });
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    `
    declare const nexus: {
      modify: <T>(callback: (t: Transaction) => Promise<T> | T) => Promise<T>;
      queryEntities: any;
    };

    declare interface Transaction {
      create(
        type:
          | "heisenberg"
          | "tonematrix"
          | "machiniste"
          | "bassline"
          | "stompboxDelay"
          | "desktopAudioCable"
          | "desktopNoteCable",
        config: {
          positionX?: number;
          positionY?: number;
          displayName?: string;
          gain?: number;
          mix?: number;
          feedbackFactor?: number;
          fromSocket?: any;
          toSocket?: any;
          [key: string]: any;
        }
      ): any;
      update(field: any, value: any): void;
    }
  `,
    "audiotool-playground-intellisense.d.ts",
  );
}

// ==========================================
// TEMPLATE MANAGER
// ==========================================

// Default template on load
editor.setValue(templates.offline);

// ==========================================
// SAMPLES GALLERY (minimal wiring)
// ==========================================
{
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

  document.querySelectorAll(".load-sample-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-sample");
      if (!key || !codeSamples[key]) return;
      editor.setValue(codeSamples[key]);
      logToConsole(`Loaded Sample: ${key}`);
      close();
    });
  });
}

// ==========================================
// TEMPLATES GALLERY (hybrid)
// ==========================================
{
  const modal = document.getElementById("templates-modal");
  const openBtn = document.getElementById("browse-templates-btn");
  const closeBtn = document.getElementById("close-templates-btn");

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

  document.querySelectorAll(".load-template-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-template");
      if (!key || !templates[key]) return;
      editor.setValue(templates[key]);
      logToConsole(`Loaded Template: ${key}`);
      close();
    });
  });
}

// ==========================================
// QUICK INSERT (minimal)
// ==========================================
document.querySelectorAll(".insert-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const codeToInsert = (btn.getAttribute("data-code") || "") + "";
    if (!codeToInsert) return;

    const position = editor.getPosition();
    if (!position) return;

    editor.executeEdits("quick-insert", [
      {
        range: new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column,
        ),
        text: codeToInsert,
        forceMoveMarkers: true,
      },
    ]);
    editor.focus();
  });
});

const consoleOutput = document.getElementById("console-output");

function logToConsole(msg, isError = false) {
  const color = isError ? "#ff5555" : "#4af626";
  consoleOutput.innerHTML += `<div style="color: ${color}; padding: 2px 0;">${msg}</div>`;
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

if (!window.__PLAYGROUND_CONSOLE_WRAPPED__) {
  window.__PLAYGROUND_CONSOLE_WRAPPED__ = true;
  const originalLog = console.log;
  console.log = (...args) => {
    originalLog(...args);
    logToConsole(`> ${args.join(" ")}`);
  };
}

const audiotoolClientId = "379f8d67-b211-43b2-8a9d-9553aa8aad32";
const audiotoolScope = "project:write";

let loginStatus = null;
let audiotoolClient = null;
let nexus = window.__NEXUS_INSTANCE__ || null;

const authBtn = document.getElementById("auth-btn");
const connectBtn = document.getElementById("connect-btn");
const projectInput = document.getElementById("project-input");
const authStatus = document.getElementById("auth-status");
const listProjectsBtn = document.getElementById("list-projects-btn");
const projectsMenu = document.getElementById("projects-menu");
const openProjectBtn = document.getElementById("open-project-btn");
const projectNameBadge = document.getElementById("project-name-badge");

let connectedProjectId = "";
let connectedProjectName = "";


function getRedirectUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  let path = url.pathname;
  if (path.endsWith(".html")) path = path.slice(0, path.lastIndexOf("/") + 1);
  if (!path.endsWith("/")) path = `${path}/`;
  url.pathname = path;
  return url.toString();
}

async function initAuth() {
  try {
    loginStatus = await getLoginStatus({
      clientId: audiotoolClientId,
      redirectUrl: getRedirectUrl(),
      scope: audiotoolScope,
    });

    if (loginStatus.loggedIn) {
      authBtn.textContent = "Logout";
      authStatus.textContent = "Status: Logged In (No Project)";
      audiotoolClient = await createAudiotoolClient({ authorization: loginStatus });
    } else {
      authBtn.textContent = "Login";
      authStatus.textContent = "Status: Offline Mode";
    }

    openProjectBtn.disabled = true;
    connectedProjectId = "";
    connectedProjectName = "";
    if (projectNameBadge) projectNameBadge.textContent = "No project";
  } catch (error) {
    logToConsole(`Auth Error: ${error.message}`, true);
  }
}

function extractProjectId(projectName) {
  // Expected: "projects/<uuid>"
  const parts = String(projectName || "").split("/");
  const idx = parts.indexOf("projects");
  if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
  return parts[parts.length - 1] || "";
}

async function bootEngine() {
  if (window.__NEXUS_IS_BOOTING__) {
    console.log("Engine is currently booting in the background...");
    return;
  }

  if (window.__NEXUS_INSTANCE__) {
    logToConsole("Engine already running (Reused from cache).");
    nexus = window.__NEXUS_INSTANCE__;
    return;
  }

  window.__NEXUS_IS_BOOTING__ = true;

  try {
    logToConsole("Booting Local Offline Engine...");
    nexus = await createOfflineDocument();
    window.__NEXUS_INSTANCE__ = nexus;
    window.__NEXUS_MODE__ = "offline";
    logToConsole("Offline Engine Ready!");
  } catch (err) {
    logToConsole(`Boot Error: ${err.message}`, true);
    console.error(err);
  } finally {
    window.__NEXUS_IS_BOOTING__ = false;
  }
}

authBtn.addEventListener("click", async () => {
  if (!loginStatus) return;
  if (loginStatus.loggedIn) {
    await loginStatus.logout();
    window.location.reload();
  } else {
    logToConsole("Redirecting to Audiotool login...");
    await loginStatus.login();
  }
});

async function connectToProject(projectId, displayNameHint) {
  if (!audiotoolClient) {
    logToConsole("You must Login first!", true);
    return;
  }

  if (!projectId) {
    logToConsole("Please paste a Project ID (UUID) first.", true);
    return;
  }

  try {
    logToConsole(`Connecting to cloud project: ${projectId}...`);

    if (nexus && window.__NEXUS_MODE__ === "synced" && typeof nexus.stop === "function") {
      await nexus.stop();
    }

    window.__NEXUS_INSTANCE__ = null;
    window.__NEXUS_MODE__ = null;
    nexus = null;

    nexus = await audiotoolClient.createSyncedDocument({ project: projectId });
    await nexus.start();
    window.__NEXUS_INSTANCE__ = nexus;
    window.__NEXUS_MODE__ = "synced";

    // Resolve a human-friendly project name
    let projectName = (displayNameHint || "").trim();
    if (!projectName) {
      try {
        const resp = await audiotoolClient.api.projectService.getProject({
          name: `projects/${projectId}`,
        });
        projectName = resp?.project?.displayName?.trim() || "";
      } catch {
        // ignore, fallback below
      }
    }
    if (!projectName) projectName = projectId;

    authStatus.textContent = `Status: Synced to ${projectName}`;
    logToConsole("Cloud Sync Ready! Your code now updates the real project.");
    connectedProjectId = projectId;
    openProjectBtn.disabled = false;
    connectedProjectName = projectName;
    if (projectNameBadge) projectNameBadge.textContent = projectName;
  } catch (err) {
    logToConsole(`Connect Error: ${err.message}`, true);
    console.error(err);
  }
}

connectBtn.addEventListener("click", async () => {
  await connectToProject(projectInput.value.trim());
});

openProjectBtn.addEventListener("click", () => {
  if (!connectedProjectId) {
    logToConsole("No project connected yet.", true);
    return;
  }
  const url = `https://beta.audiotool.com/studio?project=${encodeURIComponent(connectedProjectId)}`;
  window.open(url, "_blank", "noopener,noreferrer");
});

function setProjectsMenuOpen(isOpen) {
  projectsMenu.hidden = !isOpen;
  listProjectsBtn.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    projectsMenu.innerHTML = `<div class="project-subtitle">Loading projects…</div>`;
  }
}

document.addEventListener("click", (e) => {
  if (projectsMenu.hidden) return;
  const dropdown = document.getElementById("projects-dropdown");
  if (dropdown && !dropdown.contains(e.target)) {
    projectsMenu.hidden = true;
    listProjectsBtn.setAttribute("aria-expanded", "false");
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (projectsMenu.hidden) return;
  projectsMenu.hidden = true;
  listProjectsBtn.setAttribute("aria-expanded", "false");
  listProjectsBtn.focus();
});

listProjectsBtn.addEventListener("click", async () => {
  if (!audiotoolClient) {
    logToConsole("Login first, then click List Projects.", true);
    return;
  }

  const willOpen = projectsMenu.hidden;
  setProjectsMenuOpen(willOpen);
  if (!willOpen) return;

  try {
    const resp = await audiotoolClient.api.projectService.listProjects({
      pageSize: 50,
      filter: "",
      pageToken: "",
      orderBy: "project.update_time desc",
    });

    const projects = resp?.projects ?? [];
    if (!projects.length) {
      projectsMenu.innerHTML = `<div class="project-subtitle">No projects found.</div>`;
      return;
    }

    projectsMenu.innerHTML = projects
      .map((p) => {
        const projectId = extractProjectId(p.name);
        const title = (p.displayName || "").trim() || projectId || "(Untitled project)";
        const subtitle = projectId ? `UUID: ${projectId}` : p.name;
        const creator = p.creatorName ? `by ${p.creatorName.split("/").pop()}` : "";
        return `
          <div class="project-row" role="menuitem" tabindex="0" data-project-id="${projectId}" data-project-name="${title.replaceAll('"', "&quot;")}">
            <div>
              <div class="project-title">${title}</div>
              <div class="project-subtitle">${subtitle}</div>
            </div>
            <div class="project-meta">${creator}</div>
          </div>
        `;
      })
      .join("");

    projectsMenu.querySelectorAll(".project-row").forEach((row) => {
      row.addEventListener("click", async () => {
        const projectId = row.getAttribute("data-project-id") || "";
        const projectName = row.getAttribute("data-project-name") || "";
        if (!projectId) {
          logToConsole("Could not extract project UUID from selection.", true);
          return;
        }
        projectInput.value = projectId;
        projectsMenu.hidden = true;
        listProjectsBtn.setAttribute("aria-expanded", "false");
        await connectToProject(projectId, projectName);
      });
      row.addEventListener("keydown", async (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        row.click();
      });
    });
  } catch (err) {
    projectsMenu.innerHTML = `<div class="project-subtitle">Failed to load projects.</div>`;
    logToConsole(`List Projects Error: ${err.message}`, true);
    console.error(err);
  }
});

document.getElementById("run-btn").addEventListener("click", async () => {
  if (!nexus) {
    logToConsole("Hold on! Engine is booting...", true);
    return;
  }

  document.getElementById("nexus-ui-container").innerHTML = "";

  const userCode = editor.getValue();
  logToConsole("<br/>--- Running Code ---");

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const executeUserCode = new AsyncFunction("nexus", "Nexus", userCode);
    await executeUserCode(nexus, Nexus);
  } catch (err) {
    const message = err?.message ?? String(err);
    const stack = err?.stack ? `\n${err.stack}` : "";
    logToConsole(`Execution Error: ${message}${stack}`, true);
    console.error(err);
  }
});

initAuth();
bootEngine();
