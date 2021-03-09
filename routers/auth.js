const sha = require('js-sha256');
const HttpError = require('../util/HttpError');

const router = require("express").Router()

router.get("/login", (req, res) => {
    if (req.session.username)
        return res.redirect("/");
    return res.render('login');
});

router.post("/login", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    const row = req.db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!row)
        return res.status(404).render("error", {
            msg: "Invalid username"
        });

    const hash = sha.sha256(process.env.PASSWORD_PEPPER + password + row.password_salt);

    if (hash !== row.password_hash)
        throw new HttpError(401, "Invalid password");

    req.session.username = row.username;
    req.session.userId = row.id;
    req.session.displayName = row.display_name;
    req.session.isAdmin = !!row.is_admin;

    req.session.save(err => {
        if (err)
            return res.status(500).render("error", {
                msg: err
            });

        return res.redirect("/");
    });
});

router.get("/logout", (req, res) => {
    if (req.session.username && req.cookies.SessionId) {
        res.clearCookie('SessionId');
        req.session.destroy();
    }

    return res.redirect('/login');
});
module.exports = router;