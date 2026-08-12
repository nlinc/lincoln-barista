export const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

export const renderEmpty = (target, text) => {
    target.replaceChildren(el("div", "empty-state", text));
};

export const renderEmptyAction = (target, title, body, actionText, action) => {
    const empty = el("div", "empty-panel");
    empty.append(el("div", "empty-panel-title", title), el("div", "empty-panel-copy", body));
    if (actionText && action) {
        const button = el("button", "btn empty-panel-action", actionText);
        button.type = "button";
        button.addEventListener("click", action);
        empty.appendChild(button);
    }
    target.replaceChildren(empty);
};

export const on = (id, eventName, handler) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener(eventName, handler);
};
