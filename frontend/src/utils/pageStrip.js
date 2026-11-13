/* A .page-strip (layout/page.css) is painted with the page's grid so a
   floating button can sit on it looking like empty page while hiding what
   scrolls under it. The page's grid starts at the screen's top left; shift
   each strip's grid so its lines meet the page's. Called once a strip is on
   screen, and again when the screen changes size (rotation, iOS toolbar). */
export function alignPageStrips() {
    for (const strip of document.querySelectorAll(".page-strip")) {
        const rect = strip.getBoundingClientRect();
        strip.style.backgroundPosition = `${-rect.left}px ${-rect.top}px`;
    }
}

window.addEventListener("resize", alignPageStrips);
