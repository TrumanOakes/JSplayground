import "./style.css";
import "monaco-editor/min/vs/editor/editor.main.css";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { createAudiotoolClient, getLoginStatus } from "@audiotool/nexus";

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === "javascript" || label === "typescript") {
      return new tsWorker();
    }

    return new editorWorker();
  },
};

const defaultPackages = "dayjs,lodash-es";
const audiotoolClientId = "379f8d67-b211-43b2-8a9d-9553aa8aad32";
const audiotoolScope = "project:write";
const canEmbedAudiotoolStudio = /(^|\.)audiotool\.com$/i.test(
  window.location.hostname,
);
const defaultSource = `import dayjs from "dayjs";
import { startCase } from "lodash-es";

console.log(startCase("monaco sandbox is running"));
console.log("Current time:", dayjs().format("YYYY-MM-DD HH:mm:ss"));

try {
  await window.audiotool.apply({
    ops: [
      { op: "ensureEntity", entityType: "tonematrix", alias: "tm" },
      { op: "updateField", entityAlias: "tm", field: "positionX", value: 900 },
      { op: "updateField", entityAlias: "tm", field: "positionY", value: 600 },
    ],
  });
  console.log("Audiotool ops were synced to the connected project.");
} catch (error) {
  console.warn(
    "Connect a project first, then run again to sync operations.",
    error,
  );
}
`;

const editorElement = document.getElementById("editor");
const runButton = document.getElementById("run-btn");
const resetButton = document.getElementById("reset-btn");
const packageInput = document.getElementById("packages");
const projectInput = document.getElementById("project-input");
const authButton = document.getElementById("auth-btn");
const connectButton = document.getElementById("connect-btn");
const disconnectButton = document.getElementById("disconnect-btn");
const openProjectButton = document.getElementById("open-project-btn");
const reloadPreviewButton = document.getElementById("reload-preview-btn");
const audiotoolStatusElement = document.getElementById("audiotool-status");
const redirectUrlElement = document.getElementById("redirect-url");
const projectPreview = document.getElementById("project-preview");
const runtimeFrame = document.getElementById("runtime-frame");
const consoleOutput = document.getElementById("console-output");

packageInput.value = defaultPackages;

let loginStatus = null;
let audiotoolClient = null;
let activeDocument = null;
let activeProject = "";
let activeProjectStudioUrl = "";
let isConnectingProject = false;
let isInitializingAuth = false;
let audiotoolQueue = Promise.resolve();

monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
  allowNonTsExtensions: true,
  target: monaco.languages.typescript.ScriptTarget.ES2020,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  module: monaco.languages.typescript.ModuleKind.ESNext,
});

const editor = monaco.editor.create(editorElement, {
  value: defaultSource,
  language: "javascript",
  theme: "vs-dark",
  minimap: { enabled: false },
  automaticLayout: true,
  fontSize: 14,
  tabSize: 2,
});

function appendConsoleLine(level, message) {
  const line = `[${level}] ${message}`;
  consoleOutput.textContent = `${consoleOutput.textContent}${line}\n`;
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function clearConsole() {
  consoleOutput.textContent = "";
}

function parsePackageSpec(spec) {
  const trimmed = spec.trim();

  if (!trimmed) {
    return null;
  }

  if (!trimmed.includes("@")) {
    return { name: trimmed, version: "" };
  }

  if (trimmed.startsWith("@")) {
    const slashIndex = trimmed.indexOf("/");
    const versionIndex = trimmed.indexOf("@", slashIndex + 1);

    if (slashIndex === -1 || versionIndex === -1) {
      return { name: trimmed, version: "" };
    }

    return {
      name: trimmed.slice(0, versionIndex),
      version: trimmed.slice(versionIndex + 1),
    };
  }

  const versionIndex = trimmed.indexOf("@");
  return {
    name: trimmed.slice(0, versionIndex),
    version: trimmed.slice(versionIndex + 1),
  };
}

function parsePackageInput(inputValue) {
  return inputValue
    .split(",")
    .map((entry) => parsePackageSpec(entry))
    .filter((entry) => entry && entry.name);
}

function buildImportMap(packageList) {
  const imports = {};

  for (const pkg of packageList) {
    const packageId = pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name;
    const url = `https://esm.sh/${packageId}`;
    imports[pkg.name] = url;
    imports[`${pkg.name}/`] = `${url}/`;
  }

  return { imports };
}

function toDisplayString(value) {
  if (value instanceof Error) {
    return value.stack || value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function setAudiotoolStatus(message, state = "warn") {
  audiotoolStatusElement.textContent = message;
  audiotoolStatusElement.dataset.state = state;
}

function getRedirectUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";

  let path = url.pathname;
  if (path.endsWith(".html")) {
    path = path.slice(0, path.lastIndexOf("/") + 1);
  }
  if (!path.endsWith("/")) {
    path = `${path}/`;
  }

  url.pathname = path;
  return url.toString();
}

function extractProjectUuid(projectValue) {
  const uuidRegex =
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
  const directMatch = projectValue.match(uuidRegex);
  if (directMatch) {
    return directMatch[0];
  }

  try {
    const parsed = new URL(projectValue);
    const fromQuery = parsed.searchParams.get("project");
    if (!fromQuery) {
      return "";
    }
    const queryMatch = fromQuery.match(uuidRegex);
    return queryMatch ? queryMatch[0] : fromQuery;
  } catch {
    return "";
  }
}

function buildStudioUrl(origin, projectId) {
  return `${origin}/studio?project=${encodeURIComponent(projectId)}`;
}

function normalizeAudiotoolOrigin(candidateOrigin) {
  try {
    const parsed = new URL(candidateOrigin);
    if (parsed.hostname.toLowerCase() === "beta.audiotool.com") {
      return parsed.origin;
    }

    if (/audiotool\.com$/i.test(parsed.hostname)) {
      return "https://beta.audiotool.com";
    }
  } catch {
    // Ignore invalid origin.
  }

  return "https://beta.audiotool.com";
}

function resolveProjectConnection(projectValue) {
  const trimmed = projectValue.trim();
  if (!trimmed) {
    return { projectReference: "", studioUrl: "" };
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      const projectId = extractProjectUuid(trimmed);
      if (projectId) {
        const origin = normalizeAudiotoolOrigin(parsed.origin);
        return {
          projectReference: projectId,
          studioUrl: buildStudioUrl(origin, projectId),
        };
      }

      return {
        projectReference: trimmed,
        studioUrl: trimmed,
      };
    } catch {
      return { projectReference: trimmed, studioUrl: trimmed };
    }
  }

  const projectUuid = extractProjectUuid(trimmed);
  if (projectUuid) {
    return {
      projectReference: projectUuid,
      studioUrl: buildStudioUrl("https://beta.audiotool.com", projectUuid),
    };
  }

  return {
    projectReference: trimmed,
    studioUrl: buildStudioUrl("https://beta.audiotool.com", trimmed),
  };
}

function setProjectPreview(studioUrl, note = "") {
  if (!canEmbedAudiotoolStudio) {
    projectPreview.src = "about:blank";
    projectPreview.srcdoc = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      body {
        margin: 0;
        display: grid;
        place-items: center;
        min-height: 100vh;
        background: #0a142b;
        color: #d4e0ff;
        font-family: Inter, system-ui, -apple-system, sans-serif;
        text-align: center;
        padding: 24px;
      }
      p {
        max-width: 620px;
        line-height: 1.5;
      }
      code {
        background: #08122a;
        border: 1px solid #25345f;
        border-radius: 6px;
        padding: 2px 6px;
      }
    </style>
  </head>
  <body>
    <p>
      Embedded Audiotool Studio is disabled on <code>${window.location.hostname}</code>.
      Local dev is cross-site relative to <code>audiotool.com</code>, so login flow cookies are not valid in iframe context.
      Use <strong>Open Project Tab</strong> for now, then deploy under an <code>*.audiotool.com</code> host to enable embedded preview.
    </p>
  </body>
</html>`;
    return;
  }

  if (!studioUrl) {
    projectPreview.src = "about:blank";
    projectPreview.srcdoc = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      body {
        margin: 0;
        display: grid;
        place-items: center;
        min-height: 100vh;
        background: #0a142b;
        color: #d4e0ff;
        font-family: Inter, system-ui, -apple-system, sans-serif;
        text-align: center;
        padding: 24px;
      }
      p {
        max-width: 520px;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <p>${note || "Log in and connect a project to display Audiotool here."}</p>
  </body>
</html>`;
    return;
  }

  projectPreview.removeAttribute("srcdoc");
  projectPreview.src = studioUrl;
}

function updateControls() {
  const loggedIn = Boolean(loginStatus && loginStatus.loggedIn);
  authButton.disabled = isInitializingAuth;
  authButton.textContent = loggedIn ? "Logout" : "Login";

  connectButton.disabled = !loggedIn || isConnectingProject;
  disconnectButton.disabled = !activeDocument || isConnectingProject;
  openProjectButton.disabled = !activeProjectStudioUrl;
  reloadPreviewButton.disabled = !activeProjectStudioUrl || !canEmbedAudiotoolStudio;
}

function queueAudiotoolTask(task) {
  const nextTask = audiotoolQueue.then(task, task);
  audiotoolQueue = nextTask.catch(() => {});
  return nextTask;
}

async function stopActiveDocument(note = "Disconnected from project.") {
  if (!activeDocument) {
    return;
  }

  const previousDoc = activeDocument;
  activeDocument = null;
  const previousProject = activeProject;
  activeProject = "";
  activeProjectStudioUrl = "";
  setProjectPreview("", "Project preview is disconnected.");
  updateControls();

  try {
    await previousDoc.stop();
    setAudiotoolStatus(note, "warn");
    appendConsoleLine(
      "system",
      `Stopped Audiotool sync for project: ${previousProject || "(unknown)"}`,
    );
  } catch (error) {
    const detail = toDisplayString(error);
    setAudiotoolStatus(`Failed stopping project: ${detail}`, "error");
    appendConsoleLine("error", detail);
  }
}

async function ensureClient() {
  if (!loginStatus || !loginStatus.loggedIn) {
    throw new Error("Login required before creating an Audiotool client.");
  }

  if (audiotoolClient) {
    return audiotoolClient;
  }

  audiotoolClient = await createAudiotoolClient({
    authorization: loginStatus,
  });

  return audiotoolClient;
}

async function connectProject(project) {
  if (!project) {
    throw new Error("Project URL or UUID is required.");
  }

  const { projectReference, studioUrl } = resolveProjectConnection(project);
  if (!projectReference || !studioUrl) {
    throw new Error("Could not determine a valid project reference.");
  }

  isConnectingProject = true;
  updateControls();
  setAudiotoolStatus("Connecting to Audiotool project...", "warn");

  try {
    const client = await ensureClient();

    if (activeDocument && activeProject === projectReference) {
      setAudiotoolStatus("Project already connected.", "ok");
      return;
    }

    if (activeDocument) {
      await stopActiveDocument("Switching to another project...");
    }

    const document = await client.createSyncedDocument({
      project: projectReference,
    });
    await document.start();

    activeDocument = document;
    activeProject = projectReference;
    activeProjectStudioUrl = studioUrl;
    setProjectPreview(
      studioUrl,
      "Project preview could not be loaded in this frame. Open it in a new tab.",
    );
    projectInput.value = studioUrl;
    setAudiotoolStatus(`Connected to project: ${projectReference}`, "ok");
    appendConsoleLine(
      "system",
      `Connected Audiotool project: ${projectReference}`,
    );
    appendConsoleLine(
      "system",
      "Project preview updated. If the frame is blocked by browser policy, use Open Project Tab.",
    );
    appendConsoleLine(
      "system",
      "If you see a login error in the embedded preview, allow third-party cookies for audiotool.com or use Open Project Tab.",
    );
    appendConsoleLine(
      "system",
      "Google sign-in can fail inside iframes. Authenticate in a full tab, then reload preview.",
    );
    if (!canEmbedAudiotoolStudio) {
      appendConsoleLine(
        "system",
        "Embedded preview is disabled on local/non-audiotool hosts. Open Project Tab is the supported local workflow.",
      );
    }
  } finally {
    isConnectingProject = false;
    updateControls();
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function resolveEntityFromOp(t, aliases, op) {
  if (typeof op.entityAlias === "string" && op.entityAlias.trim()) {
    const entity = aliases.get(op.entityAlias.trim());
    if (!entity) {
      throw new Error(`Entity alias "${op.entityAlias}" was not defined.`);
    }
    return entity;
  }

  if (typeof op.entityType === "string" && op.entityType.trim()) {
    const entity = t.entities.ofTypes(op.entityType.trim()).getOne();
    if (!entity) {
      throw new Error(`No entity found for type "${op.entityType}".`);
    }
    return entity;
  }

  throw new Error(
    'Operation must specify "entityAlias" or "entityType" to resolve an entity.',
  );
}

function safeUpdateField(t, fieldRef, value) {
  if (typeof t.tryUpdate === "function") {
    const maybeError = t.tryUpdate(fieldRef, value);
    if (maybeError) {
      throw maybeError instanceof Error ? maybeError : new Error(String(maybeError));
    }
    return;
  }

  t.update(fieldRef, value);
}

function applyAudiotoolOperations(t, operations) {
  const aliases = new Map();

  for (const rawOp of operations) {
    if (!isRecord(rawOp)) {
      throw new Error("Each operation must be an object.");
    }

    const opName = asString(rawOp.op, "op");

    if (opName === "ensureEntity") {
      const entityType = asString(rawOp.entityType, "entityType");
      let entity = t.entities.ofTypes(entityType).getOne();

      if (!entity) {
        const createValues = isRecord(rawOp.create) ? rawOp.create : {};
        entity = t.create(entityType, createValues);
      }

      if (typeof rawOp.alias === "string" && rawOp.alias.trim()) {
        aliases.set(rawOp.alias.trim(), entity);
      }

      continue;
    }

    if (opName === "createEntity") {
      const entityType = asString(rawOp.entityType, "entityType");
      const createValues = isRecord(rawOp.values) ? rawOp.values : {};
      const entity = t.create(entityType, createValues);

      if (typeof rawOp.alias === "string" && rawOp.alias.trim()) {
        aliases.set(rawOp.alias.trim(), entity);
      }

      continue;
    }

    if (opName === "updateField") {
      const entity = resolveEntityFromOp(t, aliases, rawOp);
      const fieldName = asString(rawOp.field, "field");
      const fieldRef = entity.fields?.[fieldName];

      if (!fieldRef) {
        throw new Error(`Field "${fieldName}" does not exist on selected entity.`);
      }

      safeUpdateField(t, fieldRef, rawOp.value);
      continue;
    }

    if (opName === "removeEntity") {
      const entity = resolveEntityFromOp(t, aliases, rawOp);
      t.remove(entity);
      continue;
    }

    throw new Error(
      `Unsupported Audiotool operation "${opName}". Supported ops: ensureEntity, createEntity, updateField, removeEntity.`,
    );
  }
}

function validateApplyPayload(rawPayload) {
  if (!isRecord(rawPayload)) {
    throw new Error("audiotool.apply payload must be an object.");
  }

  const project =
    typeof rawPayload.project === "string" ? rawPayload.project.trim() : "";

  if (!Array.isArray(rawPayload.ops)) {
    throw new Error('audiotool.apply payload must include an "ops" array.');
  }
  if (!rawPayload.ops.length) {
    throw new Error('audiotool.apply payload "ops" cannot be empty.');
  }
  if (rawPayload.ops.length > 50) {
    throw new Error("audiotool.apply supports up to 50 operations per request.");
  }

  return { project, ops: rawPayload.ops };
}

async function ensureRequestedProject(requestedProject) {
  const fallbackProject = projectInput.value.trim();
  const targetProject = requestedProject || activeProject || fallbackProject;

  if (!targetProject) {
    throw new Error(
      "No project selected. Enter a project URL/UUID and click Connect Project first.",
    );
  }

  if (!activeDocument || activeProject !== targetProject) {
    await connectProject(targetProject);
  }
}

function postAudiotoolResult(requestId, response) {
  const target = runtimeFrame.contentWindow;
  if (!target) {
    return;
  }

  target.postMessage(
    {
      source: "audiotool-host",
      type: "audiotool.result",
      requestId,
      ...response,
    },
    "*",
  );
}

async function processAudiotoolApplyRequest(request) {
  const requestId =
    typeof request?.requestId === "string" ? request.requestId.trim() : "";
  if (!requestId) {
    appendConsoleLine("error", "Ignored audiotool.apply message without requestId.");
    return;
  }

  try {
    const { project, ops } = validateApplyPayload(request?.payload);

    await ensureRequestedProject(project);
    await activeDocument.modify((transaction) => {
      applyAudiotoolOperations(transaction, ops);
    });

    setAudiotoolStatus(
      `Applied ${ops.length} operation(s) to project sync.`,
      "ok",
    );
    appendConsoleLine("system", `Audiotool apply succeeded (${ops.length} ops).`);
    postAudiotoolResult(requestId, {
      ok: true,
      payload: { applied: ops.length, project: activeProject },
    });
  } catch (error) {
    const detail = toDisplayString(error);
    setAudiotoolStatus(`Apply failed: ${detail}`, "error");
    appendConsoleLine("error", detail);

    if (activeDocument) {
      await stopActiveDocument(
        "Document stopped after apply error. Reconnect before retrying.",
      );
    }

    postAudiotoolResult(requestId, {
      ok: false,
      error: detail,
    });
  }
}

function escapeScriptContent(code) {
  return code.replaceAll("</script>", "<\\/script>");
}

function createPreviewDocument(sourceCode, importMap) {
  const safeSource = escapeScriptContent(sourceCode);
  const safeImportMap = escapeScriptContent(JSON.stringify(importMap, null, 2));

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        margin: 0;
        padding: 16px;
        font-family: Inter, system-ui, -apple-system, sans-serif;
        background: #f8fafc;
        color: #0f172a;
      }

      #app {
        min-height: 40px;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script>
      const toStringValue = (value) => {
        if (value instanceof Error) {
          return value.stack || value.message;
        }

        if (typeof value === "string") {
          return value;
        }

        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return String(value);
        }
      };

      const send = (type, payload) => {
        parent.postMessage({ source: "monaco-playground", type, payload }, "*");
      };

      const pendingAudiotoolRequests = new Map();

      ["log", "info", "warn", "error"].forEach((method) => {
        const original = console[method].bind(console);
        console[method] = (...args) => {
          send("console", {
            method,
            messages: args.map((arg) => toStringValue(arg)),
          });
          original(...args);
        };
      });

      window.addEventListener("error", (event) => {
        send("runtime-error", {
          message: event.message,
          stack: event.error ? event.error.stack : "",
        });
      });

      window.addEventListener("unhandledrejection", (event) => {
        send("runtime-error", {
          message: "Unhandled promise rejection",
          stack: toStringValue(event.reason),
        });
      });

      window.addEventListener("message", (event) => {
        const message = event.data;
        if (!message || message.source !== "audiotool-host") {
          return;
        }
        if (message.type !== "audiotool.result") {
          return;
        }

        const pending = pendingAudiotoolRequests.get(message.requestId);
        if (!pending) {
          return;
        }

        pendingAudiotoolRequests.delete(message.requestId);

        if (message.ok) {
          pending.resolve(message.payload);
        } else {
          pending.reject(new Error(message.error || "Audiotool apply failed."));
        }
      });

      window.audiotool = {
        apply(payload) {
          return new Promise((resolve, reject) => {
            const requestId =
              globalThis.crypto?.randomUUID?.() ||
              \`req-\${Date.now()}-\${Math.random().toString(16).slice(2)}\`;

            pendingAudiotoolRequests.set(requestId, { resolve, reject });
            send("audiotool.apply", { requestId, payload });
          });
        },
      };
    </script>
    <script type="importmap">
${safeImportMap}
    </script>
    <script type="module">
${safeSource}
    </script>
  </body>
</html>`;
}

function runCode() {
  clearConsole();
  const packageList = parsePackageInput(packageInput.value);
  const importMap = buildImportMap(packageList);
  const sourceCode = editor.getValue();
  const html = createPreviewDocument(sourceCode, importMap);

  runtimeFrame.srcdoc = html;

  const packageLabel = packageList.length
    ? packageList
        .map((pkg) => (pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name))
        .join(", ")
    : "(none)";

  appendConsoleLine("system", `Running with packages: ${packageLabel}`);
  appendConsoleLine(
    "system",
    "Script runtime is hidden; use project preview and console to inspect results.",
  );
}

window.addEventListener("message", (event) => {
  if (event.source !== runtimeFrame.contentWindow) {
    return;
  }

  const payload = event.data;
  if (!payload || payload.source !== "monaco-playground") {
    return;
  }

  if (payload.type === "console") {
    const text = payload.payload.messages.join(" ");
    appendConsoleLine(payload.payload.method, text);
    return;
  }

  if (payload.type === "runtime-error") {
    const detail = payload.payload.stack || payload.payload.message;
    appendConsoleLine("error", detail);
    return;
  }

  if (payload.type === "audiotool.apply") {
    queueAudiotoolTask(() => processAudiotoolApplyRequest(payload.payload)).catch(
      (error) => {
        appendConsoleLine("error", toDisplayString(error));
      },
    );
  }
});

runButton.addEventListener("click", runCode);
resetButton.addEventListener("click", () => {
  editor.setValue(defaultSource);
  packageInput.value = defaultPackages;
  runCode();
});

projectInput.addEventListener("input", () => {
  if (activeProject && projectInput.value.trim() !== activeProject) {
    setAudiotoolStatus(
      "Project input changed. Click Connect Project to switch sync target.",
      "warn",
    );
  }
});

authButton.addEventListener("click", async () => {
  if (!loginStatus) {
    setAudiotoolStatus("Auth status not ready yet, try again.", "warn");
    return;
  }

  if (loginStatus.loggedIn) {
    loginStatus.logout();
    return;
  }

  try {
    setAudiotoolStatus("Redirecting to Audiotool login...", "warn");
    await loginStatus.login();
  } catch (error) {
    setAudiotoolStatus(`Login failed: ${toDisplayString(error)}`, "error");
  }
});

connectButton.addEventListener("click", () => {
  const project = projectInput.value.trim();
  queueAudiotoolTask(async () => {
    try {
      await connectProject(project);
    } catch (error) {
      const detail = toDisplayString(error);
      setAudiotoolStatus(`Connect failed: ${detail}`, "error");
      appendConsoleLine("error", detail);
    }
  });
});

disconnectButton.addEventListener("click", () => {
  queueAudiotoolTask(() => stopActiveDocument("Disconnected from project."));
});

openProjectButton.addEventListener("click", () => {
  if (!activeProjectStudioUrl) {
    return;
  }

  window.open(activeProjectStudioUrl, "_blank");
});

reloadPreviewButton.addEventListener("click", () => {
  if (!activeProjectStudioUrl) {
    return;
  }

  setProjectPreview(
    activeProjectStudioUrl,
    "Project preview could not be loaded in this frame. Open it in a new tab.",
  );
  appendConsoleLine(
    "system",
    "Preview reloaded. If login still fails inside iframe, continue in Open Project Tab.",
  );
});

async function initializeAudiotoolAuth() {
  isInitializingAuth = true;
  updateControls();
  setAudiotoolStatus("Initializing Audiotool authentication...", "warn");

  const redirectUrl = getRedirectUrl();
  redirectUrlElement.textContent = redirectUrl;

  try {
    loginStatus = await getLoginStatus({
      clientId: audiotoolClientId,
      redirectUrl,
      scope: audiotoolScope,
    });

    if (loginStatus.loggedIn) {
      const userName = await loginStatus.getUserName();
      setAudiotoolStatus(
        `Logged in as ${toDisplayString(userName)}. Connect a project to start syncing.`,
        "ok",
      );
      await ensureClient();
      appendConsoleLine("system", "Audiotool client initialized.");
      if (!canEmbedAudiotoolStudio) {
        setAudiotoolStatus(
          "Logged in. Embedded preview is disabled on this host; use Open Project Tab for Studio.",
          "warn",
        );
      }
    } else {
      setAudiotoolStatus("Logged out. Click Login to authorize this app.", "warn");
    }
  } catch (error) {
    const detail = toDisplayString(error);
    setAudiotoolStatus(`Auth setup failed: ${detail}`, "error");
    appendConsoleLine("error", detail);
  } finally {
    isInitializingAuth = false;
    updateControls();
  }
}

editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCode);

setProjectPreview("", "Log in and connect a project to show the Audiotool workspace here.");
runCode();
initializeAudiotoolAuth();

window.addEventListener("beforeunload", () => {
  if (activeDocument) {
    void activeDocument.stop();
  }
});
