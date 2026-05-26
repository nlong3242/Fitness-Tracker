export function attachLongPressDrag(rowEl, opts) {
    const longPressMs = (opts && opts.longPressMs) || 180;
    const cancelThreshold = (opts && opts.cancelThreshold) || 8;
    const armedMoveThreshold = (opts && opts.armedMoveThreshold) || 5;
    const axis = (opts && opts.axis) || "y";  // "y" (default) or "x"

    let state = "idle"; // idle | pressing | armed | dragging
    let pressTimer = null;
    let pointerId = null;
    let startX = 0, startY = 0;
    let lastPointerX = 0, lastPointerY = 0;
    let originRect = null;
    let originIndex = -1;
    let placeholder = null;
    let listEl = null;
    let suppressNextClick = false;
    let autoScrollAnimId = null;

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
        // Skip when pointerdown lands on a NESTED interactive element (Remove
        // button, set input, etc.) so those keep working normally. If rowEl
        // is itself the interactive element (e.g., a pill <button>), proceed.
        const interactive = e.target.closest("button, input, textarea, select, a");
        if (interactive && interactive !== rowEl) return;
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
        if (axis === "x") {
            placeholder.style.width = rowEl.offsetWidth + "px";
            placeholder.style.height = rowEl.offsetHeight + "px";
            placeholder.style.flexShrink = "0";
        } else {
            placeholder.style.height = rowEl.offsetHeight + "px";
        }
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
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        rowEl.style.left = (originRect.left + (e.clientX - startX)) + "px";
        rowEl.style.top = (originRect.top + (e.clientY - startY)) + "px";
        recomputePlaceholder();
        if (axis === "x") maybeStartAutoScroll();
    }

    /* Place the placeholder by comparing the pointer's current position
       against each sibling's midpoint along the drag axis. Extracted so the
       auto-scroll loop can re-run it after each scroll step (the user's
       pointer may be stationary but new siblings have moved into range). */
    function recomputePlaceholder() {
        const siblings = Array.from(listEl.children).filter(c => c !== rowEl && c !== placeholder);
        let insertBeforeNode = null;
        for (const sib of siblings) {
            const r = sib.getBoundingClientRect();
            const past = axis === "x"
                ? lastPointerX < r.left + r.width / 2
                : lastPointerY < r.top + r.height / 2;
            if (past) {
                insertBeforeNode = sib;
                break;
            }
        }
        if (placeholder.nextSibling !== insertBeforeNode) {
            listEl.insertBefore(placeholder, insertBeforeNode);
        }
    }

    /* While dragging near the left/right edge of a horizontally-scrollable
       listEl, scroll the container so the user can reach off-screen positions
       without having to release and start a new drag. Only relevant for the
       horizontal axis; the page itself handles vertical edge cases. */
    function maybeStartAutoScroll() {
        if (autoScrollAnimId !== null) return;
        autoScrollAnimId = requestAnimationFrame(autoScrollTick);
    }

    function autoScrollTick() {
        if (state !== "dragging") {
            autoScrollAnimId = null;
            return;
        }
        const rect = listEl.getBoundingClientRect();
        const edgeZone = 50;
        const speed = 10;
        const before = listEl.scrollLeft;
        if (lastPointerX < rect.left + edgeZone) {
            listEl.scrollLeft = Math.max(0, before - speed);
        } else if (lastPointerX > rect.right - edgeZone) {
            const maxScroll = listEl.scrollWidth - listEl.clientWidth;
            listEl.scrollLeft = Math.min(maxScroll, before + speed);
        }
        if (listEl.scrollLeft !== before) {
            recomputePlaceholder();
            autoScrollAnimId = requestAnimationFrame(autoScrollTick);
        } else {
            autoScrollAnimId = null;
        }
    }

    function endDrag(commit) {
        if (autoScrollAnimId !== null) {
            cancelAnimationFrame(autoScrollAnimId);
            autoScrollAnimId = null;
        }
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
