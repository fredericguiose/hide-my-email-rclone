// Popup : nouvelle adresse (générer → réserver → insérer/copier) et liste.
const $ = (id) => document.getElementById(id);

const state = { hme: "", tab: null, host: "", entries: null, busy: false, reserved: false };

// ── Utilitaires d'interface ───────────────────────────────────────────────
function show(view) {
  for (const v of ["new", "done", "list", "error"]) $(`view-${v}`).classList.toggle("hidden", v !== view);
  const onList = view === "list";
  $("tab-new").classList.toggle("active", !onList);
  $("tab-list").classList.toggle("active", onList);
  $("tab-new").setAttribute("aria-selected", String(!onList));
  $("tab-list").setAttribute("aria-selected", String(onList));
  document.querySelector(".segmented").classList.toggle("right", onList);
}

let toastTimer;
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

function showError(err) {
  const code = err?.error || "host";
  $("error-title").textContent = code === "session" ? "Session iCloud expirée" : "Impossible de continuer";
  $("error-detail").textContent = code === "session"
    ? "Reconnecte rclone dans un terminal, puis réessaie. Une seule connexion sert au montage iCloud et à cette extension."
    : `${HME_ERRORS[code] || "Erreur inconnue."}${err?.detail ? ` (${err.detail})` : ""}`;
  $("error-cmd").classList.toggle("hidden", code !== "session");
  show("error");
}

function setAddress(text, loading) {
  const a = $("address");
  a.textContent = text;
  a.classList.toggle("skeleton", loading);
  $("regen").classList.toggle("spin", loading);
  $("use").disabled = loading;
  $("copy-only").disabled = loading;
}

// ── Nouvelle adresse ──────────────────────────────────────────────────────
async function generate() {
  setAddress("chargement@icloud.com", true);
  try {
    const { hme } = await hmeCall("generate");
    state.hme = hme;
    setAddress(hme, false);
  } catch (err) {
    showError(err);
  }
}

async function reserve(fill) {
  if (state.busy || !state.hme) return;
  const label = $("label").value.trim();
  if (!label) {
    $("label").focus();
    toast("Ajoute un libellé");
    return;
  }
  state.busy = true;
  const btn = fill ? $("use") : $("copy-only");
  const original = btn.textContent;
  btn.textContent = "Réservation…";
  $("use").disabled = $("copy-only").disabled = true;
  try {
    await hmeCall("reserve", { hme: state.hme, label, note: $("note").value.trim() });
    state.entries = null; // la liste devra être rechargée
    let filled = false;
    if (fill && state.tab?.id) ({ filled } = await hmeFillTab(state.tab.id, 0, state.hme));
    await navigator.clipboard.writeText(state.hme).catch(() => {});
    $("done-address").textContent = state.hme;
    $("done-detail").textContent = filled
      ? `Insérée dans la page et copiée · ${label}`
      : `Copiée dans le presse-papiers · ${label}`;
    state.reserved = true;
    show("done");
  } catch (err) {
    showError(err);
  } finally {
    state.busy = false;
    btn.textContent = original;
  }
}

function resetNew() {
  state.reserved = false;
  $("note").value = "";
  $("label").value = state.host;
  show("new");
  generate();
}

// ── Liste ─────────────────────────────────────────────────────────────────
function renderList() {
  const box = $("list");
  box.replaceChildren();
  if (!state.entries) return;
  const q = $("search").value.trim().toLowerCase();
  const match = (e) => !q || `${e.label} ${e.hme} ${e.note}`.toLowerCase().includes(q);
  const items = state.entries.filter(match);
  const site = state.host
    ? items.filter((e) => e.label.toLowerCase().includes(state.host) || e.domain.toLowerCase().includes(state.host))
    : [];
  const others = items.filter((e) => !site.includes(e));

  const section = (title, list) => {
    if (!list.length) return;
    const h = document.createElement("div");
    h.className = "section-title";
    h.textContent = title;
    const s = document.createElement("div");
    s.className = "section";
    for (const e of list) {
      const b = document.createElement("button");
      b.className = "item";
      b.title = "Copier";
      const text = document.createElement("div");
      text.className = "item-text";
      const l = document.createElement("div");
      l.className = "item-label";
      l.textContent = e.label || e.domain || "Sans libellé";
      const m = document.createElement("div");
      m.className = "item-hme";
      m.textContent = e.hme;
      text.append(l, m);
      b.append(text);
      if (!e.active) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "Inactive";
        b.append(badge);
      }
      b.addEventListener("click", async () => {
        await navigator.clipboard.writeText(e.hme).catch(() => {});
        toast("Adresse copiée");
      });
      s.append(b);
    }
    box.append(h, s);
  };

  section("Pour ce site", site);
  section(site.length ? "Toutes les adresses" : `${items.length} adresse${items.length > 1 ? "s" : ""}`, others);
  if (!items.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = q ? "Aucun résultat" : "Aucune adresse";
    box.append(p);
  }
}

async function openList() {
  show("list");
  if (state.entries) return renderList();
  $("list").innerHTML = '<p class="empty">Chargement…</p>';
  try {
    const res = await hmeCall("list");
    state.entries = res.entries;
    if (res.forwardTo) $("forward").textContent = `Les e-mails reçus seront transférés vers ${res.forwardTo}.`;
    renderList();
  } catch (err) {
    showError(err);
  }
}

// ── Démarrage ─────────────────────────────────────────────────────────────
$("tab-new").addEventListener("click", () => (state.reserved ? resetNew() : show("new")));
$("tab-list").addEventListener("click", openList);
$("regen").addEventListener("click", generate);
$("use").addEventListener("click", () => reserve(true));
$("copy-only").addEventListener("click", () => reserve(false));
$("another").addEventListener("click", resetNew);
$("search").addEventListener("input", renderList);
$("retry").addEventListener("click", () => { state.entries = null; resetNew(); });
$("copy-cmd").addEventListener("click", async () => {
  await navigator.clipboard.writeText("rclone config reconnect icloud:").catch(() => {});
  toast("Commande copiée");
});
$("label").addEventListener("keydown", (e) => { if (e.key === "Enter") reserve(true); });
$("note").addEventListener("keydown", (e) => { if (e.key === "Enter") reserve(true); });

(async () => {
  [state.tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.host = hmeLabelFor(state.tab?.url || "");
  $("label").value = state.host;
  generate();
  // Compte et adresse de transfert, en arrière-plan.
  hmeCall("list").then((res) => {
    state.entries = res.entries;
    if (res.forwardTo) {
      $("account").textContent = res.forwardTo;
      $("forward").textContent = `Les e-mails reçus seront transférés vers ${res.forwardTo}.`;
    }
  }).catch(() => {});
})();
