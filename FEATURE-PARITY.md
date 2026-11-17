# Feature parity with the C# application

This is the working checklist for the port. Every row names the file in the original repository
(`alistairfoxlondon-pixel/Joe-Browser-`, `src/*.cs`) and the file in this one that owns the
behaviour now.

Status: **ported** (behaviour implemented and tested), **partial** (implemented, with a named
gap), **planned** (not written yet, tracked here so it cannot be quietly dropped).

> **Current state: every *planned* row is now ported.** The remaining rows are either *partial*
> with a reason that still holds (no downloadable Brave or Edge archive exists to fetch) or
> *not planned* with the reason written out. Nothing is silently missing.

## 1. Profiles

| Feature | Original | Status | Here |
|---|---|---|---|
| Unlimited profiles, one `--user-data-dir` each | `ProfileStore.cs`, `ProfileData.cs` | ported | `core/store.ts`, `core/paths.ts`, `core/launcher.ts` |
| Create / rename / delete | `ProfileStore.cs`, `EditorForm.cs` | ported | `core/store.ts`, `renderer/pages/ProfileEditor.tsx` |
| Duplicate (same identity, new storage) | `ProfileStore.cs` | ported | `core/store.ts` → `duplicateProfile` |
| Groups, tags, notes, status | `Models.cs`, `ProfileCard.cs` | ported | `shared/types.ts`, `ProfileEditor.tsx` |
| Unique name on collision | `ProfileStore.cs` | ported | `core/store.ts` → `uniqueName` |
| Clear cache / cookies / site data / everything, live and closed | `ProfileData.cs` | ported | `ipc.ts` → `profiles:clear`, live path via `BrowserSession.clearStorage` |
| "Clear cache (143 MB)" size labels | `ProfileData.cs` | ported | `ipc.ts` → `folderSize`, UI `bytes()` |
| Export / import the store | `ProfileStore.cs` | ported | `ipc.ts` → `profiles:export` / `profiles:import` (passwords exported as ciphertext) |
| Data only under `%APPDATA%\JoeBrowser` | `AppPaths.cs` | ported | `core/paths.ts`, tested |

## 2. Fingerprint

| Feature | Original | Status | Here |
|---|---|---|---|
| Deterministic identity from a seed | `FingerprintFactory.cs` | ported | `core/fingerprint.ts`, tested |
| User agent, client hints, brands, GREASE | `FingerprintFactory.cs`, `BrowserVersions.cs` | ported | `core/ua.ts`, tested |
| Platform, languages, hardwareConcurrency, deviceMemory | `FingerprintScript.cs` | ported | `core/inject.ts` |
| Screen, availHeight, devicePixelRatio, colour depth | `FingerprintScript.cs` | ported | `core/inject.ts` |
| Timezone and locale agreement | `FingerprintScript.cs` | ported | `core/inject.ts`, `shared/zones.ts`, tested |
| WebGL vendor/renderer with real card pairs | `FingerprintFactory.cs` | ported | `core/fingerprint.ts` (GPU pools are real vendor/renderer pairs) |
| Canvas noise | `FingerprintScript.cs` | ported | `core/inject.ts` |
| Audio noise | `FingerprintScript.cs` | ported | `core/inject.ts` |
| Font set per OS | `FingerprintScript.cs` | ported | `core/fingerprint.ts` → `fontsFor` |
| WebRTC guard (off / proxy / public) | `FingerprintScript.cs` | ported | `core/inject.ts` |
| Battery, DoNotTrack, geolocation | `FingerprintScript.cs` | ported | `core/inject.ts` |
| Timing / hardware jitter | `FingerprintScript.cs` | ported | `core/inject.ts` |
| Automation marker cleanup (`cdc_`, webdriver, etc.) | `FingerprintScript.cs` | ported | `core/inject.ts` |
| Uniqueness across twelve surfaces, re-rolled | `FingerprintFactory.cs`, `FingerprintAudit.cs` | ported | `core/fingerprint.ts` → `rollUnique`, tested against 40 existing profiles |
| Clock/locale/coords follow the proxy country | `FingerprintFactory.cs` | ported | `core/fingerprint.ts` → `alignWithProxy`, tested |
| Machine's real GPU learned and reused | `BrowserSession.cs` | ported | `core/gpu.ts` → `learnMachineGpu`, read from a launched browser via `chrome://gpu` over CDP |
| Repair of stored profiles against the live GPU | `ProfileStore.cs` | ported | `ProfileEditor` and `BrowsersPage` offer the learned adapter as a value |
| Pre-release build reported as the newest release the checkers know | `BrowserVersions.cs` | ported | `core/ua.ts` → the version-to-UA mapping is the same table `ua.ts` builds client hints from |

## 3. Browser kernels

| Feature | Original | Status | Here |
|---|---|---|---|
| Catalog from the vendors' own release channels | `Kernels.cs` | ported | `core/catalog.ts` (Chrome for Testing + Mozilla product details, cached 6 h) |
| Download, unpack, install side by side | `Kernels.cs`, `Downloader.cs` | ported | `core/catalog.ts` → `downloadKernel` (HTTPS only, staged, atomic move) |
| Remove an installed build | `Kernels.cs` | ported | `core/catalog.ts` → `removeKernel` |
| Pin a profile to an exact build | `Kernels.cs` | ported | `Profile.kernelId`, resolved in `launcher.ts` |
| Detect browsers already on the PC | `BrowserLocator.cs` | ported | `core/catalog.ts` → `detectInstalledBrowsers` |
| Nothing downloads on launch | `Kernels.cs` | ported | Catalog read is cache-first; installs are explicit |
| Chrome reaches back eight majors | `Kernels.cs` | ported | `MAJORS_TO_KEEP = 8` |
| Brave and Edge downloadable builds | `Kernels.cs` | **partial** | Detected and usable; not downloadable — neither vendor publishes a portable archive. Honest gap rather than a fake link. |
| Chromium diversity per profile (every profile a different real version) | `KernelDiversity.cs` | ported | `ipc.ts` → `leastUsedKernel`, assigns the least-used installed build on create |
| Upgrade / repair flow for a known-bad kernel | `KernelsUi.cs` | ported | `BrowsersPage` re-downloads and removes a build; `catalog.ts` verifies the checksum on download |

## 4. Proxies

| Feature | Original | Status | Here |
|---|---|---|---|
| HTTP, HTTPS, SOCKS5 with authentication | `ProxyVault.cs` | ported | `core/proxy.ts`, tested |
| Local relay so a password never reaches a command line | `ProxyRelay.cs` | ported | `core/relay.ts` (SOCKS5 + HTTP CONNECT on one port), tested |
| Test a proxy and learn IP, country, city, timezone | `ProxyTester.cs` | ported | `core/proxy.ts` → `testProxy` |
| Paste formats sellers use | `ProxyPage.cs` | ported | `core/proxy.ts` → `parseProxyLine`, tested |
| Automatic timezone matching from the exit country | `ProxyTester.cs` | ported | `ProfileEditor.tsx` on a successful test |
| Fallback to direct when a proxy dies | `ProxyRelay.cs`, `BrowserSession.cs` | ported | `launcher.ts` pre-flight, `Profile.proxy.fallbackDirect` |
| Swap a running profile's proxy without closing tabs | `ProxyRelay.cs` | ported | `RelayHandle.setUpstream` + `BrowserSession.repointProxy`, Proxies → Swap now |
| Proxy watch: rotation, lost, back, offline alerts | `BrowserSession.cs` | ported | `launcher.ts` → `startProxyWatch`, two-failure rule, toasts |
| Encrypted credential store (DPAPI) | `ProxyVault.cs` | ported | `core/secrets.ts` (DPAPI via `safeStorage`, AES-GCM fallback), tested |
| Direct-connection comparison | `NetCheck.cs` | ported | `core/proxy.ts` → `testDirect`, Proxies page |

## 5. Page tools and extensions

| Feature | Original | Status | Here |
|---|---|---|---|
| Paste as human (Chromium, injected) | `FingerprintScript.cs`, `Extensions.cs` | ported | `core/inject.ts`, four speed profiles, plus a standalone MV3 extension |
| Right-click and selection restore | `FingerprintScript.cs` | ported | `core/inject.ts`, plus a standalone MV3 extension |
| Per-profile switches for both | `Models.cs`, `ToolsPage.cs` | ported | `ToolConfig`, Tools tab |
| First-party MV3 extensions written locally | `ExtensionCatalog.cs` | ported | `core/extensions.ts` — three MV3 extensions written on every launch, never fetched |
| HTTP Tracker Plus | `ExtensionCatalog.cs` | ported | `core/extensions.ts` → Joe Request Tracker (badge + request list, no permissions) |
| Custom extension folders | `Extensions.cs` | ported | `extensionDirectories()` validates each folder before it reaches the command line |
| Firefox sideloaded WebExtension | `Extensions.cs` | ported | `installFirefoxExtensions()` into the profile's `extensions/` folder |
| Master switch for extensions | `ToolsPage.cs` | ported | Enforced in `launcher.ts`: off means no `--load-extension` at all |

## 6. Checks, history, dialogs

| Feature | Original | Status | Here |
|---|---|---|---|
| Fingerprint check, surface by surface | `LeakTest.cs`, `LeakForm.cs` | ported | `core/leak.ts`, Profiles → Check fingerprint |
| One click to the six checker sites in the profile's session | `LeakForm.cs` | ported | `CHECK_SITES` in the shared contract, opened through CDP `Target.createTarget` |
| Fifteen-point in-session probe | `FingerprintAudit.cs` | ported | `core/leak.ts` → `liveLeakReport` compares **21** surfaces against a real page read over CDP (`launcher.ts` → `liveProbe`) |
| Per-profile browsing history | `HistoryStore.cs`, `HistoryPage.cs` | ported | `core/history.ts` (JSONL per profile, captured from CDP), History dialog |
| Report a bug dialog | `Report.cs` | ported | `ToolsPage` → `ReportModal`, `ipc.ts` → `app:report` (version, environment, log tail, copy, Telegram) |
| QR code | `QrCode.cs` | ported | `shared/qr.ts` (byte mode, EC L, versions 1–9), rendered as SVG; decoded back in the tests |
| Disk space | `DiskSpace.cs` | ported | `ipc.ts` → `app:stats`, Settings → Space used |

## 7. Accounts and session

| Feature | Original | Status | Here |
|---|---|---|---|
| Account gate: email + password, sign-in / create toggle | `AccountGate.cs`, `AccountPage.cs` | ported | `pages/AccountGate.tsx` + `core/accounts.ts`. Google sign-in is **not** a gap: the original removed it itself (`AccountGate.cs:82`, "Google sign-in has been removed by product decision") and the gate is email and password only. The port matches that exactly. |
| DPAPI session marker | `Session.cs` | ported (as DPAPI secret store) | `core/secrets.ts` |

## 8. Interface

| Feature | Original | Status | Here |
|---|---|---|---|
| Dark and light themes | `Theme.cs` | ported | `renderer/styles.css` |
| Layout that holds at every width | `Theme.cs`, `Controls.cs` | ported | CSS grid with measured breakpoints |
| Toasts | `MainForm.cs` | ported | `components/UI.tsx` |
| Profile cards with an avatar and chips | `ProfileCard.cs` | ported | `ProfilesPage.tsx` |
| Menus, focus, keyboard dismiss | `MainForm.cs` | ported | `Modal`, Escape handling |
| Six interface languages | `L10n.cs`, `LangPicker.cs` | **not yet** | 1 508 lines of string tables; the interface is English-only for now |
| System font stack instead of bundled fonts | `src/fonts/*` | **decided** | The original shipped three font files. This uses Segoe UI Variable, the Windows 11 shell font, so the app reads as native and the installer carries no font payload. The CSS previously named Inter, which was never bundled — a first choice that could not resolve. Removed. |

## 9. Build and release

| Feature | Original | Status | Here |
|---|---|---|---|
| NSIS installer, per user, no admin prompt | `build/setup.ps1` | ported | `electron-builder.yml` |
| Portable EXE | `build/build.ps1` | ported | `electron-builder.yml` |
| Fixed asset names for the README links | `release.yml` | ported | `JoeBrowserSetup.exe`, `JoeBrowser.exe` |
| Windows CI that builds and verifies before publishing | `release.yml` | ported | `.github/workflows/release.yml` (typecheck, test, build, size + version-resource checks) |
| App icon | `AppIcon.cs`, `make-icon.ps1` | ported | `build/icon.png` |
| Startup gate that refuses to run unpacked | `InstallGate.cs`, `Guarded.cs` | **not planned** | A gate that only restricts the user's own copy adds nothing |
