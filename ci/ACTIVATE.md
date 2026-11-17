# Activating the corrected release workflow

**One step, about a minute, and only the repository owner can do it.**

The workflow that builds the Windows installers lives at `.github/workflows/release.yml`. The
version on `main` still hard-codes `tag_name: v2.0.0`, so a second run would overwrite the 2.0.0
release instead of publishing 2.1.0. The corrected file is already in this folder as
`ci/release.yml`; it just cannot be moved into place by an automated session, because the GitHub
App that pushes to this repository has `contents: write` but not the separate `workflows`
permission. GitHub refuses any write under `.github/workflows/` from that App — through git, and
through the REST API — and refuses to dispatch a run as well.

Nothing else is blocked: the code, tests and build are all committed and green.

## Do this

1. Open <https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/blob/main/ci/release.yml>
2. Click the **copy** icon at the top right of the file.
3. Open <https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/blob/main/.github/workflows/release.yml>
4. Click the **pencil** (Edit) button.
5. Select all of the existing content and paste over it.
6. **Commit changes** → commit directly to `main`.

## Then

1. Go to **Actions** → **Build EXE** → **Run workflow**.
2. Leave the tag field **empty** — it reads the version from `package.json` (currently `2.1.0`).
3. Run it. It takes about two minutes.

The run typechecks, runs the test suite, builds, packages both binaries, and publishes them. It
fails instead of publishing if any gate fails, or if either `.exe` is missing.

The result replaces the draft release **Joe Browser 2.1.0** with the real binaries:

- `JoeBrowserSetup.exe` — the installer
- `JoeBrowser.exe` — the portable build

The README links use `/releases/latest/download/`, so they follow the new release automatically.

## Why the draft release has no files yet

`v2.1.0` is published as a **draft** with complete notes and no assets, on purpose. A published
release with no binaries looks finished and is not; a draft is visibly incomplete. When the run
above finishes, the assets arrive and the release can be published (the workflow does this).

## Verifying afterwards

```powershell
# 1. The asset names are stable, so this link always points at the newest build.
#    https://github.com/pritamsarkar711/Joe-Browser-Pro-Windows-/releases/latest/download/JoeBrowserSetup.exe

# 2. After installing, the About page should read 2.1.0.
```

## If the run fails

- **"artifact was not produced"** — `electron-builder` failed earlier in the log. Check that
  `dist/` built; the packaging step in `electron-builder.yml` only ships `dist/` and
  `package.json`.
- **The release step fails on the tag** — the tag already exists pointing at a different commit.
  Pass the tag explicitly in the run's `tag` input to re-publish it, or bump the version in
  `package.json` and push.
- **A gate fails** — nothing was published. Run `npm test` locally; it is the same suite.
