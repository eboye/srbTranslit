/*global browser, console*/

/**
 * Execute a content script for transliteration in a given tab.
 *
 * @param {Object} tab - A tab object from browser.tabs API
 * @param {String} direction - The direction of transliteration: 'cyr_to_lat' or 'lat_to_cyr'
 */
async function execute(tab, direction) {
  const file = direction === 'cyr_to_lat' ? 'srbtranslit.js' : 'srbtranslitToCyr.js';
  try {
    await browser.scripting.executeScript({
      target: {
        tabId: tab.id,
        allFrames: true,
      },
      files: [file],
    });
  } catch (err) {
    console.error(`[srbTranslit] failed to execute script: ${err}`);
  }
}

/**
 * Given a URL string, extract the hostname.
 *
 * @param {String} url - The URL string
 * @return {String|null} The extracted hostname, or null if the URL is malformed
 */
function getHostname(url) {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch (e) {
    return null;
  }
}

/**
 * Extract the registrable domain (e.g., example.com) from a hostname.
 *
 * @param {String} hostname - The hostname string
 * @return {String|null} The extracted registrable domain
 */
function registrableDomain(hostname) {
  if (!hostname) return null;
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  // Common second-level domains in Serbia and globally
  const knownSecondLevel = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'in', 'rs']);
  if (tld.length === 2 && knownSecondLevel.has(sld)) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/**
 * Given a registrable domain, return origin patterns for permissions.
 *
 * @param {String} base - The registrable domain
 * @return {Array<String>} List of origin patterns
 */
function originPatternsForBase(base) {
  if (!base) return [];
  return [
    `*://${base}/*`,
    `*://*.${base}/*`,
  ];
}

/**
 * Check if the extension has been granted permission for the given origins.
 */
async function hasOrigins(origins) {
  try {
    for (const o of origins) {
      const ok = await browser.permissions.contains({origins: [o]});
      if (ok) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Ensure permission for the given base domain, prompting the user if necessary.
 */
async function ensurePermissionForBase(baseDomain, canPrompt) {
  const origins = originPatternsForBase(baseDomain);
  const has = await hasOrigins(origins);
  if (has) return true;
  if (!canPrompt) return false;
  try {
    return await browser.permissions.request({origins});
  } catch (e) {
    return false;
  }
}

/**
 * Throttled notification for missing permissions.
 */
async function notifyMissingPermission(base) {
  try {
    const {notifiedMissingPermission = {}} = await browser.storage.local.get('notifiedMissingPermission');
    const last = notifiedMissingPermission[base] || 0;
    const now = Date.now();
    if (now - last > 6 * 60 * 60 * 1000) { // 6 hours
      notifiedMissingPermission[base] = now;
      await browser.storage.local.set({notifiedMissingPermission});
      await browser.notifications.create(`srbtranslit-missing-${base}`, {
        type: 'basic',
        iconUrl: 'is-on.png',
        title: 'srbTranslit needs permission',
        message: `Click the srbTranslit toolbar icon to grant access to ${base} so it can auto-transliterate.`
      });
    }
  } catch (_) {}
}

/**
 * Get the map of enabled domains and their directions.
 */
async function getEnabledMap() {
  const {enabledDomains} = await browser.storage.local.get('enabledDomains');
  if (Array.isArray(enabledDomains)) {
    // Migration from old array format
    const map = {};
    for (const d of enabledDomains) map[d] = {direction: 'lat_to_cyr'};
    return map;
  }
  return enabledDomains || {};
}

async function setEnabledMap(map) {
  await browser.storage.local.set({enabledDomains: map});
}

async function findRuleForUrl(url) {
  const host = getHostname(url);
  if (!host) return null;
  const map = await getEnabledMap();
  const base = registrableDomain(host);
  if (map[base]) return {key: base, rule: map[base]};
  // Fallback for subdomains if not matched by base
  for (const key of Object.keys(map)) {
    if (host === key || host.endsWith('.' + key)) {
      return {key, rule: map[key]};
    }
  }
  return null;
}

/**
 * Updates the icon, title, and badge for a tab based on its state.
 */
async function updateActionIconForTab(tabId, url) {
  try {
    const match = await findRuleForUrl(url);
    const enabled = !!match;
    const dir = match?.rule?.direction || 'lat_to_cyr';
    
    await browser.action.setIcon({tabId, path: enabled ? 'is-on.png' : 'is-off.png'});
    
    let title = enabled 
      ? `srbTranslit: enabled (${dir === 'lat_to_cyr' ? 'to Latin' : 'to Cyrillic'})` 
      : 'srbTranslit: click to enable on this domain';
    
    if (enabled) {
      const host = getHostname(url);
      const base = registrableDomain(host);
      const hasPerm = await hasOrigins(originPatternsForBase(base));
      if (!hasPerm) {
        title = `srbTranslit: needs permission for ${base}. Click to grant.`;
        await browser.action.setBadgeText({tabId, text: '!'});
        await browser.action.setBadgeBackgroundColor({tabId, color: '#d0021b'});
      } else {
        await browser.action.setBadgeText({tabId, text: ''});
      }
    } else {
      await browser.action.setBadgeText({tabId, text: ''});
    }
    await browser.action.setTitle({tabId, title});
  } catch (e) {}
}

// --- Event Listeners ---

browser.contextMenus.create({
  id: "transliterate-to-lat",
  title: "Preslovi u latinicu (Alt+Shift+L)",
  contexts: ["page"],
});

browser.contextMenus.create({
  id: "transliterate-to-cyr",
  title: "Преслови у ћирилицу (Alt+Shift+C)",
  contexts: ["page"],
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "transliterate-to-lat") {
    await execute(tab, 'cyr_to_lat');
  } else if (info.menuItemId === "transliterate-to-cyr") {
    await execute(tab, 'lat_to_cyr');
  }
});

browser.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.url) return;
  const host = getHostname(tab.url);
  const base = registrableDomain(host);
  if (!base) return;

  const match = await findRuleForUrl(tab.url);
  if (match) {
    const hasPerm = await hasOrigins(originPatternsForBase(base));
    if (!hasPerm) {
      const granted = await ensurePermissionForBase(base, true);
      if (granted) await execute(tab, match.rule.direction);
    } else {
      // Toggle off
      const map = await getEnabledMap();
      delete map[base];
      await setEnabledMap(map);
    }
  } else {
    const granted = await ensurePermissionForBase(base, true);
    const map = await getEnabledMap();
    map[base] = {direction: 'lat_to_cyr'};
    await setEnabledMap(map);
    if (granted) await execute(tab, 'lat_to_cyr');
  }
  await updateActionIconForTab(tab.id, tab.url);
});

async function maybeAutoTransliterate(details) {
  if (details.frameId !== 0) return;
  const match = await findRuleForUrl(details.url);
  if (match) {
    const base = registrableDomain(getHostname(details.url));
    const hasPerm = await hasOrigins(originPatternsForBase(base));
    if (hasPerm) {
      await execute({id: details.tabId}, match.rule.direction);
    } else {
      await notifyMissingPermission(base);
    }
  }
}

browser.webNavigation.onCommitted.addListener(maybeAutoTransliterate);
browser.webNavigation.onHistoryStateUpdated.addListener(maybeAutoTransliterate);
browser.webNavigation.onCompleted.addListener(maybeAutoTransliterate);

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.url) {
    await updateActionIconForTab(tabId, tab.url || '');
  }
});

browser.tabs.onActivated.addListener(async ({tabId}) => {
  try {
    const tab = await browser.tabs.get(tabId);
    await updateActionIconForTab(tabId, tab.url || '');
  } catch (_) {}
});

// --- Keyboard Shortcut Support ---
browser.commands.onCommand.addListener(async (command) => {
  const tabs = await browser.tabs.query({active: true, currentWindow: true});
  const tab = tabs[0];
  if (!tab || !tab.url) return;

  if (command === "toggle-transliteration") {
    const host = getHostname(tab.url);
    const base = registrableDomain(host);
    if (!base) return;

    const match = await findRuleForUrl(tab.url);
    const map = await getEnabledMap();
    
    if (match) {
      // Rotate directions: to Latin -> to Cyrillic -> Off
      if (match.rule.direction === 'cyr_to_lat') {
        map[base].direction = 'lat_to_cyr';
      } else {
        delete map[base];
      }
    } else {
      map[base] = {direction: 'cyr_to_lat'};
    }
    
    await setEnabledMap(map);
    await updateActionIconForTab(tab.id, tab.url);
    
    const newMatch = map[base];
    if (newMatch) {
      const hasPerm = await hasOrigins(originPatternsForBase(base));
      if (hasPerm) {
        await execute(tab, newMatch.direction);
      } else {
        await ensurePermissionForBase(base, true);
      }
    }
  } else if (command === "run-to-latin") {
    await execute(tab, 'cyr_to_lat');
  } else if (command === "run-to-cyrillic") {
    await execute(tab, 'lat_to_cyr');
  }
});

// --- Messaging for popup UI ---
browser.runtime.onMessage.addListener((message, sender) => {
  const handleMessage = async () => {
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    const tab = tabs[0];
    const url = tab?.url || '';
    const host = getHostname(url);
    const base = registrableDomain(host);

    switch (message?.type) {
      case 'srb:getState': {
        const match = url ? await findRuleForUrl(url) : null;
        const hasPerm = base ? await hasOrigins(originPatternsForBase(base)) : false;
        return {
          url,
          domain: base || host || '',
          hasPermission: !!hasPerm,
          ruleDirection: match?.rule?.direction || null,
          hasRule: !!match,
        };
      }
      case 'srb:setRule': {
        if (!tab || !base) return {ok: false};
        const map = await getEnabledMap();
        map[base] = {direction: message.direction};
        await setEnabledMap(map);
        await updateActionIconForTab(tab.id, url);
        if (message.run) {
          const hasPerm = await hasOrigins(originPatternsForBase(base));
          if (hasPerm) await execute(tab, message.direction);
        }
        return {ok: true};
      }
      case 'srb:removeRule': {
        if (!base) return {ok: false};
        const map = await getEnabledMap();
        delete map[base];
        await setEnabledMap(map);
        await updateActionIconForTab(tab.id, url);
        return {ok: true};
      }
      case 'srb:runOnce': {
        if (!tab) return {ok: false};
        await execute(tab, message.direction);
        return {ok: true};
      }
    }
  };
  return handleMessage();
});
