const util = require("../util/util");
const crypto = require('crypto');
const sha = require('js-sha256');
const HttpError = require("../util/HttpError");

const router = require("express").Router()

router.get("/", (req, res) => {
    const rows = req.db.prepare("SELECT * FROM users").all();
    for (const r of rows) {
        delete r.password_hash;
        delete r.password_salt;
    }
    return res.render("users", {
        data: rows
    });
});

router.get("/edit/:id?", (req, res) => {
    const id = req.params.id;
    if (!id)
        return res.render("user", {});

    const row = req.db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);

    if (!row)
        return res.status(404).render("error", {
            msg: "User width id " + id + "not found"
        });

    delete row.password_hash;
    delete row.password_salt;

    return res.render("user", row);
});



router.post("/edit/:id?", (req, res) => {

    req.body.reset_salt = req.body.reset_salt == "on" ? 1 : 0;
    req.body.is_admin = req.body.is_admin == "on" ? 1 : 0;

    if (!req.body.username || !req.body.display_name)
        throw new HttpError("Username or display_name is invalid");

    const id = req.body.id || req.params.id || 0;

    const rows = req.db.prepare("SELECT * FROM users WHERE id = ? OR username = ?").all(id, req.body.username);
    if (rows.length >= 2)
        throw HttpError("Username taken", 404);

    if (rows.length <= 0) {
        if (!req.body.password)
            throw HttpError("Password can't be undefined");

        const salt = crypto.randomBytes(6).toString("hex");
        const hash = sha.sha256(process.env.PASSWORD_PEPPER + req.body.password + salt);

        var lastInsertRowid = req.db.prepare("INSERT INTO users (username, password_hash, password_salt, display_name, is_admin) VALUES (?, ?, ?, ?, ?)").run(req.body.username, hash, salt, req.body.display_name, req.body.is_admin).lastInsertRowid;
        util.createProfile(req.db, "General", lastInsertRowid);
        res.redirect("/user");
        return;
    }

    if (req.body.password) {
        const salt = req.body.reset_salt ? crypto.randomBytes(6).toString("hex") : rows[0].password_salt;
        const hash = sha.sha256(process.env.PASSWORD_PEPPER + req.body.password + salt);

        req.db.prepare(`UPDATE users SET
                            username = ?,
                            password_hash = ?,
                            password_salt = ?,
                            display_name = ?,
                            is_admin = ?
                        WHERE id = ?`).run(req.body.username, hash, salt, req.body.display_name, req.body.is_admin, rows[0].id);
    } else {
        req.db.prepare(`UPDATE users SET
                            username = ?,
                            display_name = ?,
                            is_admin = ?
                        WHERE id = ?`).run(req.body.username, req.body.display_name, req.body.is_admin, rows[0].id);
    }

    return res.redirect("/user");
});

router.get("/delete/:id", (req, res) => {
    req.db.prepare("DELETE FROM profiles WHERE user_id = ?").run(req.params.id);
    req.db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
    return res.redirect("/user");
});

module.exports = router;