# Monaco JS Sandbox + Audiotool Bridge

This project is a minimal, readable example of an embeddable playground with:

- **Monaco Editor** for user code,
- sandboxed iframe execution (`sandbox="allow-scripts"`),
- npm package imports via `esm.sh`,
- and a **safe parent-page bridge** that applies whitelisted operations to an
  Audiotool project using `@audiotool/nexus`.

---

## 1) Quick start

```bash
npm install
npm run dev
```

Open: `http://127.0.0.1:5173/`

> The Vite dev server is intentionally configured to use `127.0.0.1` (not
> `localhost`) because Audiotool OAuth redirect validation requires this.

---

## 2) Audiotool application setup

This repo is preconfigured with your client ID:

`379f8d67-b211-43b2-8a9d-9553aa8aad32`

Register/update your app on
`https://developer.audiotool.com/applications` with:

- Redirect URI (dev): `http://127.0.0.1:5173/`
- Scope: `project:write`

When you deploy, add your deployed URL as another redirect URI and make sure it
matches exactly (protocol, path, trailing slash).

---

## 3) What the app does

- Lets user login/logout with Audiotool (`getLoginStatus`)
- Creates `AudiotoolClient` when logged in
- Connects to one project via `createSyncedDocument({ project })`
- Shows project preview in the large pane:
  - embedded Studio iframe when the host allows it
  - automatic snapshot/cover fallback when iframe embedding is blocked
- Starts sync with `document.start()`
- Applies whitelisted operations from sandbox messages inside
  `document.modify(...)`
- Stops sync on disconnect/project switch/unload with `document.stop()`
- Keeps the runtime iframe hidden (for safety) and shows logs in a collapsible
  console panel

If embedded Studio is blocked, the app falls back to project snapshot/cover
preview automatically. Use **Open Project Tab** for full Studio editing.

If the embedded preview shows a login/session token error, this is usually due
third-party cookie restrictions in iframe context. In that case:

1. allow third-party cookies for `audiotool.com`,
2. reconnect the project,
3. authenticate once in **Open Project Tab**,
4. then use **Reload Preview**.

Google-based sign-in is especially likely to fail in embedded iframe contexts.
Top-level tab authentication is the expected fallback.

Important: when running on `127.0.0.1` (or any non-`audiotool.com` host),
embedded Studio auth is cross-site and may fail because the accounts flow relies
on same-site cookie behavior. In that case the app uses snapshot fallback in the
preview pane, and **Open Project Tab** is the reliable full-workflow option.

---

## 4) Secure execution model

### Trusted host (parent page)

- Handles auth/client/document lifecycle
- Holds credentials/token access
- Validates and applies operations

### Untrusted sandbox (iframe code)

- Runs user JavaScript
- Can only call `window.audiotool.apply(payload)` which sends a message to host
- Never gets direct access to auth status, token, or Nexus client instances

---

## 5) Operation payload format

In editor code, call:

```js
await window.audiotool.apply({
  // optional: if omitted, currently connected project is used
  // project: "https://beta.audiotool.com/studio?project=<id>",
  ops: [
    { op: "ensureEntity", entityType: "tonematrix", alias: "tm" },
    { op: "updateField", entityAlias: "tm", field: "positionX", value: 900 },
    { op: "updateField", entityAlias: "tm", field: "positionY", value: 600 }
  ]
});
```

Supported ops in this starter:

- `ensureEntity` (find one by type, create if missing)
- `createEntity`
- `updateField`
- `removeEntity`

---

## 6) Keyboard shortcut

- Run iframe code: `Ctrl+Enter` (or `Cmd+Enter`)

---

## 7) Project structure

```text
.
├── index.html
├── vite.config.js
├── src/
│   ├── main.js
│   └── style.css
└── package.json
```

---

## 8) Deploy to GitHub Pages

This repo is configured for **Deploy from branch** (legacy Pages mode).
The live site is served from the root of branch `Jsplayground`.

### One-time setup

1. Open your repository on GitHub:
   `https://github.com/TrumanOakes/JSplayground`
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose:
   - **Source**: Deploy from a branch
   - **Branch**: `Jsplayground`
   - **Folder**: `/ (root)`

### Deploy

When you update source code in:

`VideoAudioImporter-cursor-javascript-playground-packages-a747/`

publish a new branch build by running:

```bash
cd VideoAudioImporter-cursor-javascript-playground-packages-a747
npm install
BASE_PATH="/JSplayground/" npm run build
cd ..
rm -rf assets index.html .nojekyll
cp -R VideoAudioImporter-cursor-javascript-playground-packages-a747/dist/assets ./assets
cp VideoAudioImporter-cursor-javascript-playground-packages-a747/dist/index.html ./index.html
touch .nojekyll
git add assets index.html .nojekyll
git commit -m "Publish updated GitHub Pages build"
git push origin Jsplayground
```

After push, GitHub Pages serves the updated root files automatically.

### OAuth redirect update

After Pages is live, add the deployed URL (with trailing slash) as an additional
redirect URI in:

`https://developer.audiotool.com/applications`

Example:

`https://trumanoakes.github.io/JSplayground/`

---

## 9) Production hardening suggestions

- Restrict allowed operation/entity types more tightly
- Add strict request quotas/rate limits in UI layer
- Add CSP for parent page + iframe srcdoc strategy
- Add richer error UX for transaction validation failures
- Add project picker via `client.api.projectService.listProjects(...)`
