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
- Displays the connected Audiotool Studio project in the large preview pane
- Starts sync with `document.start()`
- Applies whitelisted operations from sandbox messages inside
  `document.modify(...)`
- Stops sync on disconnect/project switch/unload with `document.stop()`
- Keeps the runtime iframe hidden (for safety) and shows logs in a collapsible
  console panel

If your browser or Audiotool headers block embedding, use **Open Project Tab**
to open the same connected project URL in a full tab.

If the embedded preview shows a login/session token error, this is usually due
third-party cookie restrictions in iframe context. In that case:

1. allow third-party cookies for `audiotool.com`,
2. reconnect the project,
3. authenticate once in **Open Project Tab**,
4. then use **Reload Preview**.

Google-based sign-in is especially likely to fail in embedded iframe contexts.
Top-level tab authentication is the expected fallback.

Important: when running on `127.0.0.1` (or any non-`audiotool.com` host),
embedded Studio auth is cross-site and will not reliably work because the
accounts flow relies on same-site cookie behavior. Local development should use
**Open Project Tab**. Embedded preview is intended for deployment under an
`*.audiotool.com` site context.

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

## 8) Production hardening suggestions

- Restrict allowed operation/entity types more tightly
- Add strict request quotas/rate limits in UI layer
- Add CSP for parent page + iframe srcdoc strategy
- Add richer error UX for transaction validation failures
- Add project picker via `client.api.projectService.listProjects(...)`
