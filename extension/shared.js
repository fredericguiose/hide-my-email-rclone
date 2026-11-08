// Code partagé entre le service worker et la popup.
const HME_HOST = "com.fredericguiose.hme";

/** Envoie une commande au relais local ; rejette avec {error, detail}. */
function hmeCall(cmd, extra = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(HME_HOST, { cmd, ...extra }, (resp) => {
      if (chrome.runtime.lastError) {
        reject({ error: "host", detail: chrome.runtime.lastError.message });
      } else if (!resp || !resp.ok) {
        reject(resp || { error: "host", detail: "réponse vide" });
      } else {
        resolve(resp);
      }
    });
  });
}

/** Libellé par défaut : le domaine du site, sans « www. ». */
function hmeLabelFor(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return "";
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Exécutée DANS la page : remplit le champ e-mail ciblé (ou le premier
 * champ e-mail visible) et copie l'adresse. Renvoie {filled, copied}.
 */
function hmeFillInPage(address) {
  const isField = (el) =>
    el && el.tagName === "INPUT" && !el.disabled && !el.readOnly &&
    ["email", "text", ""].includes((el.getAttribute("type") || "").toLowerCase());
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  let target = isField(document.activeElement) ? document.activeElement : null;
  if (!target) {
    const candidates = [...document.querySelectorAll(
      'input[type="email"], input[autocomplete~="email"], input[name*="mail" i], input[id*="mail" i]'
    )].filter((el) => isField(el) && visible(el));
    target = candidates[0] || null;
  }

  let filled = false;
  if (target) {
    // Passe par le setter natif pour que React/Vue voient la saisie.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    target.focus();
    setter.call(target, address);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    filled = true;
  }

  return navigator.clipboard.writeText(address)
    .then(() => ({ filled, copied: true }))
    .catch(() => ({ filled, copied: false }));
}

/** Remplit dans l'onglet ; ne lève jamais (pages chrome://, PDF…). */
async function hmeFillTab(tabId, frameId, address) {
  try {
    const target = frameId ? { tabId, frameIds: [frameId] } : { tabId };
    const [res] = await chrome.scripting.executeScript({
      target, func: hmeFillInPage, args: [address],
    });
    return res?.result || { filled: false, copied: false };
  } catch {
    return { filled: false, copied: false };
  }
}

const HME_ERRORS = {
  session: "La session iCloud de rclone a expiré.",
  rclone: "rclone n'a pas pu fournir la session iCloud.",
  network: "Impossible de joindre iCloud. Vérifie la connexion.",
  apple: "iCloud a refusé la demande.",
  host: "Le relais local ne répond pas. Lance install.sh de la feature.",
  bad_request: "Demande invalide.",
};
