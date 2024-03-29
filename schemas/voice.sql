CREATE TABLE User (
    id INTEGER PRIMARY KEY,
    name TEXT,
    level INTEGER,
    avatar TEXT,
    playTime INTEGER,
    weight INTEGER,
    profileUrl TEXT
);

CREATE TABLE FeatureRequest (
    id TEXT PRIMARY KEY,
    creatorId INTEGER,
    upvotes INTEGER,
    downvotes INTEGER,
    status INTEGER,
    title TEXT,
    description TEXT,
    created DATE,
    updated DATE,
    weight INTEGER,
    FOREIGN KEY (creatorId) REFERENCES User(id)
);


CREATE TABLE UserVote (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    featureRequestId TEXT,
    vote INTEGER,
    FOREIGN KEY (userId) REFERENCES User(id),
    FOREIGN KEY (featureRequestId) REFERENCES FeatureRequest(id),
    UNIQUE (userId, featureRequestId)
);