    }
  }
  return c.toBuffer("image/png");
}

module.exports = function (db) {
  var client = new Client({ intents: [GatewayIntentBits.Guilds] });
  var site = { commands: [], guildId: "", kills: [], clan: [] };
  var synced = "";

  async function sync() {
    if (!client.isReady() || !site.guildId) return;
    var list = site.commands.map(function (c) { return { name: c.name, description: String(c.description || c.name).slice(0, 100) }; });
    var key = site.guildId + JSON.stringify(list);
    if (key === synced) return;
    try {
      await client.application.commands.set(list, site.guildId);
      synced = key;
      console.log("Synced " + list.length + " command(s) to server " + site.guildId);
    } catch (e) { console.error("Command sync failed:", e.message); }
  }

  db.collection("site").doc("data").onSnapshot(function (snap) {
    var d = snap.data() || {};
    site = { commands: d.commands || [], guildId: String(d.guildId || ""), kills: d.kills || [], clan: d.clan || [] };
    sync();
  });

  client.once("ready", function () { console.log("Bot online as " + client.user.tag); sync(); });

  client.on("interactionCreate", async function (i) {
    if (!i.isChatInputCommand()) return;
    var c = site.commands.find(function (x) { return x.name === i.commandName; });
    if (!c) return i.reply({ content: "Unknown command.", flags: 64 });
    try {
      if (c.type === "topkills" || c.type === "topclan") {
        await i.deferReply();
        var isK = c.type === "topkills";
        var rows = (isK ? site.kills : site.clan).slice()
          .sort(function (a, b) { return isK ? b.kills - a.kills : b.points - a.points; })
          .slice(0, 10).map(function (r) { return { name: r.name, value: isK ? r.kills : r.points }; });
        var png = isK ? leaderboardPNG("TOP KILLS", "Top 10 players", rows, "kills", "red")
                      : leaderboardPNG("CLAN LEADERBOARD", "Top 10 members", rows, "pts", "green");
        await i.editReply({ files: [new AttachmentBuilder(png, { name: (isK ? "topkills" : "topclan") + ".png" })] });
      } else {
        await i.reply(String(c.reply || "—").slice(0, 2000));
      }
    } catch (e) { console.error(e); }
  });

  client.login(process.env.DISCORD_BOT_TOKEN);
};
