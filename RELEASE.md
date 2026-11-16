# Releasing Joe Browser

## What went wrong the first time (the real reason nothing showed up)

The workflow was saved to **`ci/.github/workflows/release.yml`**. That `ci/` prefix is fatal:
GitHub only reads workflows from `.github/workflows/` **at the repository root**, so a file
one folder deeper is just an ordinary YAML file that nobody runs. That is why
`/actions/workflows/release.yml` returned **404** and why "Run workflow" never appeared.

It is fixed on `main` now: the stray `ci/.github/` copy is gone and `ci/release.yml` is back.
The file still has to be created at the root path — the GitHub App that writes to this repo
has no `workflows` permission, so it cannot be pushed from here. Only you can create it.

Because the mistake was an easy one, **use the short file** below rather than the 150-line one.
A short file is easy to eyeball, and it produces the same two EXEs.

---

## Create the workflow (owner-only, ~1 minute)

### 1. Open the new-file editor

**https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/new/main**

### 2. Type the path — read this carefully

In the **filename box at the top**, type exactly:

```
.github/workflows/release.yml
```

Rules that matter, because this is where it went wrong last time:

- It must **start** with `.github`, not `ci`. No `ci/` in front, no leading `/`.
- The box must read `.github/workflows/release.yml` and nothing else.
- Typing the slashes is what creates the two folders.

### 3. Paste this content

```yaml
name: Build EXE

on: workflow_dispatch

permissions:
  contents: write

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npx electron-builder --win --x64 --publish never
      - uses: softprops/action-gh-release@v2
        with:
          tag_name: v2.0.0
          name: Joe Browser 2.0.0
          generate_release_notes: true
          files: |
            release/JoeBrowserSetup.exe
            release/JoeBrowser.exe
```

### 4. Commit

Leave **Commit directly to the `main` branch** selected, click **Commit changes**.

### 5. Check you got it right — before doing anything else

Open: **https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/blob/main/.github/workflows/release.yml**

- **Shows YAML** → correct, continue to step 6.
- **404** → the path was wrong again. Check the filename box started with `.github`. Delete
  what you made and redo step 1.

### 6. Run it

**https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/actions**

You should see **Build EXE** in the left column. Click it → **Run workflow** → green
**Run workflow** button. No tag needs typing; this file publishes `v2.0.0` by itself.

5–8 minutes later: **https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/releases/latest**
holds `JoeBrowserSetup.exe` and `JoeBrowser.exe`.

---

## How to tell each failure apart

| What you see | What it means |
|---|---|
| The actions/workflows link 404s | The file is not at the root `.github/workflows/`. Check the blob link in step 5. |
| Repo page loads but **Actions tab is empty**, no "Workflow Not Found" | Actions is off. **Settings → Actions → General → Allow all actions → Save.** |
| "Workflow Not Found" | File exists but is not on `main`. It must be on the default branch. |
| "Run workflow" button missing | You are not on `main`, or GitHub has not indexed the file yet (wait ~30 s). |
| Job fails at `npm ci` | Lockfile drift — tell me the error text. |
| Job fails at `electron-builder` | Packaging config — tell me the error text. |
| Release exists but has no files | The build failed before packaging; the job log names the step. |

## Why the build cannot happen from here

Measured from this environment, not assumed:

| Host | Reachable | Consequence |
|---|---|---|
| `github.com`, `api.github.com` | yes | branches, PRs, releases, commits |
| `codeload.github.com` | yes | source archives only |
| `registry.npmjs.org` | yes | JS packages; no Electron runtime in any of them |
| `release-assets.githubusercontent.com` | **no** | the Windows Electron zip cannot be downloaded |
| `objects.githubusercontent.com` | **no** | no binary objects |
| `uploads.github.com` | **no** | a release can be created but no asset attached |

A release record can be created from here, but no binary can be produced or attached, so the
EXE must be built on a runner that can reach the Electron CDN: `windows-latest`. A local
cross-build is no workaround — electron-builder needs the same blocked runtime.

---

## The fuller workflow

`ci/release.yml` is the longer version (12 steps) with a tag-vs-version guard, size checks, an
artifact upload before publishing, and tag-triggered releases. Once the short one has produced
a release, swap the content of `.github/workflows/release.yml` for that file if you want those
safeguards. Do not create it at `ci/.github/...` — that path is not read by GitHub.

## Alternative: build on your own Windows PC

```powershell
git clone https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-.git
cd Joe-Browser-Pro-Windows-
.\scripts\release.ps1 -Publish -Tag v2.0.0
```

Needs Node 22 and the GitHub CLI logged in.
