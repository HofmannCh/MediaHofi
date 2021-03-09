require("dotenv").config();
const express = require("express");
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const session = require('express-session');
const sessionFileStore = require('session-file-store');
// const pug = require('pug');
const moment = require("moment");
const morgan = require("morgan");
const BetterSqlite3 = require('better-sqlite3-with-prebuilds');
const util = require("./util/util");

// create data folder
if (!fs.existsSync(util.dataPath))
    fs.mkdirSync(util.dataPath);

// Init db
const db = new BetterSqlite3(path.join(process.cwd(), "storage.db"));
console.log("DB connected");

const app = express();

process.on("SIGTERM", () => {
    console.log("Server error");
    app.close(() => {
        console.log("Server shutdown");
    });
});

app.use("/favicon.ico", express.static(path.join(__dirname, "/static/favicon.ico")));
app.use("/data", express.static(path.join(__dirname, "/data")));
app.use("/robots.txt", express.static(path.join(__dirname, "/robots.txt")));
app.use("/static", express.static(path.join(__dirname, "/static")));

app.use(cookieParser());
app.use(session({
    key: 'SessionId',
    secret: '12345678',
    genid: (req) => crypto.randomBytes(8).toString("hex"),
    resave: false,
    saveUninitialized: false,
    store: new(sessionFileStore(session))({
        path: "./sessions",
        ttl: 604800, // one week in sec
        logFn: () => {}
    }),
    cookie: {
        maxAge: 6.048e+8 // one week in ms
    },
    unset: "destroy"
}));
app.use((req, res, next) => {
    req.db = db;
    res.locals.url = req.url;
    res.locals.session = req.session;
    res.locals.req = () => req;
    res.locals.res = () => res;

    if (res.cookies && req.cookies.SessionId && !req.session.username)
        delete res.cookies.SessionId;

    return next();
});

app.set("viwes", path.join(__dirname, "views"));
app.set('view engine', 'pug');

// All use or methods after these lines are logged
app.use(morgan((tokens, req, res) => [
    moment().format("YY-MM-DD-HH-mm-ss-SSS"),
    tokens["response-time"](req, res),
    req.xhr ? 1 : 0,
    tokens.status(req, res),
    tokens.method(req, res),
    tokens.res(req, res, "content-length") || "-",
    tokens["remote-addr"](req, res),
    req.path,
    JSON.stringify(req.query || []),
    JSON.stringify(req.body || []),
].map(x => String(x).replace("\t", " ").trimRight()).join("\t"), {
    stream: fs.createWriteStream("requests.log", {
        flags: "a",
        encoding: "utf-8",
        mode: 0666
    })
}));

app.all("/", (req, res) => res.redirect("/profile"));
app.use(require("./routers/files"));

app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(require("./routers/auth"));
app.use("/profile", util.auth, require("./routers/profiles"));
app.use("/user", util.admin, require("./routers/users"));

app.use((err, req, res, next) => {
    err = err || {};
    console.error(err);

    if (res.headersSent)
        return;

    if (req.xhr) {
        return res.status(err.status || 500).send({
            error: err.toString()
        });
    } else {
        return res.status(err.status || 500).render("error", {
            msg: err.message
        });
    }
})

app.listen(process.env.PORT, () => console.log("Server running on http://localhost:" + process.env.PORT));