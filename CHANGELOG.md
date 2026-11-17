# Changelog

## 2.2.0

- Add Joe Browser accounts with cloud sign-in and registration (7-day trial on the first sign-in),
  backed by the project's licensing service. The workspace is reachable without an account - the
  free plan keeps one profile - and the choice is remembered like the theme.
- Add subscription management: tier chip in the title bar, a subscription card in Settings with the
  validity date, license-key activation (monthly, yearly, trial or custom-length keys), an inline
  "start 7-day trial" action, and sign-out that returns to the gate.
- Enforce the free plan's one-profile ceiling at the point of creation (new profile, batch create
  and the new-profile shortcut) with an activation prompt.
- Add an admin panel for the project administrator: headline stats, license-key generator in bulk,
  outstanding-key list with revoke, per-account search, +31-day/+1-year extension, exact expiry
  editing and blocking, all through the administrator-guarded RPCs.
- Restore the idle auto-lock: after the configured minutes without input the window locks behind
  the local identity's PIN and (when configured) authenticator code, with the only way through
  being the unlock form.
- Replace the gate for entering the app with the account screen; the local device lock moves into
  Settings → Security and no longer doubles as the onboarding step.
- Switch the interface to Telenor (Fira Sans fallback) with flat, gradient-free styling, Material
  icons, a rebuilt brand mark, full-width content, and a dark/light theme toggle in the title bar.
- Production builds: the Content-Security-Policy now permits the licensing origin for account and
  entitlement reads only; the packaged app ships the logo assets correctly.
- React 19 for the Material UI v9 renderer.
- Hardening: cloud session restore cannot crash the window, offline entitlement is anchored to the
  server's clock, and all renderer network access is limited to the licensing origin.

## 2.1.1

- Clarify that Setup is the installer and the other executable is portable.
- Add a license page and language selection to assisted setup; explicitly allow elevation for
  all-users installs and retain destination selection, shortcuts, uninstall and finish/launch.
- Simplify registration/sign-in screens and improve their vertical spacing.
- State clearly that local registration needs no email verification; no cloud auth is used.
- Fix a desktop-only Extensions page crash: expose the event subscription on the real preload
  bridge as promised by its interface; test the built preload API, not only source patterns.
- Await the registration-to-workspace transition so IPC failures stay visible in the form.
- Retry the full startup sequence after initialization failures instead of retrying only profiles.
- Add an actionable render-error recovery screen rather than leaving a blank window.
- Test first registration with an empty workspace and reopening a remembered account.
- Gate publishing on a real installed-Windows registration/restart/navigation/uninstall smoke test.
