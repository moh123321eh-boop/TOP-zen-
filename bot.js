// TopZen Discord bot — loaded by server.js ONLY when DISCORD_BOT_TOKEN is set.
const { Client, GatewayIntentBits, AttachmentBuilder } = require("discord.js");
const { createCanvas } = require("@napi-rs/canvas");

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
