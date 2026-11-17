# Releasing Joe Browser

The pipeline is `.github/workflows/release.yml`. It runs on a Windows runner, builds both
binaries, and attaches them to a GitHub release. It has produced a working release before
(`v2.0.0`, 16 November 2026), so nothing here is theoretical.

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

   Leave the tag field empty. It defaults to `v<package.json version>`, which is what you want;
   the input exists for re-publishing a tag that failed halfway.

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
