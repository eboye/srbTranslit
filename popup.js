/* global browser */

function qs(id) {
  return document.getElementById(id);
}

async function send(type, payload) {
  return browser.runtime.sendMessage(Object.assign({type}, payload || {}));
}

function setStatus(text) {
  qs('status').textContent = text;
}

function setHint(text) {
  qs('hint').textContent = text || '';
}

// Popup-side helpers so we can request permissions within the same user gesture.
async function getActiveTab() {
  const tabs = await browser.tabs.query({active: true, currentWindow: true});
  return tabs && tabs[0];
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

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

function originPatternsForBase(base) {
  if (!base) return [];
  return [`*://${base}/*`, `*://*.${base}/*`];
}

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

async function onDisable() {
  await send('srb:removeRule');
  await refresh();
}

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
