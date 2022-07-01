require("dotenv").config();

const axios = require("axios");
const express = require("express");
const bodyParser = require("body-parser");
const qs = require("querystring");
const ticket = require("./ticket");
const signature = require("./verifySignature");
const db = require("./db");
const debug = require("debug")("slash-command-template:index");

const apiUrl = "https://slack.com/api";

const app = express();

/*
 * Parse application/x-www-form-urlencoded && application/json
 * Use body-parser's `verify` callback to export a parsed raw body
 * that you need to use to verify the signature
 */
const rawBodyBuffer = (req, res, buf, encoding) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || "utf8");
  }
};

app.use(bodyParser.urlencoded({ verify: rawBodyBuffer, extended: true }));
app.use(bodyParser.json({ verify: rawBodyBuffer }));

app.get("/", (req, res) => {
  res.send(
    "<h2>The Slash Command and Dialog app is running</h2>" +
      "<p>Follow the instructions in the README to configure the Slack App and your environment variables.</p>"
  );
});

/*
 * Endpoint to receive autorization responses from Slack.
 */
app.get("/slack-install", (req, res) => {
  const params = {
    code: req.query.code,
    client_id: process.env.SLACK_CLIENT_ID,
    client_secret: process.env.SLACK_CLIENT_SECRET,
  };
  axios
    .post(`${apiUrl}/oauth.v2.access`, qs.stringify(params))
    .then((result) => {
      const { data } = result;
      if (data.ok) {
        const { id, access_token } = data.authed_user;
        // TODO: check state
        db.User.create({
          id,
          accessToken: access_token,
        });
        res.redirect("/slack-authorized");
      } else {
        res.send(`Not ok: ${data.error}`);
      }
    })
    .catch((err) => {
      console.log("oauth.v2.access call failed:", err);
      res.send("Not ok");
    });
});

/*
 * Endpoint when slack authorization is complete
 */
app.get("/slack-authorized", (req, res) => {
  res.send(
    "<h2>All ok</h2>" + "<p>You can close this and re-run the command</p>"
  );
});

/*
 * Endpoint to receive slash command from Slack.
 * Checks verification token and opens a dialog to capture more info.
 */
app.post("/command", (req, res) => {
  // Verify the signing secret
  if (!signature.isVerified(req)) {
    debug("Verification token mismatch");
    res.sendStatus(404);
    return;
  }

  // extract the slash command text, and trigger ID from payload
  const { user_id, text, trigger_id, response_url } = req.body;

  db.User.findByPk(user_id)
    .then((user) => {
      res.send("");
      // const view = {...add blocks...};
      // // open the dialog by calling dialogs.open method and sending the payload
      // axios.post(`${apiUrl}/views.open`, qs.stringify(view))
      //   .then((result) => {
      //     debug('views.open: %o', result.data);
      //     res.send('');
      //   }).catch((err) => {
      //     debug('views.open call failed: %o', err);
      //     res.sendStatus(500);
      //   });
      if (user == null || !user.accessToken) {
        // TODO: Store state
        const params = {
          scope: [].join(","),
          user_scope: ["users.profile:write"].join(","),
          redirect_uri: `https://${process.env.PROJECT_DOMAIN}.glitch.me/slack-install`,
          client_id: process.env.SLACK_CLIENT_ID,
          // TODO: Add state
        };
        const url = `https://slack.com/oauth/v2/authorize?${qs.stringify(
          params
        )}`;
        return axios.post(response_url, {
          text: "No access",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "You need to allow access to change your profile details",
              },
              accessory: {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Open permissions",
                  emoji: true,
                },
                value: "give_access",
                url,
                action_id: "button-action",
              },
            },
          ],
        });
      } else {
        const params = {
          name: "display_name",
          value: text,
        };
        return axios
          .post(`${apiUrl}/users.profile.set`, qs.stringify(params), {
            headers: { Authorization: `Bearer ${user.accessToken}` },
          })
          .then((value) => {
            const { data } = value;
            if (!data.ok) {
              return axios.post(response_url, {
                text: `Error: ${data.error || "Unknown error"}`,
              });
            }
          });
      }
    })
    .catch((err) => {
      debug("updating display name failed: %o", err);
      res.sendStatus(500);
    });
});

/*
 * Endpoint to receive the modal submission. Checks the verification token
 * and creates a Helpdesk ticket
 */
// app.post("/interactive", (req, res) => {
//   const body = JSON.parse(req.body.payload);

//   // check that the verification token matches expected value
//   if (signature.isVerified(req)) {
//     debug(`Form submission received: ${body.view}`);

//     // immediately respond with a empty 200 response to let
//     // Slack know the command was received
//     res.send("");

//     // create Helpdesk ticket
//     ticket.create(body.user.id, body.view);
//   } else {
//     debug("Token mismatch");
//     res.sendStatus(404);
//   }
// });

/*
 * Endpoint to list the registered users in the db
 */
// app.get("/registered-users", (req, res) => {
//   db.User.findAll()
//     .then((users) => {
//       const dbUsers = users.map((user) => {
//         return {
//           partialId: (user.id || "").substring(0, 7),
//           partialAccessToken: (user.accessToken || "").substring(0, 10),
//         };
//       });
//       res.send(dbUsers);
//     })
//     .catch((err) => {
//       console.log("Users.findAll call failed:", err);
//       res.send("not ok");
//     });
// });

const server = app.listen(process.env.PORT || 5000, () => {
  console.log(
    "Express server listening on port %d in %s mode",
    server.address().port,
    app.settings.env
  );
});
