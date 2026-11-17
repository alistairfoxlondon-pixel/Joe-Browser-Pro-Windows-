# Changelog

## 2.1.1

- Clarify that Setup is the installer and the other executable is portable.
- Add a license page and language selection to assisted setup; explicitly allow elevation for
  all-users installs and retain destination selection, shortcuts, uninstall and finish/launch.
- Simplify registration/sign-in screens and improve their vertical spacing.
- State clearly that local registration needs no email verification; no cloud auth is used.
- Await the registration-to-workspace transition so IPC failures stay visible in the form.
- Retry the full startup sequence after initialization failures instead of retrying only profiles.
- Add an actionable render-error recovery screen rather than leaving a blank window.
- Test first registration with an empty workspace and reopening a remembered account.
- Gate publishing on a real installed-Windows registration/restart/navigation/uninstall smoke test.
