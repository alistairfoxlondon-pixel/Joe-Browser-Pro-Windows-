// Chrome Web Store listing logos, provided by the publishers via the official listings.
export const INCLUDED_EXTENSIONS = [
  { id: 'fklakbbaaknbgcedidhblbnhclijnhbi', name: 'HTTP Tracker', url: 'https://chromewebstore.google.com/detail/http-tracker/fklakbbaaknbgcedidhblbnhclijnhbi', icon: './brand/http-tracker.png' },
  { id: 'okaeekdeohehbdanbbohcfhhlblcmjkm', name: 'Absolute Enable Right Click & Copy', url: 'https://chromewebstore.google.com/detail/absolute-enable-right-cli/okaeekdeohehbdanbbohcfhhlblcmjkm', icon: './brand/absolute-right-click.png' },
];

export const RECOMMENDED_EXTENSIONS = [
  { name: 'uBlock Origin Lite', url: 'https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh', icon: './brand/ublock-origin-lite.png' },
  { name: 'Bitwarden', url: 'https://chromewebstore.google.com/detail/bitwarden-free-password-m/nngceckbapebfimnlniiiahkandclblb', icon: './brand/bitwarden.png' },
  { name: 'Dark Reader', url: 'https://chromewebstore.google.com/detail/dark-reader/eimadpbcbfnmbkopoojfekhnkhdbieeh', icon: './brand/dark-reader.png' },
  { name: 'Cookie-Editor', url: 'https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm', icon: './brand/cookie-editor.png' },
  { name: 'Wappalyzer', url: 'https://chromewebstore.google.com/detail/wappalyzer-technology-pro/gppongmhjkpfnbhagpmjfkannfbllamg', icon: './brand/wappalyzer.png' },
  { name: 'Google Translate', url: 'https://chromewebstore.google.com/detail/google-translate/aapbdbdomjkkjkaonfhkkikfgjllcleb', icon: './brand/google-translate.png' },
  { name: 'Clear Cache', url: 'https://chromewebstore.google.com/detail/clear-cache/cppjkneekbjaeellbfkmgnhonkkjfpdn', icon: './brand/clear-cache.png' },
  { name: 'JSONVue', url: 'https://chromewebstore.google.com/detail/jsonvue/chklaanhfefbnpoihckbnefhakgolnmc', icon: './brand/jsonvue.png' },
  { name: 'WebRTC Leak Prevent', url: 'https://chromewebstore.google.com/detail/webrtc-leak-prevent/eiadekoaikejlgdbkbdfeijglgfdalml', icon: './brand/webrtc-leak-prevent.png' },
  { name: 'Privacy Badger', url: 'https://chromewebstore.google.com/detail/privacy-badger/pkehgijcmpdhfbdbbnkijodmdjhbjlgp', icon: './brand/privacy-badger.png' },
].map((entry) => ({ ...entry, description: '' }));
