/*eslint-env es6*/
/*global document*/
// Reliable Latin → Cyrillic transliteration using sequence-first replacement
// and a TreeWalker over text nodes. Mirrors the performance approach in srbtranslit.js

// 1) Multi-letter sequences (case-aware)
// noinspection JSNonASCIINames
const SEQ_MAP_LAT2CYR = {
  // dž / dz families → Џ/џ
  'dž': 'џ', 'Dž': 'Џ', 'DŽ': 'Џ', 'dz': 'џ', 'Dz': 'Џ', 'DZ': 'Џ',
  // nj → њ/Њ
  'nj': 'њ', 'Nj': 'Њ', 'NJ': 'Њ',
  // lj → љ/Љ
  'lj': 'љ', 'Lj': 'Љ', 'LJ': 'Љ',
  // dj → ђ/Ђ
  'dj': 'ђ', 'Dj': 'Ђ', 'DJ': 'Ђ'
};

// 2) Single-letter Latin → Cyrillic map (covers diacritics)
const SINGLE_MAP_LAT2CYR = {
  'A': 'А', 'B': 'Б', 'V': 'В', 'G': 'Г', 'D': 'Д', 'Đ': 'Ђ', 'E': 'Е', 'Ž': 'Ж', 'Z': 'З',
  'I': 'И', 'J': 'Ј', 'K': 'К', 'L': 'Л', 'M': 'М', 'N': 'Н', 'O': 'О', 'P': 'П', 'R': 'Р',
  'S': 'С', 'Š': 'Ш', 'T': 'Т', 'Ć': 'Ћ', 'U': 'У', 'F': 'Ф', 'H': 'Х', 'C': 'Ц', 'Č': 'Ч',
  'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'đ': 'ђ', 'e': 'е', 'ž': 'ж', 'z': 'з',
  'i': 'и', 'j': 'ј', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о', 'p': 'п', 'r': 'р',
  's': 'с', 'š': 'ш', 't': 'т', 'ć': 'ћ', 'u': 'у', 'f': 'ф', 'h': 'х', 'c': 'ц', 'č': 'ч'
};

const SEQ_REGEX_LAT2CYR = new RegExp(Object.keys(SEQ_MAP_LAT2CYR).join('|'), 'g');
const SINGLE_REGEX_LAT2CYR = new RegExp(Object.keys(SINGLE_MAP_LAT2CYR).join('|'), 'g');

/**
 * @summary Transliterates Latin text to Cyrillic.
 * @description Takes a string of Latin text and returns the same string transliterated to Cyrillic.
 * @param {string} txt Latin text to transliterate.
 * @returns {string} The transliterated Cyrillic text.
 * @example
 * transliterateTextToCyr('Ovo je test') // 'Ово је тест'
 * transliterateTextToCyr('Dobar dan') // 'Добар дан'
 */
function transliterateTextToCyr(txt) {
  if (!txt || !txt.trim()) return txt;
  // First sequences: dž/dz, nj, lj, dj families
  let out = txt.replace(SEQ_REGEX_LAT2CYR, m => SEQ_MAP_LAT2CYR[m]);
  // Then single letters
  out = out.replace(SINGLE_REGEX_LAT2CYR, m => SINGLE_MAP_LAT2CYR[m]);
  return out;
}

/**
 * @summary Determines whether a node should be skipped during transliteration.
 * @description Nodes which are children of elements with the following tags will be skipped:
 *  - `<script>`
 *  - `<style>`
 *  - `<noscript>`
 *  - `<textarea>`
 * Additionally, nodes which are children of elements with contenteditable set to true will be skipped.
 * @param {Node} node The node to be evaluated.
 * @returns {boolean} true if the node should be skipped; false otherwise.
 */
function shouldSkipNode(node) {
  const p = node.parentNode;
  if (!p) return false;
  const tag = (p.nodeName || '').toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'textarea') return true;
  return p.isContentEditable;

}

/**
 * @summary Transliterates all non-skipped text nodes in the document from Latin to Cyrillic.
 * @description Uses a TreeWalker to traverse the document and transliterate all non-skipped text nodes.
 * @see {@link shouldSkipNode} for details on which nodes are skipped.
 * @see {@link transliterateTextToCyr} for details on the transliteration process.
 */
function srbTranslit() {
  'use strict';
  const root = document.body || document;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const batch = [];
  let node;
  while ((node = walker.nextNode())) {
    if (!shouldSkipNode(node) && node.nodeValue && node.nodeValue.trim() !== '') {
      batch.push(node);
    }
  }
  for (const textNode of batch) {
    textNode.nodeValue = transliterateTextToCyr(textNode.nodeValue);
  }
}

srbTranslit();
