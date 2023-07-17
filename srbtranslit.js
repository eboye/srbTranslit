/*eslint-env es6*/
/*global document*/
let replace = {
    "А": "A",
    "Б": "B",
    "В": "V",
    "Г": "G",
    "Д": "D",
    "Ђ": "Đ",
    "Е": "E",
    "Ж": "Ž",
    "З": "Z",
    "И": "I",
    "Ј": "J",
    "К": "K",
    "Л": "L",
    "Љ": "LJ",
    "М": "M",
    "Н": "N",
    "Њ": "NJ",
    "О": "O",
    "П": "P",
    "Р": "R",
    "С": "S",
    "Ш": "Š",
    "Т": "T",
    "Ћ": "Ć",
    "У": "U",
    "Ф": "F",
    "Х": "H",
    "Ц": "C",
    "Ч": "Č",
    "Џ": "DŽ",
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "ђ": "đ",
    "е": "e",
    "ж": "ž",
    "з": "z",
    "и": "i",
    "ј": "j",
    "к": "k",
    "л": "l",
    "љ": "lj",
    "м": "m",
    "н": "n",
    "њ": "nj",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "ш": "š",
    "т": "t",
    "ћ": "ć",
    "у": "u",
    "ф": "f",
    "х": "h",
    "ц": "c",
    "ч": "č",
    "џ": "dž",
    "Ња": "Nja",
    "Ње": "Nje",
    "Њи": "Nji",
    "Њо": "Njo",
    "Њу": "Nju",
    "Ља": "Lja",
    "Ље": "Lje",
    "Љи": "Lji",
    "Љо": "Ljo",
    "Љу": "Lju",
    "Џа": "Dža",
    "Џе": "Dže",
    "Џи": "Dži",
    "Џо": "Džo",
    "Џу": "Džu",
    ".срб": ".срб",
    "иѕ.срб": "иѕ.срб",
    "њњњ.из.срб": "њњњ.из.срб",
    ".СРБ": ".СРБ",
    "ИЗ.СРБ": "ИЗ.СРБ",
    "ЊЊЊ.ИЗ.СРБ": "ЊЊЊ.ИЗ.СРБ"
  },
  getElementsWithNoChildren = function (target) {
    'use strict';
    let candidates;

    if (target && typeof target.querySelectorAll === 'function') {
      candidates = target.querySelectorAll('*');
    } else if (target && typeof target.length === 'number') {
      candidates = target;
    } else {
      candidates = document.querySelectorAll('*');
    }

    return Array.from(candidates).filter((elem) => {
      if (elem.children.length === 0) {
        return true;
      } else {
        let pass = false;
        elem.childNodes.forEach(function (text) {
          if (typeof text.nodeValue !== 'undefined') {
            pass = typeof text.nodeValue !== 'undefined';
          }
        });
        return pass;
      }
      // return elem.children.length === 0;
    });
  },
  allElements;

function transliterate(word) {
  'use strict';
  return word.split('').map(function (char) {
    return replace[char] || char;
  }).join('');
}

function iterator(text) {
  if (text.nodeValue && text.nodeValue.trim() !== '') {
    text.nodeValue = transliterate(text.nodeValue);
  }
}

function srbTranslit() {
  'use strict';
  let x,
    elem;
  allElements = getElementsWithNoChildren(document);

  for (x = 0; x < allElements.length; x += 1) {
    elem = allElements[x];
    if (elem.children.length === 0) {
      if (elem.textContent && elem.textContent !== '') {
        elem.textContent = transliterate(elem.textContent);
      }
    } else {
      elem.childNodes.forEach(iterator);
    }
  }
}

srbTranslit();
