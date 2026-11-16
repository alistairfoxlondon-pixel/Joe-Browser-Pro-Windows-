# The release pipeline

`ci/release.yml` is the GitHub Actions workflow that builds `JoeBrowserSetup.exe` and
`JoeBrowser.exe` on a Windows runner and attaches them to a release.

## Why it is not already in `.github/workflows/`

The GitHub App that pushes this repository has `contents: write` but not the separate
**`workflows`** permission. GitHub therefore refuses any push that creates a file under
`.github/workflows/`:

```
refusing to allow a GitHub App to create or update workflow
`.github/workflows/release.yml` without `workflows` permission
```

The contents API (`PUT /contents/...`) and the Git Data API (`POST /git/trees`) both answer
`403 Resource not accessible by integration`. Ordinary files in ordinary folders push fine, so
this is a permission boundary, not a broken remote.

The file lives here, one move away from where Actions reads it.

## Activating it

See [RELEASE.md](../RELEASE.md). The short version — only the repository owner can do this,
because the App's permission is the thing that is missing:

1. Open the file in GitHub's web editor.
2. Rename `ci/release.yml` to `.github/workflows/release.yml`.
3. Commit to `main`.
4. **Actions → Release → Run workflow**, tag `v2.0.0`.

Renaming rather than pasting matters: the content is never retyped, so it cannot be corrupted,
and the editor creates the leading-dot folder properly. The "Upload files" flow silently skips
dot-directories — that is how `.github/` went missing in the first place, and why GitHub kept
reporting "Workflow Not Found".

Alternatively, grant the App **Workflows: read and write** and the file can be moved by a
normal push with no browser work at all.

## What it does

```
typecheck → test → build → electron-builder → verify both binaries → upload artifact → publish on a tag
```

A branch push builds and verifies but publishes nothing, so a broken build is visible before
any release can be cut from it. The artifact upload runs before publishing, so even a failed
publish leaves a downloadable EXE in the run summary.
