// ============================================================
//  CONFIG — แก้ตรงนี้อย่างเดียว
// ============================================================
const CONFIG = {
  DISCORD_TOKEN: "MTQ5NjU5MzM4ODExNDQxMTYzMQ.GMlqUn.MN2c5ap6e50aLfLw6SsHLJBqxD3J3DQ-k16i-8",   // ← ใส่ Token ใหม่
  GUILD_ID:      "1512837517890682930",                // ← ใส่ Server ID

  // Roblox Group ID
  ROBLOX_GROUP_ID: "35646818",

  // Mapping: ชื่อ Rank ใน Roblox Group → Discord Role ID
  // เพิ่ม/ลด ได้เรื่อยๆ
  ROLE_MAP: {
    "[Developer] นักพัฒนา":      "1512850277630345267",
    // เพิ่มเองได้เลย เช่น
    // "VIP":    "123456789012345678",
  },

  // Port สำหรับรับ request จากเว็บ
  PORT: 3000,
};
// ============================================================

const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
const express = require("express");
const cors    = require("cors");
const fetch   = (...a) => import("node-fetch").then(({ default: f }) => f(...a));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const app = express();
app.use(cors());
app.use(express.json());

// ── ดึง Roblox User ID จากชื่อ ──────────────────────────────
async function getRobloxUserId(username) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
  });
  const data = await res.json();
  if (!data.data || data.data.length === 0) return null;
  return data.data[0].id;
}

// ── ดึง Rank ในกลุ่มจาก Roblox User ID ─────────────────────
async function getRobloxGroupRank(userId) {
  const res  = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
  const data = await res.json();
  if (!data.data) return null;
  const group = data.data.find(g => String(g.group.id) === CONFIG.ROBLOX_GROUP_ID);
  if (!group) return null;
  return group.role.name; // ชื่อ Rank เช่น "ARMY"
}

// ── Endpoint: /verify ────────────────────────────────────────
app.post("/verify", async (req, res) => {
  const { robloxUsername, discordId } = req.body;

  if (!robloxUsername || !discordId) {
    return res.json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });
  }

  try {
    // 1. หา Roblox User ID
    const robloxId = await getRobloxUserId(robloxUsername);
    if (!robloxId) {
      return res.json({ success: false, message: "ไม่พบชื่อ Roblox นี้" });
    }

    // 2. หา Rank ในกลุ่ม
    const rank = await getRobloxGroupRank(robloxId);
    if (!rank) {
      return res.json({ success: false, message: "คุณไม่ได้อยู่ในกลุ่ม Roblox นี้" });
    }

    // 3. หา Discord Member
    const guild  = await client.guilds.fetch(CONFIG.GUILD_ID);
    let   member;
    try {
      member = await guild.members.fetch(discordId);
    } catch {
      return res.json({ success: false, message: "ไม่พบ Discord ID นี้ในเซิร์ฟเวอร์" });
    }

    // 4. เปลี่ยนชื่อ → "ARMY | username"
    const newNick = `${rank} | ${robloxUsername}`;
    try {
      await member.setNickname(newNick);
    } catch {
      // บอทอาจไม่มีสิทธิ์เปลี่ยนชื่อ Owner
    }

    // 5. เพิ่ม Role ที่ตรงกับ Rank
    const roleId = CONFIG.ROLE_MAP[rank];
    if (roleId) {
      // ลบ Role เก่าที่อยู่ใน ROLE_MAP ออกก่อน
      for (const [, rid] of Object.entries(CONFIG.ROLE_MAP)) {
        if (member.roles.cache.has(rid)) {
          await member.roles.remove(rid).catch(() => {});
        }
      }
      await member.roles.add(roleId).catch(() => {});
    }

    return res.json({
      success:  true,
      message:  `ยืนยันตัวตนสำเร็จ! ชื่อของคุณถูกเปลี่ยนเป็น "${newNick}"`,
      nickname: newNick,
      rank,
    });

  } catch (err) {
    console.error(err);
    return res.json({ success: false, message: "เกิดข้อผิดพลาด: " + err.message });
  }
});

// ── Health check ─────────────────────────────────────────────
app.get("/", (_, res) => res.send("Bot is running ✅"));

// ── Start ─────────────────────────────────────────────────────
client.once("ready", () => {
  console.log(`✅ Bot พร้อมใช้งาน: ${client.user.tag}`);
  app.listen(CONFIG.PORT, () => {
    console.log(`✅ API รันที่ port ${CONFIG.PORT}`);
  });
});

client.login(CONFIG.DISCORD_TOKEN);
