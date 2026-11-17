/** Application-injected paste helper for Chromium profiles. It never reads the clipboard until
 * the user invokes the browser's ordinary paste command. Synthetic input events are not trusted
 * native keystrokes; sites may reject them. */
export function buildHumanPasteScript(enabled: boolean, speedName: string): string {
  const speeds: Record<string, [number, number]> = { relaxed: [58, 165], natural: [32, 95], fast: [12, 44], instant: [0, 4] };
  const speed = speeds[speedName] ?? speeds['natural']!;
  if (!enabled) return '';
  return `
try {
  if (!window.__joeHumanPaste) {
    Object.defineProperty(window, '__joeHumanPaste', { value: true });
    document.addEventListener('paste', function(event) {
      var target = event.target;
      if (!target || target.disabled || target.readOnly) return;
      var tag = target.tagName;
      var isInput = tag === 'INPUT' && ['text','search','url','tel','password'].indexOf((target.type || 'text').toLowerCase()) >= 0;
      var isTextArea = tag === 'TEXTAREA';
      var isEditable = !!target.isContentEditable;
      if (!isInput && !isTextArea && !isEditable) return;
      var text = event.clipboardData && event.clipboardData.getData('text/plain');
      // Large pastes retain the browser's normal, immediate behavior.
      if (!text || text.length > 20000) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      var chars = Array.from(text);
      var index = 0;
      function step() {
        if (index >= chars.length || !target.isConnected || document.activeElement !== target) return;
        var ch = chars[index++];
        if (isEditable) {
          if (!document.execCommand || !document.execCommand('insertText', false, ch)) {
            var selection = window.getSelection();
            if (!selection || !selection.rangeCount) return;
            var range = selection.getRangeAt(0);
            if (!target.contains(range.startContainer)) return;
            range.deleteContents();
            var node = document.createTextNode(ch);
            range.insertNode(node);
            range.setStartAfter(node);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            target.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
          }
        } else {
          var start = target.selectionStart == null ? target.value.length : target.selectionStart;
          var end = target.selectionEnd == null ? start : target.selectionEnd;
          var prototype = isTextArea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          var setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
          setter.call(target, target.value.slice(0, start) + ch + target.value.slice(end));
          try { target.setSelectionRange(start + ch.length, start + ch.length); } catch (error) {}
          target.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
        }
        if (index < chars.length) setTimeout(step, ${speed[0]} + Math.random() * ${speed[1] - speed[0]});
      }
      step();
    }, true);
  }
} catch (error) {}
`;
}
