/*global browser, console*/

async function execute(tab, direction) {
  const file = direction === 'lat_to_cyr' ? 'srbtranslit.js' : 'srbtranslitToCyr.js';
  try {
    await browser.scripting.executeScript({
      target: {
        tabId: tab.id,
        allFrames: true,
      },
      files: [file],
    });
  } catch (err) {
    console.error(`failed to execute script: ${err}`);
  }
}

browser.contextMenus.create(
  {
    id: "transliterate-to-lat",
    title: "Preslovi u latinicu",
    contexts: ["page"],
  },
  () => void browser.runtime.lastError,
);

browser.contextMenus.create(
  {
    id: "transliterate-to-cyr",
    title: "Преслови у ћирилицу (experimental)",
    contexts: ["page"],
  },
  () => void browser.runtime.lastError,
);

browser.action.onClicked.addListener(async (tab) => execute(tab, 'lat_to_cyr'));

browser.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case "transliterate-to-lat":
      execute(tab, 'lat_to_cyr').then(r => void browser.runtime.lastError);
      break;
    case "transliterate-to-cyr":
      execute(tab, 'cyr_to_lat').then(r => void browser.runtime.lastError);
      break;
  }
});
