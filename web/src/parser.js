// ─────────────────────────────────────────────────
//  parser.js  ·  HTML ↔ skeleton + blocks
//
//  Two attributes are stamped onto the DOM:
//    data-block-id="bN"     — every meaningful element in <body>
//    data-hce-text="1"      — only on text-leaf elements (editable)
//    data-hce-marker="1"    — on list-marker spans we synthesize
//    data-hce-li-styled="1" — on the <ol>/<ul> we restyled
//
//  For ordered/unordered lists, the marker ("1. ", "•") is browser-rendered
//  and not a real text node, so users can't edit or collaboratively change
//  it. We preprocess such lists: strip the default list rendering and
//  prepend a marker <span> inside each <li>. The marker then becomes a
//  normal editable text leaf, syncable like any other piece of text.
// ─────────────────────────────────────────────────

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
  'HEAD', 'META', 'LINK', 'TITLE', 'BASE',
]);

const VOID_TAGS = new Set([
  'AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT',
  'KEYGEN', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR',
]);

const HCE_LIST_STYLE = 'list-style: none; padding-left: 1.4em;';

function preprocessLists(doc) {
  doc.querySelectorAll('ol, ul').forEach(list => {
    if (list.hasAttribute('data-hce-li-styled')) return;   // already done
    const ordered = list.tagName === 'OL';
    const start = parseInt(list.getAttribute('start') || '1', 10);

    // Apply our styling so the browser stops drawing its own marker.
    const existing = list.getAttribute('style') || '';
    const sep = existing && !/;\s*$/.test(existing) ? '; ' : '';
    list.setAttribute('style', existing + sep + HCE_LIST_STYLE);
    list.setAttribute('data-hce-li-styled', '1');

    let n = start - 1;
    Array.from(list.children).forEach(li => {
      if (li.tagName !== 'LI') return;
      n++;
      // Skip if we've already preprocessed this <li>.
      if (li.firstElementChild && li.firstElementChild.hasAttribute('data-hce-marker')) return;
      const marker = doc.createElement('span');
      marker.setAttribute('data-hce-marker', '1');
      // A trailing space so cursor lands naturally after the marker text.
      marker.textContent = ordered ? `${n}. ` : '• ';
      li.insertBefore(marker, li.firstChild);
    });
  });
}

export function parseHTML(htmlString) {
  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  preprocessLists(doc);

  const blocks = [];
  let counter = 0;
  const nextId = () => 'b' + (++counter);

  function tagAsElement(el) {
    if (!el.hasAttribute('data-block-id')) el.setAttribute('data-block-id', nextId());
    return el.getAttribute('data-block-id');
  }

  function tagAsTextLeaf(el, text, tagName) {
    const id = tagAsElement(el);
    el.setAttribute('data-hce-text', '1');
    blocks.push({ id, tag: (tagName || el.tagName).toLowerCase(), text });
    return id;
  }

  function walk(el) {
    if (!el || SKIP_TAGS.has(el.tagName)) return;
    if (VOID_TAGS.has(el.tagName)) { tagAsElement(el); return; }

    tagAsElement(el);

    const childNodes = Array.from(el.childNodes);
    const hasElementChild = childNodes.some(n => n.nodeType === Node.ELEMENT_NODE);

    if (!hasElementChild) {
      const text = el.textContent;
      if (text && text.trim()) tagAsTextLeaf(el, text);
      return;
    }

    for (const child of childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.nodeValue;
        if (t && t.trim()) {
          const span = doc.createElement('span');
          span.setAttribute('data-text-leaf', '1');
          span.textContent = t;
          el.insertBefore(span, child);
          el.removeChild(child);
          tagAsTextLeaf(span, t, 'span');
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  }

  walk(doc.body);

  const skeleton = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  return { skeleton, blocks };
}

export function renderForEditor(skeleton, blocks) {
  const doc = new DOMParser().parseFromString(skeleton, 'text/html');
  const map = new Map(blocks.map(b => [b.id, b.text]));

  doc.querySelectorAll('[data-hce-text]').forEach(el => {
    const id = el.getAttribute('data-block-id');
    if (map.has(id)) el.textContent = map.get(id);
  });

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

export function reassembleHTML(skeleton, blocks) {
  const doc = new DOMParser().parseFromString(skeleton, 'text/html');
  const map = new Map(blocks.map(b => [b.id, b.text]));

  doc.querySelectorAll('[data-hce-text]').forEach(el => {
    const id = el.getAttribute('data-block-id');
    if (map.has(id)) el.textContent = map.get(id);
  });

  // Strip our synthetic list markers.
  doc.querySelectorAll('[data-hce-marker]').forEach(el => el.remove());

  // Strip the inline list-styling we added (best-effort: remove our exact
  // declaration; leave any other inline style the user had).
  doc.querySelectorAll('[data-hce-li-styled]').forEach(list => {
    const s = (list.getAttribute('style') || '').replace(HCE_LIST_STYLE, '').replace(/;\s*;/g, ';').trim();
    if (s) list.setAttribute('style', s);
    else list.removeAttribute('style');
    list.removeAttribute('data-hce-li-styled');
  });

  // Unwrap our text-leaf spans.
  doc.querySelectorAll('span[data-text-leaf]').forEach(el => {
    const text = doc.createTextNode(el.textContent);
    el.parentNode.replaceChild(text, el);
  });

  // Scrub editor attributes.
  doc.querySelectorAll('[data-block-id]').forEach(el => {
    el.removeAttribute('data-block-id');
    el.removeAttribute('data-hce-text');
    el.removeAttribute('data-commented');
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
    el.removeAttribute('data-mode');
  });

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

export function removeElementFromSkeleton(skeleton, elementId) {
  const doc = new DOMParser().parseFromString(skeleton, 'text/html');
  const target = doc.querySelector(`[data-block-id="${elementId}"]`);
  if (!target) return { skeleton, removedIds: [] };

  const removedIds = [elementId];
  target.querySelectorAll('[data-block-id]').forEach(el => {
    removedIds.push(el.getAttribute('data-block-id'));
  });
  target.remove();

  return {
    skeleton: '<!DOCTYPE html>\n' + doc.documentElement.outerHTML,
    removedIds,
  };
}

/**
 * Deep-clone an element in the skeleton, assign fresh data-block-ids to
 * the clone (and all data-block-id descendants), insert it directly after
 * the original. Returns the new skeleton plus an `addedBlocks` array
 * (the new text-leaf blocks to push into collab/state).
 *
 * `nextCounter` is the integer the caller should use to keep new IDs
 * unique across the doc — we accept it because the parser counter is
 * local. Callers can pass `state.blocks.length` or compute from existing
 * IDs; we just need monotonically increasing values that don't collide.
 */
export function duplicateElementInSkeleton(skeleton, elementId, existingBlocks) {
  const doc = new DOMParser().parseFromString(skeleton, 'text/html');
  const target = doc.querySelector(`[data-block-id="${elementId}"]`);
  if (!target) return { skeleton, addedBlocks: [] };

  // Compute next free integer ID.
  const usedNums = new Set();
  doc.querySelectorAll('[data-block-id]').forEach(el => {
    const m = /^b(\d+)$/.exec(el.getAttribute('data-block-id') || '');
    if (m) usedNums.add(+m[1]);
  });
  (existingBlocks || []).forEach(b => {
    const m = /^b(\d+)$/.exec(b.id || '');
    if (m) usedNums.add(+m[1]);
  });
  let counter = 0;
  for (const n of usedNums) if (n > counter) counter = n;

  const clone = target.cloneNode(true);

  // Rewrite IDs on the clone itself + every descendant with data-block-id.
  const addedBlocks = [];
  const reassign = (el) => {
    const newId = 'b' + (++counter);
    el.setAttribute('data-block-id', newId);
    if (el.hasAttribute('data-hce-text')) {
      addedBlocks.push({
        id: newId,
        tag: el.tagName.toLowerCase(),
        text: el.textContent,
      });
    }
  };
  if (clone.hasAttribute('data-block-id')) reassign(clone);
  clone.querySelectorAll('[data-block-id]').forEach(reassign);

  // Insert immediately after the original.
  if (target.nextSibling) {
    target.parentNode.insertBefore(clone, target.nextSibling);
  } else {
    target.parentNode.appendChild(clone);
  }

  return {
    skeleton: '<!DOCTYPE html>\n' + doc.documentElement.outerHTML,
    addedBlocks,
    // Serialized HTML of the clone — the caller injects this into the
    // live iframe DOM so the page doesn't have to be re-rendered (which
    // would lose the user's scroll position).
    clonedHTML: clone.outerHTML,
    originalId: elementId,
  };
}

/**
 * Remove the column containing `cellId`. Walks every <tr> in the
 * cell's <table>, deletes the cell at the same index.
 * Returns the new skeleton + removedIds (every block-id removed).
 */
export function removeColumnFromSkeleton(skeleton, cellId) {
  const doc = new DOMParser().parseFromString(skeleton, 'text/html');
  const cell = doc.querySelector(`[data-block-id="${cellId}"]`);
  if (!cell) return { skeleton, removedIds: [] };

  // Climb to the enclosing TD/TH if click landed on a descendant.
  let targetCell = cell;
  while (targetCell && targetCell.tagName !== 'TD' && targetCell.tagName !== 'TH') {
    if (targetCell.tagName === 'TABLE' || !targetCell.parentElement) return { skeleton, removedIds: [] };
    targetCell = targetCell.parentElement;
  }
  if (!targetCell || (targetCell.tagName !== 'TD' && targetCell.tagName !== 'TH')) {
    return { skeleton, removedIds: [] };
  }

  const tr = targetCell.parentElement;
  if (!tr) return { skeleton, removedIds: [] };
  const colIndex = Array.from(tr.children).indexOf(targetCell);

  let table = tr.parentElement;
  while (table && table.tagName !== 'TABLE') table = table.parentElement;
  if (!table) return { skeleton, removedIds: [] };

  const removedIds = [];
  table.querySelectorAll('tr').forEach(row => {
    const rowCells = Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
    if (colIndex >= rowCells.length) return;
    const victim = rowCells[colIndex];
    if (victim.hasAttribute('data-block-id')) {
      removedIds.push(victim.getAttribute('data-block-id'));
    }
    victim.querySelectorAll('[data-block-id]').forEach(el => {
      removedIds.push(el.getAttribute('data-block-id'));
    });
    victim.remove();
  });

  return {
    skeleton: '<!DOCTYPE html>\n' + doc.documentElement.outerHTML,
    removedIds,
  };
}

/**
 * Duplicate the column containing `cellId`. Walks every <tr> in the
 * cell's <table>, clones the cell at the same index, and inserts after.
 * Returns the new skeleton, added blocks, and a list of insertions
 * (so the caller can patch the live iframe DOM surgically).
 */
export function duplicateColumnInSkeleton(skeleton, cellId, existingBlocks) {
  const doc = new DOMParser().parseFromString(skeleton, 'text/html');
  const cell = doc.querySelector(`[data-block-id="${cellId}"]`);
  if (!cell) return { skeleton, addedBlocks: [], insertions: [] };

  // Climb to the enclosing TD/TH if the click was on a descendant.
  let targetCell = cell;
  while (targetCell && targetCell.tagName !== 'TD' && targetCell.tagName !== 'TH') {
    if (targetCell.tagName === 'TABLE' || !targetCell.parentElement) return { skeleton, addedBlocks: [], insertions: [] };
    targetCell = targetCell.parentElement;
  }
  if (!targetCell || (targetCell.tagName !== 'TD' && targetCell.tagName !== 'TH')) {
    return { skeleton, addedBlocks: [], insertions: [] };
  }

  const tr = targetCell.parentElement;
  if (!tr) return { skeleton, addedBlocks: [], insertions: [] };
  const colIndex = Array.from(tr.children).indexOf(targetCell);

  let table = tr.parentElement;
  while (table && table.tagName !== 'TABLE') table = table.parentElement;
  if (!table) return { skeleton, addedBlocks: [], insertions: [] };

  // ID counter, primed from existing usage.
  const used = new Set();
  doc.querySelectorAll('[data-block-id]').forEach(el => {
    const m = /^b(\d+)$/.exec(el.getAttribute('data-block-id') || '');
    if (m) used.add(+m[1]);
  });
  (existingBlocks || []).forEach(b => {
    const m = /^b(\d+)$/.exec(b.id || '');
    if (m) used.add(+m[1]);
  });
  let counter = 0;
  for (const n of used) if (n > counter) counter = n;

  const addedBlocks = [];
  const insertions = [];

  table.querySelectorAll('tr').forEach(row => {
    const rowCells = Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
    if (colIndex >= rowCells.length) return;
    const orig = rowCells[colIndex];
    if (!orig.hasAttribute('data-block-id')) return;
    const clone = orig.cloneNode(true);

    const reassign = (el) => {
      const newId = 'b' + (++counter);
      el.setAttribute('data-block-id', newId);
      if (el.hasAttribute('data-hce-text')) {
        addedBlocks.push({ id: newId, tag: el.tagName.toLowerCase(), text: el.textContent });
      }
    };
    if (clone.hasAttribute('data-block-id')) reassign(clone);
    clone.querySelectorAll('[data-block-id]').forEach(reassign);

    if (orig.nextSibling) row.insertBefore(clone, orig.nextSibling);
    else row.appendChild(clone);

    insertions.push({
      afterId: orig.getAttribute('data-block-id'),
      html: clone.outerHTML,
    });
  });

  return {
    skeleton: '<!DOCTYPE html>\n' + doc.documentElement.outerHTML,
    addedBlocks,
    insertions,
  };
}

export function snippetForBlock(block, maxLen = 60) {
  const t = (block.text || '').trim().replace(/\s+/g, ' ');
  if (!t) return `[${block.tag}]`;
  return t.length > maxLen ? t.slice(0, maxLen) + '…' : t;
}

export function describeElement(skeleton, elementId) {
  const doc = new DOMParser().parseFromString(skeleton, 'text/html');
  const el = doc.querySelector(`[data-block-id="${elementId}"]`);
  if (!el) return { tag: '?', snippet: '' };
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
  const snippet = text ? (text.length > 60 ? text.slice(0, 60) + '…' : text) : `<${tag}>`;
  return { tag, snippet };
}
