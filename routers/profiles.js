const HttpError = require("../util/HttpError");
const util = require("../util/util");
const router = require("express").Router();
const moment = require("moment");
const fs = require("fs");
const path = require("path");
const zip = require("express-zip");
const pug = require("pug");

router.get("/", util.auth, (req, res) => {
    const rows = req.session.isAdmin ?
        req.db.prepare("SELECT p.*, u.display_name AS user FROM profiles AS p JOIN users AS u ON u.id = p.user_id ORDER BY u.display_name ASC, p.Id ASC").all() :
        req.db.prepare("SELECT * FROM profiles WHERE user_id = ?").all(req.session.userId);

    return res.render("profiles", {
        data: rows.map(x => ({
            id: x.id,
            name: x.name,
            user: x.user
        }))
    });
});

router.get("/edit/:id?", (req, res) => {
    const id = req.params.id;
    if (!id)
        return res.render("profile", {});

    const row = req.session.isAdmin ?
        req.db.prepare("SELECT * FROM profiles WHERE id = ?").get(req.params.id) :
        req.db.prepare("SELECT * FROM profiles WHERE id = ? AND user_id = ?").get(req.params.id, req.session.userId);

    if (!row)
        throw new HttpError("Profile not found", 404);

    delete row.user_id;

    return res.render("profile", row);
});

router.post("/edit/:id?", (req, res) => {
    delete req.body.key;

    if (!req.body.name)
        throw new HttpError("Name is invalid");

    const id = req.body.id || req.params.id || 0;

    if (id) {
        req.session.isAdmin ?
            req.db.prepare(`UPDATE profiles SET name = ? WHERE id = ?`).run(req.body.name, id) :
            req.db.prepare(`UPDATE profiles SET name = ? WHERE id = ? AND user_id = ?`).run(req.body.name, id, req.session.userId);
    } else {
        const row = req.db.prepare("SELECT * FROM profiles WHERE user_id = ? AND name = ?").get(req.session.userId, req.body.name);
        if (row)
            throw new HttpError("Name taken");
        util.createProfile(req.db, req.body.name, req.session.userId);
    }
    return res.redirect("/profile");
});

router.get("/delete/:id", (req, res) => {

    const row = req.session.isAdmin ?
        req.db.prepare("SELECT * FROM profiles WHERE id = ?").get(req.params.id) :
        req.db.prepare("SELECT * FROM profiles WHERE id = ? AND user_id = ?").get(req.params.id, req.session.userId);
    if (row) {
        const files = req.db.prepare("SELECT * FROM files WHERE profile_id = ?").all(req.params.id);
        util.deleteFilesById(req, res, files.map(x => x.id), true);
        req.db.prepare("DELETE FROM files WHERE profile_id = ?").run(req.params.id);
        req.db.prepare("DELETE FROM profiles WHERE id = ?").run(req.params.id);
    }
    return res.redirect("/profile");
});

router.get("/show/:id", (req, res) => {
    const row = req.session.isAdmin ?
        req.db.prepare(`SELECT name FROM profiles WHERE id = ?`).get(req.params.id) :
        req.db.prepare(`SELECT name FROM profiles WHERE id = ? AND user_id = ?`).get(req.params.id, req.session.userId);

    if (!row)
        throw new HttpError("Profile not found", 404);

    return res.render("profilesShow", {
        profileName: row.name,
    });
});

router.get(/\/show\/content\/(.+)\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})/, (req, res) => {
    const from = moment(req.params[1], "YYYY-MM-DD").startOf("day");
    let till = moment(req.params[2], "YYYY-MM-DD").endOf("day");
    if (till.diff(from, "month", true) > 2)
        till = from.clone().add(2, "month").endOf("day");

    const rows = req.session.isAdmin ?
        req.db.prepare(`
        SELECT p.id, f.* FROM profiles AS p
        LEFT JOIN files AS f ON f.profile_id = p.id AND f.creation_date BETWEEN ? AND ?
        WHERE p.id = ?
        ORDER BY f.creation_date DESC, f.id DESC`).all(from.unix(), till.unix(), parseInt(req.params[0])) :
        req.db.prepare(`
        SELECT p.id, f.* FROM profiles AS p
        LEFT JOIN files AS f ON f.profile_id = p.id AND f.creation_date BETWEEN ? AND ?
        WHERE p.id = ? AND p.user_id = ?
        ORDER BY f.creation_date DESC, f.id DESC`).all(from.unix(), till.unix(), parseInt(req.params[0]), req.session.userId);

    if (!rows.length)
        throw new HttpError("Profile not found", 404);

    const days = [];
    let lastDay;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        if (!row.id)
            continue;

        const fileDate = moment.unix(row.creation_date);
        const file = {
            ...row,
            isImage: row.content_type.startsWith("image/"),
            isAudio: row.content_type.startsWith("audio/"),
            isVideo: row.content_type.startsWith("video/"),
            isIframe: util.supportedFileExtensions.includes(row.path.substring(row.path.lastIndexOf(".") + 1)),
            date: fileDate
        };
        if (i == 0 || !lastDay.date.isSame(fileDate, "day")) {
            lastDay = {
                date: fileDate.clone().startOf("day"),
                files: [file]
            };
            days.push(lastDay);
        } else {
            lastDay.files.push(file);
        }
    }
    return res.send({
        from: from.format("YYYY-MM-DD"),
        till: till.format("YYYY-MM-DD"),
        content: pug.renderFile(path.join(process.cwd(), "views", "profilesShowData.pug"), {
            days: days,
        }),
    });
});

router.get("/deleteFile/:ids", (req, res) => {
    util.deleteFilesById(req, res, req.params.ids.split(",").map(Number));
});

router.get("/downloadFile/:ids", (req, res) => {
    const ids = req.params.ids.split(",").map(Number);
    const rows = req.session.isAdmin ?
        req.db.prepare(`
        SELECT f.path, f.name FROM files AS f
        LEFT JOIN profiles AS p ON p.id = f.profile_id
        WHERE f.id IN (${ids.map(() => "?").join(", ")})`).all([...ids]) :
        req.db.prepare(`
        SELECT f.path, f.name FROM files AS f
        LEFT JOIN profiles AS p ON p.id = f.profile_id
        WHERE f.id IN (${ids.map(() => "?").join(", ")}) AND p.user_id = ?`).all([...ids, req.session.userId]);

    res.zip(rows.map(x => ({
        path: path.join(util.dataPath, x.path),
        name: x.name
    })), "files.zip");
});

module.exports = router;