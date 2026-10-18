// TopZen backend — ربط Discord (دخول) + Roblox (توثيق)
// التثبيت:  npm i express firebase-admin     التشغيل:  node server.js  (Node 18+)
//
// متغيرات البيئة في Railway:
//   FIREBASE_SERVICE_ACCOUNT  محتوى ملف الـ JSON حق Service Account (Firebase Console → Project settings → Service accounts)
//   DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET   من discord.com/developers → OAuth2
//   ROBLOX_CLIENT_ID / ROBLOX_CLIENT_SECRET     من Roblox Creator Hub → OAuth 2.0 Apps (scopes: openid, profile)
//   SITE_URL      رابط الموقع (اللي فيه index.html)
//   BACKEND_URL   https://top-zen-production.up.railway.app
//   STATE_SECRET  أي نص عشوائي طويل
//   OWNER_DISCORD_ID  آيدي ديسكورد حقك (عشان تدخل بنفس حساب الأونر القديم)
//   OWNER_UID         HSfRw4AD0mfmRcLig5MWPhQGN7C2
//   DISCORD_BOT_TOKEN توكن البوت (Bot tab) — بدونه الأوامر ما تشتغل
//
// Redirect URIs تضيفها في التطبيقين:
//   BACKEND_URL/auth/discord/callback   و   BACKEND_URL/auth/roblox/callback

const express = require("express");
const crypto = require("crypto");
const admin = require("firebase-admin");
const E = process.env;

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(E.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const app = express();

const mac = function (b) { return crypto.createHmac("sha256", E.STATE_SECRET).update(b).digest("base64url"); };
function sign(o) {
  var b = Buffer.from(JSON.stringify(Object.assign({}, o, { exp: Date.now() + 10 * 60 * 1000 }))).toString("base64url");
  return b + "." + mac(b);
}
function read(s) {
  var p = String(s || "").split(".");
  if (p.length !== 2 || p[1].length !== mac(p[0]).length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(p[1]), Buffer.from(mac(p[0])))) return null;
  var o = JSON.parse(Buffer.from(p[0], "base64url").toString());
  return o.exp > Date.now() ? o : null;
}
async function exchange(url, id, secret, code, redirect) {
  var r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: code, redirect_uri: redirect, client_id: id, client_secret: secret })
  });
  var j = await r.json();
  if (!j.access_token) throw new Error("token");
  return j.access_token;
}
function fail(res, msg) { res.redirect(E.SITE_URL + "?error=" + encodeURIComponent(msg)); }

// ---------- Discord: تسجيل الدخول ----------
app.get("/auth/discord", function (req, res) {
  res.redirect("https://discord.com/oauth2/authorize?" + new URLSearchParams({
    client_id: E.DISCORD_CLIENT_ID, response_type: "code", scope: "identify",
    redirect_uri: E.BACKEND_URL + "/auth/discord/callback", state: sign({ k: "d" })
  }));
});
app.get("/auth/discord/callback", async function (req, res) {
  try {
    var s = read(req.query.state);
    if (!s || s.k !== "d" || !req.query.code) throw new Error("state");
    var at = await exchange("https://discord.com/api/oauth2/token", E.DISCORD_CLIENT_ID, E.DISCORD_CLIENT_SECRET, req.query.code, E.BACKEND_URL + "/auth/discord/callback");
    var u = await (await fetch("https://discord.com/api/users/@me", { headers: { Authorization: "Bearer " + at } })).json();
    if (!u.id) throw new Error("user");
    var uid = (u.id === E.OWNER_DISCORD_ID && E.OWNER_UID) ? E.OWNER_UID : "discord:" + u.id;
    var ref = db.collection("users").doc(uid);
    var snap = await ref.get();
    var data = { discord: u.username, discordId: u.id, discordVerified: true };
    if (!snap.exists || !(snap.data() || {}).displayName) data.displayName = String(u.global_name || u.username).slice(0, 18);
    await ref.set(data, { merge: true });
    var token = await admin.auth().createCustomToken(uid);
    res.redirect(E.SITE_URL + "#token=" + token);
  } catch (e) { fail(res, "Discord login failed"); }
});

// ---------- Roblox: ربط الحساب (يحتاج المستخدم يكون داخل) ----------
app.get("/auth/roblox", async function (req, res) {
  try {
    var d = await admin.auth().verifyIdToken(String(req.query.idToken || ""));
    res.redirect("https://apis.roblox.com/oauth/v1/authorize?" + new URLSearchParams({
      client_id: E.ROBLOX_CLIENT_ID, response_type: "code", scope: "openid profile",
      redirect_uri: E.BACKEND_URL + "/auth/roblox/callback", state: sign({ k: "r", uid: d.uid })
    }));
  } catch (e) { fail(res, "Sign in first"); }
});
app.get("/auth/roblox/callback", async function (req, res) {
  try {
    var s = read(req.query.state);
    if (!s || s.k !== "r" || !req.query.code) throw new Error("state");
    var at = await exchange("https://apis.roblox.com/oauth/v1/token", E.ROBLOX_CLIENT_ID, E.ROBLOX_CLIENT_SECRET, req.query.code, E.BACKEND_URL + "/auth/roblox/callback");
    var u = await (await fetch("https://apis.roblox.com/oauth/v1/userinfo", { headers: { Authorization: "Bearer " + at } })).json();
    if (!u.sub) throw new Error("user");
    var dup = await db.collection("users").where("robloxId", "==", String(u.sub)).limit(1).get();
    if (!dup.empty && dup.docs[0].id !== s.uid) return fail(res, "This Roblox account is already linked to another member");
    await db.collection("users").doc(s.uid).set({
      roblox: u.preferred_username || u.name || String(u.sub), robloxId: String(u.sub), robloxVerified: true
    }, { merge: true });
    res.redirect(E.SITE_URL + "?linked=roblox");
  } catch (e) { fail(res, "Roblox linking failed"); }
});

app.get("/", function (req, res) { res.send("TopZen backend OK"); });
// البوت: ما يشتغل إلا إذا حطيت توكن البوت في المتغيرات
if (E.DISCORD_BOT_TOKEN) require("./bot")(db);
else console.log("Bot disabled: set DISCORD_BOT_TOKEN to activate Discord commands.");

app.listen(E.PORT || 3000);
    
