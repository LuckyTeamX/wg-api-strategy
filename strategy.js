const CustomStrategy = require('passport-custom').Strategy;
const rp = require('request-promise');

async function delay() {
  return new Promise((resolve) => {
    setTimeout(resolve, 1000);
  })
}

module.exports = function WgApiStrategy(applicationId, next) {
  return new CustomStrategy(
    async (req, callback) => {
      if (req.query.status === 'error' && req.query.message === 'AUTH_CANCEL') {
        return callback(null, null);
      }
      if (req.query.status && req.query.account_id && req.query.nickname) {
        const access_token = req.query.access_token;
        const account_id = req.query.account_id;

        if (typeof access_token !== "string" && access_token === "") {
          return callback(new Error("badToken"));
        }

        if (req.query.status !== 'ok') {
          return callback(new Error("statusNotOk"));

        }
        try {
          const reqUrl = `https://api.worldoftanks.ru/wot/account/info/` +
            `?nofollow=1&language=ru&application_id=${applicationId}`
            + '&account_id=' + account_id + '&access_token=' + access_token + '&fields=private,nickname';

          // 3 attempts
          let data = JSON.parse(await rp(reqUrl));
          if (data && data.error && data.error.code == 504) {
            await delay(1000);
            data = JSON.parse(await rp(reqUrl));
            if (data && data.error && data.error.code == 504) {
              await delay(1000);
              data = JSON.parse(await rp(reqUrl));
            }
          }

          if (!data || data.status !== "ok") {
            return callback(new Error("responseStatusNotOk"));
            //Helpers.redirectToWgAuth(res, APPLICATION_ID);
          }
          let playerData = data.data[account_id];
          if (!playerData) {
            //return callback(new Error("playerData of #" + account_id + " is null"));
            data = await rp({
              uri: 'https://api.worldoftanks.ru/wot/auth/prolongate/',
              qs: {application_id: applicationId},
              form: {access_token},
              json: true
            });
            if (data.status === 'ok' && data.data.account_id == account_id) {
              playerData = {};
              playerData.nickname = req.query.nickname;
              playerData.private = null;
            } else {
              return callback(new Error("cannot prolongate #" + account_id + ": " + JSON.stringify(data)));
            }
          } else if (!playerData.private) {
            return callback(new Error("private data of player " + playerData.nickname + " is not available"));
          }

          next({
            wgId: account_id,
            username: playerData.nickname,
            privateData: playerData.private
          }, callback);

        } catch (err) {
          return callback(err);
        }
      } else {
        return callback(new Error("notAllParams"));
      }
    }
  );
};