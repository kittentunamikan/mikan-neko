import { getSettings } from "./settings.js";

const STYLE_ID = "mikan-imgui-menu-style";
const MENU_ID = "mikan-imgui-menu";

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${MENU_ID}{position:fixed;z-index:2147483647;left:12px;top:12px;display:flex;gap:2px;padding:3px;background:rgba(15,15,15,.96);border:1px solid rgba(110,110,128,.55);font:12px/1.4 monospace;user-select:none}
    #${MENU_ID} button{color:#fff;background:transparent;border:0;border-radius:0;padding:3px 8px;font:inherit;cursor:pointer}
    #${MENU_ID} button:hover,#${MENU_ID} button.active{background:#294a7a}
    #${MENU_ID} button.warn{color:#ff9a9a}
  `;
  document.head.appendChild(style);
}

function makeButton(label, key) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.page = key;
  return button;
}

function openFxSettings() {
  const settings = document.querySelector(".settings");
  if (!settings) return;
  document.querySelectorAll(".window").forEach((window) => {
    if (window !== settings) window.style.display = "none";
  });
  settings.style.display = null;
  settings.scrollIntoView?.({ block: "nearest" });
}

function setPanelVisible(id, visible, attempts = 20) {
  const panel = document.getElementById(id);
  if (!panel) {
    if (attempts > 0) setTimeout(() => setPanelVisible(id, visible, attempts - 1), 50);
    return;
  }
  panel.style.display = visible ? "" : "none";
}

function mount() {
  if (!document.body || document.getElementById(MENU_ID)) return;
  ensureStyle();

  const menu = document.createElement("nav");
  menu.id = MENU_ID;
  menu.title = "Mikan ImGui";
  const pages = [
    ["自动开局", "opening"],
    ["开局录制器", "recorder"],
    ["设置", "settings"],
  ];
  pages.forEach(([label, key]) => menu.appendChild(makeButton(label, key)));
  document.body.appendChild(menu);
  ["mousedown", "mouseup", "click", "contextmenu"].forEach((type) => {
    menu.addEventListener(type, (event) => event.stopPropagation());
  });

  const buttons = [...menu.querySelectorAll("button")];
  function select(key) {
    buttons.forEach((button) => button.classList.toggle("active", button.dataset.page === key));
    if (key === "opening") {
      setPanelVisible("mikan-auto-opening", true);
      setPanelVisible("mikan-opening-recorder", false);
    } else if (key === "recorder") {
      setPanelVisible("mikan-auto-opening", false);
      setPanelVisible("mikan-opening-recorder", true);
    } else {
      setPanelVisible("mikan-auto-opening", false);
      setPanelVisible("mikan-opening-recorder", false);
      openFxSettings();
    }
  }
  buttons.forEach((button) => button.addEventListener("click", () => select(button.dataset.page)));

  const enabled = getSettings().enableMikanImgui !== false;
  menu.style.display = enabled ? "flex" : "none";
  select("opening");
  window.__mikanImgui = {
    menu,
    select,
    setEnabled(value) {
      menu.style.display = value ? "flex" : "none";
      if (!value) {
        setPanelVisible("mikan-auto-opening", false);
        setPanelVisible("mikan-opening-recorder", false);
      } else {
        select("opening");
      }
    },
  };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
