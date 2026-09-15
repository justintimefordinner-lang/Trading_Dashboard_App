// Phone / Tablet layout switch (the Family Calendar pattern: one app, one flag).
//
// The shell is styled through a `tablet:` Tailwind variant that keys off
// `<html data-layout="tablet">`. That attribute is set BEFORE first paint by
// LAYOUT_BOOT_SCRIPT (inlined at the top of <body> in app/layout.tsx), so
// there is no flash of the wrong layout and the server never needs to know
// the viewport. The preference lives in localStorage:
//
//   "auto"   (default)  tablet at TABLET_MIN_PX and wider, phone below
//   "phone"             always the phone frame
//   "tablet"            always the 1024px canvas with the side rail
//
// Changing it (LayoutToggle) writes the key and fires LAYOUT_EVENT; the boot
// script listens for that as well as viewport changes, so the switch is
// instant and needs no reload.

export type LayoutMode = "auto" | "phone" | "tablet";

export const LAYOUT_KEY = "layout-mode";
export const LAYOUT_EVENT = "layout-mode-change";
// Above this width the auto layout picks Tablet. An iPad in landscape (1024)
// and any laptop qualify; an iPad in portrait (768–834) stays on the phone
// layout, which suits its aspect better.
export const TABLET_MIN_PX = 900;

export function readLayoutMode(): LayoutMode {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw === "phone" || raw === "tablet") return raw;
  } catch {
    /* ignore */
  }
  return "auto";
}

export function writeLayoutMode(mode: LayoutMode): void {
  try {
    if (mode === "auto") localStorage.removeItem(LAYOUT_KEY);
    else localStorage.setItem(LAYOUT_KEY, mode);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(LAYOUT_EVENT));
}

// Runs before React hydrates. Kept dependency-free and tiny on purpose.
export const LAYOUT_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(LAYOUT_KEY)};var q=window.matchMedia("(min-width: ${TABLET_MIN_PX}px)");function ap(){var m=null;try{m=localStorage.getItem(k)}catch(e){}var t=m==="tablet"||(m!=="phone"&&q.matches);document.documentElement.setAttribute("data-layout",t?"tablet":"phone")}ap();if(q.addEventListener)q.addEventListener("change",ap);else q.addListener(ap);window.addEventListener(${JSON.stringify(LAYOUT_EVENT)},ap)}catch(e){}})();`;
