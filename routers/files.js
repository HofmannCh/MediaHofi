const moment = require("moment");
const fs = require("fs");
const path = require("path");
const fileUpload = require("express-fileupload");
const mime = require("mime-types");
const crypto = require("crypto");

const util = require("../util/util");
const HttpError = require("../util/HttpError");
const router = require("express").Router()

router.get("/i/:id", (req, res) => {
    const row = req.db.prepare(`
        SELECT f.*, p.user_id FROM files AS f
        LEFT JOIN profiles AS p ON p.id = f.profile_id
        WHERE path = ?`).get(req.params.id);
    if (row) {
        return res.render("raw", {
            inDb: true,
            canDelete: util.isAuth(req) && req.session.userId === row.user_id,
            name: row.name,
            path: row.path,
            creationDate: moment.unix(row.creation_date).format("DD.MM.YYYY HH:mm:ss"),
            blobUrl: "/data/" + row.path,
            absoluteBlobUrl: process.env.BASE_URL + "data/" + row.path,
            isImage: row.content_type.startsWith("image/"),
            contentType: row.content_type,
        });
    } else {
        const contentType = mime.contentType(req.params.id);
        return res.render("raw", {
            inDb: false,
            name: req.params.id,
            path: req.params.id,
            blobUrl: "/data/" + req.params.id,
            absoluteBlobUrl: process.env.BASE_URL + "data/" + req.params.id,
            isImage: contentType.startsWith("image/"),
            contentType: contentType,
        });
    }
});

router.get("/upload", util.auth, (req, res) => {
    const rows = req.db.prepare("SELECT key, name FROM profiles WHERE user_id = ?").all(req.session.userId);

    return res.render("upload", {
        profiles: rows.map(x => ({
            key: x.key,
            name: x.name
        }))
    });
});

router.get("/deleteFile/:path", util.auth, (req, res) => {
    util.deleteFilesByPath(req, res, [req.params.path]);
});

router.post("/upload", fileUpload(), (req, res) => {

    if (!req.body.profiles)
        throw new HttpError("Profile key is empty");

    const profile = req.db.prepare("SELECT id FROM profiles WHERE key = ?").get(req.body.profiles);
    if (!profile)
        throw new HttpError("Profile not found", 404);

    const now = moment().unix();
    const files = [];
    const memoryFiles = req.files.files.length ? req.files.files : [req.files.files];

    if (!memoryFiles.length)
        throw new HttpError("No files");

    for (const uploadedFile of memoryFiles) {
        const ext = uploadedFile.name.substring(uploadedFile.name.lastIndexOf("."))
        let newFileName;

        do newFileName = crypto.randomBytes(5).toString("hex") + ext;
        while (fs.existsSync(path.join(util.dataPath, newFileName)));

        files.push(uploadedFile.mv(path.join(util.dataPath, newFileName)).then(e => {
            if (e)
                return err instanceof Error ? err : new HttpError(err.message);
            return [uploadedFile, newFileName];
        }));
    }

    Promise.all(files).then(values => {
        const returns = [];
        let error = [];
        for (const val of values) {
            if (val instanceof Error) {
                error.push(val.message);
                continue;
            }
            req.db.prepare("INSERT INTO files (name, path, content_type, creation_date, profile_id) VALUES (?, ?, ?, ?, ?)")
                .run(val[0].name, val[1], val[0].mimetype, now, profile.id);

            console.log("File " + val[0].name + " uploaded to " + val[1]);

            returns.push({
                shouldShow: util.supportedFileExtensions.includes(val[1].substring(val[1].lastIndexOf(".") + 1)),
                file: process.env.BASE_URL + "i/" + val[1]
            })
        }

        if (req.xhr) {
            if (error.length) {
                return res.status(500).send({
                    error: error.join(", "),
                    files: returns
                });
            } else {
                return res.send({
                    files: returns
                });
            }
        } else {
            if (error.length) {
                return res.status(500).render({
                    msg: error.join(", ")
                });
            } else {
                return res.redirect("/profile/show/" + profile.id);
            }
        }
    }).catch(e => {
        if (req.xhr) {
            return res.status(500).send({
                error: e.message
            });
        } else {
            return res.status(500).render({
                msg: e.message
            });
        }
    });
});

module.exports = router;