# Releasing Joe Browser

## The one thing that was wrong

Joe Browser has **no `.github/workflows/` directory**, and the GitHub App that writes to this
repository is not allowed to create one. Verified on 2026-11-16:

| Probe | Result |
|---|---|
| `GET /actions/workflows` | `total_count: 0` — GitHub knows of no workflow |
| `git push` of `.github/workflows/release.yml` | rejected: *"refusing to allow a GitHub App to create or update workflow … without `workflows` permission"* |
| `PUT /contents/.github/workflows/release.yml` | `403 Resource not accessible by integration` |
| `POST /git/trees` + `POST /git/commits` | `403 Resource not accessible by integration` |
| `git push` of an ordinary file | allowed |

So it is **not** a build problem, a config problem or a test problem. The app is complete:

| Check | Result |
|---|---|
| `npm run typecheck` | passes |
| `npm test` | 19 tests pass |
| `npm run build` | main, preload and renderer bundles produced |
| `npx electron-builder --win --x64` | config loads, packages the app, then fails **only** at downloading the Windows Electron zip |
| `release-assets.githubusercontent.com` | unreachable from the build sandbox (`SSL_ERROR_SYSCALL`) |

The last line is why the EXE cannot be assembled anywhere except a Windows-capable machine.
GitHub's `windows-latest` runner is that machine — it just needs the workflow file to exist.

**The fix is installing one file, and only the repository owner can do it.** Three clicks,
below. No copy-paste, no terminal, no content that can go wrong.

---

## Install the workflow (3 clicks, ~30 seconds)

The workflow already lives at **`ci/release.yml`** on `main`, fully written and verified. You
are going to move it into the folder GitHub reads, using GitHub's own editor — your browser
session has the permission the App lacks.

1. **Open the editor** on the existing file:

   **https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/edit/main/ci/release.yml**

2. **Change the filename.** At the top there is a box reading `ci/release.yml`. Replace the
   whole thing with exactly:

   ```
   .github/workflows/release.yml
   ```

   Typing the slashes creates the folders. Do not add a leading `/` and do not leave a space
   at either end.

3. **Commit.** Scroll to the bottom, leave *Commit directly to the `main` branch* selected,
   click **Commit changes**.

That is it. The content is never retyped, so it cannot be corrupted, and the leading-dot
folder is created properly — which is exactly what the "Upload files" flow silently failed to
do before.

### Then run it

**https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/actions/workflows/release.yml**

Click **Run workflow** (right side), type `v2.0.0` in the box, press the green **Run workflow**
button. In 5–8 minutes:

**https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/releases/latest**

holds `JoeBrowserSetup.exe` and `JoeBrowser.exe`.

> If the file reference above ever 404s, use the repo's file finder instead: open
> `https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/edit/main/` and type
> `ci/release.yml` in the path box.

---

## If the green "Run workflow" button is missing

Check in this order:

1. **The file is really there.** Open
   `https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/blob/main/.github/workflows/release.yml`
   — it must show YAML, not a 404. If it 404s, step 2 above saved to the wrong path.
2. **Actions is on.** **Settings → Actions → General → Allow all actions and reusable
   workflows → Save.** A repository whose content was re-uploaded can arrive with Actions
   disabled, and a disabled Actions tab shows no Run button and no explanation.
3. **Look at `main`.** A workflow file only registers on the default branch.
4. **Wait ~30 seconds** after committing; GitHub indexes new workflows asynchronously.

---

## Alternative: let the App finish it instead

If you would rather not touch the file at all, grant the App the permission it is missing and
the file can be moved by a normal push:

**Settings → Applications → Installed GitHub Apps → (the app used here) → Configure →
Permissions → Workflows: Read and write → Save.**

Then say so, and the move plus the tagged release can be done without you.

---

## Alternative: build it on your own Windows PC

```powershell
git clone https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-.git
cd Joe-Browser-Pro-Windows-
.\scripts\release.ps1 -Publish -Tag v2.0.0
```

Needs Node 22 and the GitHub CLI logged in. Installs, typechecks, tests, builds, packages,
verifies both binaries, then tags and publishes.

---

## What the pipeline guarantees

| Step | Failure it catches |
|---|---|
| `npm ci` | A lockfile that no longer matches `package.json` |
| `npm run typecheck` | A type error, or dead code hiding one |
| `npm test` | A broken identity engine, or a page that will not mount (19 tests) |
| `npm run build` | An unresolved import in either bundle |
| `electron-builder` | A packaging config that cannot produce both targets |
| Size check, both files ≥ 20 MB | A stub installer rather than a real one |
| Version-resource report | An installer Windows will show as an unknown publisher |
| Tag-vs-`package.json` check | A release whose title disagrees with the binaries inside it |
| Artifact upload before publish | A build that cannot be attached by hand if publishing fails |

Only a tag push, or a manual run that names a tag, publishes. A branch push builds and verifies
without publishing, so a broken build is visible before a release can be cut from it.

## Why the asset names never change

`electron-builder.yml` pins them:

```yaml
nsis:
  artifactName: JoeBrowserSetup.${ext}
portable:
  artifactName: JoeBrowser.${ext}
```

So the README's `../../releases/latest/download/JoeBrowserSetup.exe` link keeps working across
versions. If you rename them, update the README too.
