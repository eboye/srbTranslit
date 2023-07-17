/*global browser, console*/

async function execute(tab){
  try {
    await browser.scripting.executeScript({
      target: {
        tabId: tab.id,
        allFrames: true,
      },
      files: ['srbtranslit.js'],
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

browser.action.onClicked.addListener(async (tab) => execute(tab));

browser.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case "transliterate-to-lat":
      execute(tab).then(r => void browser.runtime.lastError);
      break;
  }
});
