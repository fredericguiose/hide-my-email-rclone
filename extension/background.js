// Clic droit sur un champ : crée une adresse, la réserve avec le site comme
// libellé, la remplit et la copie.
importScripts("shared.js");

const MENU_ID = "hme-create";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Masquer mon adresse e-mail ici",
    contexts: ["editable"],
  });
});

function notify(title, message) {
  chrome.notifications.create({
    type: "basic", iconUrl: "icons/128.png", title, message, priority: 0,
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  const label = hmeLabelFor(info.frameUrl || info.pageUrl || tab.url) || "Sans libellé";
  try {
    const { hme } = await hmeCall("generate");
    await hmeCall("reserve", { hme, label, note: "Créée depuis Chrome" });
    const { filled, copied } = await hmeFillTab(tab.id, info.frameId, hme);
    const done = [filled && "insérée", copied && "copiée"].filter(Boolean).join(" et ");
    notify("Adresse masquée créée", `${hme}\n${done ? done[0].toUpperCase() + done.slice(1) : "Réservée"} · ${label}`);
  } catch (err) {
    const msg = HME_ERRORS[err.error] || err.detail || "Erreur inconnue";
    notify("Échec", err.error === "session" ? `${msg}\nLance : rclone config reconnect icloud:` : msg);
  }
});
