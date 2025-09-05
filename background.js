/*global browser, console*/

// --- Helpers for executing scripts and managing domain state ---
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

function getHostname(url) {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch (e) {
    return null;
  }
}

function rootFor(hostname) {
  if (!hostname) return null;
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

// Storage shape (v2): { [rootDomain: string]: { direction: 'lat_to_cyr' | 'cyr_to_lat' } }
async function getEnabledMap() {
  const {enabledDomains} = await browser.storage.local.get('enabledDomains');
  // Migrate legacy array form to map
  if (Array.isArray(enabledDomains)) {
    const map = {};
    for (const d of enabledDomains) map[d] = {direction: 'lat_to_cyr'};
    return map;
  }
  // Already a map or undefined
  return enabledDomains || {};
}

async function setEnabledMap(map) {
  await browser.storage.local.set({enabledDomains: map});
}

async function findRuleForUrl(url) {
  const host = getHostname(url);
  if (!host) return null;
  const map = await getEnabledMap();
  for (const key of Object.keys(map)) {
    if (host === key || host.endsWith('.' + key)) {
      return {key, rule: map[key]};
    }
  }
  return null;
}

async function upsertRuleForTab(tab, desiredDirection) {
  if (!tab || !tab.url) return;
  const host = getHostname(tab.url);
  const base = rootFor(host);
  if (!base) return;
  const map = await getEnabledMap();
  map[base] = {direction: desiredDirection || (map[base]?.direction || 'lat_to_cyr')};
  await setEnabledMap(map);
  try {
    console.log('[srbTranslit] Enabled', base, 'direction:', map[base].direction);
  } catch (_) {
  }
}

async function removeRuleForTab(tab) {
  if (!tab || !tab.url) return;
  const host = getHostname(tab.url);
  const base = rootFor(host);
  if (!base) return;
  const map = await getEnabledMap();
  delete map[base];
  await setEnabledMap(map);
  try {
    console.log('[srbTranslit] Disabled', base);
  } catch (_) {
  }
}

async function updateActionIconForTab(tabId, url) {
  try {
    const match = await findRuleForUrl(url);
    const enabled = !!match;
    const dir = match?.rule?.direction || 'lat_to_cyr';
    await browser.action.setIcon({tabId, path: enabled ? 'is-on.png' : 'is-off.png'});
    const title = enabled ? `srbTranslit: enabled (${dir === 'lat_to_cyr' ? 'to Latin' : 'to Cyrillic'}) for this domain (incl. subdomains)` : 'srbTranslit: click to enable on this domain (incl. subdomains)';
    await browser.action.setTitle({tabId, title});
  } catch (e) {
    // ignore
  }
}

// --- Context menus remain available for one-off conversions ---
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

// New context menus for persistent per-domain preference
browser.contextMenus.create(
  {
    id: "always-enable-domain-lat",
    title: "Always transliterate to Latin on this domain",
    contexts: ["page"],
  },
  () => void browser.runtime.lastError,
);

browser.contextMenus.create(
  {
    id: "always-enable-domain-cyr",
    title: "Always transliterate to Cyrillic on this domain (experimental)",
    contexts: ["page"],
  },
  () => void browser.runtime.lastError,
);

browser.contextMenus.create(
  {
    id: "stop-auto-domain",
    title: "Stop auto-transliteration on this domain",
    contexts: ["page"],
  },
  () => void browser.runtime.lastError,
);

browser.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case "transliterate-to-lat":
      execute(tab, 'lat_to_cyr').then(r => void browser.runtime.lastError);
      break;
    case "transliterate-to-cyr":
      execute(tab, 'cyr_to_lat').then(r => void browser.runtime.lastError);
      break;
    case "always-enable-domain-lat":
      (async () => {
        await upsertRuleForTab(tab, 'lat_to_cyr');
        await updateActionIconForTab(tab.id, tab.url);
        await execute(tab, 'lat_to_cyr');
      })();
      break;
    case "always-enable-domain-cyr":
      (async () => {
        await upsertRuleForTab(tab, 'cyr_to_lat');
        await updateActionIconForTab(tab.id, tab.url);
        await execute(tab, 'cyr_to_lat');
      })();
      break;
    case "stop-auto-domain":
      (async () => {
        await removeRuleForTab(tab);
        await updateActionIconForTab(tab.id, tab.url);
      })();
      break;
  }
});

// Dynamically adjust menu titles based on current page domain and state
browser.contextMenus.onShown.addListener(async (info, tab) => {
  const host = getHostname(tab?.url || '');
  const base = rootFor(host);
  const match = await findRuleForUrl(tab?.url || '');
  const enabled = !!match;
  const dir = match?.rule?.direction || 'lat_to_cyr';

  try {
    await browser.contextMenus.update('always-enable-domain-lat', {
      title: `Always transliterate to Latin on ${base || 'this domain'}`,
      enabled: !!base && (!enabled || dir !== 'lat_to_cyr')
    });
    await browser.contextMenus.update('always-enable-domain-cyr', {
      title: `Always transliterate to Cyrillic on ${base || 'this domain'} (experimental)`,
      enabled: !!base && (!enabled || dir !== 'cyr_to_lat')
    });
    await browser.contextMenus.update('stop-auto-domain', {
      title: `Stop auto-transliteration on ${base || 'this domain'}`,
      enabled: enabled
    });
  } catch (e) {
    // ignore update errors
  }

  try {
    await browser.contextMenus.refresh();
  } catch (e) { /* ignore */
  }
});

// --- Toolbar button toggles remembering the current domain ---
browser.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.url) return;
  const host = getHostname(tab.url);
  const base = rootFor(host);
  if (!base) return;

  const match = await findRuleForUrl(tab.url);
  if (match) {
    await removeRuleForTab(tab);
  } else {
    await upsertRuleForTab(tab, 'lat_to_cyr'); // default direction when toggling via icon
    // Immediately transliterate current page when enabling
    await execute(tab, 'lat_to_cyr');
  }

  await updateActionIconForTab(tab.id, tab.url);
});

// --- Auto-apply on navigation for remembered domains ---
async function maybeAutoTransliterate(details) {
  if (details.frameId !== 0) return; // run once per top-level navigation
  const url = details.url;
  try {
    console.debug('[srbTranslit] Nav event', details.transitionType || details.reason || 'unknown', 'url:', url);
  } catch (_) {
  }
  const match = await findRuleForUrl(url);
  if (match) {
    try {
      await execute({id: details.tabId}, match.rule.direction || 'lat_to_cyr');
      try {
        console.log('[srbTranslit] Auto-applied on', url, 'direction:', match.rule.direction || 'lat_to_cyr');
      } catch (_) {
      }
    } catch (e) {
      console.error('Auto transliteration failed', e);
    }
  }
}

browser.webNavigation.onCommitted.addListener(maybeAutoTransliterate);
browser.webNavigation.onHistoryStateUpdated.addListener(maybeAutoTransliterate);
// Some sites only become stable at onCompleted
browser.webNavigation.onCompleted.addListener(async (details) => {
  try {
    await maybeAutoTransliterate(details);
  } catch (e) {
    console.error('Auto transliteration (onCompleted) failed', e);
  }
});

// Update icon whenever a tab updates or becomes active
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const currentUrl = tab.url || changeInfo.url || '';
  if (changeInfo.status === 'loading' || changeInfo.url) {
    await updateActionIconForTab(tabId, currentUrl);
  }
  // Additionally, try to auto-apply when the tab finishes loading.
  if (changeInfo.status === 'complete' && currentUrl) {
    const match = await findRuleForUrl(currentUrl);
    if (match) {
      try {
        await execute({id: tabId}, match.rule.direction || 'lat_to_cyr');
        try {
          console.log('[srbTranslit] Auto-applied (tabs.onUpdated complete) on', currentUrl, 'direction:', match.rule.direction || 'lat_to_cyr');
        } catch (_) {
        }
      } catch (e) {
        console.error('Auto transliteration (onUpdated) failed', e);
      }
    }
  }
});

browser.tabs.onActivated.addListener(async ({tabId}) => {
  try {
    const tab = await browser.tabs.get(tabId);
    await updateActionIconForTab(tabId, tab.url || '');
  } catch (e) {
    // ignore
  }
});
