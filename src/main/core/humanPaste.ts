import fs from 'node:fs';
import path from 'node:path';
import { Paths } from './paths';

/** Create a small local extension: the browser owns the context menu, and the clipboard is only
 * read after the user selects the menu item. Synthetic input is not a trusted native keystroke. */
export function ensureHumanPasteExtension(speedName: string): string {
  const speeds: Record<string, [number, number]> = { relaxed: [58, 165], natural: [32, 95], fast: [12, 44], instant: [0, 4] };
  const [min, max] = speeds[speedName] ?? speeds.natural!;
  const folder = path.join(Paths.extensions, 'human-paste', `${min}-${max}`);
  fs.mkdirSync(folder, { recursive: true });
  const manifest = {
    manifest_version: 3,
    name: 'Paste as Human', version: '1.0.0',
    permissions: ['contextMenus', 'activeTab', 'scripting', 'clipboardRead', 'offscreen'],
    background: { service_worker: 'worker.js' },
  };
  const worker = `
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'human-paste', title: 'Paste as Human', contexts: ['editable'] });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'human-paste' || !tab.id) return;
  try {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({ url: 'clipboard.html', reasons: ['CLIPBOARD'], justification: 'Read the clipboard when Paste as Human is selected.' });
    }
    const response = await chrome.runtime.sendMessage({ action: 'read-clipboard' });
    const text = response && response.text;
    if (!text || text.length > 20000) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [info.frameId || 0] }, args: [text, ${min}, ${max}], func: typeText });
  } catch (error) { console.error('Paste as Human failed:', error); }
});
function typeText(text, min, max) {
  const target = document.activeElement;
  if (!target || target.disabled || target.readOnly) return;
  const isInput = target.tagName === 'INPUT' && ['text', 'search', 'url', 'tel', 'password'].includes((target.type || 'text').toLowerCase());
  const isTextArea = target.tagName === 'TEXTAREA';
  if (!isInput && !isTextArea && !target.isContentEditable) return;
  const chars = Array.from(text); let index = 0;
  function step() {
    if (index >= chars.length || !target.isConnected || document.activeElement !== target) return;
    const ch = chars[index++];
    if (target.isContentEditable) {
      if (!document.execCommand('insertText', false, ch)) return;
    } else {
      const start = target.selectionStart == null ? target.value.length : target.selectionStart;
      const end = target.selectionEnd == null ? start : target.selectionEnd;
      const prototype = isTextArea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(target, target.value.slice(0, start) + ch + target.value.slice(end));
      target.setSelectionRange(start + ch.length, start + ch.length);
      target.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
    }
    if (index < chars.length) setTimeout(step, min + Math.random() * (max - min));
  }
  step();
}
`;
  const clipboard = `chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.action !== 'read-clipboard') return;
  navigator.clipboard.readText().then(text => respond({ text }), () => respond({ text: '' }));
  return true;
});`;
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(folder, 'worker.js'), worker);
  fs.writeFileSync(path.join(folder, 'clipboard.html'), '<!doctype html><script src="clipboard.js"></script>');
  fs.writeFileSync(path.join(folder, 'clipboard.js'), clipboard);
  return folder;
}
