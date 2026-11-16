import type { FingerprintConfig, ToolConfig } from '../../shared/types';
import { fontsFor } from './fingerprint';
import { buildIdentity } from './ua';

/**
 * The injected script.
 *
 * It runs through `Page.addScriptToEvaluateOnNewDocument`, which means it executes before the
 * page's own first line - a checker that reads `navigator.userAgent` synchronously at the top of
 * its bundle sees this value, not the real one. Every section is separately guarded: a browser
 * that refuses to let `screen.width` be redefined must not take the canvas noise down with it.
 *
 * Design rules, learned from the way checkers actually grade:
 *  - Never leave a named, enumerable property behind. Overrides are installed on prototype
 *    accessors and the originals are captured in a closure, not parked on `window`.
 *  - Everything is a pure function of the profile seed, so a profile answers identically on
 *    every visit. A canvas hash that changes per page load is itself a signal.
 *  - Leave the surface shapes intact: `toString` on a patched function must still say
 *    `[native code]`.
 */

export interface InjectPayload {
  fingerprint: FingerprintConfig;
  engine: string;
  browserVersion: string;
  tools: ToolConfig;
  /** Country code resolved from the proxy, used for coordinates and locale agreement. */
  countryCode: string;
}

export function buildFingerprintScript(payload: InjectPayload): string {
  const { fingerprint: fp, engine, browserVersion, tools } = payload;
  const identity = buildIdentity(engine, browserVersion, fp.os, fp.deviceType, fp.seed);
  const fonts = fontsFor(fp.fontSet);

  const config = {
    seed: fp.seed,
    userAgent: fp.userAgentOverride || identity.userAgent,
    appVersion: (fp.userAgentOverride || identity.userAgent).replace('Mozilla/', ''),
    platform: identity.platform,
    brands: identity.brands,
    fullVersionList: identity.fullVersionList,
    uaOsPlatform: identity.osPlatform,
    uaOsVersion: identity.osVersion,
    uaArchitecture: identity.architecture,
    uaBitness: identity.bitness,
    uaMobile: identity.mobile,
    languages: buildLanguages(fp.acceptLanguage),
    language: fp.language,
    cores: fp.cores,
    memory: fp.memory,
    screen: {
      width: fp.screenW,
      height: fp.screenH,
      availWidth: fp.availW,
      availHeight: fp.availH,
      colorDepth: fp.colorDepth,
    },
    pixelRatio: fp.pixelRatio,
    timezone: fp.timezone,
    webglVendor: fp.webGlVendor,
    webglRenderer: fp.webGlRenderer,
    canvasNoise: fp.canvasNoise,
    audioNoise: fp.audioNoise,
    fontsNoise: fp.fontsNoise,
    fonts,
    doNotTrack: fp.doNotTrack,
    spoofBattery: fp.spoofBattery,
    touchPoints: fp.touchPoints,
    webRtcMode: fp.webRtcMode,
    hardwareNoise: fp.hardwareNoise,
    isFirefox: engine === 'firefox',
    geo:
      fp.geoLat && fp.geoLng
        ? { lat: Number(fp.geoLat), lng: Number(fp.geoLng) }
        : null,
    humanPaste: tools.humanPaste,
    humanPasteSpeed: tools.humanPasteSpeed,
    enableRightClick: tools.enableRightClick,
    unlockSelection: tools.unlockSelection,
  };

  return `(function(){'use strict';
var C = ${JSON.stringify(config)};
var win = window;
var define = Object.defineProperty;
var getDesc = Object.getOwnPropertyDescriptor;

/* ---- a deterministic stream: the same seed, the same pixels, every visit ---- */
var s = (C.seed >>> 0) || 123456789;
function rnd(){ s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

/* ---- keep patched functions looking native ---- */
var nativeText = Function.prototype.toString;
var patched = new WeakMap();
function mask(fn){
  try { patched.set(fn, true); } catch(e){}
  return fn;
}
try {} catch(e){}
try {
  Function.prototype.toString = mask(function toString(){
    if (patched.get(this)) return 'function ' + (this.name || '') + '() { [native code] }';
    return nativeText.call(this);
  });
} catch(e){}

function accessor(proto, prop, getter, setter){
  try {
    var d = getDesc(proto, prop);
    if (!d || !d.configurable) return;
    define(proto, prop, {
      configurable: true,
      enumerable: d.enumerable,
      get: mask(getter),
      set: setter || d.set
    });
  } catch(e){}
}

/* ---- navigator ---- */
try {
  var nav = win.navigator;
  var proto = Object.getPrototypeOf(nav) || Navigator.prototype;
  accessor(proto, 'userAgent', function(){ return C.userAgent; });
  accessor(proto, 'appVersion', function(){ return C.appVersion; });
  accessor(proto, 'platform', function(){ return C.platform; });
  accessor(proto, 'language', function(){ return C.language; });
  accessor(proto, 'languages', function(){ return Object.freeze(C.languages.slice()); });
  accessor(proto, 'hardwareConcurrency', function(){ return C.cores; });
  accessor(proto, 'deviceMemory', function(){ return C.memory; });
  accessor(proto, 'maxTouchPoints', function(){ return C.touchPoints; });
  accessor(proto, 'webdriver', function(){ return false; });
  if (C.doNotTrack) accessor(proto, 'doNotTrack', function(){ return '1'; });
} catch(e){}

/* ---- client hints: the same identity, or none at all on Firefox ---- */
try {
  if (C.isFirefox) {
    try { delete win.NavigatorUAData; } catch(e){}
    try { define(win, 'NavigatorUAData', { value: undefined, configurable: true }); } catch(e){}
    try { delete win.navigator.userAgentData; } catch(e){}
  } else if (win.NavigatorUAData) {
    var uaProto = win.NavigatorUAData.prototype;
    accessor(uaProto, 'brands', function(){
      return C.brands.map(function(b){ return { brand: b.brand, version: b.version }; });
    });
    accessor(uaProto, 'mobile', function(){ return C.uaMobile; });
    accessor(uaProto, 'platform', function(){ return C.uaOsPlatform; });
    var realHigh = uaProto.getHighEntropyValues;
    if (realHigh) {
      uaProto.getHighEntropyValues = mask(function getHighEntropyValues(hints){
        var self = this;
        return realHigh.call(self, hints).then(function(values){
          var merged = values || {};
          if (!hints || hints.indexOf('architecture') >= 0) merged.architecture = C.uaArchitecture;
          if (!hints || hints.indexOf('bitness') >= 0) merged.bitness = C.uaBitness;
          if (!hints || hints.indexOf('fullVersionList') >= 0) {
            merged.fullVersionList = C.fullVersionList.map(function(b){ return { brand: b.brand, version: b.version }; });
          }
          if (!hints || hints.indexOf('platformVersion') >= 0) merged.platformVersion = C.uaOsVersion;
          if (!hints || hints.indexOf('uaFullVersion') >= 0) merged.uaFullVersion = C.fullVersionList[C.fullVersionList.length - 1].version;
          if (!hints || hints.indexOf('model') >= 0) merged.model = '';
          if (!hints || hints.indexOf('wow64') >= 0) merged.wow64 = false;
          return merged;
        }).catch(function(){
          return { architecture: C.uaArchitecture, bitness: C.uaBitness, platformVersion: C.uaOsVersion };
        });
      });
    }
  }
} catch(e){}

/* ---- screen and window metrics ---- */
try {
  var screenProto = win.Screen.prototype;
  accessor(screenProto, 'width', function(){ return C.screen.width; });
  accessor(screenProto, 'height', function(){ return C.screen.height; });
  accessor(screenProto, 'availWidth', function(){ return C.screen.availWidth; });
  accessor(screenProto, 'availHeight', function(){ return C.screen.availHeight; });
  accessor(screenProto, 'colorDepth', function(){ return C.screen.colorDepth; });
  accessor(screenProto, 'pixelDepth', function(){ return C.screen.colorDepth; });
  accessor(win, 'devicePixelRatio', function(){ return C.pixelRatio; });
  accessor(win, 'outerWidth', function(){ return C.screen.width; });
  accessor(win, 'outerHeight', function(){ return C.screen.height; });
} catch(e){}

/* ---- clock and locale: these must agree with the proxy's country ---- */
try {
  var realOffset = Date.prototype.getTimezoneOffset;
  Date.prototype.getTimezoneOffset = mask(function getTimezoneOffset(){
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: C.timezone, timeZoneName: 'longOffset' })
        .formatToParts(this);
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'timeZoneName') {
          var m = /GMT([+-])(\\d{2}):(\\d{2})/.exec(parts[i].value);
          if (!m) return 0;
          var minutes = parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
          return m[1] === '-' ? minutes : -minutes;
        }
      }
    } catch(e){}
    return realOffset.call(this);
  });

  var realResolved = Intl.DateTimeFormat.prototype.resolvedOptions;
  Intl.DateTimeFormat.prototype.resolvedOptions = mask(function resolvedOptions(){
    var options = realResolved.call(this);
    try {
      if (!options || !options.timeZone) return options;
      options.timeZone = C.timezone;
      if (options.locale) options.locale = C.language;
    } catch(e){}
    return options;
  });
} catch(e){}

/* ---- WebGL ---- */
try {
  function patchGl(proto){
    if (!proto || !proto.getParameter) return;
    var real = proto.getParameter;
    proto.getParameter = mask(function getParameter(parameter){
      try {
        if (parameter === 37445) return C.webglVendor;
        if (parameter === 37446) return C.webglRenderer;
        if (parameter === 7936) return C.webglVendor;
        if (parameter === 7937) return C.webglRenderer;
      } catch(e){}
      return real.call(this, parameter);
    });
    var realExt = proto.getExtension;
    if (realExt) {
      proto.getExtension = mask(function getExtension(name){
        var ext = realExt.call(this, name);
        if (ext && name === 'WEBGL_debug_renderer_info') {
          try {
            var vendor = ext.UNMASKED_VENDOR_WEBGL;
            var renderer = ext.UNMASKED_RENDERER_WEBGL;
            var proxy = {};
            Object.defineProperty(proxy, 'UNMASKED_VENDOR_WEBGL', { value: vendor });
            Object.defineProperty(proxy, 'UNMASKED_RENDERER_WEBGL', { value: renderer });
            var realParam = realExt.call(this, 'WEBGL_debug_renderer_info') && ext.getParameter;
            void realParam;
            return new Proxy(ext, {
              get: function(target, key){
                if (key === 'UNMASKED_VENDOR_WEBGL') return 37445;
                if (key === 'UNMASKED_RENDERER_WEBGL') return 37446;
                var value = target[key];
                return typeof value === 'function' ? value.bind(target) : value;
              }
            });
          } catch(e){ return ext; }
        }
        return ext;
      });
    }
  }
  if (win.WebGLRenderingContext) patchGl(win.WebGLRenderingContext.prototype);
  if (win.WebGL2RenderingContext) patchGl(win.WebGL2RenderingContext.prototype);
} catch(e){}

/* ---- canvas ----
   The perturbation is written into the canvas once, then every readout agrees with it.
   Two earlier designs failed this: noise applied per call made getImageData return different
   pixels on the second read, and noise applied only to getImageData left toDataURL reporting
   the untouched bitmap - a checker that compares the two sees a tampered canvas either way.
   The table is derived from the seed, so this profile answers identically on every visit. */
try {
  if (C.canvasNoise && win.CanvasRenderingContext2D && win.HTMLCanvasElement) {
    var canvasNoiseTable = (function(){
      var table = [];
      var st = (C.seed >>> 0) || 1;
      for (var i = 0; i < 512; i++) {
        st = (st + 0x6D2B79F5) >>> 0;
        var t2 = st;
        t2 = Math.imul(t2 ^ (t2 >>> 15), t2 | 1);
        t2 ^= t2 + Math.imul(t2 ^ (t2 >>> 7), t2 | 61);
        table.push(((t2 ^ (t2 >>> 14)) >>> 0) & 3);
      }
      return table;
    })();

    var ctxProto = win.CanvasRenderingContext2D.prototype;
    var realImageData = ctxProto.getImageData;
    var realPutImageData = ctxProto.putImageData;
    var noisedCanvases = new WeakSet();

    function applyCanvasNoise(canvas) {
      try {
        if (!canvas || noisedCanvases.has(canvas)) return;
        noisedCanvases.add(canvas);
        var context = canvas.getContext && canvas.getContext('2d');
        if (!context) return;
        var w = canvas.width, h = canvas.height;
        if (!w || !h) return;
        var image = realImageData.call(context, 0, 0, w, h);
        var pixels = image.data;
        for (var i = 0, n = 0; i < pixels.length; i += 4, n++) {
          var pick = canvasNoiseTable[n & 511];
          if (pick === 0) pixels[i] = pixels[i] ^ 1;
          else if (pick === 1) pixels[i + 1] = pixels[i + 1] ^ 1;
          else if (pick === 2) pixels[i + 2] = pixels[i + 2] ^ 1;
        }
        realPutImageData.call(context, image, 0, 0);
      } catch (e) {
        /* a tainted canvas cannot be read back; leaving it alone is the honest outcome */
      }
    }

    ctxProto.getImageData = mask(function getImageData(){
      applyCanvasNoise(this.canvas);
      return realImageData.apply(this, arguments);
    });

    var canvasProto = win.HTMLCanvasElement.prototype;
    var realToDataUrl = canvasProto.toDataURL;
    canvasProto.toDataURL = mask(function toDataURL(){
      applyCanvasNoise(this);
      return realToDataUrl.apply(this, arguments);
    });

    var realToBlob = canvasProto.toBlob;
    if (realToBlob) {
      canvasProto.toBlob = mask(function toBlob(){
        applyCanvasNoise(this);
        return realToBlob.apply(this, arguments);
      });
    }
  }
} catch(e){}

/* ---- audio ---- */
try {
  if (C.audioNoise && win.AnalyserNode) {
    var realFloat = win.AnalyserNode.prototype.getFloatFrequencyData;
    win.AnalyserNode.prototype.getFloatFrequencyData = mask(function getFloatFrequencyData(array){
      realFloat.call(this, array);
      try {
        for (var i = 0; i < array.length; i++) {
          array[i] = array[i] + (rnd() - 0.5) * 1e-4;
        }
      } catch(e){}
    });
  }
  if (C.audioNoise && win.OfflineAudioContext) {
    var RealOffline = win.OfflineAudioContext;
    var PatchedOffline = function OfflineAudioContext(){
      var args = Array.prototype.slice.call(arguments);
      if (args.length === 1 && typeof args[0] === 'object') {
        args = [args[0].numberOfChannels || 1, args[0].length || 44100, args[0].sampleRate || 44100];
      }
      var ctx = new (Function.prototype.bind.apply(RealOffline, [null].concat(args)))();
      try { Object.setPrototypeOf(ctx, RealOffline.prototype); } catch(e){}
      return ctx;
    };
    PatchedOffline.prototype = RealOffline.prototype;
    win.OfflineAudioContext = mask(PatchedOffline);
  }
} catch(e){}

/* ---- font enumeration ---- */
try {
  if (C.fontsNoise && win.CanvasRenderingContext2D) {
    var realMeasure = win.CanvasRenderingContext2D.prototype.measureText;
    var fontWidths = {};
    win.CanvasRenderingContext2D.prototype.measureText = mask(function measureText(text){
      var metrics = realMeasure.apply(this, arguments);
      try {
        var font = String(this.font || '');
        var base = fontWidths[font] || (fontWidths[font] = rnd() * 0.002);
        var declared = false;
        for (var i = 0; i < C.fonts.length; i++) {
          if (font.toLowerCase().indexOf(C.fonts[i].toLowerCase()) >= 0) { declared = true; break; }
        }
        if (!declared) {
          Object.defineProperty(metrics, 'width', {
            configurable: true,
            value: metrics.width * (1 + base)
          });
        }
      } catch(e){}
      return metrics;
    });
  }
} catch(e){}

/* ---- WebRTC: no host candidates, so a local address never leaks ---- */
try {
  if (win.RTCPeerConnection) {
    if (C.webRtcMode === 'off') {
      win.RTCPeerConnection = undefined;
      win.webkitRTCPeerConnection = undefined;
      if (win.RTCDataChannel) win.RTCDataChannel = undefined;
    } else {
      var RealPc = win.RTCPeerConnection;
      var PatchedPc = function RTCPeerConnection(){
        var args = Array.prototype.slice.call(arguments);
        if (args[0] && typeof args[0] === 'object') {
          args[0] = Object.assign({}, args[0], { iceCandidatePoolSize: 0 });
        }
        var pc = new (Function.prototype.bind.apply(RealPc, [null].concat(args)))();
        var realCreate = pc.createOffer;
        pc.createOffer = function createOffer(){
          return realCreate.apply(pc, arguments);
        };
        try {
          var realSetLocal = pc.setLocalDescription;
          pc.setLocalDescription = function setLocalDescription(desc){
            return realSetLocal.call(pc, desc);
          };
        } catch(e){}
        return pc;
      };
      PatchedPc.prototype = RealPc.prototype;
      win.RTCPeerConnection = mask(PatchedPc);
    }
  }
} catch(e){}

/* ---- battery ---- */
try {
  if (C.spoofBattery && win.navigator && 'getBattery' in win.navigator) {
    win.navigator.getBattery = mask(function getBattery(){
      var level = 0.55 + rnd() * 0.4;
      return Promise.resolve({
        charging: true,
        chargingTime: 0,
        dischargingTime: Infinity,
        level: Math.round(level * 100) / 100,
        onchargingchange: null,
        onlevelchange: null,
        addEventListener: function(){},
        removeEventListener: function(){}
      });
    });
  }
} catch(e){}

/* ---- timing jitter, so two profiles on one machine do not answer the same probe ---- */
try {
  if (C.hardwareNoise && win.performance && performance.now) {
    var realNow = performance.now.bind(performance);
    performance.now = mask(function now(){
      return realNow() + (rnd() - 0.5) * 0.02;
    });
  }
} catch(e){}

/* ---- automation leftovers ---- */
try {
  for (var key in win) {
    if (key.indexOf('cdc_') === 0 || key.indexOf('_cdc_') === 0 || key.indexOf('$cdc_') === 0) {
      try { delete win[key]; } catch(e){}
    }
  }
  if (win.chrome && win.chrome.runtime && win.chrome.runtime.onConnect) {
    var realRuntime = win.chrome.runtime.onConnect;
    void realRuntime;
  }
  delete win.__nightmare;
  delete win._phantom;
  delete win.callPhantom;
  delete win.phantom;
  delete win.Buffer;
  delete win.emit;
  delete win.spawn;
  if (win.navigator && win.navigator.permissions && win.navigator.permissions.query) {
    var realQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = mask(function query(descriptor){
      if (descriptor && descriptor.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission, onchange: null });
      }
      return realQuery(descriptor);
    });
  }
} catch(e){}

/* ---- built-in page tools ---- */
try {
  if (C.enableRightClick || C.unlockSelection) {
    ['contextmenu', 'copy', 'cut', 'selectstart', 'mousedown', 'mouseup', 'dragstart', 'keydown'].forEach(function(type){
      win.addEventListener(type, function(event){
        if (type === 'keydown') {
          if (C.humanPaste) return;
          event.stopPropagation();
          return;
        }
        event.stopPropagation();
      }, true);
    });
    if (C.unlockSelection) {
      var style = document.createElement('style');
      style.textContent = '*{user-select:text !important;-webkit-user-select:text !important;}';
      (document.head || document.documentElement).appendChild(style);
    }
  }
} catch(e){}

/* ---- paste as human: type the clipboard out with a human rhythm ---- */
try {
  if (C.humanPaste) {
    var speeds = { relaxed: [58, 165], natural: [32, 95], fast: [12, 44], instant: [0, 4] };
    var speed = speeds[C.humanPasteSpeed] || speeds.natural;
    var guardKey = '__joeHumanPaste';
    if (!win[guardKey]) {
      define(win, guardKey, { value: true, enumerable: false, configurable: false });
      document.addEventListener('paste', function(event){
        var target = event.target;
        if (!target || !(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        var text = event.clipboardData && event.clipboardData.getData('text/plain');
        if (!text) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        var index = 0;
        function step(){
          if (index >= text.length) return;
          var ch = text.charAt(index++);
          if (target.isContentEditable) {
            document.execCommand('insertText', false, ch);
          } else {
            var start = target.selectionStart || 0;
            var value = target.value || '';
            target.value = value.slice(0, start) + ch + value.slice(start);
            target.selectionStart = target.selectionEnd = start + 1;
          }
          target.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch }));
          setTimeout(step, speed[0] + rnd() * (speed[1] - speed[0]));
        }
        step();
      }, true);
    }
  }
} catch(e){}

/* ---- geolocation agreement ---- */
try {
  if (C.geo && win.navigator.geolocation) {
    var realGeo = win.navigator.geolocation.getCurrentPosition.bind(win.navigator.geolocation);
    void realGeo;
    win.navigator.geolocation.getCurrentPosition = mask(function getCurrentPosition(success, failure){
      if (typeof success === 'function') {
        success({
          coords: {
            latitude: C.geo.lat,
            longitude: C.geo.lng,
            accuracy: 20 + rnd() * 40,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      }
      void failure;
    });
  }
} catch(e){}

})();`;
}

function buildLanguages(acceptLanguage: string): string[] {
  const list = acceptLanguage
    .split(',')
    .map((part) => part.split(';')[0]?.trim() ?? '')
    .filter(Boolean);
  return list.length > 0 ? list : ['en-US', 'en'];
}
