/* global browser */

/**
 * Returns an element from the popup with the given ID.
 *
 * @param {string} id The ID of the element to retrieve.
 * @return {HTMLElement} The element with the given ID.
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
 * Updates the hint text in the popup.
 *
 * @param {string} text The new hint text.
 */
function setHint(text) {
  qs('hint').textContent = text || '';
}

/**
 * Extracts the hostname from a given URL.
 *
 * @param {string} url The URL.
 * @return {string} The hostname or an empty string.
 */
function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Extract the registrable domain (e.g., example.com) from a host.
 * Synchronized with background.js.
 *
 * @param {string} host The full host.
 * @return {string} The registrable domain.
 */
function registrableDomain(host) {
  if (!host) return '';
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  const known = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'in', 'rs']);
  if (tld.length === 2 && known.has(sld)) return parts.slice(-3).join('.');
  return parts.slice(-2).join('.');
}

/**
 * Given a registrable domain, returns origin patterns.
 *
 * @param {string} base The registrable domain.
 * @return {string[]} An array of origin patterns.
 */
function originPatternsForBase(base) {
  if (!base) return [];
  return [`*://${base}/*`, `*://*.${base}/*`];
}

/**
 * Refresh the popup state.
 */
async function refresh() {
  const state = await send('srb:getState');
  if (!state) return;
  
  const {domain, hasPermission, ruleDirection, hasRule} = state;
  qs('domain').textContent = domain || 'unknown';
  if (ruleDirection) {
    qs('direction').value = ruleDirection;
  }

  if (hasRule) {
    if (hasPermission) {
      qs('status').textContent = 'Omogućeno · Date dozvole';
      setHint('Automatsko preslovljavanje je aktivno. Koristi Alt+Shift+T da promeniš ili isključiš.');
    } else {
      qs('status').textContent = 'Omogućeno · Nedostaju dozvole';
      setHint('Klikni "Daj dozvolu" da dozvoliš automatsko translitovanje.');
    }
  } else {
    if (hasPermission) {
      qs('status').textContent = 'Data dozvola · Nije omogućeno';
      setHint('Klikni "Uključi uvek" (Alt+Shift+T) da zapamtiš domen.');
    } else {
      qs('status').textContent = 'Nije omogućeno · Nedostaju dozvole';
      setHint('Pokreni jednom (Alt+Shift+L/C) ili daj dozvole za stalno.');
    }
  }

  // Buttons state
  qs('grant').disabled = !!hasPermission;
  qs('enable').disabled = !!hasRule && !!hasPermission;
  qs('disable').disabled = !hasRule;
}

/**
 * Request permission for the current domain.
 */
async function onGrant() {
  const state = await send('srb:getState');
  const base = registrableDomain(getHostname(state.url));
  const origins = originPatternsForBase(base);
  try {
    const ok = await browser.permissions.request({origins});
    if (ok) {
      setHint(`Dozvola odobrena za ${base}.`);
    } else {
      setHint(`Dozvola nije odobrena za ${base}.`);
    }
  } catch (e) {
    setHint('Greška pri zahtevu za dozvolu.');
  }
  await refresh();
}

/**
 * Enable persistent transliteration for the current domain.
 */
async function onEnable() {
  const direction = qs('direction').value;
  const state = await send('srb:getState');
  const base = registrableDomain(getHostname(state.url));
  
  if (!state.hasPermission) {
    const origins = originPatternsForBase(base);
    try {
      const ok = await browser.permissions.request({origins});
      if (!ok) {
        setHint('Morate dati dozvolu da bi automatsko preslovljavanje radilo.');
        return;
      }
    } catch (e) {
      setHint('Greška pri zahtevu za dozvolu.');
      return;
    }
  }
  
  await send('srb:setRule', {direction, run: true});
  await refresh();
}

/**
 * Disable persistent transliteration for the current domain.
 */
async function onDisable() {
  await send('srb:removeRule');
  await refresh();
}

/**
 * Run transliteration once on the current page.
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
      await browser.tabs.create({url: 'about:addons'});
    } catch (e) {
      await browser.runtime.openOptionsPage().catch(() => {});
    }
  });
  refresh();
});
