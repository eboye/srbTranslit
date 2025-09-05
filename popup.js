/* global browser */

/**
 * Returns an element from the popup with the given ID.
 *
 * @param {string} id The ID of the element to retrieve.
 * @return {Element} The element with the given ID, or null if not found.
 */
function qs(id) {
  return document.getElementById(id);
}

/**
 * Sends a message to the background script.
 *
 * @param {string} type The type of message to send.
 * @param {object} [payload] Additional data to send with the message.
 * @return {Promise<object>} The response from the background script.
 */
async function send(type, payload) {
  return browser.runtime.sendMessage(Object.assign({type}, payload || {}));
}

/**
 * Updates the status text in the popup.
 *
 * @param {string} text The new status text
 */
function setStatus(text) {
  qs('status').textContent = text;
}

/**
 * Updates the hint text in the popup.
 *
 * @param {string} text The new hint text, or `undefined` or an empty string
 * to clear the hint.
 */
function setHint(text) {
  qs('hint').textContent = text || '';
}


/**
 * Retrieves the active tab in the current window.
 *
 * @return {object} The active tab.
 */
async function getActiveTab() {
  const tabs = await browser.tabs.query({active: true, currentWindow: true});
  return tabs && tabs[0];
}

/**
 * Extracts the hostname from a given URL.
 *
 * @param {string} url The URL.
 * @return {string} The hostname or an empty string if the URL is invalid.
 */
function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Given a host, returns the registrable domain, which is the last two labels if
 * the TLD is not a country code (length 2) or if the second level domain is not
 * on the list of known second level domains.
 *
 * @param {string} host The full host (e.g., example.com).
 * @return {string} The registrable domain (e.g., example.com).
 */
function registrableDomain(host) {
  if (!host) return '';
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  const known = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac']);
  if (tld.length === 2 && known.has(sld)) return parts.slice(-3).join('.');
  return parts.slice(-2).join('.');
}

/**
 * Given a registrable domain, returns an array of two strings representing the
 * host patterns that would match it (e.g., for "example.com", returns
 * ["*://example.com/*", "*://*.example.com/*"]).
 *
 * @param {string} base The registrable domain (e.g., "example.com").
 * @return {string[]} An array of two strings, or an empty array if the input
 *     is invalid.
 */
function originPatternsForBase(base) {
  if (!base) return [];
  return [`*://${base}/*`, `*://*.${base}/*`];
}

/**
 * Refresh the popup state based on the current tab's domain and permission
 * state. Called on popup show and after each user interaction.
 *
 * This function updates the popup with the current domain, whether the domain
 * has the permission, whether there is a rule for this domain, and based on that
 * sets the status and hint text. It also updates the state of the buttons.
 */
async function refresh() {
  const state = await send('srb:getState');
  const {domain, host, hasPermission, ruleDirection, hasRule, canAuto} = state;
  qs('domain').textContent = domain || host || 'unknown';
  qs('direction').value = ruleDirection || 'lat_to_cyr';

  if (hasRule) {
    if (hasPermission) {
      setStatus('Omogućeno · Date dozvole');
      setHint('Ovaj domen će automatski biti translitovan prilikom navigacije.');
    } else {
      setStatus('Omogućeno · Nedostaju dozvole');
      setHint('Klikni "Daj dozvolu" da dozvoliš automatsko translitovanje.');
    }
  } else {
    if (hasPermission) {
      setStatus('Data dozvola · Nije omogućeno');
      setHint('Klikni "Uključi uvek" da zapamtiš domen.');
    } else {
      setStatus('Nije omogućeno · Nedostaju dozvole');
      setHint('Možeš pokrenuti jednom ili dati dozvole da omogućiš.');
    }
  }

  // Buttons state
  qs('grant').disabled = !!hasPermission;
  qs('enable').disabled = !!hasRule && !!hasPermission; // if rule+perm already set
  qs('disable').disabled = !hasRule;
  qs('runOnce').disabled = false;
}

/**
 * Request permission for the current tab's domain directly from the popup.
 * This is needed to preserve the user gesture so that the permission request
 * is not blocked by the browser.
 *
 * The permission request is first attempted with the full set of origins
 * (wildcard subdomains and exact), then with wildcard subdomains only, and
 * finally with exact only. This allows the user to grant permission for a
 * subset of subdomains if they prefer.
 *
 * After the permission request is complete, the popup's state is refreshed.
 */
async function onGrant() {
  // Request permission directly from the popup to preserve user gesture
  const tab = await getActiveTab();
  const host = getHostname(tab?.url || '');
  const base = registrableDomain(host);
  const origins = originPatternsForBase(base);
  try {
    let ok = await browser.permissions.request({origins});
    if (!ok) {
      // Retry strategies: wildcard subdomains only, then exact only
      const wild = [`*://*.${base}/*`];
      const exact = [`*://${base}/*`];
      ok = await browser.permissions.request({origins: wild});
      if (!ok) ok = await browser.permissions.request({origins: exact});
    }
    if (!ok) {
      setHint(`Zahtev za dozvolama nije odobren za ${base}.`);
    } else {
      const has = browser.permissions.contains({origins});
      setHint(has ? `Dozvola omogućena za ${base}.` : `Dozvola (delimično) omogućena za ${base}.`);
    }
  } catch (e) {
    setHint('Zahtev za dozvolama nije uspeo.');
  }
  await refresh();
}

/**
 * Request permission for the given domain (if not already present) and then
 * set a rule for the given domain with the given direction.
 *
 * If permission is not present, request it now as part of the same user
 * gesture. If permission is denied, display a hint to the user how to
 * whitelist the domain.
 *
 * @return {Promise<void>} Resolves when the rule has been set or permission
 * has been denied.
 */
async function onEnable() {
  const direction = qs('direction').value;
  // Ensure permission is present; if not, request now as part of the same user gesture.
  const tab = await getActiveTab();
  const host = getHostname(tab?.url || '');
  const base = registrableDomain(host);
  const origins = originPatternsForBase(base);
  let has = false;
  try {
    // Check OR across origins
    const exact = browser.permissions.contains({origins: [`*://${base}/*`]});
    const wild = browser.permissions.contains({origins: [`*://*.${base}/*`]});
    has = exact || wild;
  } catch {
  }
  if (!has) {
    try {
      let ok = await browser.permissions.request({origins});
      if (!ok) {
        const wildOnly = [`*://*.${base}/*`];
        const exactOnly = [`*://${base}/*`];
        ok = await browser.permissions.request({origins: wildOnly});
        if (!ok) ok = await browser.permissions.request({origins: exactOnly});
      }
      if (!ok) {
        setHint(`Zahtev za dozvolama nije omogućen za ${base}. Ako Firefox pristup sajtovima je namešten na "Nakon klika", otvori Add-ons (dodaci) i promeni Pristup sajtovima na "Na specifičnim sajtovima" (i ovaj domen) ili "Na svim sajtovima".`);
        await refresh();
        return;
      }
    } catch (e) {
      setHint('Zahtev za dozvolama nije uspeo.');
      await refresh();
      return;
    }
  }
  const res = await send('srb:setRule', {direction, run: true});
  if (!res || !res.ok) {
    setHint('Nije moguće omogućiti. Budite sigurni da odobrite dozvole kada ste upitani.');
  }
  await refresh();
}

/**
 * Removes the transliteration rule from the active tab.
 */
async function onDisable() {
  await send('srb:removeRule');
  await refresh();
}

/**
 * Sends a one-time "run" message to the content script.
 *
 * @private
 * @async
 */
async function onRunOnce() {
  const direction = qs('direction').value;
  await send('srb:runOnce', {direction});
}

window.addEventListener('DOMContentLoaded', () => {
  qs('grant').addEventListener('click', onGrant);
  qs('enable').addEventListener('click', onEnable);
  qs('disable').addEventListener('click', onDisable);
  qs('runOnce').addEventListener('click', onRunOnce);
  qs('openAddons').addEventListener('click', async () => {
    try {
      // about:addons cannot be opened from extensions in some contexts -> may throw Illegal URL
      await browser.tabs.create({url: 'about:addons'});
    } catch (e) {
      try {
        await browser.runtime.openOptionsPage();
      } catch (_) {
      }
      setHint('Nije moguće otvoriti Add-ons Menadžer. Otvorite ga ručno: Menu → Add-ons and themes (Ctrl+Shift+A), zatim podesite Pristup sajtovima za srbTranslit.');
    }
  });
  refresh().then(r => console.log(r));
});
