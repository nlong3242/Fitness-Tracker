/* Tapping into a number box (a text input with a number keyboard: height,
   weekly goal, weight...) puts the cursor after what's there, ready to
   add to it or delete back, wherever the tap landed. Only the tap that
   focuses it: tapping again in a focused box places the cursor as usual.
   iOS sets the cursor from the tap after focus, hence also on that click.
   Workout weight and reps boxes are text boxes for this reason:
   type="number" inputs don't allow moving the cursor. */
function isNumberBox(el) {
    return el instanceof HTMLInputElement && el.type === "text"
        && (el.inputMode === "numeric" || el.inputMode === "decimal");
}

export function keepCaretAtEnd() {
    document.addEventListener("focusin", function(e) {
        const input = e.target;
        if (!isNumberBox(input)) return;
        const toEnd = function() {
            if (document.activeElement !== input) return;
            const end = input.value.length;
            input.setSelectionRange(end, end);
        };
        toEnd();
        setTimeout(toEnd, 0);
        input.addEventListener("click", toEnd, { once: true });
        input.addEventListener("blur", function() {
            input.removeEventListener("click", toEnd);
        }, { once: true });
    });
}
