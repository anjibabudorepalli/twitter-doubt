const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initilizeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Serever Started at http://localhost:3000");
    });
  } catch (e) {
    console.log(e.message);
    process.exit(1);
  }
};
initilizeDbAndServer();

///API1 REGISTER

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const dbUserSql = `SELECT * FROM 
                  USER
                  WHERE 
                  username='${username}';`;

  const dbUser = await db.get(dbUserSql);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUserSql = `INSERT INTO USER
                           (name,username,password,gender)
                           VALUES
                           ('${name}','${username}','${hashedPassword}','${gender}');`;

      await db.run(addUserSql);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

///API2 LOGIN

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const usernameSql = `SELECT
                       * FROM
                        USER
                        WHERE 
                        username='${username}';`;

  const dbUser = await db.get(usernameSql);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const checkPassword = await bcrypt.compare(password, dbUser.password);
    if (checkPassword === true) {
      const plyload = { username: username };
      const jwtToken = jwt.sign(plyload, "anji");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

///AUTHENTICATION TOKEN

const authenticate = (request, response, next) => {
  let jwtToken;
  const authParameter = request.headers["authorization"];
  if (authParameter !== undefined) {
    jwtToken = authParameter.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    const verifyAuthToken = jwt.verify(jwtToken, "anji", (error, user) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = user;
        next();
      }
    });
  }
};

///API3

app.get("/user/tweets/feed/", authenticate, async (request, response) => {
  const { username } = request.username;

  const userFollowsSql = `SELECT 
                            user_id from 
                            user
                            where username='${username}';`;
  const data = await db.get(userFollowsSql);
  const id = data.user_id;

  const sql = `SELECT
                 *
                 FROM FOLLOWER
                 inner join tweet
                 on follower.following_user_id=tweet.user_id
                 inner join user on follower.following_user_id=user.user_id
                 WHERE FOLLOWER.follower_user_id=${id} 
                 order by date_time desc
                 limit 4`;

  const data2 = await db.all(sql);

  response.send(
    data2.map((k) => {
      return {
        username: k.username,
        tweet: k.tweet,
        dateTime: k.date_time,
      };
    })
  );
});

///API4 GET USER ALL USER NAMES

app.get("/user/following/", authenticate, async (request, response) => {
  const { username } = request.username;

  const userIdSql = `SELECT 
                      USER_ID
                      FROM
                      USER
                      WHERE
                      USERNAME='${username}';`;
  const data = await db.get(userIdSql);
  const id = data.user_id;

  const sql = `SELECT
              *
              FROM
              FOLLOWER
              INNER JOIN
              USER ON
              FOLLOWER.following_user_id=USER.USER_ID
              WHERE FOLLOWER.follower_user_id=${id};`;

  const data2 = await db.all(sql);
  response.send(
    data2.map((k) => {
      return {
        name: k.name,
      };
    })
  );
});

///API5 GET ALL NAMES OF FOLLOWER

app.get("/user/followers/", authenticate, async (request, response) => {
  const { username } = request.username;
  const adminSql = `SELECT
                      USER_ID
                      FROM 
                      USER
                      WHERE
                      USERNAME='${username}'`;
  const data = await db.get(adminSql);
  const id = data.user_id;

  const sql = `SELECT
                *
               FROM
               FOLLOWER
               INNER JOIN USER
               on follower.follower_user_id=user.user_id
               WHERE FOLLOWER.following_user_id=${id};`;

  const data2 = await db.all(sql);
  response.send(
    data2.map((k) => {
      return {
        name: k.name,
      };
    })
  );
});

///API6

app.get("/tweets/:tweetId/", authenticate, async (request, response) => {
  const { username } = request.username;
  const { tweetId } = request.params;

  const sql = `SELECT
               tweet.tweet as tweet,
               sum(distinct like_id) as likes,
               sum(distinct reply_id) as replies,
               tweet.date_time as datetime
               FROM
               TWEET
               INNER JOIN
               LIKE
               ON
               TWEET.TWEET_ID=LIKE.TWEET_ID
               INNER JOIN REPLY
               ON TWEET.TWEET_ID=REPLY.TWEET_ID
               WHERE tweet.USER_ID IN(SELECT
                           following_user_id
                           FROM 
                           FOLLOWER
                           INNER JOIN
                           USER
                           ON FOLLOWER.follower_user_id=USER.user_id
                           WHERE USERNAME='${username}')
                           and tweet.tweet_id=${tweetId}
                           group by tweet.tweet_id;`;

  const data2 = await db.get(sql);
  if (data2 === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send({
      tweet: data2.tweet,
      likes: data2.likes,
      replies: data2.replies,
      dateTime: data2.datetime,
    });
  }
});

///API7

app.get("/tweets/:tweetId/likes/", authenticate, async (request, response) => {
  const { username } = request.username;
  const { tweetId } = request.params;
  const following = `SELECT
                        following_user_id
                        FROM
                        FOLLOWER
                        INNER JOIN
                        USER
                        ON
                        FOLLOWER.follower_user_id=USER.USER_ID
                        WHERE USER.USERNAME='${username}';`;

  const data = await db.all(following);
  let arr = [];
  for (let i of data) {
    arr.push(i.following_user_id);
  }

  const sql = `SELECT
               * 
               FROM
               TWEET
                INNER JOIN
                LIKE
                ON TWEET.TWEET_ID=LIKE.TWEET_ID
                INNER JOIN
                USER
                ON
                LIKE.USER_ID=USER.USER_ID
                WHERE TWEET.USER_ID IN(SELECT
                        following_user_id
                        FROM
                        FOLLOWER
                        INNER JOIN
                        USER
                        ON
                        FOLLOWER.follower_user_id=USER.USER_ID
                        WHERE USER.USERNAME='${username}')
                AND TWEET.tweet_id=${tweetId}
                ;`;

  const data2 = await db.all(sql);
  if (data2 == false) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    let arr = [];
    for (let k of data2) {
      arr.push(k.username);
    }
    response.send(arr);
  }
});

///API8

app.get(
  "/tweets/:tweetId/replies/",
  authenticate,
  async (request, response) => {
    const { username } = request.username;
    const { tweetId } = request.params;
    const sql = `SELECT 
                *
                FROM
                TWEET
                INNER JOIN
                REPLY
                ON
                TWEET.TWEET_ID=REPLY.TWEET_ID
                INNER JOIN
                FOLLOWER
                ON
                TWEET.USER_ID=FOLLOWER.following_user_id
                inner join 
                user
                on
                reply.user_id=user.user_id

                WHERE 
                TWEET.TWEET_ID=${tweetId}
                AND FOLLOWER.follower_user_id=(SELECT
                    USER_ID FROM USER 
                    WHERE USERNAME='${username}');`;

    const data = await db.all(sql);
    if (data == false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(
        data.map((k) => {
          return {
            replies: [
              {
                name: k.name,
                reply: k.reply,
              },
            ],
          };
        })
      );
    }
  }
);

///API9

app.get("/user/tweets/", authenticate, async (request, response) => {
  const { username } = request.username;
  const sql = `SELECT
                 tweet.tweet as tweet,
                 sum(distinct like_id) as likes,
                 sum(distinct reply_id) as replies,
                 tweet.date_time as dateTime
                FROM
                TWEET
                inner join user
                on
                tweet.user_id=user.user_id
                left join like
                on
                tweet.tweet_id=like.tweet_id
                left join reply
                on tweet.tweet_id=reply.tweet_id

                where user.username='${username}'
                group by tweet.tweet_id;`;

  const data = await db.all(sql);
  response.send(
    data.map((k) => {
      return {
        tweet: k.tweet,
        likes: k.likes,
        replies: k.replies,
        dataTime: k.dateTime,
      };
    })
  );
});

///API 10

app.post("/user/tweets/", authenticate, async (request, response) => {
  const { username } = request.username;
  const { tweet } = request.body;
  const userIdSql = `SELECT USER_ID
                   FROM USER 
                   WHERE USER.USERNAME='${username}';`;
  const data = await db.get(userIdSql);
  const id = data.user_id;
  const date = Date.now();
  const sql = `INSERT
             INTO TWEET
             (TWEET,USER_ID,DATE_TIME)
             VALUES
             ('${tweet}',${id},${date})`;
  await db.run(sql);
  response.send("Created a Tweet");
});

///API11

app.delete("/tweets/:tweetId/", authenticate, async (request, response) => {
  const { username } = request.username;
  const { tweetId } = request.params;
  const checkTweetId = `SELECT
                          TWEET.tweet
                          FROM 
                          TWEET
                          inner join
                          user
                          on tweet.user_id=user.user_id
                          WHERE TWEET_ID=${tweetId}
                          AND USERNAME='${username}';`;
  const data = await db.get(checkTweetId);
  if (data === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const sql = `DELETE FROM TWEET
                    WHERE
                    TWEET.TWEET_ID=${tweetId};`;
    await db.run(sql);
    response.send("Tweet Removed");
  }
});
module.exports = app;
