# Sandbox Commands — Audiotool Project API

A searchable reference for commands you can type in the Monaco editor to modify an Audiotool project using the sandbox app. Connect a project first, then run your code with **Ctrl+Enter** (or **Cmd+Enter**).

---

## Quick lookup

| Task | Command |
|------|---------|
| Ensure entity exists | `{ op: "ensureEntity", entityType: "tonematrix", alias: "tm" }` |
| Create entity | `{ op: "createEntity", entityType: "tonematrix", alias: "tm", values: {...} }` |
| Update field | `{ op: "updateField", entityAlias: "tm", field: "positionX", value: 900 }` |
| Remove entity | `{ op: "removeEntity", entityAlias: "tm" }` |
| Apply changes | `await window.audiotool.apply({ ops: [...] })` |

---

## Basic usage

In the editor, call:

```js
await window.audiotool.apply({
  ops: [
    // your operations here
  ]
});
```

- **Connect a project** first (Project URL or UUID → Connect Project).
- **Run** with Ctrl+Enter (Cmd+Enter).
- Up to **50 ops** per `apply` call.
- Optional: set `project` in the payload to use a different project than the one connected.

---

## Commands (operations)

### `ensureEntity`

Find an entity by type; create it if it doesn't exist. Use this to get or create a single entity of a given type.

| Parameter   | Required | Description                                          |
|-------------|----------|------------------------------------------------------|
| `entityType`| ✓        | Entity type (e.g. `"tonematrix"`)                    |
| `alias`     |          | Name to use in later ops (e.g. `"tm"`)               |
| `create`    |          | Initial field values when creating (object)          |

**Example:**
```js
{ op: "ensureEntity", entityType: "tonematrix", alias: "tm" }
// With initial values if creating:
{ op: "ensureEntity", entityType: "tonematrix", alias: "tm", create: { positionX: 100, positionY: 200 } }
```

---

### `createEntity`

Create a new entity. Use when you always want a new instance.

| Parameter   | Required | Description                                          |
|-------------|----------|------------------------------------------------------|
| `entityType`| ✓        | Entity type (e.g. `"tonematrix"`)                    |
| `alias`     |          | Name to use in later ops                              |
| `values`    |          | Initial field values (object)                        |

**Example:**
```js
{ op: "createEntity", entityType: "tonematrix", alias: "tm2", values: { positionX: 300, positionY: 400 } }
```

---

### `updateField`

Update a field on an existing entity. Target the entity by alias (from a previous op) or by type (picks the first match).

| Parameter   | Required | Description                                          |
|-------------|----------|------------------------------------------------------|
| `entityAlias` | *       | Alias from a previous op (use this or `entityType`)  |
| `entityType`  | *       | Entity type — picks first match                      |
| `field`     | ✓        | Field name (e.g. `"positionX"`, `"positionY"`)        |
| `value`     | ✓        | New value                                            |

**Example:**
```js
{ op: "updateField", entityAlias: "tm", field: "positionX", value: 900 }
{ op: "updateField", entityAlias: "tm", field: "positionY", value: 600 }
```

---

### `removeEntity`

Remove an entity from the project.

| Parameter   | Required | Description                                          |
|-------------|----------|------------------------------------------------------|
| `entityAlias` | *       | Alias from a previous op (use this or `entityType`)  |
| `entityType`  | *       | Entity type — picks first match                      |

**Example:**
```js
{ op: "removeEntity", entityAlias: "tm" }
```

---

## Full example

```js
await window.audiotool.apply({
  ops: [
    { op: "ensureEntity", entityType: "tonematrix", alias: "tm" },
    { op: "updateField", entityAlias: "tm", field: "positionX", value: 900 },
    { op: "updateField", entityAlias: "tm", field: "positionY", value: 600 }
  ]
});
```

---

## Search tips

- **Ctrl+F** / **Cmd+F** — Search this doc by keyword.
- Keywords: `ensureEntity`, `createEntity`, `updateField`, `removeEntity`, `alias`, `entityType`, `positionX`, `tonematrix`, `apply`.

---

## Limits & notes

- Max **50 operations** per `apply()` call.
- `entityType` and field names depend on Audiotool’s schema (e.g. `tonematrix` with `positionX`, `positionY`).
- Use `alias` so later ops can reference the same entity.
- Connect a project before running; otherwise the apply will fail.
