/*eslint-env es6*/
/*global document, NodeFilter, MutationObserver*/
(function () {
  'use strict';

  if (window.__srbTranslitCyrToLatActive) return;
  window.__srbTranslitCyrToLatActive = true;

  const replaceMap = {
    "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D", "Ђ": "Đ", "Е": "E", "Ж": "Ž", "З": "Z",
    "И": "I", "Ј": "J", "К": "K", "Л": "L", "Љ": "LJ", "М": "M", "Н": "N", "Њ": "NJ", "О": "O",
    "П": "P", "Р": "R", "С": "S", "Ш": "Š", "Т": "T", "Ћ": "Ć", "У": "U", "Ф": "F", "Х": "H",
    "Ц": "C", "Ч": "Č", "Џ": "DŽ", "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ђ": "đ",
    "е": "e", "ж": "ž", "з": "z", "и": "i", "ј": "j", "к": "k", "л": "l", "љ": "lj", "м": "m",
    "н": "n", "њ": "nj", "о": "o", "п": "p", "р": "r", "с": "s", "ш": "š", "т": "t", "ћ": "ć",
    "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "č", "џ": "dž"
  };

  const regex = new RegExp(Object.keys(replaceMap).join('|'), 'g');

  // Skip scripts, styles, code blocks, and user-editable areas
  const skipTags = ['script', 'style', 'noscript', 'textarea', 'code', 'pre', 'kbd', 'math'];

  /**
   * Transliterates a string of text from Cyrillic to Latin.
   * @param {string} text - The text to transliterate.
   * @returns {string} The transliterated text.
   */
  function transliterate(text) {
    return text.replace(regex, function (m) {
      return replaceMap[m];
    });
  }

  /**
   * Determines whether a node should be skipped during transliteration.
   * Skip logic is crucial to prevent breaking code blocks, scripts, or editable areas.
   * @param {Node} node - The node to evaluate.
   * @returns {boolean} True if the node should be skipped; false otherwise.
   */
  function shouldSkipNode(node) {
    let p = node.parentNode;
    while (p && p.nodeType === 1) {
      const tag = (p.nodeName || '').toLowerCase();
      if (skipTags.indexOf(tag) !== -1) return true;
      if (p.isContentEditable) return true;
      // Also check for common class names that indicate code or non-translatable content
      if (p.classList && (p.classList.contains('syntaxhighlighter') || p.classList.contains('notranslate'))) return true;
      p = p.parentNode;
    }
    return false;
  }

  /**
   * Scans the document (or a specific subtree) and transliterates all suitable text nodes.
   * @param {Node} root - The root node to start scanning from.
   */
  function srbTranslit(root = document.body || document) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!shouldSkipNode(node) && node.nodeValue && node.nodeValue.trim() !== '') {
        nodes.push(node);
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const newVal = transliterate(n.nodeValue);
      if (newVal !== n.nodeValue) {
        n.nodeValue = newVal;
      }
    }
  }

  // Initial run
  srbTranslit();

  // Handle dynamic content via MutationObserver
  let timeout = null;
  const pendingElements = new Set();
  const pendingTextNodes = new Set();
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === 'characterData') {
        pendingTextNodes.add(mutation.target);
        return;
      }
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) {
          pendingElements.add(node);
        } else if (node.nodeType === 3) {
          pendingTextNodes.add(node);
        }
      });
    });

    if (pendingElements.size > 0 || pendingTextNodes.size > 0) {
      // Debounce the transliteration to prevent performance lag on massive DOM updates
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(function () {
        const textNodes = Array.from(pendingTextNodes);
        const elements = Array.from(pendingElements);
        pendingTextNodes.clear();
        pendingElements.clear();
        textNodes.forEach(function (node) {
          if (!shouldSkipNode(node) && node.nodeValue && node.nodeValue.trim() !== '') {
            const newVal = transliterate(node.nodeValue);
            if (newVal !== node.nodeValue) node.nodeValue = newVal;
          }
        });
        elements.forEach(function (node) {
          srbTranslit(node);
        });
      }, 150);
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

})();
