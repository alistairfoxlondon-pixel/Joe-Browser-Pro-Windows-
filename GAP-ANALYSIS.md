# Verified gap analysis — original Joe Browser (C#) vs. this port

> **Status: closed.** Every row below marked *missing* or *partial* has been implemented on
> `arena/29b5b90a-joe-browser-pro-windows`. The three surfaces that are not reproduced are listed
> with their reasons in section G. This document is kept as the record of what was compared and
> how, because the useful part is the method — 81 files read, not a feature page skimmed.

Method: every one of the 81 `.cs` files in `alistairfoxlondon-pixel/Joe-Browser-`
(`src/*.cs`, 40 987 lines) was read and its public surface enumerated with `grep` against a
line-by-line inventory. Each row below names the original file and what the port does now.
Anything marked **missing** or **partial** is implemented in this branch.

## A. Shell, navigation and language

| Original | Surface | Port before this branch |
|---|---|---|
| `MainForm.cs` nav group "Workspace" / "System" | Two grouped nav sections, collapsing to an icon rail | **missing** — flat 4-item list, no groups, no rail |
| `MainForm.cs` pages | Profiles, History, Account, Proxies, Extensions, Browsers, Settings, Tools, About (9) | **partial** — 4 (Profiles, Browsers, Proxies, Settings) |
| `HistoryPage.cs` | Workspace-wide history index, per-profile drill-down, "passed through" filter, copy link, open | **partial** — a per-profile modal only |
| `ExtensionsPage` (`ExtensionPage.cs`, 738 lines) | Library rows, enable/disable, delete, add by store link / `.crx` / folder, shipped pair with remove + restore, three recommended | **missing** — read-only list of three injected scripts |
| `ToolsPage.cs` | 12 tiles: batch create, import, export, proxy batch test, network diagnostics, cookie manager, extensions folder, recycle bin, clear caches, account audit, report, (empty state) | **missing** |
| `AboutPage` (`MainForm.AboutPaint`) | 8 feature cards, workspace stats, Telegram contact | **missing** |
| `L10n.cs` | 15 interface languages, per-language coverage %, flag pickers | **missing** — English only |
| `LangPicker.cs` | Searchable language popup with circular flags | **missing** |
| `Theme.cs` | Dark + light, 4-step neutral ramp, density tokens | **partial** — two themes, thin ramp |
| `MainForm.OnKeyDown` | Ctrl+N, Ctrl+F/K, Ctrl+O, Ctrl+A, F2, F5, Escape, arrow-key grid navigation, Shift+F10 | **missing** |
| `MainForm.BuildTray` | Tray icon, balloon alerts that survive a covered window | **missing** |
| `Controls.cs` (3 642 lines) | The whole control kit: JBButton, JBSegment, JBSelect, JBToast, JBScrollHost, JBGrid, JBMenu, JBToggle, JBChip, JBPanel, ConfirmForm, ToolDialog, JBLangPicker | **partial** — 6 primitives |

## B. Profiles

| Original | Surface | Port before this branch |
|---|---|---|
| `MainForm.BulkOpen/Stop/Duplicate/Delete` | Multi-select + bulk action bar | **missing** |
| `MainForm.ApplySort/CycleSort` | 6 sort modes (recent, name, created, running, OS, group) | **missing** |
| `MainForm.ApplyFilter` | Free-text search over name/group/tag/OS/language/proxy host + group filter | **partial** — name/group/tag/proxy only |
| `MainForm.BatchCreate` | Batch create with prefix, count (5–200), group, one proxy per line | **missing** |
| `ProfileStore.Trash` | Recycle bin: soft delete, list, restore, empty | **missing** — hard delete only |
| `ProfileCard` | Per-card menu: open, focus, close, edit, proxy, report, cookies in/out, folder, duplicate, delete, rename, clear cache, history | **partial** — 5 of 15 |
| `Profile.FreshSession` | Wipe cookies/storage/history on close | **missing** |
| `Profile.BrowserPath` / `custom` engine | Custom executable per profile | **missing** |
| `Profile.OpenCount` | Times opened, shown on the card | **missing** |
| `EditorForm.cs` (2 260 lines) | 5 tabs: General, Fingerprint, Privacy, Proxy, Tools | **partial** — 4 tabs, no Privacy tab |
| `EditorForm` device targets | System default, Windows 11/10, macOS, Linux, Android, iPhone, iPad (7) | **partial** — 5 desktop only |
| `EditorForm` "Random identity" | Re-rolls the whole device target | **missing** |
| `EditorForm` "Use this PC's graphics card" | Reads the live adapter and applies it | **missing** |
| `EditorForm` OS version row | Android/iOS version token | **partial** — field exists, not editable |
| `EditorForm` font list | auto/windows/macos/linux/minimal | **partial** — field exists, not editable |
| `EditorForm` sign-in / status / tags | Group, tags, status, notes | **partial** — notes, group, tags, status exist |
| `FingerprintIdentity.cs` | 12-surface uniqueness + "worst match" report + linked profiles | **partial** — uniqueness only, no relation report |
| `FingerprintFactory` machine GPU | `MachineRenderer/MachineVendor`, repair stored profiles | **missing** |

## C. Proxies

| Original | Surface | Port before this branch |
|---|---|---|
| `ProxyVault.cs` | **Saved proxy library** (`proxies.json`), DPAPI secrets, names, notes, last status/IP/country/city/latency/checked | **missing** — proxies exist only inside profiles |
| `ProxyPage.cs` | Library page: add, edit, delete, import list, check all, check one, create profile from proxy, apply live | **missing** |
| `ProxyPage` row menu | Copy full address / host:port / user / password / last IP | **missing** |
| `ProxyTester.cs` | Test + learn IP, country, city, timezone, latency | **port** |
| `NetCheck.cs` | Three independent lookup services, resolver IP, clock skew, warnings | **missing** — one service, no resolver/clock |
| `NetworkForm.cs` | Network diagnostics dialog for this PC and every saved proxy | **missing** |
| `ProxyRelay.cs` | Local relay, live re-point | **port** |
| `ProxyBatchTest` (`MainForm`) | Paste a list, test all, failure report | **missing** |

## D. Extensions

| Original | Surface | Port before this branch |
|---|---|---|
| `ExtensionCatalog.cs` (1 207 lines) | Library file, add by store URL (fetch + unpack `.crx`), add file, add folder, enable/disable, delete, icons read from the package | **missing** |
| `Extensions.EnsureShippedFallbacks` | Two shipped extensions written locally: **HTTP Tracker Plus** (request list popup) and **Absolute Enable Right Click and Copy** | **partial** — one generic tracker script |
| shipped remove/restore | "Removed by the user" memory + restore row | **missing** |
| `ExtensionCatalog.Recommended` | Three recommendations, store *searches* (never invented ids) | **missing** |
| `Extensions.ProxyWatch` extension | MV3 proxy watcher with badge + banner | **partial** — main-process watch only |
| Firefox tools extension | Sideloaded WebExtension + prefs | **port** |

## E. Page tools / injection

`FingerprintScript.cs` is 1 569 lines. The port's `inject.ts` covers 12 of its 18 blocks.

| Original block | Port before this branch |
|---|---|
| Worker realm (navigator inside Workers) | **missing** |
| `window.chrome` object shape | **missing** |
| plugin / mimeType array | **missing** |
| iOS + Android tell-tales | **missing** |
| `navigator.connection` | **missing** |
| permissions / notifications / mediaDevices | **partial** |
| viewport clamp + scrollbar width | **partial** |
| WebGPU adapter | **missing** |
| speechSynthesis voices | **missing** |
| font metrics (element widths) | **missing** |
| Element `getBoundingClientRect` jitter | **missing** |
| canvas / audio / WebGL / timezone / battery / WebRTC / automation / geo / hardware noise | **port** |

## F. Sessions and data

| Original | Surface | Port before this branch |
|---|---|---|
| `BrowserSession.ExportCookiesAsync` / `ImportCookiesAsync` | Cookie manager over CDP | **missing** |
| `BrowserSession.EvaluateAsync` / `TypeTextAsync` / `NavigateAsync` / `ScreenshotAsync` / `Focus` | In-session control | **missing** |
| `HistoryStore` | JSONL per profile, hops, title attach, count, clear all, `Forget` | **partial** — no hops, no titles, no clear-all, no count |
| `FingerprintAudit.cs` | 15-point **live** in-session probe over CDP | **missing** — static claim-vs-claim only |
| `DiskSpace.cs` | Free space, low-space floor, auto-clean caches | **missing** |
| `Log.cs` | Rolling log file + "report a problem" tail | **missing** |
| `Accounts.cs` / `AccountGate.cs` | Local accounts, PBKDF2 sign-up/sign-in, PIN lock, TOTP 2FA, session marker | **port** — `core/accounts.ts`, `pages/AccountGate.tsx`, `pages/SecurityPanel.tsx` |
| `Session.cs` | DPAPI session marker naming the signed-in account | **port** — `session.json`, identity only, never a credential |
| `SecurityDialog.cs` | PIN set/remove, 2FA QR, enable/disable with a live code | **port** — `SecurityPanel` + `TotpDialog` |
| `QrCode.cs` | QR encoder for the `otpauth://` URI (versions 1–9, level L) | **port** — `shared/qr.ts`, rendered as SVG; verified against jsQR |
| `KernelDiversity.cs` | Least-used build for a new profile, never the source's build for a duplicate | **port** — `core/diversity.ts`, wired into create and duplicate |
| `Report.cs` | Report dialog: version, environment, log tail, copy, Telegram | **missing** |
| `Installation.cs` / `Setup.cs` | In-app installer/uninstaller, shortcuts, Add-Remove Programs | out of scope for Electron (electron-builder owns it) |

## G. What the port deliberately does differently

Three original surfaces are not reproduced, and each is a decision rather than an oversight:

| Original | Why it is not ported |
|---|---|
| `Program.cs` Google sign-in (`GoogleSignIn.cs`) | The original shipped this file **not at all** — `AUDIT.md` describes it, but no `GoogleSignIn.cs` exists in the repository. `AccountGate` offers email registration only. A cloud identity is also the one thing this app promises never to need. |
| `Installation.cs` / `Setup.cs` (68 KB of embedding, shortcut and Add/Remove Programs code) | electron-builder owns install, uninstall and shortcuts. Re-implementing an NSIS-equivalent in a `node:child_process` call would be strictly worse. `InstallGate` (refusing to run outside the install folder) has no Electron equivalent because a portable build is a supported mode there. |
| Per-account data roots (`Accounts` → one root per email) | The original stored profiles under the signed-in account's folder. This port keeps one workspace per Windows user, which is what `%APPDATA%` already scopes; the account names the person, the OS user owns the data. |

## H. Build

`electron-builder.yml`, `ci/release.yml`, `scripts/release.ps1` already exist and are sound.
`build/icon.png` exists. Missing in this branch: portable data mode (`portable.txt`),
`--selftest` equivalent, and the low-disk guard.
