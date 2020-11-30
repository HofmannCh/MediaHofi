require("dotenv").config();
const path = require("path");
const express = require("express");
const basicAuth = require("express-basic-auth");
const fileUpload = require("express-fileupload");
const fs = require("fs");
const exphbs = require("express-handlebars");
const uuid = require("uuid");
const mime = require("mime-types");
const moment = require("moment");
const morgan = require("morgan");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();

// Database
let db = undefined;
const initDb = (success) => {
    db = new sqlite3.Database(path.join(__dirname, "storage.db"), (err) => {
        if (err) {
            console.error(err.message);
            return process.exit();
        }

        console.log("Database connected");

        db.run(`CREATE TABLE IF NOT EXISTS data (
            id INT PRIMARY KEY,
            name TEXT NOT NULL,
            creation_date INT NOT NULL
        )`, err => {
            success();
        });
    });

    process.on("SIGTERM", () => {
        db.close(err => {
            if (err) console.error(err);
        });
    });
}

// Express
let app = undefined;
const initExpress = () => {
    app = express();

    app.use("/robots.txt", express.static(path.join(__dirname, "/robots.txt")));
    app.use("/favicon.ico", express.static(path.join(__dirname, "/static/favicon.ico")));
    app.use("/static", express.static(path.join(__dirname, "/static")));

    // All use or methods after these lines are logged
    app.use(morgan((tokens, req, res) => [
        moment().format("YY-MM-DD-HH-mm-ss-SSS"),
        tokens["response-time"](req, res),
        req.xhr ? 1 : 0,
        tokens.status(req, res),
        tokens.method(req, res),
        tokens.res(req, res, "content-length") || "-",
        tokens["remote-addr"](req, res),
        tokens.url(req, res),
        req.body || ""
    ].map(x => String(x).replace("\t", " ").trimEnd()).join("\t"), {
        stream: fs.createWriteStream("requests.log", {
            flags: "a",
            encoding: "utf-8",
            mode: 0666
        })
    }));

    app.use("/data", express.static(path.join(__dirname, "/data")));

    const headTitle = title => title ? title + " | hofi.dev" : "hofi.dev";

    app.set('views', path.join(__dirname, 'views'))
    const hbs = exphbs.create({
        defaultLayout: "main",
        extname: '.hbs',
        helpers: {
            headTitle: headTitle,
            section: (name, options) => {
                if (!this._sections) this._sections = {};
                this._sections[name] = options.fn(this);
                return null;
            }
        },
    });
    app.engine("hbs", hbs.engine);
    app.set('view engine', ".hbs");

    const dataPath = path.join(__dirname, 'data');

    if (!fs.existsSync(dataPath))
        fs.mkdirSync(dataPath);

    const auth = basicAuth({
        users: {
            'admin': process.env.PW
        },
        challenge: true
    });

    // const sleep = async (ms) => new Promise((resolve, reject) => setTimeout(resolve, ms));

    app.all("/", (req, res) => {
        return res.render("landing");
    });

    const supportedFileExtensions = ["avi", "mov", "mp4", "mp3", "ogg", "webm", "wav", "bmp", "gif", "jpg", "jpeg", "png", "webp", "svg", "txt", "pdf", "json", "xml"];

    app.get("/stats", auth, (req, res) => {
        return res.render("status", {
            title: "Status",
            files: fs.readdirSync(dataPath).sort().reverse().map(x => {
                let isImg, isIframe, isNothing;
                const end = x.substring(x.lastIndexOf(".") + 1);
                if (mime.contentType(x).includes("image")) {
                    isImg = true;
                    isIframe = false;
                    isNothing = false;
                } else if (supportedFileExtensions.includes(end)) {
                    isImg = false;
                    isIframe = true;
                    isNothing = false;
                } else {
                    isImg = false;
                    isIframe = false;
                    isNothing = true;
                }

                return {
                    text: x,
                    del: "/del/" + x,
                    isImg: isImg,
                    isIframe: isIframe,
                    isNothing: isNothing,
                    link: "/i/" + x,
                    rawLink: "/data/" + x
                };
            }),
        });
    });

    app.get("/del/:id", auth, (req, res) => {
        fs.unlinkSync(path.join(dataPath, req.params.id));
        return res.redirect("/stats");
    });

    app.get("/i/:id", (req, res) => {
        db.get("SELECT * FROM data WHERE name = ?", [req.params.id], (err, row) => {
            return res.render("raw", {
                title: req.params.id,
                dispId: req.params.id,
                creationDate: row ? moment.unix(row.creation_date).format("DD.MM.YYYY HH:mm:ss") : "-",
                blobUrl: "/data/" + req.params.id,
                meta: [{
                        name: "property",
                        prop: "og:title",
                        value: headTitle(req.params.id)
                    }, {
                        name: "property",
                        prop: "og:image",
                        value: process.env.BASE_URL + "data/" + req.params.id
                    },
                    {
                        name: "property",
                        prop: "og:image:type",
                        value: mime.contentType(req.params.id)
                    },
                    {
                        name: "property",
                        prop: "og:url",
                        value: process.env.BASE_URL + "i/" + req.params.id
                    },
                ]
            });
        });
    })

    app.post("/i", auth, fileUpload(), (req, res) => {
        try {
            const uploadedFile = req.files["file"];
            const ext = uploadedFile.name.substring(uploadedFile.name.lastIndexOf("."))
            let newFileName;

            const now = moment();
            do newFileName = crypto.randomBytes(5).toString("hex") + ext;
            while (fs.existsSync(path.join(dataPath, newFileName)));

            uploadedFile.mv(path.join(dataPath, newFileName), err => {
                if (err) {
                    console.log(err);
                    return res.status(500).send({
                        error: err.toString()
                    });
                }

                console.log("File " + uploadedFile.name + " uploaded to " + newFileName);

                db.run("INSERT INTO data (name, creation_date) VALUES (?, ?)", [newFileName, now.unix()]);

                return res.status(200).send({
                    shouldShow: supportedFileExtensions.includes(newFileName.substring(newFileName.lastIndexOf(".") + 1)),
                    file: process.env.BASE_URL + "i/" + newFileName
                });
            });
        } catch (error) {
            return res.status(500).send({
                error: error
            });
        }
    });

    app.listen(process.env.PORT, (req, res) => console.log("Start server on Port " + process.env.PORT));

    process.on("SIGTERM", () => {
        app.close(() => {
            console.log("Server shutdown");
        });
    });
}

initDb(initExpress);