let startDate = moment().startOf("isoWeek"),
    endDate = moment().endOf("isoWeek");

const datePicker = $("#datepicker");
const loading = $(".loading-files");
const data = $(".data");

$(() => {
    console.log("Init");
    datePicker.daterangepicker({
        opens: 'center',
        showDropdowns: true,
        minYear: 2020,
        maxYear: parseInt(moment().add(2, "year").format('YYYY'), 10),
        startDate: startDate,
        endDate: endDate,
        locale: {
            format: 'DD.MM.YY',
            firstDay: 1
        },
        autoApply: true,
        maxSpan: {
            "months": 3
        },
    }, (start, end, label) => {
        startDate = start;
        endDate = end;
        reload();
    });

    reload();
});

$(".content")
    .on("click", ".day-heading", e => {
        const dayEls = [...e.currentTarget.nextSibling.children];
        const selected = window.selectable.getSelectedNodes();
        const intersect = dayEls.filter(value => selected.includes(value));
        if (intersect.length) {
            window.selectable.deselect(intersect);
        } else {
            window.selectable.select(dayEls);
        }
    }).on("click", ".download-files", e => {
        const all = window.selectable.getSelectedNodes();
        const toUpdate = [...all].map(x => x.attributes["data-id"].value).join(",");
        if (!toUpdate)
            return;
        window.open("/profile/downloadFile/" + toUpdate, "_blank");
    }).on("click", ".open-files", e => {
        const all = [...window.selectable.getSelectedNodes()];
        if (!all)
            return;
        if (all.length === 1) {
            window.location.href = all[0].querySelector("a").href;
        } else {
            for (const al of all)
                window.open(al.querySelector("a").href, "_blank");
        }
    }).on("click", ".delete-files", e => {
        const all = window.selectable.getSelectedNodes();
        const tou = [...all].map(x => x.attributes["data-id"].value);
        const toUpdate = tou.join(",");
        if (!toUpdate)
            return;
        if (confirm(`Delete all ${tou.length} file(s)?`))
            window.location.href = "/profile/deleteFile/" + toUpdate;
    }).on("click", ".reload-files", e => {
        reload();
    }).on("dblclick", ".blob-wrapper", e => {
        location.href = $(e.currentTarget).find("> a").attr("href");
    });

function reload() {
    loading.show();
    $.get(`/profile/show/content/${location.pathname.match(/\d+$/)[0]}/${startDate.format("YYYY-MM-DD")}/${endDate.format("YYYY-MM-DD")}`, res => {
        data.empty();
        data.html(res.content);
        const dateP = datePicker.data('daterangepicker');
        dateP.setStartDate(moment(res.from, "YYYY-MM-DD"));
        dateP.setEndDate(moment(res.till, "YYYY-MM-DD"));

        window.selectable = new Selectable({
            filter: ".blob-wrapper",
            ignore: ".day-heading",
            appendTo: data[0],
            lasso: {
                borderColor: "rgba(255, 255, 255, 1)",
                backgroundColor: "rgba(255, 255, 255, 0.1)"
            }
        });

        loading.hide();
    });
}