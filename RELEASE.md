# Releasing Joe Browser

The source is finished and merged. Publishing needs one Windows build, and this sandbox cannot
produce it: the Windows Electron distribution lives on `release-assets.githubusercontent.com`,
which refuses connections here. Pick **one** of the three paths below. Path A needs one paste and
one click.

---

## Path A — the one-click path (recommended)

### Step 1. Create the workflow file (one paste)

Open this link. It opens GitHub's new-file editor with the path already filled in:

**https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/new/main?filename=.github/workflows/release.yml**

In the editor:

1. Open **https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/blob/main/ci/release.yml**
   in a second tab.
2. Click **Raw** (top-right of the file), select all, copy.
3. Back in the first tab, paste into the editor.
4. Scroll down, press **Commit changes**.

The file is ~150 lines. Nothing else needs to change.

### Step 2. Run it

Open this link and press the **Run workflow** button on the right:

**https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/actions/workflows/release.yml**

In the box that appears:

- **Release tag to publish**: type `v2.0.0`
- Press **Run workflow**

It takes about 5–8 minutes. When it finishes, the release is at:

**https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/releases/latest**

with `JoeBrowserSetup.exe` and `JoeBrowser.exe` attached.

> If **Run workflow** does not appear, the file was not committed to the default branch. Check
> step 1: the path must be exactly `.github/workflows/release.yml`.

---

## Path B — grant the app permission and I finish it

The GitHub App that pushes this repository has `contents: write` for code but **not** the
separate `workflows` permission, so GitHub rejects any push that creates a file under
`.github/workflows/` (HTTP 403, `Resource not accessible by integration`).

Grant that permission in the app's settings, tell me, and I will move `ci/release.yml` into
place and trigger the release myself in one turn.

---

## Path C — build it on a Windows PC

No GitHub involvement at all:

```powershell
git clone https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-.git
cd Joe-Browser-Pro-Windows-
.\scripts\release.ps1 -Publish -Tag v2.0.0
```

That script installs, typechecks, runs the tests, builds, packages, verifies both binaries carry
their version resources, then tags and publishes them with `gh`. It needs Node 22 and the GitHub
CLI logged in.

---

## What the pipeline guarantees

Every path runs the same checks before anything is published:

| Step | Failure it catches |
|---|---|
| `npm ci` | A lockfile that no longer matches `package.json` |
| `npm run typecheck` | A type error, or dead code hiding one |
| `npm test` | A broken identity engine, or a page that will not mount |
| `npm run build` | An unresolved import in either bundle |
| `electron-builder` | A packaging config that cannot produce both targets |
| Size and version-resource check | An installer that is a stub, or one with no publisher |
| Tag-vs-version check | A release whose title disagrees with the binaries inside it |

Only a tag push or a manual run with a tag publishes. A branch push builds and verifies, so a
broken build is visible before a release can be cut from it.
