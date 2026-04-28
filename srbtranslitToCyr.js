/*eslint-env es6*/
/*global document, NodeFilter, MutationObserver*/
(function () {
  'use strict';

  // 1) Multi-letter sequences (Case-aware)
  const SEQ_MAP_LAT2CYR = {
    'dž': 'џ', 'Dž': 'Џ', 'DŽ': 'Џ', 'dZ': 'џ',
    'dz': 'џ', 'Dz': 'Џ', 'DZ': 'Џ', 'dZ': 'џ',
    'nj': 'њ', 'Nj': 'Њ', 'NJ': 'Њ', 'nJ': 'њ',
    'lj': 'љ', 'Lj': 'Љ', 'LJ': 'Љ', 'lJ': 'љ',
    'dj': 'ђ', 'Dj': 'Ђ', 'DJ': 'Ђ', 'dJ': 'ђ'
  };

  // 2) Single-letter Latin → Cyrillic map
  const SINGLE_MAP_LAT2CYR = {
    'A': 'А', 'B': 'Б', 'V': 'В', 'G': 'Г', 'D': 'Д', 'Đ': 'Ђ', 'E': 'Е', 'Ž': 'Ж', 'Z': 'З',
    'I': 'И', 'J': 'Ј', 'K': 'К', 'L': 'Л', 'M': 'М', 'N': 'Н', 'O': 'О', 'P': 'П', 'R': 'Р',
    'S': 'С', 'Š': 'Ш', 'T': 'Т', 'Ć': 'Ћ', 'U': 'У', 'F': 'Ф', 'H': 'Х', 'C': 'Ц', 'Č': 'Ч',
    'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'đ': 'ђ', 'e': 'е', 'ž': 'ж', 'z': 'з',
    'i': 'и', 'j': 'ј', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о', 'p': 'п', 'r': 'р',
    's': 'с', 'š': 'ш', 't': 'т', 'ć': 'ћ', 'u': 'у', 'f': 'ф', 'h': 'х', 'c': 'ц', 'č': 'ч'
  };

  const SEQ_REGEX = new RegExp(Object.keys(SEQ_MAP_LAT2CYR).join('|'), 'g');
  const SINGLE_REGEX = new RegExp(Object.keys(SINGLE_MAP_LAT2CYR).join('|'), 'g');

  /**
   * Linguistic exceptions where digraphs should NOT be merged.
   * We handle these by pre-transliterating them into separate Cyrillic letters.
   */
  function applyExceptions(text) {
    // nj -> нј (e.g. injekcija, konjunkcija, tanjon)
    text = text.replace(/(i|ko)nj(u[nk])/gi, function(match, p1, p2) {
      const N = p1.endsWith(p1.toLowerCase()) ? 'н' : 'Н';
      const J = 'ј'; // usually followed by lowercase 'u'
      return p1 + N + J + p2;
    });
    text = text.replace(/tanjon/gi, function(match) {
      return match.charAt(0) === 't' ? 'танјон' : 'ТАНЈОН';
    });
    text = text.replace(/vanjezič/gi, function(match) {
      return match.charAt(0) === 'v' ? 'ванјезич' : 'ВАНЈЕЗИЧ';
    });

    // dj -> дј (prefixes od-, pod-, pred-, nad- before j)
    const djPrefixes = ['od', 'pod', 'pred', 'nad'];
    djPrefixes.forEach(prefix => {
      const re = new RegExp('\\b(' + prefix + ')j', 'gi');
      text = text.replace(re, function(match, p1) {
        // Transliterate prefix normally, but keep j separate
        let cyrPrefix = p1.split('').map(c => SINGLE_MAP_LAT2CYR[c] || c).join('');
        return cyrPrefix + 'ј';
      });
    });

    // dž -> дж (prefixes nad-, pod- before ž)
    const dzPrefixes = ['nad', 'pod'];
    dzPrefixes.forEach(prefix => {
      const re = new RegExp('\\b(' + prefix + ')ž', 'gi');
      text = text.replace(re, function(match, p1) {
        let cyrPrefix = p1.split('').map(c => SINGLE_MAP_LAT2CYR[c] || c).join('');
        return cyrPrefix + 'ж';
      });
    });

    return text;
  }

  /**
   * Transliterates a string of text from Latin to Cyrillic.
   * @param {string} txt - The text to transliterate.
   * @returns {string} The transliterated text.
   */
  function transliterate(txt) {
    if (!txt || !txt.trim()) return txt;
    
    // 1. Apply linguistic exceptions first
    let out = applyExceptions(txt);
    
    // 2. Transliterate digraphs (nj, lj, dž, dj)
    out = out.replace(SEQ_REGEX, m => SEQ_MAP_LAT2CYR[m]);
    
    // 3. Transliterate remaining single letters
    out = out.replace(SINGLE_REGEX, m => SINGLE_MAP_LAT2CYR[m]);
    
    return out;
  }

  /**
   * Determines whether a node should be skipped during transliteration.
   */
  function shouldSkipNode(node) {
    const p = node.parentNode;
    if (!p) return false;
    const tag = (p.nodeName || '').toLowerCase();
    const skipTags = ['script', 'style', 'noscript', 'textarea', 'code', 'pre', 'kbd', 'math'];
    if (skipTags.indexOf(tag) !== -1) return true;
    if (p.isContentEditable) return true;
    if (p.classList && (p.classList.contains('syntaxhighlighter') || p.classList.contains('notranslate'))) return true;
    return false;
  }

  /**
   * Scans the document and transliterates all suitable text nodes.
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
  const observer = new MutationObserver(function (mutations) {
    const addedNodes = [];
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === 1 || node.nodeType === 3) {
          addedNodes.push(node);
        }
      });
    });

    if (addedNodes.length > 0) {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(function () {
        addedNodes.forEach(function (node) {
          if (node.nodeType === 3) {
            if (!shouldSkipNode(node) && node.nodeValue && node.nodeValue.trim() !== '') {
              node.nodeValue = transliterate(node.nodeValue);
            }
          } else {
            srbTranslit(node);
          }
        });
      }, 150);
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

})();
