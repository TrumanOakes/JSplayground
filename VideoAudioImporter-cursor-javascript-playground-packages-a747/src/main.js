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
const previewModeLabel = document.getElementById("preview-mode-label");
const audiotoolStatusElement = document.getElementById("audiotool-status");
const redirectUrlElement = document.getElementById("redirect-url");
const projectPreview = document.getElementById("project-preview");
const runtimeFrame = projectPreview;
const consoleOutput = document.getElementById("console-output");
const sessionProjectMeta = document.getElementById("session-project-meta");
const sessionEntitySummary = document.getElementById("session-entity-summary");
const sessionEntityCounts = document.getElementById("session-entity-counts");
const sessionAliasSummary = document.getElementById("session-alias-summary");
const sessionLastApply = document.getElementById("session-last-apply");
const sessionActivityLog = document.getElementById("session-activity-log");

packageInput.value = defaultPackages;

let loginStatus = null;
let audiotoolClient = null;
let activeDocument = null;
let activeProject = "";
let activeProjectStudioUrl = "";
let isConnectingProject = false;
let isInitializingAuth = false;
let audiotoolQueue = Promise.resolve();
let sessionSubscriptions = [];
let sessionEntityCountsState = new Map();
let sessionAliasState = new Map();
let sessionActivity = [];
let sessionMeta = null;
let lastApplySummary = "No apply requests yet.";
let sessionConnectionStatus = "not connected";

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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatClockTime(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function addSessionSubscription(terminable) {
  sessionSubscriptions.push(terminable);
}

function clearSessionSubscriptions() {
  for (const subscription of sessionSubscriptions) {
    try {
      subscription?.terminate?.();
    } catch {
      // Ignore subscription cleanup failures.
    }
  }
  sessionSubscriptions = [];
}

function setSessionModeLabel(message) {
  if (previewModeLabel) {
    previewModeLabel.textContent = `Session mode: ${message}`;
  }
}

function pushSessionActivity(level, message, detail = "") {
  sessionActivity.unshift({
    at: formatClockTime(),
    level,
    message,
    detail,
  });
  if (sessionActivity.length > 120) {
    sessionActivity = sessionActivity.slice(0, 120);
  }
  renderSessionDashboard();
}

function updateSessionEntityCount(entityType, delta) {
  const current = sessionEntityCountsState.get(entityType) || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) {
    sessionEntityCountsState.delete(entityType);
    return;
  }
  sessionEntityCountsState.set(entityType, next);
}

function upsertSessionAlias(alias, entityType, entityId) {
  sessionAliasState.set(alias, {
    alias,
    entityType,
    entityId,
    updatedAt: formatClockTime(),
  });
}

function pruneAliasesByEntityIds(entityIds) {
  const activeEntityIds = new Set(entityIds);
  for (const [alias, value] of sessionAliasState.entries()) {
    if (!activeEntityIds.has(value.entityId)) {
      sessionAliasState.delete(alias);
    }
  }
}

function removeAliasesByEntityId(entityId) {
  for (const [alias, value] of sessionAliasState.entries()) {
    if (value.entityId === entityId) {
      sessionAliasState.delete(alias);
    }
  }
}

function renderSessionMetaList() {
  if (!sessionProjectMeta) {
    return;
  }

  const values = sessionMeta
    ? [
        ["Project", sessionMeta.displayName || sessionMeta.projectId || "(unknown)"],
        ["Project ID", sessionMeta.projectId || "(unknown)"],
        ["Creator", sessionMeta.creatorName || "(unknown)"],
        ["Status", sessionConnectionStatus],
        ["Studio URL", sessionMeta.studioUrl || activeProjectStudioUrl || "(none)"],
      ]
    : [
        ["Project", "(not connected)"],
        ["Project ID", "-"],
        ["Creator", "-"],
        ["Status", sessionConnectionStatus],
        ["Studio URL", "-"],
      ];

  sessionProjectMeta.innerHTML = values
    .map(
      ([key, value]) =>
        `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join("");
}

function renderEntitySummaryList() {
  if (!sessionEntitySummary || !sessionEntityCounts) {
    return;
  }

  const total = Array.from(sessionEntityCountsState.values()).reduce(
    (sum, value) => sum + value,
    0,
  );
  sessionEntitySummary.textContent = `Total tracked entities: ${total.toLocaleString()}`;

  const sorted = Array.from(sessionEntityCountsState.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  if (!sorted.length) {
    sessionEntityCounts.innerHTML = "<li>No entities tracked yet.</li>";
    return;
  }

  sessionEntityCounts.innerHTML = sorted
    .slice(0, 20)
    .map(
      ([entityType, count]) =>
        `<li><strong>${escapeHtml(entityType)}</strong>: ${count.toLocaleString()}</li>`,
    )
    .join("");
}

function renderAliasSummaryList() {
  if (!sessionAliasSummary) {
    return;
  }

  const aliases = Array.from(sessionAliasState.values()).sort((a, b) =>
    a.alias.localeCompare(b.alias),
  );
  if (!aliases.length) {
    sessionAliasSummary.innerHTML = "<li>No aliases captured yet.</li>";
    return;
  }

  sessionAliasSummary.innerHTML = aliases
    .map(
      (entry) =>
        `<li><strong>${escapeHtml(entry.alias)}</strong> → ${escapeHtml(entry.entityType)} <span class="subtle">(${escapeHtml(entry.entityId)})</span></li>`,
    )
    .join("");
}

function renderSessionActivityList() {
  if (!sessionActivityLog) {
    return;
  }

  if (!sessionActivity.length) {
    sessionActivityLog.innerHTML = "<li>No activity yet.</li>";
    return;
  }

  sessionActivityLog.innerHTML = sessionActivity
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.at)}</strong> [${escapeHtml(item.level)}] ${escapeHtml(item.message)}${item.detail ? `<div class="subtle">${escapeHtml(item.detail)}</div>` : ""}</li>`,
    )
    .join("");
}

function renderLastApplySummary() {
  if (!sessionLastApply) {
    return;
  }
  sessionLastApply.textContent = lastApplySummary;
}

function renderSessionDashboard() {
  renderSessionMetaList();
  renderEntitySummaryList();
  renderAliasSummaryList();
  renderLastApplySummary();
  renderSessionActivityList();
}

function resetSessionDashboard(message = "waiting for project connection") {
  sessionMeta = null;
  sessionEntityCountsState = new Map();
  sessionAliasState = new Map();
  sessionActivity = [];
  lastApplySummary = "No apply requests yet.";
  sessionConnectionStatus = "not connected";
  setSessionModeLabel(message);
  renderSessionDashboard();
}

async function refreshSessionEntitySummary() {
  if (!activeDocument) {
    sessionEntityCountsState = new Map();
    renderSessionDashboard();
    return;
  }

  const entities = activeDocument.queryEntities.get();
  const counts = new Map();
  for (const entity of entities) {
    counts.set(entity.entityType, (counts.get(entity.entityType) || 0) + 1);
  }
  sessionEntityCountsState = counts;
  pruneAliasesByEntityIds(entities.map((entity) => entity.id));
  renderSessionDashboard();
}

async function refreshSessionMetadata() {
  if (!activeProjectStudioUrl) {
    sessionMeta = null;
    renderSessionDashboard();
    return;
  }

  try {
    const metadata = await loadProjectPreviewMetadata(activeProjectStudioUrl);
    sessionMeta = {
      projectId: metadata.projectId,
      displayName: metadata.displayName,
      creatorName: metadata.creatorName,
      description: metadata.description,
      imageUrl: metadata.imageUrl,
      studioUrl: activeProjectStudioUrl,
    };
  } catch (error) {
    sessionMeta = {
      projectId: activeProject || "(unknown)",
      displayName: "(metadata unavailable)",
      creatorName: "",
      description: toDisplayString(error),
      imageUrl: "",
      studioUrl: activeProjectStudioUrl,
    };
    pushSessionActivity(
      "warn",
      "Could not load project metadata.",
      toDisplayString(error),
    );
  }

  renderSessionDashboard();
}

function attachSessionDocumentSubscriptions() {
  if (!activeDocument) {
    return;
  }

  clearSessionSubscriptions();

  try {
    if (activeDocument.connected?.subscribe) {
      addSessionSubscription(
        activeDocument.connected.subscribe((isConnected) => {
          sessionConnectionStatus = isConnected ? "connected" : "reconnecting";
          setSessionModeLabel(
            isConnected
              ? "sandbox runtime active; use Open Project Tab for Studio visuals."
              : "connection interrupted, waiting for sync recovery...",
          );
          renderSessionDashboard();
        }, true),
      );
    }
  } catch (error) {
    pushSessionActivity(
      "warn",
      "Connection status subscription unavailable.",
      toDisplayString(error),
    );
  }

  try {
    if (activeDocument.events?.onCreate) {
      addSessionSubscription(
        activeDocument.events.onCreate("*", (entity) => {
          updateSessionEntityCount(entity.entityType, 1);
          pushSessionActivity(
            "event",
            `Entity created: ${entity.entityType}`,
            entity.id,
          );
        }),
      );
    }
  } catch (error) {
    pushSessionActivity(
      "warn",
      "Entity create event subscription unavailable.",
      toDisplayString(error),
    );
  }

  try {
    if (activeDocument.events?.onRemove) {
      addSessionSubscription(
        activeDocument.events.onRemove("*", (entity) => {
          updateSessionEntityCount(entity.entityType, -1);
          removeAliasesByEntityId(entity.id);
          pushSessionActivity(
            "event",
            `Entity removed: ${entity.entityType}`,
            entity.id,
          );
        }),
      );
    }
  } catch (error) {
    pushSessionActivity(
      "warn",
      "Entity remove event subscription unavailable.",
      toDisplayString(error),
    );
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

function resolveProjectResourceName(projectReference, studioUrl) {
  const projectUuid =
    extractProjectUuid(projectReference) || extractProjectUuid(studioUrl);
  if (!projectUuid) {
    return "";
  }
  return `projects/${projectUuid}`;
}

function normalizePreviewImageUrl(imageUrl) {
  if (!imageUrl) {
    return "";
  }

  try {
    const parsed = new URL(imageUrl);
    if (!parsed.searchParams.has("width")) {
      parsed.searchParams.set("width", "1440");
    }
    if (!parsed.searchParams.has("height")) {
      parsed.searchParams.set("height", "810");
    }
    if (!parsed.searchParams.has("fit")) {
      parsed.searchParams.set("fit", "cover");
    }
    if (!parsed.searchParams.has("format")) {
      parsed.searchParams.set("format", "webp");
    }
    return parsed.toString();
  } catch {
    return imageUrl;
  }
}

async function loadProjectPreviewMetadata(studioUrl) {
  const projectName = resolveProjectResourceName(activeProject, studioUrl);
  if (!projectName) {
    throw new Error("Could not infer a project UUID for preview metadata.");
  }

  const client = await ensureClient();
  const response = await client.api.projectService.getProject({
    name: projectName,
  });

  if (response instanceof Error) {
    throw response;
  }
  if (!response.project) {
    throw new Error("Project metadata is unavailable.");
  }

  const projectId = projectName.replace("projects/", "");
  return {
    projectId,
    displayName: response.project.displayName || projectId,
    description: response.project.description || "",
    creatorName: response.project.creatorName || "",
    imageUrl: normalizePreviewImageUrl(
      response.project.snapshotUrl || response.project.coverUrl || "",
    ),
  };
}

function updateControls() {
  const loggedIn = Boolean(loginStatus && loginStatus.loggedIn);
  authButton.disabled = isInitializingAuth;
  authButton.textContent = loggedIn ? "Logout" : "Login";

  connectButton.disabled = !loggedIn || isConnectingProject;
  disconnectButton.disabled = !activeDocument || isConnectingProject;
  openProjectButton.disabled = !activeProjectStudioUrl;
  reloadPreviewButton.disabled = !activeProjectStudioUrl;
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

  clearSessionSubscriptions();
  const previousDoc = activeDocument;
  activeDocument = null;
  const previousProject = activeProject;
  activeProject = "";
  activeProjectStudioUrl = "";
  resetSessionDashboard("project disconnected.");
  updateControls();

  try {
    await previousDoc.stop();
    setAudiotoolStatus(note, "warn");
    appendConsoleLine(
      "system",
      `Stopped Audiotool sync for project: ${previousProject || "(unknown)"}`,
    );
    pushSessionActivity(
      "system",
      "Project disconnected.",
      previousProject || "(unknown)",
    );
  } catch (error) {
    const detail = toDisplayString(error);
    setAudiotoolStatus(`Failed stopping project: ${detail}`, "error");
    appendConsoleLine("error", detail);
    pushSessionActivity("error", "Error while stopping project sync.", detail);
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
    sessionConnectionStatus = "connected";
    setSessionModeLabel(
      "sandbox runtime active; use Open Project Tab for Studio visuals.",
    );
    await refreshSessionMetadata();
    await refreshSessionEntitySummary();
    attachSessionDocumentSubscriptions();
    projectInput.value = studioUrl;
    setAudiotoolStatus(`Connected to project: ${projectReference}`, "ok");
    appendConsoleLine(
      "system",
      `Connected Audiotool project: ${projectReference}`,
    );
    appendConsoleLine(
      "system",
      "Session preview is now data-driven and updates from sandbox/apply events.",
    );
    appendConsoleLine(
      "system",
      "Use Open Project Tab to view and edit the full Audiotool Studio UI.",
    );
    appendConsoleLine(
      "system",
      "The in-page preview now shows your sandbox runtime plus action log/state.",
    );
    pushSessionActivity(
      "system",
      "Project connected.",
      `${projectReference} (${studioUrl})`,
    );
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
  const aliasUpdates = [];
  const removedAliases = new Set();
  const operationSummaries = [];

  for (const rawOp of operations) {
    if (!isRecord(rawOp)) {
      throw new Error("Each operation must be an object.");
    }

    const opName = asString(rawOp.op, "op");

    if (opName === "ensureEntity") {
      const entityType = asString(rawOp.entityType, "entityType");
      let entity = t.entities.ofTypes(entityType).getOne();
      const existed = Boolean(entity);

      if (!entity) {
        const createValues = isRecord(rawOp.create) ? rawOp.create : {};
        entity = t.create(entityType, createValues);
      }

      if (typeof rawOp.alias === "string" && rawOp.alias.trim()) {
        const alias = rawOp.alias.trim();
        aliases.set(alias, entity);
        aliasUpdates.push({
          alias,
          entityType: entity.entityType,
          entityId: entity.id,
        });
        operationSummaries.push(
          `ensureEntity(${entityType}) as ${alias} (${existed ? "existing" : "created"})`,
        );
      } else {
        operationSummaries.push(
          `ensureEntity(${entityType}) (${existed ? "existing" : "created"})`,
        );
      }

      continue;
    }

    if (opName === "createEntity") {
      const entityType = asString(rawOp.entityType, "entityType");
      const createValues = isRecord(rawOp.values) ? rawOp.values : {};
      const entity = t.create(entityType, createValues);

      if (typeof rawOp.alias === "string" && rawOp.alias.trim()) {
        const alias = rawOp.alias.trim();
        aliases.set(alias, entity);
        aliasUpdates.push({
          alias,
          entityType: entity.entityType,
          entityId: entity.id,
        });
        operationSummaries.push(`createEntity(${entityType}) as ${alias}`);
      } else {
        operationSummaries.push(`createEntity(${entityType})`);
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
      operationSummaries.push(
        `updateField(${entity.entityType}.${fieldName} = ${toDisplayString(rawOp.value)})`,
      );
      continue;
    }

    if (opName === "removeEntity") {
      const entity = resolveEntityFromOp(t, aliases, rawOp);
      if (typeof rawOp.entityAlias === "string" && rawOp.entityAlias.trim()) {
        removedAliases.add(rawOp.entityAlias.trim());
      }
      operationSummaries.push(`removeEntity(${entity.entityType}:${entity.id})`);
      t.remove(entity);
      continue;
    }

    throw new Error(
      `Unsupported Audiotool operation "${opName}". Supported ops: ensureEntity, createEntity, updateField, removeEntity.`,
    );
  }

  return {
    aliasUpdates,
    removedAliases: Array.from(removedAliases),
    operationSummaries,
  };
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
    pushSessionActivity(
      "apply",
      `Apply request received (${ops.length} op${ops.length === 1 ? "" : "s"}).`,
    );

    await ensureRequestedProject(project);
    let applyResult = null;
    await activeDocument.modify((transaction) => {
      applyResult = applyAudiotoolOperations(transaction, ops);
    });

    for (const alias of applyResult?.removedAliases || []) {
      sessionAliasState.delete(alias);
    }
    for (const aliasUpdate of applyResult?.aliasUpdates || []) {
      upsertSessionAlias(
        aliasUpdate.alias,
        aliasUpdate.entityType,
        aliasUpdate.entityId,
      );
    }
    await refreshSessionEntitySummary();
    lastApplySummary = `${formatClockTime()} — Applied ${ops.length} operation(s) successfully.`;
    renderSessionDashboard();
    if (applyResult?.operationSummaries?.length) {
      pushSessionActivity(
        "apply",
        `Applied ${ops.length} operation(s).`,
        applyResult.operationSummaries.join(" | "),
      );
    }

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
    lastApplySummary = `${formatClockTime()} — Apply failed.`;
    pushSessionActivity("error", "Apply request failed.", detail);
    renderSessionDashboard();

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
    "Script runtime is visible in Session preview; use Action log for apply results.",
  );
  pushSessionActivity("runtime", "Sandbox runtime refreshed.", packageLabel);
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
    if (payload.payload.method === "warn" || payload.payload.method === "error") {
      pushSessionActivity(payload.payload.method, "Runtime console message.", text);
    }
    return;
  }

  if (payload.type === "runtime-error") {
    const detail = payload.payload.stack || payload.payload.message;
    appendConsoleLine("error", detail);
    pushSessionActivity("error", "Runtime error in sandbox.", detail);
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

  queueAudiotoolTask(async () => {
    await refreshSessionMetadata();
    await refreshSessionEntitySummary();
    appendConsoleLine("system", "Session data refreshed.");
    pushSessionActivity("system", "Session data refreshed.");
  });
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

resetSessionDashboard("waiting for project connection.");
runCode();
initializeAudiotoolAuth();

window.addEventListener("beforeunload", () => {
  clearSessionSubscriptions();
  if (activeDocument) {
    void activeDocument.stop();
  }
});
