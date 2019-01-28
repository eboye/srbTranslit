/*global browser, console*/
function onTabLoad(details) {
  'use strict';
  browser.tabs.executeScript(details.tabId, {
    file: 'srbtranslit.js',
    allFrames: true
  });
}

browser.browserAction.onClicked.addListener(onTabLoad);
