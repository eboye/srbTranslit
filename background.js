/*global browser, console*/
browser.action.onClicked.addListener(async (tab) => {
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
});
