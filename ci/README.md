# The release pipeline

`ci/release.yml` is the GitHub Actions workflow that builds `JoeBrowserSetup.exe` and
`JoeBrowser.exe` on a Windows runner and attaches them to a release.

## Why it is not in `.github/workflows/` already

The GitHub App that pushes this repository has `contents: write` but not the separate
**`workflows`** permission. GitHub refuses any push that creates or changes a file under
`.github/workflows/` without it:

```
refusing to allow a GitHub App to create or update workflow
`.github/workflows/release.yml` without `workflows` permission
```

The contents API answers the same way (`Resource not accessible by integration`). The file is
therefore stored here, one move away from where Actions reads it.

## Activating it

Two options, both in [RELEASE.md](../RELEASE.md):

- **Create the file through the web editor** — *Add file → Create new file*, filename
  `.github/workflows/release.yml`, paste the contents of `ci/release.yml`, commit.
  **Do not use "Upload files"**: that flow silently skips dot-directories, so `.github/` never
  arrives and GitHub keeps saying "Workflow Not Found".
- **Grant the App the `workflows` permission** and the file can be moved by a normal push.

Once it is in place, push a tag or use **Run workflow** with a tag name; either publishes.

## What it does

`typecheck → test → build → electron-builder → verify both binaries → publish on a tag`.
A branch push builds and verifies but publishes nothing.
