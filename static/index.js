$(() => {
    $(document.body).on("click", ".delete-confirm", e => {
        const btn = $(e.currentTarget);
        return window.confirm(`Do you want to delete ${btn.data("entity-name")} ${btn.data("entity-value")}`);
    });
});