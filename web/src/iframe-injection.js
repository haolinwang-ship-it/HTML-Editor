// ─────────────────────────────────────────────────
//  iframe-injection.js
//  Injects a <style> + <script> bundle into the iframe
//  just before </body>. Inside the iframe it manages:
//    edit    — text editing on [data-hce-text] only
//    block   — hover/click any [data-block-id] to delete it
//    comment — toggle-select any [data-block-id]; multi-select
//
//  All three modes work off the same data-block-id stamped
//  by parser.js. The parent (room.js) is the source of truth
//  for selection set and modal/sidebar UI.
// ─────────────────────────────────────────────────

export function buildIframeScript() {
  return `
<style id="__hce-style">
  /* ───── Edit mode (text) ───── */
  body[data-mode="edit"] [data-hce-text]:hover {
    outline: 1px dashed rgba(26, 26, 26, 0.35) !important;
    outline-offset: 2px;
    cursor: text;
  }
  body[data-mode="edit"] [data-hce-text][contenteditable]:focus {
    outline: 1.5px solid rgba(255, 90, 31, 0.85) !important;
    outline-offset: 2px;
    /* No background override — would clobber dark themes and make
       light-on-dark text unreadable. The outline alone signals focus. */
  }

  /* ───── Block mode ───── */
  body[data-mode="block"], body[data-mode="block"] * {
    cursor: pointer !important;
  }
  body[data-mode="block"] [data-block-id]:hover {
    outline: 1.5px solid rgba(185, 28, 28, 0.7) !important;
    outline-offset: 2px;
    background: rgba(254, 226, 226, 0.35) !important;
  }

  /* ───── Comment mode ───── */
  body[data-mode="comment"], body[data-mode="comment"] * {
    cursor: crosshair !important;
  }
  body[data-mode="comment"] [data-block-id]:hover {
    outline: 1.5px dashed rgba(255, 90, 31, 0.7) !important;
    outline-offset: 2px;
  }
  [data-hce-selected] {
    outline: 2px solid rgba(255, 90, 31, 0.9) !important;
    outline-offset: 2px;
    background: rgba(255, 241, 236, 0.5) !important;
  }

  /* ───── Flash for "scroll-to" / sidebar interaction ───── */
  [data-flash] { animation: hce-flash 1.2s ease; }
  @keyframes hce-flash {
    0%, 100% { background-color: transparent; }
    30% { background-color: rgba(255, 90, 31, 0.25); }
  }

  /* ───── Floating delete handle (legacy block mode, kept for compat) ───── */
  #__hce-handle {
    position: fixed;
    z-index: 99999;
    background: #b91c1c;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 10px;
    font: 600 11px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    pointer-events: auto;
    display: none;
  }
  #__hce-handle:hover { background: #991b1b; }

  /* ───── Edit-mode selection toolbar (duplicate + delete) ───── */
  #__hce-tools {
    position: fixed;
    z-index: 99999;
    display: none;
    gap: 2px;
    background: #ffffff;
    border: 1px solid #e7e5e4;
    border-radius: 999px;
    padding: 3px;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.10), 0 2px 4px rgba(15, 23, 42, 0.06);
    pointer-events: auto;
    font: 500 13px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  #__hce-tools button {
    background: transparent;
    border: none;
    color: #44403c;
    height: 28px;
    min-width: 28px;
    padding: 0 6px;
    border-radius: 999px;
    cursor: pointer;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 500;
  }
  #__hce-tools button.has-label { padding: 0 10px 0 8px; }
  #__hce-tools button:hover { background: #f5f5f4; color: #1a1a1a; }
  #__hce-tools button.del:hover { background: #fee2e2; color: #991b1b; }
  #__hce-tools .sep { width: 1px; background: #e7e5e4; margin: 4px 2px; }
  body[data-mode="edit"] [data-block-id].__hce-selected-tools {
    outline: 1.5px solid rgba(26, 26, 26, 0.6) !important;
    outline-offset: 2px;
  }
</style>
<scr` + `ipt id="__hce-script">
(function() {
  var mode = 'edit';
  document.body.dataset.mode = mode;

  function applyMode(m) {
    mode = m;
    document.body.dataset.mode = m;
    // Only text leaves are contenteditable in edit mode
    document.querySelectorAll('[data-hce-text]').forEach(function(el) {
      if (m === 'edit') {
        el.setAttribute('contenteditable', 'plaintext-only');
        el.spellcheck = false;
      } else {
        el.removeAttribute('contenteditable');
      }
    });
    if (m !== 'block') hideHandle();
    if (m !== 'edit' && typeof hideTools === 'function') hideTools();
  }

  // ─── Edit: input → parent ─────────────────────
  // NOTE: We deliberately do NOT auto-remove when text becomes empty.
  // Reason: select-all + Backspace, paste-replace, and other mid-edit
  // states would momentarily produce empty text, which previously caused
  // the whole row to disappear on every collaborator's screen — a very
  // jarring "ghost delete" bug. The marker/line stays put while empty.
  // To explicitly delete a line, the user backspaces in an already-empty
  // text leaf (the keydown handler below), or uses the row × handle.
  var inputTimer;
  var LINE_TAGS = /^(LI|TR|TD|TH|DT|DD)$/;

  function findRemovableAncestor(el) {
    var p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      if (LINE_TAGS.test(p.tagName)) return p;
      p = p.parentElement;
    }
    return el;
  }

  function requestRemove(el) {
    var id = el.getAttribute('data-block-id');
    if (!id) return;
    window.parent.postMessage({ type: 'request-block-delete', id: id }, '*');
  }

  // Track when each block was last touched locally — used to decide whether
  // an incoming remote update would clobber an in-progress edit.
  var lastLocalInputAt = Object.create(null);

  document.addEventListener('input', function(e) {
    if (mode !== 'edit') return;
    var el = e.target.closest && e.target.closest('[data-hce-text]');
    if (!el) return;
    var id = el.getAttribute('data-block-id');
    lastLocalInputAt[id] = Date.now();
    clearTimeout(inputTimer);
    var ms = (el.textContent === '') ? 1000 : 180;
    inputTimer = setTimeout(function() {
      window.parent.postMessage({
        type: 'block-text-change',
        id: id,
        text: el.textContent
      }, '*');
    }, ms);
  });

  // Explicit removal: Backspace/Delete inside an already-empty leaf removes
  // the containing line (or the leaf itself if no line ancestor exists).
  document.addEventListener('keydown', function(e) {
    if (mode !== 'edit') return;
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    var el = e.target.closest && e.target.closest('[data-hce-text]');
    if (!el) return;
    if (el.textContent.length === 0) {
      e.preventDefault();
      requestRemove(findRemovableAncestor(el));
    }
  });

  // ⌘Z / ⌘⇧Z forwarding — keyboard events inside this sandboxed iframe
  // don't bubble to the parent, so the browser's default contenteditable
  // undo runs and our Yjs UndoManager never fires. Intercept and ask the
  // parent to undo/redo through the collab provider.
  function forwardUndo(redo) {
    // Clear the "recently typed" gate so the upcoming text patch from
    // the UndoManager isn't dropped by the keep-cursor protection.
    for (var k in lastLocalInputAt) delete lastLocalInputAt[k];
    window.parent.postMessage({
      type: redo ? 'request-redo' : 'request-undo'
    }, '*');
  }
  document.addEventListener('keydown', function(e) {
    var mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      forwardUndo(!!e.shiftKey);
    }
  });
  // beforeinput catches the undo intent at a deeper level than keydown;
  // some browser configurations skip the keydown path for historyUndo.
  document.addEventListener('beforeinput', function(e) {
    if (e.inputType === 'historyUndo') { e.preventDefault(); forwardUndo(false); }
    if (e.inputType === 'historyRedo') { e.preventDefault(); forwardUndo(true); }
  });

  // ─── Pick the best ancestor for non-text targets ───
  function pickTarget(node) {
    if (!node || node.id === '__hce-handle' || node.id === '__hce-tools') return null;
    if (node.closest && node.closest('#__hce-tools')) return null;
    var el = node.closest && node.closest('[data-block-id]');
    if (!el) {
      var p = node.parentElement;
      while (p && !p.getAttribute('data-block-id')) p = p.parentElement;
      el = p;
    }
    // Refuse to target <body> / <html> — would nuke the whole doc.
    if (!el || el === document.body || el === document.documentElement) return null;
    return el;
  }

  // ─── Edit-mode click-selection toolbar (Duplicate / Delete) ───
  //
  // Click any element to "pin" the toolbar to it. Click outside any
  // tracked element (or press Esc) to deselect.
  //
  // In a table cell, the toolbar gains an extra button so the user can
  // duplicate a row OR a column independently.
  var tools = null;
  var toolsTarget = null;        // element receiving the toolbar visually
  var toolsCellId = null;        // data-block-id of the cell, when in a table

  function svgIcon(paths) {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" '
      + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
      + 'stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var ICON_PLUS = svgIcon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>');
  var ICON_X    = svgIcon('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>');
  // Row icon: a small "stacked rows" mark with a plus glyph in the second row.
  var ICON_ROW  = svgIcon(
    '<rect x="3"  y="4"  width="18" height="6" rx="1.5"/>' +
    '<rect x="3"  y="14" width="18" height="6" rx="1.5"/>' +
    '<line x1="12" y1="15" x2="12" y2="19"/>' +
    '<line x1="10" y1="17" x2="14" y2="17"/>'
  );
  // Column icon: two side-by-side columns with a plus glyph in the right one.
  var ICON_COL  = svgIcon(
    '<rect x="4"  y="3"  width="6" height="18" rx="1.5"/>' +
    '<rect x="14" y="3"  width="6" height="18" rx="1.5"/>' +
    '<line x1="17" y1="10" x2="17" y2="14"/>' +
    '<line x1="15" y1="12" x2="19" y2="12"/>'
  );

  function ensureTools() {
    if (tools) return tools;
    tools = document.createElement('div');
    tools.id = '__hce-tools';
    document.body.appendChild(tools);
    return tools;
  }
  function renderToolsContent() {
    if (!tools) return;
    if (toolsCellId) {
      tools.innerHTML =
          '<button class="dup-row has-label" title="Duplicate this row">' + ICON_ROW + '<span>Row</span></button>'
        + '<button class="dup-col has-label" title="Duplicate this column">' + ICON_COL + '<span>Col</span></button>'
        + '<span class="sep"></span>'
        + '<button class="del-row has-label" title="Delete this row">' + ICON_X + '<span>Row</span></button>'
        + '<button class="del-col has-label" title="Delete this column">' + ICON_X + '<span>Col</span></button>';
      tools.querySelector('.dup-row').addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (!toolsTarget) return;
        window.parent.postMessage({
          type: 'request-block-duplicate',
          id: toolsTarget.getAttribute('data-block-id')
        }, '*');
        hideTools();
      });
      tools.querySelector('.dup-col').addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (!toolsCellId) return;
        window.parent.postMessage({
          type: 'request-column-duplicate',
          id: toolsCellId
        }, '*');
        hideTools();
      });
      tools.querySelector('.del-row').addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (!toolsTarget) return;
        // toolsTarget is the TR (resolved on the parent side from cellId),
        // but inside the iframe we still want to send the cell id; the
        // parent's resolveStructuralTarget will lift it to the TR.
        window.parent.postMessage({
          type: 'request-block-delete',
          id: toolsCellId || toolsTarget.getAttribute('data-block-id')
        }, '*');
        hideTools();
      });
      tools.querySelector('.del-col').addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (!toolsCellId) return;
        window.parent.postMessage({
          type: 'request-column-delete',
          id: toolsCellId
        }, '*');
        hideTools();
      });
    } else {
      tools.innerHTML =
          '<button class="dup" title="Duplicate">' + ICON_PLUS + '</button>'
        + '<button class="del" title="Delete">' + ICON_X + '</button>';
      tools.querySelector('.dup').addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (!toolsTarget) return;
        window.parent.postMessage({
          type: 'request-block-duplicate',
          id: toolsTarget.getAttribute('data-block-id')
        }, '*');
        hideTools();
      });
      tools.querySelector('.del').addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (!toolsTarget) return;
        window.parent.postMessage({
          type: 'request-block-delete',
          id: toolsTarget.getAttribute('data-block-id')
        }, '*');
        hideTools();
      });
    }
  }
  function hideTools() {
    if (tools) tools.style.display = 'none';
    if (toolsTarget) toolsTarget.classList.remove('__hce-selected-tools');
    toolsTarget = null;
    toolsCellId = null;
  }
  function showToolsOn(el, cellId) {
    var t = ensureTools();
    if (toolsTarget && toolsTarget !== el) {
      toolsTarget.classList.remove('__hce-selected-tools');
    }
    toolsTarget = el;
    toolsCellId = cellId || null;
    renderToolsContent();
    el.classList.add('__hce-selected-tools');
    var r = el.getBoundingClientRect();
    t.style.display = 'flex';
    requestAnimationFrame(function() {
      var w = t.offsetWidth || 70;
      var top = Math.max(4, r.top - 36);
      var left = Math.min(window.innerWidth - w - 4, r.right - w);
      t.style.top = top + 'px';
      t.style.left = Math.max(4, left) + 'px';
    });
  }

  // Click-to-select. Listen on click (not mousedown) so contenteditable
  // focus still works naturally for text leaves.
  document.addEventListener('click', function(e) {
    if (mode !== 'edit') return;
    if (tools && tools.contains(e.target)) return;
    var el = pickTarget(e.target);
    if (!el) { hideTools(); return; }
    // Detect table-cell context for the +row/+col split.
    var rawTarget = e.target;
    var cellAncestor = rawTarget && rawTarget.closest
      ? rawTarget.closest('td, th') : null;
    var cellId = cellAncestor && cellAncestor.hasAttribute('data-block-id')
      ? cellAncestor.getAttribute('data-block-id')
      : null;
    showToolsOn(el, cellId);
  });
  // Esc deselects.
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') hideTools();
  });
  // Re-pin when the iframe scrolls so toolbar doesn't drift.
  window.addEventListener('scroll', function() {
    if (toolsTarget) showToolsOn(toolsTarget, toolsCellId);
  }, true);
  // Mouse leaves / window blur — keep selection but hide visual to be tidy.
  window.addEventListener('blur', function() { /* keep selection */ });

  function snippetOf(el) {
    var t = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
    if (t) return t;
    return '<' + el.tagName.toLowerCase() + '>';
  }

  // ─── Block mode: show floating × handle on hover ───
  var handle = null;
  var hoveredEl = null;
  function ensureHandle() {
    if (handle) return handle;
    handle = document.createElement('button');
    handle.id = '__hce-handle';
    handle.textContent = '× Remove';
    handle.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (!hoveredEl) return;
      window.parent.postMessage({
        type: 'request-block-delete',
        id: hoveredEl.getAttribute('data-block-id')
      }, '*');
      hideHandle();
    });
    document.body.appendChild(handle);
    return handle;
  }
  function hideHandle() {
    if (handle) handle.style.display = 'none';
    hoveredEl = null;
  }
  function showHandleOn(el) {
    var h = ensureHandle();
    var r = el.getBoundingClientRect();
    h.style.top = Math.max(4, r.top - 28) + 'px';
    h.style.left = Math.min(window.innerWidth - 90, r.right - 88) + 'px';
    h.style.display = 'block';
    hoveredEl = el;
  }
  document.addEventListener('mouseover', function(e) {
    if (mode !== 'block') return;
    if (e.target && e.target.id === '__hce-handle') return;  // don't lose hover when over the handle itself
    var el = pickTarget(e.target);
    if (!el) return hideHandle();
    showHandleOn(el);
  });
  document.addEventListener('mouseleave', function(e) {
    // when leaving the iframe entirely
    if (mode === 'block' && e.target === document) hideHandle();
  });

  document.addEventListener('click', function(e) {
    // Block-mode plain click → delete target (in addition to × handle)
    if (mode === 'block') {
      e.preventDefault();
      e.stopPropagation();
      var el = pickTarget(e.target);
      if (!el) return;
      window.parent.postMessage({
        type: 'request-block-delete',
        id: el.getAttribute('data-block-id')
      }, '*');
      hideHandle();
      return;
    }

    // Comment mode → toggle selection
    if (mode === 'comment') {
      e.preventDefault();
      e.stopPropagation();
      var el = pickTarget(e.target);
      if (!el) return;
      var id = el.getAttribute('data-block-id');
      window.parent.postMessage({
        type: 'comment-toggle-select',
        id: id,
        tag: el.tagName.toLowerCase(),
        snippet: snippetOf(el)
      }, '*');
    }
  }, true);

  // ─── Parent → iframe commands ─────────────────
  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d || d._src !== 'hce') return;

    if (d.cmd === 'set-mode') applyMode(d.mode);

    if (d.cmd === 'mark-commented') {
      var el = document.querySelector('[data-block-id="' + d.id + '"]');
      if (el) el.setAttribute('data-commented', '1');
    }
    if (d.cmd === 'unmark-commented') {
      var el = document.querySelector('[data-block-id="' + d.id + '"]');
      if (el) el.removeAttribute('data-commented');
    }
    if (d.cmd === 'clear-commented') {
      document.querySelectorAll('[data-commented]').forEach(function(el) {
        el.removeAttribute('data-commented');
      });
    }

    if (d.cmd === 'set-selection') {
      // d.ids: full selection set
      document.querySelectorAll('[data-hce-selected]').forEach(function(el) {
        el.removeAttribute('data-hce-selected');
      });
      (d.ids || []).forEach(function(id) {
        var el = document.querySelector('[data-block-id="' + id + '"]');
        if (el) el.setAttribute('data-hce-selected', '1');
      });
    }

    if (d.cmd === 'scroll-to') {
      var el = document.querySelector('[data-block-id="' + d.id + '"]');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.setAttribute('data-flash', '1');
        setTimeout(function() { el.removeAttribute('data-flash'); }, 1200);
      }
    }

    if (d.cmd === 'flash-refs') {
      (d.ids || []).forEach(function(id) {
        var el = document.querySelector('[data-block-id="' + id + '"]');
        if (el) {
          el.setAttribute('data-flash', '1');
          setTimeout(function() { el.removeAttribute('data-flash'); }, 1600);
        }
      });
    }

    if (d.cmd === 'set-block-text') {
      var el = document.querySelector('[data-block-id="' + d.id + '"]');
      if (!el) return;
      if (el.textContent === d.text) return;
      // Only skip the update if the local user is _actively_ typing in this
      // exact element right now. Idle focus (cursor parked but no recent
      // keystrokes) MUST NOT block remote additions.
      var typing = document.activeElement === el
                && lastLocalInputAt[d.id]
                && (Date.now() - lastLocalInputAt[d.id] < 800);
      if (typing) return;
      // Preserve cursor position if the user has focus but isn't typing.
      if (document.activeElement === el && window.getSelection) {
        try {
          var sel = window.getSelection();
          var caret = sel && sel.rangeCount ? sel.getRangeAt(0).startOffset : null;
          el.textContent = d.text;
          if (caret !== null) {
            var range = document.createRange();
            var node = el.firstChild || el;
            var pos = Math.min(caret, el.textContent.length);
            range.setStart(node, node.nodeType === 3 ? pos : 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } catch (_) {
          el.textContent = d.text;
        }
      } else {
        el.textContent = d.text;
      }
    }

    if (d.cmd === 'remove-element') {
      var el = document.querySelector('[data-block-id="' + d.id + '"]');
      if (el) el.remove();
      hideHandle();
      hideTools();
    }

    if (d.cmd === 'insert') {
      // Generic insert: { afterId | parentId+position: 'first'|'last', html }
      var anchor, position;
      if (d.afterId) {
        anchor = document.querySelector('[data-block-id="' + d.afterId + '"]');
        position = 'afterend';
      } else if (d.parentId) {
        anchor = document.querySelector('[data-block-id="' + d.parentId + '"]');
        position = d.position === 'first' ? 'afterbegin' : 'beforeend';
      }
      if (!anchor || !d.html) return;
      // insertAdjacentHTML parses in the host's context, so <tr> inside a
      // <tbody>/<table> anchor works without manual wrapping.
      anchor.insertAdjacentHTML(position, d.html);
      // Make any newly-inserted text leaves editable if we're in edit mode.
      if (mode === 'edit') {
        document.querySelectorAll('[data-hce-text]:not([contenteditable])').forEach(function(c) {
          c.setAttribute('contenteditable', 'plaintext-only');
          c.spellcheck = false;
        });
      }
      return;
    }

    if (d.cmd === 'insert-after') {
      var anchor = document.querySelector('[data-block-id="' + d.afterId + '"]');
      if (!anchor || !d.html) return;
      // HTML fragments like <tr>/<td>/<li> can't be parsed standalone in
      // a template — the parser is context-sensitive. Wrap them so the
      // browser keeps the tag.
      var html = d.html;
      var trimmed = html.replace(/^\\s+/, '');
      var wrapStart = '', wrapEnd = '', sel = null;
      if (/^<tr[\\s>]/i.test(trimmed)) {
        wrapStart = '<table><tbody>'; wrapEnd = '</tbody></table>'; sel = 'tr';
      } else if (/^<t[hd][\\s>]/i.test(trimmed)) {
        wrapStart = '<table><tbody><tr>'; wrapEnd = '</tr></tbody></table>'; sel = 'td,th';
      } else if (/^<li[\\s>]/i.test(trimmed)) {
        wrapStart = '<ul>'; wrapEnd = '</ul>'; sel = 'li';
      } else if (/^<(thead|tbody|tfoot)[\\s>]/i.test(trimmed)) {
        wrapStart = '<table>'; wrapEnd = '</table>'; sel = 'thead,tbody,tfoot';
      } else if (/^<(dt|dd)[\\s>]/i.test(trimmed)) {
        wrapStart = '<dl>'; wrapEnd = '</dl>'; sel = 'dt,dd';
      }
      var node;
      if (sel) {
        var holder = document.createElement('div');
        holder.innerHTML = wrapStart + html + wrapEnd;
        node = holder.querySelector(sel);
      } else {
        var tpl = document.createElement('template');
        tpl.innerHTML = html;
        node = tpl.content.firstElementChild;
      }
      if (!node) return;
      // Make the inserted text-leaves immediately editable in edit mode.
      if (mode === 'edit') {
        if (node.hasAttribute('data-hce-text')) {
          node.setAttribute('contenteditable', 'plaintext-only');
          node.spellcheck = false;
        }
        node.querySelectorAll('[data-hce-text]').forEach(function(c) {
          c.setAttribute('contenteditable', 'plaintext-only');
          c.spellcheck = false;
        });
      }
      anchor.parentNode.insertBefore(node, anchor.nextSibling);
      // Brief flash to make the duplication discoverable.
      node.setAttribute('data-flash', '1');
      setTimeout(function() { node.removeAttribute('data-flash'); }, 1200);
    }
  });

  // Let the parent close popovers (Share / Export menu) on any click inside
  // the iframe — clicks here don't bubble to the parent document.
  document.addEventListener('mousedown', function() {
    window.parent.postMessage({ type: 'iframe-mousedown' }, '*');
  }, true);

  applyMode('edit');
  window.parent.postMessage({ type: 'ready' }, '*');
})();
</scr` + `ipt>`;
}
