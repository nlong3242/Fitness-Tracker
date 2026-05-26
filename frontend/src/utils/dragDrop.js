export function attachLongPressDrag(rowEl, opts) {
    const longPressMs = (opts && opts.longPressMs) || 180;
    const cancelThreshold = (opts && opts.cancelThreshold) || 8;
    const armedMoveThreshold = (opts && opts.armedMoveThreshold) || 5;

    let state = "idle"; // idle | pressing | armed | dragging
    let pressTimer = null;
    let pointerId = null;
    let startX = 0, startY = 0;
    let originRect = null;
    let originIndex = -1;
    let placeholder = null;
    let listEl = null;
    let suppressNextClick = false;

    rowEl.addEventListener("pointerdown", onPointerDown);
    rowEl.addEventListener("click", function(e) {
        if (suppressNextClick) {
            e.stopImmediatePropagation();
            e.preventDefault();
            suppressNextClick = false;
        }
    }, true);
    rowEl.addEventListener("contextmenu", function(e) {
        if (state === "armed" || state === "dragging") e.preventDefault();
    });

    function onPointerDown(e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (e.target.closest("button, input, textarea, select, a")) return;
        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        state = "pressing";
        pressTimer = setTimeout(arm, longPressMs);
        rowEl.addEventListener("pointermove", onPointerMove);
        rowEl.addEventListener("pointerup", onPointerUp);
        rowEl.addEventListener("pointercancel", onPointerCancel);
    }

    function onPointerMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (state === "pressing") {
            if (Math.abs(dx) > cancelThreshold || Math.abs(dy) > cancelThreshold) {
                resetListeners();
            }
        } else if (state === "armed") {
            if (Math.abs(dx) > armedMoveThreshold || Math.abs(dy) > armedMoveThreshold) {
                beginDrag();
                onDragMove(e);
            }
        } else if (state === "dragging") {
            onDragMove(e);
        }
    }

    function onPointerUp() {
        if (state === "dragging") {
            endDrag(true);
        } else {
            resetListeners();
        }
    }

    function onPointerCancel() {
        if (state === "dragging") {
            endDrag(false);
        } else {
            resetListeners();
        }
    }

    function arm() {
        pressTimer = null;
        if (state === "pressing") state = "armed";
    }

    function resetListeners() {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
        rowEl.removeEventListener("pointermove", onPointerMove);
        rowEl.removeEventListener("pointerup", onPointerUp);
        rowEl.removeEventListener("pointercancel", onPointerCancel);
        state = "idle";
    }

    function beginDrag() {
        state = "dragging";
        listEl = rowEl.parentElement;
        originIndex = Array.from(listEl.children).indexOf(rowEl);
        originRect = rowEl.getBoundingClientRect();

        placeholder = document.createElement(rowEl.tagName);
        placeholder.className = "drag-placeholder";
        placeholder.style.height = rowEl.offsetHeight + "px";
        listEl.insertBefore(placeholder, rowEl);

        rowEl.classList.add("dragging");
        rowEl.style.position = "fixed";
        rowEl.style.left = originRect.left + "px";
        rowEl.style.top = originRect.top + "px";
        rowEl.style.width = originRect.width + "px";
        rowEl.style.margin = "0";
        rowEl.style.zIndex = "1000";
        rowEl.style.pointerEvents = "none";

        suppressNextClick = true;

        try { rowEl.setPointerCapture(pointerId); } catch (_) {}
        document.addEventListener("keydown", onKeyDown);
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
    }

    function onDragMove(e) {
        rowEl.style.left = (originRect.left + (e.clientX - startX)) + "px";
        rowEl.style.top = (originRect.top + (e.clientY - startY)) + "px";

        const siblings = Array.from(listEl.children).filter(c => c !== rowEl && c !== placeholder);
        let insertBeforeNode = null;
        for (const sib of siblings) {
            const r = sib.getBoundingClientRect();
            if (e.clientY < r.top + r.height / 2) {
                insertBeforeNode = sib;
                break;
            }
        }
        if (placeholder.nextSibling !== insertBeforeNode) {
            listEl.insertBefore(placeholder, insertBeforeNode);
        }
    }

    function endDrag(commit) {
        document.removeEventListener("keydown", onKeyDown);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        try { rowEl.releasePointerCapture(pointerId); } catch (_) {}

        let toIndex = originIndex;
        if (commit) {
            const filtered = Array.from(listEl.children).filter(c => c !== rowEl);
            toIndex = filtered.indexOf(placeholder);
        }

        rowEl.classList.remove("dragging");
        rowEl.style.position = "";
        rowEl.style.left = "";
        rowEl.style.top = "";
        rowEl.style.width = "";
        rowEl.style.margin = "";
        rowEl.style.zIndex = "";
        rowEl.style.pointerEvents = "";
        placeholder.remove();
        placeholder = null;

        if (commit && toIndex !== -1 && toIndex !== originIndex) {
            opts.onReorder(originIndex, toIndex);
        }

        setTimeout(function() { suppressNextClick = false; }, 50);
        resetListeners();
    }

    function onKeyDown(e) {
        if (e.key === "Escape" && state === "dragging") endDrag(false);
    }
}
