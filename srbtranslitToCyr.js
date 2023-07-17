/*eslint-env es6*/
/*global document*/
// noinspection JSNonASCIINames
let replaceLatToCyr = {
    // multi letters first
    "Nja": "Ња",
    "Nje": "Ње",
    "Nji": "Њи",
    "Njo": "Њо",
    "Nju": "Њу",
    "Lja": "Ља",
    "Lje": "Ље",
    "Lji": "Љи",
    "Ljo": "Љо",
    "Lju": "Љу",
    "Dža": "Џа",
    "Dže": "Џе",
    "Dži": "Џи",
    "Džo": "Џо",
    "Džu": "Џу",
    "LJ": "Љ",
    "NJ": "Њ",
    "DŽ": "Џ",
    "nj": "њ",
    "lj": "љ",
    "dž": "џ",
    // then the rest
    "A": "А",
    "B": "Б",
    "V": "В",
    "G": "Г",
    "D": "Д",
    "Đ": "Ђ",
    "E": "Е",
    "Ž": "Ж",
    "Z": "З",
    "I": "И",
    "J": "Ј",
    "K": "К",
    "L": "Л",
    "M": "М",
    "N": "Н",
    "O": "О",
    "P": "П",
    "R": "Р",
    "S": "С",
    "Š": "Ш",
    "T": "Т",
    "Ć": "Ћ",
    "U": "У",
    "F": "Ф",
    "H": "Х",
    "C": "Ц",
    "Č": "Ч",
    "a": "а",
    "b": "б",
    "v": "в",
    "g": "г",
    "d": "д",
    "đ": "ђ",
    "e": "е",
    "ž": "ж",
    "z": "з",
    "i": "и",
    "j": "ј",
    "k": "к",
    "l": "л",
    "m": "м",
    "n": "н",
    "o": "о",
    "p": "п",
    "r": "р",
    "s": "с",
    "š": "ш",
    "t": "т",
    "ć": "ћ",
    "u": "у",
    "f": "ф",
    "h": "х",
    "c": "ц",
    "č": "ч",
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

function transliterateToCyr(word) {
  'use strict';
  //TODO needs better splitting to assume multi characters
  return word.split('').map(function (char) {
    return replaceLatToCyr[char] || char;
  }).join('');
}

function iterator(text) {
  if (text.nodeValue && text.nodeValue.trim() !== '') {
    text.nodeValue = transliterateToCyr(text.nodeValue);
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
        elem.textContent = transliterateToCyr(elem.textContent);
      }
    } else {
      elem.childNodes.forEach(iterator);
    }
  }
}

srbTranslit();
