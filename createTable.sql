DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_admin INT NOT NULL
);

DROP TABLE IF EXISTS profiles;
CREATE TABLE profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    key TEXT NOT NULL,
    user_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IX_profiles_key ON profiles(key);
CREATE INDEX IX_profiles_user_id ON profiles(user_id);

DROP TABLE IF EXISTS files;
CREATE TABLE files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    content_type TEXT NOT NULL,
    creation_date INT NOT NULL,
    profile_id INT NOT NULL,
    size_bytes INT NOT NULL,
    meta TEXT NULL,
    FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IX_files_name ON files(name);
CREATE INDEX IX_files_profile_id ON profiles(id);