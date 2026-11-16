# The release pipeline

`ci/release.yml` is the GitHub Actions workflow that builds `JoeBrowserSetup.exe` and
`JoeBrowser.exe` on a Windows runner and attaches them to a release.

It lives here rather than in `.github/workflows/` because the GitHub App that pushed this
repository does not have the `workflows` permission, and GitHub refuses any push that creates or
changes a file under `.github/workflows/` without it.

## To activate it — either way works

**A. Move it (one command, once the app has `workflows` permission):**

```powershell
mkdir .github\workflows
git mv ci/release.yml .github/workflows/release.yml
git commit -m "Activate the release pipeline"
git push
```

**B. Add it through the web UI (no permission change needed):**

1. Open the repository on github.com.
2. **Add file → Create new file**.
3. Name it `.github/workflows/release.yml`.
4. Paste the contents of `ci/release.yml`.
5. Commit.

## Then

Push a tag and the release appears with both binaries:

```powershell
git tag v2.0.0
git push origin v2.0.0
```

`ci/release.yml` runs `npm run typecheck`, `npm test`, `npm run build`, then
`electron-builder --win --x64`, checks that both binaries exist and are a plausible size, reads
the installer's version resource, and only then publishes. A push to a branch builds and
verifies without publishing, so a broken build is visible before a tag is cut.

The asset names are fixed (`JoeBrowserSetup.exe`, `JoeBrowser.exe`) so that
`releases/latest/download/JoeBrowserSetup.exe` in the README never changes shape.
