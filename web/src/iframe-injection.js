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
  // [ADDITION] Palette icon for the Style button
  var ICON_STYLE = svgIcon(
    '<circle cx="13.5" cy="6.5" r=".5"/>' +
    '<circle cx="17.5" cy="10.5" r=".5"/>' +
    '<circle cx="8.5" cy="7.5" r=".5"/>' +
    '<circle cx="6.5" cy="12.5" r=".5"/>' +
    '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.6 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.6-1.4 1.4-1.4H16c3.3 0 6-2.7 6-6 0-5.5-4.5-10-10-10z"/>'
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
        + '<button class="style" title="Style (color · size · weight · align · radius · padding)">' + ICON_STYLE + '</button>'
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
      // [ADDITION] Style button — toggles the style panel
      tools.querySelector('.style').addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (!toolsTarget) return;
        toggleStylePanel(toolsTarget);
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
  // ─── [ADDITION · Delete-key delete] ───
  // Backspace / Delete on the currently-selected block removes it.
  // Cmd+Backspace / Cmd+Delete always removes (even when cursor is in text).
  // Plain Backspace inside an editable text leaf is left alone so users
  // can still delete characters normally.
  document.addEventListener('keydown', function(e) {
    if (mode !== 'edit') return;
    if (!toolsTarget) return;
    var isDelKey = (e.key === 'Delete' || e.key === 'Backspace');
    if (!isDelKey) return;
    var meta = e.metaKey || e.ctrlKey;
    var inText = e.target && e.target.closest
      && e.target.closest('[data-hce-text][contenteditable]');
    if (inText && !meta) return; // let contenteditable handle char delete
    e.preventDefault();
    e.stopPropagation();
    window.parent.postMessage({
      type: 'request-block-delete',
      id: toolsTarget.getAttribute('data-block-id')
    }, '*');
    hideTools();
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

  // ─── [ADDITION] Style panel ───────────────────────────────────────
  // Floating dark popover with: text color · font size · align · padding.
  // Anchored to the currently-selected element, toggled by 🎨 toolbar button.
  //
  // Defined as a function, called AFTER applyMode/ready below. Any error
  // here can't break the core editor.
  var stylePanel = null;
  var styleTarget = null;
  var hideStylePanel; // forward decl

  // ─── 样式 Undo / Redo 栈 ───
  // 独立于 Yjs UndoManager（只追踪文字）。
  // Cmd+Z 优先撤销样式；样式栈空了再 fall through 到 Yjs（撤销文字）。
  var styleHistory = [];
  var styleHistoryPtr = -1;
  var preChangeSnap = null;
  var preChangeTarget = null;
  var commitDebounceTimer = null;
  var STYLE_HISTORY_LIMIT = 100;

  function captureStyleSnap(el) {
    var snap = [{ el: el, css: el.style.cssText }];
    el.querySelectorAll('*').forEach(function(c) {
      snap.push({ el: c, css: c.style.cssText });
    });
    return snap;
  }
  function applyStyleSnap(snap) {
    snap.forEach(function(s) {
      if (s.el && s.el.style) s.el.style.cssText = s.css;
    });
  }
  function maybeStartStyleChange(target) {
    if (!target) return;
    if (preChangeSnap && preChangeTarget === target) return; // 已经在记录
    if (preChangeSnap) commitStyleChange(); // 切到新目标 — 先把前一组提交
    preChangeSnap = captureStyleSnap(target);
    preChangeTarget = target;
  }
  function debouncedCommitStyle() {
    if (commitDebounceTimer) clearTimeout(commitDebounceTimer);
    commitDebounceTimer = setTimeout(commitStyleChange, 500);
  }
  function commitStyleChange() {
    if (commitDebounceTimer) { clearTimeout(commitDebounceTimer); commitDebounceTimer = null; }
    if (!preChangeSnap || !preChangeTarget) return;
    var after = captureStyleSnap(preChangeTarget);
    // 截掉 redo 路径
    styleHistory.length = styleHistoryPtr + 1;
    styleHistory.push({ before: preChangeSnap, after: after });
    if (styleHistory.length > STYLE_HISTORY_LIMIT) {
      styleHistory.shift();
    } else {
      styleHistoryPtr++;
    }
    preChangeSnap = null;
    preChangeTarget = null;
  }
  function undoStyleHistory() {
    commitStyleChange(); // 提交任何 pending
    if (styleHistoryPtr < 0) return false;
    applyStyleSnap(styleHistory[styleHistoryPtr].before);
    styleHistoryPtr--;
    return true;
  }
  function redoStyleHistory() {
    if (styleHistoryPtr >= styleHistory.length - 1) return false;
    styleHistoryPtr++;
    applyStyleSnap(styleHistory[styleHistoryPtr].after);
    return true;
  }
  // 拦截 Cmd+Z / Cmd+Shift+Z 在 capture 阶段，比原 handler 先跑
  document.addEventListener('keydown', function(e) {
    var meta = e.metaKey || e.ctrlKey;
    if (!meta || !e.key || e.key.toLowerCase() !== 'z') return;
    var handled = e.shiftKey ? redoStyleHistory() : undoStyleHistory();
    if (handled) {
      e.preventDefault();
      e.stopImmediatePropagation(); // 不让原 handler 再 forward 到 Yjs
    }
  }, true);
  function rgbToHex(c) {
    if (!c) return '#000000';
    if (c.charAt(0) === '#') return c.length === 7 ? c : '#000000';
    var m = c.match(/rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/);
    if (!m) return '#000000';
    function h(n){ return (+n).toString(16).padStart(2,'0'); }
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
  }
  function pxNum(s) {
    if (!s) return 0;
    var m = String(s).match(/(-?\\d+(\\.\\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  }
  function ensureStylePanel() {
    if (stylePanel) return stylePanel;
    var styleEl = document.createElement('style');
    styleEl.id = '__hce-style-panel-css';
    styleEl.textContent = ''
      + '#__hce-style-panel{position:fixed;z-index:2147483647;width:280px;'
      + 'background:#1f1d2e;color:#e8e6f0;border:1px solid rgba(255,255,255,.08);'
      + 'border-radius:12px;padding:14px;font:13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;'
      + 'box-shadow:0 12px 40px rgba(0,0,0,.5);display:none;}'
      + '#__hce-style-panel label{display:block;color:#9b97b0;margin-bottom:4px;font-size:11px;}'
      + '#__hce-style-panel .row{margin-bottom:10px;}'
      + '#__hce-style-panel input[type=text]{width:100%;background:#0e0c1a;border:1px solid rgba(255,255,255,.08);color:#fff;padding:6px 8px;border-radius:6px;font:12px ui-monospace,SFMono-Regular,monospace;box-sizing:border-box;}'
      + '#__hce-style-panel input[type=color]{width:32px;height:32px;border:1px solid rgba(255,255,255,.08);border-radius:6px;background:transparent;cursor:pointer;padding:0;}'
      + '#__hce-style-panel .colorrow{display:flex;gap:8px;align-items:center;}'
      + '#__hce-style-panel input[type=range]{width:100%;}'
      + '#__hce-style-panel select{width:100%;background:#0e0c1a;border:1px solid rgba(255,255,255,.08);color:#fff;padding:6px 8px;border-radius:6px;}'
      + '#__hce-style-panel .alignrow{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;}'
      + '#__hce-style-panel .alignrow button{background:#0e0c1a;border:1px solid rgba(255,255,255,.08);color:#cfcadf;padding:6px 0;border-radius:6px;cursor:pointer;font-size:11px;}'
      + '#__hce-style-panel .alignrow button.on{background:#5a4fcf;color:#fff;}'
      + '#__hce-style-panel .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}'
      + '#__hce-style-panel .head .ttl{font-size:13px;font-weight:600;}'
      + '#__hce-style-panel .head button{background:none;border:none;color:#9b97b0;cursor:pointer;font-size:18px;line-height:1;}';
    document.head.appendChild(styleEl);
    stylePanel = document.createElement('div');
    stylePanel.id = '__hce-style-panel';
    stylePanel.innerHTML =
        '<div class="head"><span class="ttl">样式</span><button class="close" title="关闭">×</button></div>'
      + '<div class="row"><label>文字颜色</label><div class="colorrow"><input type="color" class="sp-color"><input type="text" class="sp-color-txt"></div></div>'
      + '<div class="row"><label class="sp-fs-l">字号 <span class="sp-fs-v">14</span>px</label><input type="range" class="sp-fs" min="10" max="120"></div>'
      + '<div class="row"><label>对齐</label><div class="alignrow">'
        + '<button data-align="left">left</button>'
        + '<button data-align="center">center</button>'
        + '<button data-align="right">right</button>'
        + '<button data-align="justify">justify</button>'
      + '</div></div>'
      + '<div class="row"><label class="sp-pd-l">内边距 <span class="sp-pd-v">0</span>px</label><input type="range" class="sp-pd" min="0" max="80"></div>';
    document.body.appendChild(stylePanel);
    // [FIX] 阻止面板内的事件冒泡到 document — 否则点滑块松手时 click 事件
    // 会冒泡到 iframe-injection 的全局 click handler，触发 hideTools 把面板关了
    stylePanel.addEventListener('click', function(e) { e.stopPropagation(); });
    stylePanel.addEventListener('mousedown', function(e) { e.stopPropagation(); });

    function apply(prop, val) {
      if (!styleTarget) return;
      // 在第一次改之前快照 before-state
      maybeStartStyleChange(styleTarget);
      // camelCase → kebab-case (fontSize → font-size 等)
      var cssProp = prop.replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); });
      styleTarget.style.setProperty(cssProp, val, 'important');
      // color 要无脑打给所有后代元素 — 中间层 <a><strong> 等可能也有自己的 color
      if (prop === 'color') {
        styleTarget.querySelectorAll('*').forEach(function(child) {
          child.style.setProperty('color', val, 'important');
        });
      }
      debouncedCommitStyle();
    }
    stylePanel.querySelector('.close').onclick = hideStylePanel;
    var cIn = stylePanel.querySelector('.sp-color');
    var cTx = stylePanel.querySelector('.sp-color-txt');
    cIn.oninput = function() { apply('color', cIn.value); cTx.value = cIn.value; };
    cTx.onchange = function() { apply('color', cTx.value); cIn.value = rgbToHex(cTx.value); };
    var fs = stylePanel.querySelector('.sp-fs');
    fs.oninput = function() {
      apply('fontSize', fs.value + 'px');
      stylePanel.querySelector('.sp-fs-v').textContent = fs.value;
    };
    stylePanel.querySelectorAll('.alignrow button').forEach(function(btn) {
      btn.onclick = function() {
        apply('textAlign', btn.dataset.align);
        stylePanel.querySelectorAll('.alignrow button').forEach(function(b){ b.classList.toggle('on', b === btn); });
      };
    });
    var pd = stylePanel.querySelector('.sp-pd');
    pd.oninput = function() {
      apply('padding', pd.value + 'px');
      stylePanel.querySelector('.sp-pd-v').textContent = pd.value;
    };
    return stylePanel;
  }
  function populateStylePanel(el) {
    var p = ensureStylePanel();
    var cs = getComputedStyle(el);
    var hexC = rgbToHex(cs.color);
    p.querySelector('.sp-color').value = hexC;
    p.querySelector('.sp-color-txt').value = cs.color;
    var fs = pxNum(cs.fontSize);
    p.querySelector('.sp-fs').value = fs;
    p.querySelector('.sp-fs-v').textContent = fs;
    p.querySelectorAll('.alignrow button').forEach(function(b){
      b.classList.toggle('on', b.dataset.align === cs.textAlign);
    });
    var pd = pxNum(cs.padding);
    p.querySelector('.sp-pd').value = pd;
    p.querySelector('.sp-pd-v').textContent = pd;
  }
  function positionStylePanel(el) {
    var p = ensureStylePanel();
    var r = el.getBoundingClientRect();
    var top = r.bottom + 10;
    var left = r.left;
    // Keep on screen
    var maxLeft = window.innerWidth - 300;
    if (left > maxLeft) left = maxLeft;
    if (top + 480 > window.innerHeight) top = Math.max(8, r.top - 488);
    p.style.top = top + 'px';
    p.style.left = Math.max(8, left) + 'px';
  }
  function showStylePanel(el) {
    styleTarget = el;
    var p = ensureStylePanel();
    populateStylePanel(el);
    positionStylePanel(el);
    p.style.display = 'block';
  }
  hideStylePanel = function() {
    if (stylePanel) stylePanel.style.display = 'none';
    styleTarget = null;
  };
  function toggleStylePanel(el) {
    if (stylePanel && stylePanel.style.display === 'block' && styleTarget === el) {
      hideStylePanel();
    } else {
      showStylePanel(el);
    }
  }
  // [defensive] 初始化样式面板的副作用（包了 try/catch，
  // 任何错误都不影响主编辑器）
  function __hceInitStylePanel() {
    try {
      // 包装 hideTools 以便也关闭样式面板（如果 hideTools 已经存在）
      if (typeof hideTools === 'function') {
        var _origHideTools = hideTools;
        hideTools = function() {
          try { _origHideTools(); } catch (e) {}
          try { hideStylePanel(); } catch (e) {}
        };
      }
      window.addEventListener('scroll', function() {
        if (styleTarget && stylePanel && stylePanel.style.display === 'block') {
          try { positionStylePanel(styleTarget); } catch (e) {}
        }
      }, true);
    } catch (e) {
      console.warn('[hce] style panel init error:', e);
    }
  }

  // ─── 主初始化（必须先跑，不能被 style panel 影响） ───
  applyMode('edit');
  window.parent.postMessage({ type: 'ready' }, '*');

  // 现在再绑 style panel 的全局事件
  __hceInitStylePanel();
})();
</scr` + `ipt>`;
}
