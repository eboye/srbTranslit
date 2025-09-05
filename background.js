/*global browser, console*/

/**
 * Execute a content script for transliteration in a given tab.
 * The content script is chosen based on the given direction:
 *  - 'cyr_to_lat' for srbtranslit.js (Cyrillic → Latin)
 *  - 'lat_to_cyr' for srbtranslitToCyr.js (Latin → Cyrillic)
 *
 * @param {Object} tab - A tab object from browser.tabs API
 * @param {String} direction - The direction of transliteration as 'cyr_to_lat' or 'lat_to_cyr'
 */
async function execute(tab, direction) {
  // Map directions to the correct content script:
  //  - 'cyr_to_lat' should use srbtranslit.js (Cyrillic → Latin)
  //  - 'lat_to_cyr' should use srbtranslitToCyr.js (Latin → Cyrillic)
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
    console.error(`failed to execute script: ${err}`);
  }
}

/**
 * Given a URL string, extract the hostname.
 * If the URL is not parseable, return null.
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
 * Given a hostname, extract the most relevant domain part that
 * should be registered in the browser's permissions.
 * If the hostname is not parseable, return null.
 *
 * @param {String} hostname - The hostname string
 * @return {String|null} The extracted registrable domain, or null if the hostname is malformed
 */
function registrableDomain(hostname) {
  if (!hostname) return null;
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  const knownSecondLevel = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac']);
  if (tld.length === 2 && knownSecondLevel.has(sld)) {
    // e.g., foo.bar.gov.rs -> bar.gov.rs
    return parts.slice(-3).join('.');
  }
  // default: last two labels
  return parts.slice(-2).join('.');
}

/**
 * Given a registrable domain, return a list of origin patterns
 * that will be passed to the browser.permissions API.
 *
 * @param {String} base - The registrable domain as a string
 * @return {Array<String>} A list of origin patterns that will be
 *  passed to the browser.permissions API. If the input base is
 *  falsy, an empty list is returned.
 */
function originPatternsForBase(base) {
  if (!base) return [];
  return [
    `*://${base}/*`,
    `*://*.${base}/*`,
  ];
}

/**
 * Check if the extension has been granted any of the given origins
 * in the browser's permissions.
 *
 * @param {Array<String>} origins - List of origin patterns to check.
 * @return {Promise<Boolean>} A promise resolving to true if the extension
 *  has been granted any of the origins, false if not. If an error occurs,
 *  the promise is rejected or resolved to false.
 */
async function hasOrigins(origins) {
  try {
    for (const o of origins) {
      const ok = browser.permissions.contains({origins: [o]});
      if (ok) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Request the given origins from the user directly. If the user grants
 * any of the origins, the promise resolves to true. If the user denies
 * the request or an error occurs, the promise resolves to false.
 *
 * @param {Array<String>} origins - List of origin patterns to request.
 * @return {Promise<Boolean>} A promise resolving to true if any of the
 *  origins are granted, false if not.
 */
async function requestOriginsFromUser(origins) {
  try {
    return await browser.permissions.request({origins});
  } catch (e) {
    return false;
  }
}

/**
 * Ensure that the extension has been granted the given origin patterns for the
 * given domain. If the extension does not have the permission, request it from
 * the user if allowed by the given boolean flag.
 *
 * @param {String} baseDomain - The domain to check for permission.
 * @param {Boolean} canPrompt - True if it is allowed to request permission
 *  from the user, false if not.
 * @return {Promise<Boolean>} A promise resolving to true if the extension has
 *  been granted the permission, false if not.
 */
async function ensurePermissionForBase(baseDomain, canPrompt) {
  const origins = originPatternsForBase(baseDomain);
  const has = await hasOrigins(origins);
  if (has) return true;
  if (!canPrompt) return false;
  const granted = await requestOriginsFromUser(origins);
  try {
    console.debug('[srbTranslit] permissions.request', baseDomain, '=>', granted);
  } catch (_) {
  }
  if (granted) {
    // Clear any stale notification throttle for this base so future missing notices (if any) are timely
    try {
      const {notifiedMissingPermission = {}} = await browser.storage.local.get('notifiedMissingPermission');
      delete notifiedMissingPermission[baseDomain];
      await browser.storage.local.set({notifiedMissingPermission});
    } catch (_) {
    }
  }
  return granted;
}

/**
 * Check if a notification about missing permission for the given domain
 * should be shown. The notification is throttled to once per 6 hours per
 * base domain.
 *
 * @param {String} base - The base domain to check
 * @return {Promise<Boolean>} A promise resolving to true if the notification
 *  should be shown, false if not.
 */
async function shouldNotifyForBase(base) {
  try {
    // If permission is already present, do not notify and clear stale throttle
    const hasPerm = await hasOrigins(originPatternsForBase(base));
    if (hasPerm) {
      try {
        const {notifiedMissingPermission = {}} = await browser.storage.local.get('notifiedMissingPermission');
        if (notifiedMissingPermission[base]) {
          delete notifiedMissingPermission[base];
          await browser.storage.local.set({notifiedMissingPermission});
        }
      } catch (_) {
      }
      return false;
    }
    const {notifiedMissingPermission = {}} = await browser.storage.local.get('notifiedMissingPermission');
    const last = notifiedMissingPermission[base] || 0;
    const now = Date.now();
    // Throttle to once per 6 hours per base domain
    if (now - last > 6 * 60 * 60 * 1000) {
      notifiedMissingPermission[base] = now;
      await browser.storage.local.set({notifiedMissingPermission});
      return true;
    }
    return false;
  } catch (_) {
    return true;
  }
}

/**
 * Notifies the user that a permission is missing for the given domain.
 *
 * The notification is throttled to once per 6 hours per base domain.
 * If the notification is shown, it will appear as a browser notification
 * with a button to grant permission.
 *
 * @param {String} base - The base domain for which permission is missing
 * @return {Promise<void>} A promise resolving when the notification
 *  has been shown or throttled.
 */
async function notifyMissingPermission(base) {
  try {
    const ok = await shouldNotifyForBase(base);
    if (!ok) return;
    try {
      console.warn('[srbTranslit] Missing host permission for', base, '— notifying user');
    } catch (_) {
    }
    await browser.notifications.create(`srbtranslit-missing-${base}`, {
      type: 'basic',
      iconUrl: 'is-on.png',
      title: 'srbTranslit needs permission',
      message: `Click the srbTranslit toolbar icon to grant access to ${base} so it can auto-transliterate.`
    });
  } catch (_) {
    // ignore
  }
}

/**
 * Periodically cleans up any throttle records for domains which have been
 * granted permission in the meantime.
 *
 * This is a no-op if the storage area is not accessible.
 *
 * @return {Promise<void>} A promise resolving when the cleanup is complete.
 */
async function cleanupNotifiedForGranted() {
  try {
    const {notifiedMissingPermission = {}} = await browser.storage.local.get('notifiedMissingPermission');
    let changed = false;
    for (const base of Object.keys(notifiedMissingPermission)) {
      const hasPerm = await hasOrigins(originPatternsForBase(base));
      if (hasPerm) {
        delete notifiedMissingPermission[base];
        changed = true;
      }
    }
    if (changed) {
      await browser.storage.local.set({notifiedMissingPermission});
    }
  } catch (_) {
    // ignore
  }
}

/**
 * Retrieves the map of enabled domains to their transliteration directions.
 *
 * The storage schema changed from an array of strings to a map of
 * strings to objects with a `direction` key. This function migrates
 * legacy data from the array form to the map form.
 *
 * @return {Promise<object>} A promise resolving to the map of enabled
 *  domains to their transliteration directions. The map is empty if
 *  no enabled domains are present.
 */
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

/**
 * Sets the map of enabled domains to their transliteration directions.
 *
 * @param {{[domain: string]: {direction: ('lat_to_cyr'|'cyr_to_lat')}}} map
 *  The map of enabled domains to their transliteration directions.
 *  The keys are domains and values are objects with a `direction` field.
 * @returns {Promise<void>} Resolves when stored in local storage.
 */
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

/**
 * If the given URL has a rule associated with it, this function migrates
 * the rule from the old key to the new key derived from the registrable
 * domain of the URL. The new key is the registrable domain of the URL,
 * and the old key is the key currently associated with the rule.
 *
 * This function is needed because the old key is not always the same as
 * the new key. For example, the old key might be "example.com" while the
 * new key is "subdomain.example.com".
 *
 * This function returns the new key and the associated rule if the rule
 * was migrated, or null if there was no rule associated with the given URL.
 *
 * @param {string} url The URL for which to migrate the rule.
 * @return {Promise<{key: string, rule: {direction: 'lat_to_cyr'|'cyr_to_lat'}}> | null} The promise resolves to the new key and the associated rule if the rule was migrated, or null if there was no rule associated with the given URL.
 */
async function migrateRuleKeyIfNeeded(url) {
  const host = getHostname(url);
  const desired = registrableDomain(host);
  if (!host || !desired) return null;
  const match = await findRuleForUrl(url);
  if (!match) return null;
  if (match.key === desired) return match; // already aligned
  const map = await getEnabledMap();
  map[desired] = match.rule; // copy
  delete map[match.key]; // remove old key
  await setEnabledMap(map);
  try {
    console.log('[srbTranslit] Migrated rule key', match.key, '->', desired);
  } catch (_) {
  }
  return {key: desired, rule: match.rule};
}

/**
 * Upserts a transliteration rule for the given tab.
 *
 * If the given `desiredDirection` is truthy, it sets the transliteration
 * direction to that value. Otherwise, it defaults to 'lat_to_cyr'.
 *
 * If `requirePermission` is truthy, this function will request permission
 * for the given host if it is not already present. If permission is denied,
 * it will notify the user with a notification.
 *
 * @param {Object} tab - A tab object from browser.tabs API
 * @param {string} [desiredDirection] - The desired transliteration direction
 * @param {{requirePermission: boolean}} [options] - Options controlling behavior
 * @return {Promise<void>} Resolves when the rule has been upserted.
 */
async function upsertRuleForTab(tab, desiredDirection, {requirePermission = false} = {}) {
  if (!tab || !tab.url) return;
  const host = getHostname(tab.url);
  const base = registrableDomain(host);
  if (!base) return;
  if (requirePermission) {
    const granted = await ensurePermissionForBase(base, true);
    if (!granted) {
      await notifyMissingPermission(base);
      return;
    }
  }
  const map = await getEnabledMap();
  map[base] = {direction: desiredDirection || (map[base]?.direction || 'lat_to_cyr')};
  await setEnabledMap(map);
  try {
    console.log('[srbTranslit] Enabled', base, 'direction:', map[base].direction);
  } catch (_) {
  }
}

/**
 * Removes a transliteration rule for the given tab.
 *
 * This function removes the rule currently associated with the given tab
 * by deleting the entry in the enabled map that corresponds to the
 * registrable domain of the tab's URL.
 *
 * @param {Object} tab - A tab object from browser.tabs API
 * @return {Promise<void>} Resolves when the rule has been removed.
 */
async function removeRuleForTab(tab) {
  if (!tab || !tab.url) return;
  const host = getHostname(tab.url);
  const base = registrableDomain(host);
  if (!base) return;
  const map = await getEnabledMap();
  delete map[base];
  await setEnabledMap(map);
  try {
    console.log('[srbTranslit] Disabled', base);
  } catch (_) {
  }
}

/**
 * Updates the icon and title of the browser action for the given tab.
 *
 * This function updates the icon to either the enabled or disabled image
 * based on whether a rule is associated with the given tab. It also sets
 * the title of the action to a string that indicates whether the rule is
 * enabled for the domain of the tab's URL, and if so, the direction of
 * transliteration.
 *
 * If the rule is enabled, this function also checks whether the host of
 * the tab's URL has permission to access the domain. If permission is
 * missing, it requests permission and sets a badge on the action to
 * indicate to the user that permission is needed. If permission is denied,
 * it displays a notification with instructions on how to whitelist the
 * domain.
 *
 * @param {number} tabId - The ID of the tab to update
 * @param {string} url - The URL of the tab to update
 * @returns {Promise<void>} Resolves when the action has been updated.
 */
async function updateActionIconForTab(tabId, url) {
  try {
    const match = await migrateRuleKeyIfNeeded(url) || await findRuleForUrl(url);
    const enabled = !!match;
    const dir = match?.rule?.direction || 'lat_to_cyr';
    await browser.action.setIcon({tabId, path: enabled ? 'is-on.png' : 'is-off.png'});
    let title = enabled ? `srbTranslit: enabled (${dir === 'lat_to_cyr' ? 'to Latin' : 'to Cyrillic'}) for this domain (incl. subdomains)` : 'srbTranslit: click to enable on this domain (incl. subdomains)';
    if (enabled) {
      const host = getHostname(url || '');
      const base = registrableDomain(host);
      const hasPerm = await hasOrigins(originPatternsForBase(base));
      if (!hasPerm) {
        title = `srbTranslit: needs permission to access ${base}. Click the icon to grant.`;
        try {
          await browser.action.setBadgeText({tabId, text: '!'});
          await browser.action.setBadgeBackgroundColor({tabId, color: '#d0021b'});
        } catch (_) {
        }
        await notifyMissingPermission(base);
      } else {
        try {
          await browser.action.setBadgeText({tabId, text: ''});
        } catch (_) {
        }
        // Clear stale notification throttle once permission is present
        try {
          const {notifiedMissingPermission = {}} = await browser.storage.local.get('notifiedMissingPermission');
          if (notifiedMissingPermission[base]) {
            delete notifiedMissingPermission[base];
            await browser.storage.local.set({notifiedMissingPermission});
          }
        } catch (_) {
        }
      }
    } else {
      try {
        await browser.action.setBadgeText({tabId, text: ''});
      } catch (_) {
      }
    }
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
    title: "Uvek preslovi u latinicu na ovom domenu",
    contexts: ["page"],
  },
  () => void browser.runtime.lastError,
);

browser.contextMenus.create(
  {
    id: "always-enable-domain-cyr",
    title: "Uvek preslovi u ćirilicu na ovom domenu (experimental)",
    contexts: ["page"],
  },
  () => void browser.runtime.lastError,
);

browser.contextMenus.create(
  {
    id: "stop-auto-domain",
    title: "Zaustavi automatsko preslovljavanje na ovom domenu",
    contexts: ["page"],
  },
  () => void browser.runtime.lastError,
);

browser.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case "transliterate-to-lat":
      // To Latin = Cyrillic → Latin
      execute(tab, 'cyr_to_lat').then(r => void browser.runtime.lastError);
      break;
    case "transliterate-to-cyr":
      // To Cyrillic = Latin → Cyrillic
      execute(tab, 'lat_to_cyr').then(r => void browser.runtime.lastError);
      break;
    case "always-enable-domain-lat":
      (async () => {
        const host = getHostname(tab?.url || '');
        const base = registrableDomain(host);
        if (!base) return;
        const granted = await ensurePermissionForBase(base, true);
        if (!granted) {
          await notifyMissingPermission(base);
          return;
        }
        // Always to Latin = Cyrillic → Latin
        await upsertRuleForTab(tab, 'cyr_to_lat');
        await updateActionIconForTab(tab.id, tab.url);
        await execute(tab, 'cyr_to_lat');
      })();
      break;
    case "always-enable-domain-cyr":
      (async () => {
        const host = getHostname(tab?.url || '');
        const base = registrableDomain(host);
        if (!base) return;
        const granted = await ensurePermissionForBase(base, true);
        if (!granted) {
          await notifyMissingPermission(base);
          return;
        }
        // Always to Cyrillic = Latin → Cyrillic
        await upsertRuleForTab(tab, 'lat_to_cyr');
        await updateActionIconForTab(tab.id, tab.url);
        await execute(tab, 'lat_to_cyr');
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
      title: `Uvek preslovi u latinicu na ${base || 'ovom domenu'}`,
      enabled: !!base && (!enabled || dir !== 'lat_to_cyr')
    });
    await browser.contextMenus.update('always-enable-domain-cyr', {
      title: `Uvek preslovi u ćirilicu na ${base || 'ovom domenu'} (experimental)`,
      enabled: !!base && (!enabled || dir !== 'cyr_to_lat')
    });
    await browser.contextMenus.update('stop-auto-domain', {
      title: `Zaustavi automatsko preslovljavanje na ${base || 'ovom domenu'}`,
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
  const base = registrableDomain(host);
  if (!base) return;

  const match = await findRuleForUrl(tab.url);
  if (match) {
    // If enabled but permission is missing, use the click as a user gesture to request it
    const hasPerm = await hasOrigins(originPatternsForBase(base));
    if (!hasPerm) {
      const granted = await ensurePermissionForBase(base, true);
      if (granted) {
        // Run immediately now that permission is present
        await execute(tab, match.rule.direction || 'lat_to_cyr');
      } else {
        await notifyMissingPermission(base);
      }
    } else {
      // Toggle off if already permitted
      await removeRuleForTab(tab);
    }
  } else {
    const granted = await ensurePermissionForBase(base, true);
    if (!granted) {
      await notifyMissingPermission(base);
      await updateActionIconForTab(tab.id, tab.url);
    } else {
      await upsertRuleForTab(tab, 'lat_to_cyr'); // default direction when toggling via icon
      // Immediately transliterate current page when enabling
      await execute(tab, 'lat_to_cyr');
    }
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
  const match = await migrateRuleKeyIfNeeded(url) || await findRuleForUrl(url);
  if (match) {
    try {
      const host = getHostname(url || '');
      const base = registrableDomain(host);
      const hasPerm = await hasOrigins(originPatternsForBase(base));
      try {
        console.debug('[srbTranslit] Auto-check', {base, matchKey: match.key, hasPerm});
      } catch (_) {
      }
      if (!hasPerm) {
        try {
          console.warn('[srbTranslit] Skipping auto-run: missing permission for', base);
        } catch (_) {
        }
        await notifyMissingPermission(base);
        return;
      }
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
    const match = await migrateRuleKeyIfNeeded(currentUrl) || await findRuleForUrl(currentUrl);
    if (match) {
      try {
        const host = getHostname(currentUrl || '');
        const base = registrableDomain(host);
        const hasPerm = await hasOrigins(originPatternsForBase(base));
        try {
          console.debug('[srbTranslit] Auto-check (onUpdated)', {base, matchKey: match.key, hasPerm});
        } catch (_) {
        }
        if (!hasPerm) {
          try {
            console.warn('[srbTranslit] Skipping auto-run (onUpdated): missing permission for', base);
          } catch (_) {
          }
          await notifyMissingPermission(base);
          return;
        }
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

// --- Messaging for popup UI ---
async function getActiveTab() {
  const tabs = await browser.tabs.query({active: true, currentWindow: true});
  return tabs && tabs[0];
}

browser.runtime.onMessage.addListener((message, sender) => {
  const doAsync = async () => {
    const tab = await getActiveTab();
    const url = tab?.url || '';
    const host = getHostname(url);
    const base = registrableDomain(host);
    switch (message?.type) {
      case 'srb:getState': {
        const ruleMatch = url ? await findRuleForUrl(url) : null;
        const rule = ruleMatch?.rule || null;
        const hasPerm = base ? await hasOrigins(originPatternsForBase(base)) : false;
        return {
          url,
          domain: base || host || '',
          host: host || '',
          hasPermission: !!hasPerm,
          ruleDirection: rule?.direction || null,
          hasRule: !!ruleMatch,
          canAuto: !!ruleMatch && !!hasPerm,
        };
      }
      case 'srb:grantPermission': {
        if (!base) return {ok: false};
        const ok = await ensurePermissionForBase(base, true);
        if (ok) await updateActionIconForTab(tab.id, url);
        return {ok};
      }
      case 'srb:setRule': {
        const direction = message?.direction === 'cyr_to_lat' ? 'cyr_to_lat' : 'lat_to_cyr';
        if (!tab || !base) return {ok: false};
        // Save the rule regardless of permission; UI and auto-run will handle missing permission gracefully.
        await upsertRuleForTab(tab, direction);
        await updateActionIconForTab(tab.id, url);
        if (message?.run) {
          const hasPerm = await hasOrigins(originPatternsForBase(base));
          if (hasPerm) {
            await execute(tab, direction);
          }
        }
        return {ok: true};
      }
      case 'srb:removeRule': {
        if (!tab) return {ok: false};
        await removeRuleForTab(tab);
        await updateActionIconForTab(tab.id, url);
        return {ok: true};
      }
      case 'srb:runOnce': {
        const direction = message?.direction === 'cyr_to_lat' ? 'cyr_to_lat' : 'lat_to_cyr';
        if (!tab) return {ok: false};
        await execute(tab, direction);
        return {ok: true};
      }
      default:
        return {ok: false, error: 'unknown_message'};
    }
  };
  return doAsync();
});
