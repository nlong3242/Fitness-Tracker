/* A small pop-up menu opened by a ⋮ button (the workout page's exercise
   rows). items: [{ label, danger, onSelect() }].
   A see-through backdrop takes the tap outside, so closing the menu never
   also opens whatever is underneath; Esc closes it too. It opens below the
   button, or above it when there's no room above the tab bar. */

let openMenu = null;

export function showActionMenu(anchor, items) {
    closeActionMenu();

    const backdrop = document.createElement("div");
    backdrop.className = "action-menu-backdrop";
    const menu = document.createElement("div");
    menu.className = "action-menu";
    menu.setAttribute("role", "menu");
    for (const item of items) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "action-menu-item" + (item.danger ? " danger" : "");
        button.setAttribute("role", "menuitem");
        button.textContent = item.label;
        button.onclick = function() {
            closeActionMenu();
            item.onSelect();
        };
        menu.appendChild(button);
    }
    document.body.append(backdrop, menu);

    const gap = 6;
    const edge = 8;
    const a = anchor.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const nav = document.getElementById("bottom-nav");
    const floor = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    let top = a.bottom + gap;
    if (top + m.height > floor - edge) top = Math.max(edge, a.top - gap - m.height);
    const left = Math.max(edge, Math.min(a.right - m.width, window.innerWidth - m.width - edge));
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    function onKey(e) {
        if (e.key === "Escape") closeActionMenu();
    }
    backdrop.onclick = closeActionMenu;
    document.addEventListener("keydown", onKey);
    anchor.setAttribute("aria-expanded", "true");
    openMenu = { backdrop, menu, anchor, onKey };
}

export function closeActionMenu() {
    if (!openMenu) return;
    openMenu.backdrop.remove();
    openMenu.menu.remove();
    openMenu.anchor.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", openMenu.onKey);
    openMenu = null;
}
