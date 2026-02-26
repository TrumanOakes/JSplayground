# Sandbox Commands for Project Modification

A searchable reference of terminal commands useful for modifying a project in Cursor's sandbox. For developers who want to type commands to edit the project but aren't sure which commands to use.

---

## Quick Lookup

| Keyword | Category | Command |
|---------|----------|---------|
| append | File write | `echo "text" >> file.txt` |
| create file | File write | `touch file.txt` |
| create dir | Directories | `mkdir dirname` |
| find files | Search | `find . -name "*.js"` |
| grep | Search | `grep -r "pattern" .` |
| install deps | Packages | `npm install` |
| replace text | File edit | `sed -i 's/old/new/g' file.txt` |
| run dev | Scripts | `npm run dev` |
| git add | Git | `git add .` |
| git commit | Git | `git commit -m "msg"` |
| git push | Git | `git push origin branch` |

---

## File creation & writing

| Command | Description | Example |
|---------|-------------|---------|
| `touch <path>` | Create empty file | `touch src/utils.js` |
| `echo "content" > <path>` | Create/overwrite file | `echo "hello" > greeting.txt` |
| `echo "content" >> <path>` | Append to file | `echo "line 2" >> file.txt` |
| `printf '%s\n' "line1" "line2" > <path>` | Write multiple lines | `printf '%s\n' "a" "b" > out.txt` |
| `cp <src> <dest>` | Copy file | `cp config.json config.backup.json` |
| `tee <path>` | Write to file and stdout | `echo "data" \| tee log.txt` |

---

## Directories

| Command | Description | Example |
|---------|-------------|---------|
| `mkdir <dir>` | Create directory | `mkdir src/components` |
| `mkdir -p <path>` | Create nested dirs | `mkdir -p src/components/Button` |
| `rmdir <dir>` | Remove empty dir | `rmdir empty_folder` |
| `rm -r <dir>` | Remove dir and contents | `rm -r build/` |
| `mv <src> <dest>` | Move/rename | `mv old.js new.js` |

---

## File editing (non-interactive)

| Command | Description | Example |
|---------|-------------|---------|
| `sed -i 's/<old>/<new>/g' <file>` | Replace text in file | `sed -i 's/foo/bar/g' app.js` |
| `sed -i '/<pattern>/d' <file>` | Delete lines matching pattern | `sed -i '/debug/d' config.js` |
| `sed -i '3a new line' <file>` | Insert after line N | `sed -i '5a console.log(x)' main.js` |
| `sed -i '1i prefix' <file>` | Prepend to file | `sed -i '1i /** @preserve */' lib.js` |

---

## Search & find

| Command | Description | Example |
|---------|-------------|---------|
| `find . -name "<pattern>"` | Find files by name | `find . -name "*.ts"` |
| `find . -type f -name "*.js"` | Find files by type | `find . -type f -name "*.test.js"` |
| `grep -r "<pattern>" <path>` | Search text in files | `grep -r "function" src/` |
| `grep -rl "<pattern>" .` | List files containing pattern | `grep -rl "TODO" .` |
| `rg "<pattern>"` | Fast search (ripgrep) | `rg "import" src/` |

---

## Git

| Command | Description | Example |
|---------|-------------|---------|
| `git add <path>` | Stage files | `git add src/main.js` |
| `git add .` | Stage all changes | `git add .` |
| `git status` | Show working tree | `git status` |
| `git diff` | Show unstaged changes | `git diff` |
| `git diff --staged` | Show staged changes | `git diff --staged` |
| `git commit -m "<msg>"` | Commit with message | `git commit -m "Add feature"` |
| `git push -u origin <branch>` | Push to remote | `git push -u origin main` |
| `git pull origin <branch>` | Pull from remote | `git pull origin main` |
| `git checkout -b <branch>` | Create and switch branch | `git checkout -b feature/x` |
| `git restore <file>` | Discard changes to file | `git restore config.js` |
| `git restore --staged <file>` | Unstage file | `git restore --staged file.js` |

---

## npm / Node

| Command | Description | Example |
|---------|-------------|---------|
| `npm install` | Install dependencies | `npm install` |
| `npm install <pkg>` | Add package | `npm install lodash-es` |
| `npm install -D <pkg>` | Add dev dependency | `npm install -D vite` |
| `npm run <script>` | Run npm script | `npm run dev` |
| `npm run build` | Build project | `npm run build` |
| `npx <cmd>` | Run package binary | `npx vite build` |

---

## Project-specific (this repo)

| Command | Description | Example |
|---------|-------------|---------|
| `cd VideoAudioImporter-cursor-javascript-playground-packages-a747 && npm run dev` | Start dev server | — |
| `cd VideoAudioImporter-cursor-javascript-playground-packages-a747 && npm run build` | Build for production | — |
| `BASE_PATH="/JSplayground/" npm run build` | Build for GitHub Pages | In subfolder |

---

## Useful combinations

| Task | Command |
|------|---------|
| Create file with content | `printf '%s\n' "line1" "line2" > newfile.js` |
| Replace in all JS files | `find . -name "*.js" -exec sed -i 's/old/new/g' {} +` |
| Count occurrences | `grep -r "pattern" . --include="*.js" \| wc -l` |
| List changed files | `git status --short` |
| Stage and commit | `git add . && git commit -m "Update"` |
| Install and run dev | `npm install && npm run dev` |

---

## Search tips

- **Ctrl+F** (or Cmd+F) in this document to find commands by keyword.
- Use the Quick Lookup table at the top for common tasks.
- Categories: `File creation`, `Directories`, `File editing`, `Search`, `Git`, `npm`, `combinations`.

---

*For Cursor sandbox: workspace read/write and some network access are allowed; other operations may require approval or config.*
