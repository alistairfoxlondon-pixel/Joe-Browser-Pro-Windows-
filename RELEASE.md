# Releasing Joe Browser

The pipeline is `.github/workflows/release.yml`. It runs on a Windows runner, builds both
binaries, and attaches them to a GitHub release. It has produced a working release before
(`v2.0.0`, 16 November 2026), so nothing here is theoretical.

## One thing to do before the next release

The live workflow at `.github/workflows/release.yml` still hard-codes `tag_name: v2.0.0`. A second
dispatch would therefore overwrite the `v2.0.0` release instead of creating `v2.1.0`.

The corrected workflow is **already written** at `release/ci/release.yml`. It cannot be moved into
place from an automated session: the GitHub App that pushes this repository has `contents: write`
but not the separate **`workflows`** permission, so any push or API write touching
`.github/workflows/` is refused with

```
refusing to allow a GitHub App to create or update workflow
`.github/workflows/release.yml` without `workflows` permission
```

This is the same boundary the earlier `ci/` workaround was built around. It affects only workflow
files; every other file in this repository pushes normally.

**The one-minute fix, for a human with the repository open:**

1. Open https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/blob/main/release/ci/release.yml
2. Copy the file's contents.
3. Open https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/blob/main/.github/workflows/release.yml
4. Replace its contents, commit to `main`.

`npm test` proves the staged file is correct and fails if it drifts from what it must contain
(`test/contract.test.ts` → *the staged workflow replacement is correct*). It also fails if the
staged file is deleted while the live one still pins a tag.

## Cutting a release

1. **Bump the version** in `package.json`. Nothing else carries a version: the installer name,
   the release tag, the "About" page and the Add/Remove Programs entry all read this one number.

   ```powershell
   npm version 2.1.0 --no-git-tag-version
   ```

2. **Commit and push to `main`.**

3. **Run the workflow.**

   ```
   Actions -> Build EXE -> Run workflow -> Run
   ```

   With the staged workflow in place, leave the tag field empty: it defaults to
   `v<package.json version>`. If the pinned workflow is still live, pass the tag explicitly —
   `v2.1.0` — because otherwise it defaults to `v2.0.0` and overwrites that release.

4. **Wait about two minutes.** The run typechecks, tests, builds, packages, and publishes. It
   fails rather than publishing if any of those steps fail, or if either `.exe` is missing.

5. **Check the release page.** It should carry two assets with the same names every time, so
   links never rot:

   - `JoeBrowserSetup.exe` — the installer
   - `JoeBrowser.exe` — the portable build

The README links to `/releases/latest/download/...`, so they follow the newest release without
being edited.

## What the workflow guarantees

| Step | Why it is before packaging |
|---|---|
| `npm ci` | A lockfile that does not install is a release that cannot be rebuilt |
| `npm run typecheck` | Both projects, `noUnusedLocals` on |
| `npm test` | 49 tests: core behaviour, every page mounting, and the contracts between the three processes |
| `npm run build` | Main, preload and renderer bundles |
| artifact check | Both `.exe` files exist before anything is published |
| `fail_on_unmatched_files` | A release with no binaries looks finished and is not |

## Building without CI

`scripts\release.ps1` runs the same sequence on a Windows machine that has a normal network
connection, and publishes when asked:

```powershell
.\scripts\release.ps1                    # build and verify into .\release
.\scripts\release.ps1 -Publish           # then tag and create the release
```

It refuses to publish when the tag does not match `package.json`, so the two cannot drift.

## Why a local build fails here and not on a runner

`electron-builder` downloads the Electron Windows distribution from `github.com/electron/electron`
at packaging time. This development sandbox was granted access only to `github.com`,
`codeload.github.com`, `api.github.com`, `registry.npmjs.org`, `pypi.org` and
`files.pythonhosted.org`, so the download step cannot complete here. Installing with
`ELECTRON_SKIP_BINARY_DOWNLOAD=1` makes the code and the tests work; packaging still requires the
runner, which has unrestricted access. This is a property of the sandbox, not of the project.

## If a run fails

- **`npm ci` fails on the electron postinstall** — the runner has network access, so this is
  usually a transient CDN error. Re-run the job.
- **Typecheck or tests fail** — nothing was published. Fix, push, run again.
- **"artifact was not produced"** — `electron-builder` failed earlier in the log. The usual cause
  is a missing file under `files:` in `electron-builder.yml`; the `dist/` tree is the only thing
  the app loads at runtime apart from `package.json`.
- **The release step fails on the tag** — the tag already exists and points at a different
  commit. Either pass the existing tag in the `tag` input to re-publish it, or bump the version.
