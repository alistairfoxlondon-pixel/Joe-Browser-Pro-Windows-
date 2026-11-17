import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildHumanPasteScript } from '../src/main/core/humanPaste';

function setup(enabled = true) {
  const dom = new JSDOM('<!doctype html><input id="field"><input id="readonly" readonly><input id="email" type="email">', { runScripts: 'outside-only' });
  dom.window.eval(buildHumanPasteScript(enabled, 'instant'));
  return dom;
}
function paste(win: JSDOM['window'], target: Element, text: string): Event {
  const event = new win.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  target.dispatchEvent(event);
  return event as unknown as Event;
}

test('optional app-injected paste replaces selections and preserves unicode', async () => {
  const dom = setup();
  const field = dom.window.document.querySelector<HTMLInputElement>('#field')!;
  field.value = 'Hello world'; field.focus(); field.setSelectionRange(6, 11);
  const values: string[] = [];
  field.addEventListener('input', () => values.push(field.value));
  const event = paste(dom.window, field, 'hi🙂');
  assert.equal(event.defaultPrevented, true);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(field.value, 'Hello hi🙂');
  assert.equal(values.length, 3);
  dom.window.close();
});

test('normal paste is not intercepted when disabled, unsupported, read-only or too large', () => {
  const dom = setup();
  const readonly = dom.window.document.querySelector<HTMLInputElement>('#readonly')!;
  const email = dom.window.document.querySelector<HTMLInputElement>('#email')!;
  const field = dom.window.document.querySelector<HTMLInputElement>('#field')!;
  assert.equal(paste(dom.window, readonly, 'abc').defaultPrevented, false);
  assert.equal(paste(dom.window, email, 'abc').defaultPrevented, false);
  assert.equal(paste(dom.window, field, 'a'.repeat(20001)).defaultPrevented, false);
  dom.window.close();
  const disabled = setup(false);
  assert.equal(paste(disabled.window, disabled.window.document.querySelector('#field')!, 'abc').defaultPrevented, false);
  disabled.window.close();
});
