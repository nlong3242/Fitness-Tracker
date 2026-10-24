/* Pixel-art icons drawn from text grids: each row is a string, each
   character a pixel looked up in `colors` ("." or any unmapped character
   is transparent). Runs of the same colour on a row become one <rect>, and
   crispEdges keeps the pixels square at any size. Size the result in CSS. */
export function pixelArt(rows, colors, className = "pixel-art") {
    const width = Math.max(...rows.map(r => r.length));
    let rects = "";
    rows.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
            const ch = row[x];
            let end = x + 1;
            while (end < row.length && row[end] === ch) end++;
            if (colors[ch]) {
                rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${colors[ch]}"/>`;
            }
            x = end;
        }
    });
    return `<svg class="${className}" viewBox="0 0 ${width} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
