const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const supportedFileExtensions = ["avi", "mov", "mp4", "mp3", "ogg", "webm", "wav", "bmp", "gif", "jpg", "jpeg", "png", "webp", "svg", "txt", "pdf", "json", "xml"];
const supportedImageExtensions = ["bmp", "gif", "icns", "ico", "jpeg", "jpg", "png", "psd", "svg", "tiff", "webp"];

const dataPath = path.join(process.cwd(), './data');

const isAuth = req => req.cookies.SessionId && req.session.username && req.session.userId;

const auth = (req, res, next) => {
  if (isAuth(req)) {
    return next();
  } else if (req.xhr) {
    return res.status(401).send({
      msg: "Unauthorized 401"
    });
  } else {
    return res.redirect("/login");
  }
};

const admin = (req, res, next) => {
  if (isAuth(req) && req.session.isAdmin) {
    return next();
  } else if (req.xhr) {
    return res.status(401).send({
      msg: "Unauthorized 401"
    });
  } else {
    return res.redirect("/login");
  }
};


function createProfile(db, name, userId) {
  let key, row;

  do {
    key = crypto.randomBytes(6).toString("hex");
    row = db.prepare("SELECT EXISTS(SELECT 1 FROM profiles WHERE key = ?) AS Result").get(key);
  } while (row.Result);

  return db.prepare("INSERT INTO profiles (name, key, user_id) VALUES (?, ?, ?)").run(name, key, userId).lastInsertRowid;
}

function deleteFilesByPath(req, res, paths, withoutRedirect) {
  const rows = req.session.isAdmin ?
    req.db.prepare(`
    SELECT f.id, f.path, f.profile_id FROM files AS f
    LEFT JOIN profiles AS p ON p.id = f.profile_id
    WHERE f.path IN (${paths.map(() => "?").join(", ")})`).all([...paths]) :
    req.db.prepare(`
    SELECT f.id, f.path, f.profile_id FROM files AS f
    LEFT JOIN profiles AS p ON p.id = f.profile_id
    WHERE f.path IN (${paths.map(() => "?").join(", ")}) AND p.user_id = ?`).all([...paths, req.session.userId]);

  return deleteFiles(req, res, rows, withoutRedirect);
}

function deleteFilesById(req, res, ids, withoutRedirect) {
  const rows = req.session.isAdmin ?
    req.db.prepare(`
    SELECT f.id, f.path, f.profile_id FROM files AS f
    LEFT JOIN profiles AS p ON p.id = f.profile_id
    WHERE f.id IN (${ids.map(() => "?").join(", ")})`).all([...ids]) :
    req.db.prepare(`
    SELECT f.id, f.path, f.profile_id FROM files AS f
    LEFT JOIN profiles AS p ON p.id = f.profile_id
    WHERE f.id IN (${ids.map(() => "?").join(", ")}) AND p.user_id = ?`).all([...ids, req.session.userId]);

  return deleteFiles(req, res, rows, withoutRedirect);
}

function deleteFiles(req, res, rows, withoutRedirect) {
  if (rows.length) {
    for (const row of rows) {
      try {
        fs.unlinkSync(path.join(dataPath, row.path));
      } catch (e) {}
    }
    req.db.prepare(`DELETE FROM files WHERE id IN (${rows.map(() => "?").join(", ")})`).run(rows.map(x => x.id));
    if (!withoutRedirect)
      return res.redirect("/profile/show/" + rows[0].profile_id);
  } else {
    if (!withoutRedirect)
      return res.redirect("/profile");
  }
}

module.exports = {
  isAuth,
  auth,
  admin,
  createProfile,
  supportedFileExtensions,
  supportedImageExtensions,
  deleteFilesByPath,
  deleteFilesById,
  dataPath
};