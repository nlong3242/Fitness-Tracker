/* The picker's Add / Replace bar sits on a .page-strip: painted like the
   page (grid lined up), running from the bar's top edge down to the tab
   bar, so the list scrolling under it doesn't show. Measured here for the
   Add and Replace tests. */
async function pickerStrip(page) {
    return page.evaluate(() => {
        const f = document.querySelector(".picker-action-footer");
        const b = f && f.querySelector(".picker-action-bar");
        const nav = document.getElementById("bottom-nav");
        if (!b || !nav) return null;
        const fr = f.getBoundingClientRect(), br = b.getBoundingClientRect(), nr = nav.getBoundingClientRect();
        const fs = getComputedStyle(f), bs = getComputedStyle(document.body);
        const [px, py] = fs.backgroundPosition.split(" ").map(parseFloat);
        const mod = v => ((Math.round(v) % 28) + 28) % 28;
        const at = y => document.elementFromPoint(window.innerWidth / 2, y);
        return {
            shown: fs.visibility === "visible" && fs.opacity === "1",
            pageLike: fs.backgroundColor === bs.backgroundColor && fs.backgroundImage === bs.backgroundImage,
            fromBarTop: Math.round(br.top) === Math.round(fr.top),
            toNav: Math.abs(fr.bottom - nr.top) <= 1,
            gridOk: mod(fr.left + px) === 0 && mod(fr.top + py) === 0,
            covered: [fr.top + 4, br.bottom + 10].every(y => at(y) && at(y).closest(".picker-action-footer"))
        };
    });
}

module.exports = { pickerStrip };
