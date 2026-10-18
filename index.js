// TopZen backend على Firebase Functions (بدل Railway) — Discord login + Roblox link + Slash commands
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const express = require("express");
const crypto = require("crypto");
const { createCanvas } = require("@napi-rs/canvas");

admin.initializeApp();
const db = admin.firestore();
const E = process.env;

const THEMES = {
  red:   { accent: "#ef4444", dark: "#1c0707", mid: "#2b0b0b", glow: "rgba(239,68,68,0.55)" },
  green: { accent: "#10b981", dark: "#04150e", mid: "#082a1c", glow: "rgba(16,185,129,0.55)" }
};
const MEDALS = ["#fbbf24", "#d6dbe3", "#d97706"];

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Top-10 leaderboard card (red theme = kills, green theme = clan)
function leaderboardPNG(title, sub, rows, unit, theme) {
  var t = THEMES[theme], W = 900, rowH = 64, top = 170, H = top + 10 * rowH + 40;
  var c = createCanvas(W, H), g = c.getContext("2d");
  var bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, t.mid); bg.addColorStop(1, t.dark);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  var rg = g.createRadialGradient(W - 100, 0, 10, W - 100, 0, 520);
  rg.addColorStop(0, t.glow); rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg; g.fillRect(0, 0, W, H);

  g.textBaseline = "alphabetic"; g.textAlign = "left";
  g.fillStyle = t.accent; g.font = "bold 20px sans-serif"; g.fillText("TOPZEN", 40, 52);
  g.shadowColor = t.accent; g.shadowBlur = 24; g.fillStyle = "#fff"; g.font = "bold 56px sans-serif"; g.fillText(title, 40, 118);
  g.shadowBlur = 0; g.fillStyle = "rgba(255,255,255,0.55)"; g.font = "18px sans-serif"; g.fillText(sub, 40, 148);

  for (var i = 0; i < 10; i++) {
    var y = top + i * rowH, row = rows[i], cy = y + 27;
    rr(g, 30, y, W - 60, rowH - 10, 14);
    g.fillStyle = "rgba(255,255,255,0.06)"; g.fill();
    g.strokeStyle = i < 3 ? MEDALS[i] : t.accent; g.globalAlpha = i < 3 ? 0.8 : 0.3; g.lineWidth = 1.5; g.stroke(); g.globalAlpha = 1;
    g.beginPath(); g.arc(74, cy, 22, 0, Math.PI * 2);
    g.fillStyle = i < 3 ? MEDALS[i] : "rgba(255,255,255,0.12)"; g.fill();
    g.textBaseline = "middle"; g.textAlign = "center";
    g.fillStyle = i < 3 ? "#1a1204" : "#fff"; g.font = "bold 22px sans-serif"; g.fillText(String(i + 1), 74, cy + 1);
    g.textAlign = "left";
    if (row) {
      g.fillStyle = "#fff"; g.font = "bold 26px sans-serif"; g.fillText(String(row.name).slice(0, 22), 116, cy);
      g.textAlign = "right"; g.fillStyle = t.accent; g.font = "bold 28px sans-serif";
      g.fillText(row.value + " " + unit, W - 56, cy);
    } else {
      g.fillStyle = "rgba(255,255,255,0.25)"; g.font = "24px sans-serif"; g.fillText("—", 116, cy);
    }
  }
  return c.toBuffer("image/png");
}

// ---------- helpers ----------
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

const app = express();

// ---------- Discord: login ----------
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
  } catch (e) { console.error(e); fail(res, "Discord login failed"); }
});// ---------- Roblox: link ----------
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
  } catch (e) { console.error(e); fail(res, "Roblox linking failed"); }
});

// ---------- Discord slash commands (Interactions Endpoint — ما يحتاج بوت شغال) ----------
function verifyDiscord(req) {
  try {
    var key = crypto.createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(E.DISCORD_PUBLIC_KEY, "hex")]),
      format: "der", type: "spki"
    });
    return crypto.verify(null, Buffer.from(req.get("X-Signature-Timestamp") + req.rawBody), key, Buffer.from(req.get("X-Signature-Ed25519"), "hex"));
  } catch (e) { return false; }
}
app.post("/interactions", async function (req, res) {
  if (!verifyDiscord(req)) return res.status(401).send("invalid signature");
  var i = req.body;
  if (i.type === 1) return res.json({ type: 1 });
  try {
    var d = (await db.collection("site").doc("data").get()).data() || {};
    var c = (d.commands || []).find(function (x) { return x.name === (i.data || {}).name; });
    if (!c) return res.json({ type: 4, data: { content: "Unknown command.", flags: 64 } });
    if (c.type === "text") return res.json({ type: 4, data: { content: String(c.reply || "—").slice(0, 2000) } });
    var isK = c.type === "topkills";
    var rows = (isK ? d.kills || [] : d.clan || []).slice()
      .sort(function (a, b) { return isK ? b.kills - a.kills : b.points - a.points; })
      .slice(0, 10).map(function (r) { return { name: r.name, value: isK ? r.kills : r.points }; });
    var png = isK ? leaderboardPNG("TOP KILLS", "Top 10 players", rows, "kills", "red")
                  : leaderboardPNG("CLAN LEADERBOARD", "Top 10 members", rows, "pts", "green");
    var fname = (isK ? "topkills" : "topclan") + ".png";
    var fd = new FormData();
    fd.append("payload_json", JSON.stringify({ type: 4, data: { attachments: [{ id: 0, filename: fname }] } }));
    fd.append("files[0]", new Blob([png], { type: "image/png" }), fname);
    var out = new Response(fd);
    res.set("Content-Type", out.headers.get("content-type"));
    res.send(Buffer.from(await out.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.json({ type: 4, data: { content: "Something went wrong.", flags: 64 } });
  }
});

app.get("/", function (req, res) { res.send("TopZen backend OK"); });

exports.api = functions.runWith({ memory: "512MB", timeoutSeconds: 30 }).https.onRequest(app);

// ---------- يسجّل الأوامر في ديسكورد تلقائيًا أول ما تغيّرها من الموقع ----------
exports.syncCommands = functions.firestore.document("site/data").onWrite(async function (change) {
  var a = change.after.exists ? change.after.data() : {};
  var b = change.before.exists ? change.before.data() : {};
  var pick = function (d) { return JSON.stringify([d.guildId || "", (d.commands || []).map(function (c) { return [c.name, c.description]; })]); };
  if (!a.guildId || pick(a) === pick(b)) return null;
  var body = (a.commands || []).map(function (c) { return { name: c.name, description: String(c.description || c.name).slice(0, 100), type: 1 }; });
  var r = await fetch("https://discord.com/api/v10/applications/" + E.DISCORD_CLIENT_ID + "/guilds/" + a.guildId + "/commands", {
    method: "PUT",
    headers: { Authorization: "Bot " + E.DISCORD_BOT_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  console.log("Command sync:", r.status, body.length + " command(s)");
  return null;
});
