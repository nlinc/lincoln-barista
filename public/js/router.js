export const navigate = (viewName, addToHistory = true) => {
    document.body.dataset.view = viewName;
    document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
    document.getElementById("view-" + viewName)?.classList.add("active");

    const topBar = document.getElementById("top-bar");
    if (topBar) topBar.style.display = viewName === "login" || viewName === "machine-select" ? "none" : "flex";

    document.getElementById("fab-add-bean")?.classList.toggle("hidden", viewName !== "list");
    document.getElementById("fab-log-shot")?.classList.toggle("hidden", viewName !== "detail");

    if (addToHistory) {
        const state = { view: viewName };
        const url = "#" + viewName;
        if (viewName === "list" && !history.state) history.replaceState(state, "", url);
        else history.pushState(state, "", url);
    }
    window.scrollTo(0, 0);
};
