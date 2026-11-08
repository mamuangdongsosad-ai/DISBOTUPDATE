require('dotenv').config();

// ==========================================
// [ 1. Global Error Handlers ]
// ==========================================
process.on('unhandledRejection', (reason) => { console.error('❌ Unhandled Rejection:', reason); });
process.on('uncaughtException',  (err)    => { console.error('💥 Uncaught Exception:',  err);    });

// ==========================================
// [ 2. Imports ]
// ==========================================
// หมายเหตุ: ต้องใช้ discord.js v14.8 ขึ้นไป (มี ChannelSelectMenu)
const {
    Client, GatewayIntentBits, Events,
    ActionRowBuilder, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    StringSelectMenuBuilder, ChannelSelectMenuBuilder,
    PermissionFlagsBits, ChannelType,
    ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');

const fs = require('fs');

const EPHEMERAL = MessageFlags.Ephemeral;

// ==========================================
// [ 3. CONFIG ]
// ==========================================
const ADMIN_ROLE_ID       = '1555146265958944878';  // แอดมิน: สร้างประกาศ
const PING_ROLE_IDS       = ['1561043784270225508', '1554881838382579763'];  // ยศที่แท็กได้ตอนส่งประกาศ
const ANNOUNCE_CHANNEL_ID = '';                     // ← ใส่ ID ห้องประกาศ (ไม่ใส่ก็ได้ เลือกห้องตอนส่งได้)

const BRAND = { name: 'COMET NEW', color: '#FFB6C1', accent: '#FF6FAF' };

const EMOJI = { announce: '📢', ok: '✅', no: '❌' };

// สติกเกอร์ของเซิร์ฟเวอร์ที่จะส่งแนบไปกับประกาศ (ใส่ ID สติกเกอร์ ถ้าเว้นว่างจะไม่แนบ)
// key = ชื่อเทมเพลตของ !embed
const STICKERS = {
    new: '', open: '', close: '',
    queue: '', promo: '', maint: '', notice: '', custom: ''
};

// ==========================================
// [ 3.3 STATUS — ประกาศ เปิด/ปิดร้าน ]
// ==========================================
const STATUS_CHANNEL_ID   = '1554881839422906494';          // ← ใส่ ID ห้องประกาศสถานะร้าน (ไม่ใส่ = ส่งในห้องที่พิมพ์คำสั่ง/กดปุ่ม)
const STATUS_BANNER_OPEN  = 'https://cdn.discordapp.com/attachments/1558800783133249708/1562512859433533595/IMG_9599.gif?ex=6ada42ff&is=6ad8f17f&hm=2ff2541a53821a6eefc5d0a93e45fc6f3a4246e9dce73ab9ccddeb7fb5050694&';          // ← ลิงก์รูปแบนเนอร์ "เปิดร้าน" (ว่าง = ไม่มีรูป)
const STATUS_BANNER_CLOSE = 'https://cdn.discordapp.com/attachments/1558800783133249708/1562512859018301500/IMG_9600.gif?ex=6ada42ff&is=6ad8f17f&hm=d04988008e0ccbedad9b1b485d3f790fb06dd04c5e8575dd26bf1a2daedd9239&';          // ← ลิงก์รูปแบนเนอร์ "ปิดร้าน"
const STATUS_OPEN_TIME    = '09:00';     // เวลาเปิดร้าน (แสดงในข้อความประกาศเท่านั้น ไม่ได้ตั้งเวลาอัตโนมัติ)
const STATUS_CLOSE_TIME   = '00:30';     // เวลาปิดร้าน (แสดงในข้อความประกาศเท่านั้น)
const STATUS_COLOR_OPEN  = '#00FF66';   // สีเส้นข้าง embed ตอนร้านเปิด
const STATUS_COLOR_CLOSE = '#FF3B3B';   // สีเส้นข้าง embed ตอนร้านปิด
const STATUS_FILE         = './status_state.json';

// เปลี่ยนชื่อห้องสถานะตอนเปิด/ปิดร้าน (บอทต้องมีสิทธิ์ Manage Channels ที่ห้องนั้น)
const STATUS_RENAME       = true;
const STATUS_NAME_OPEN    = '│﹒สถานะร้าน-𝑶𝑷𝑬𝑵🟢';
const STATUS_NAME_CLOSE   = '│﹒สถานะร้าน-𝑪𝑳𝑶𝑺𝑬🔴';

// ปุ่มลิงก์ใต้ประกาศ — ใส่ ID ห้องที่ต้องการให้กดแล้วพาไป (ช่อง channelId ว่าง = ไม่แสดงปุ่มนั้น)
const STATUS_BUTTONS = [
    { label: 'เปิด Ticket ซื้อของ', emoji: '<a:1271420570311069759:1562679699489034331> ', channelId: '1554881839422906496' },   // ห้องที่มีแผงร้านค้า (!setupshop)
    { label: 'ดูตัวอย่าง',          emoji: '<a:1439855196799766681:1562681121278263326> ', url: 'https://discord.com/shop' },
    { label: 'ดูเรทราคา',           emoji: '<a:nitroboost:1557406666482384940> ', channelId: '1554881839422906497' }
];

// open = สถานะล่าสุดที่ประกาศ (true = เปิด / false = ปิด / null = ยังไม่เคยประกาศ)
let statusState = { messageId: null, channelId: null, open: null };
try { if (fs.existsSync(STATUS_FILE)) statusState = { ...statusState, ...JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')) }; } catch {}
const saveStatus = () => { try { fs.writeFileSync(STATUS_FILE, JSON.stringify(statusState, null, 2)); } catch (e) { console.error('save status:', e); } };

// ==========================================
// [ 4. Runtime State ]
// ==========================================
const embedDrafts  = new Map();   // userId -> draft ของตัวสร้างประกาศ
const embedTargets = new Map();   // userId -> ห้องปลายทางที่เลือกตอนใช้ !embed

// ==========================================
// [ 5. Helpers ]
// ==========================================
const nowTs   = () => Math.floor(Date.now() / 1000);
const isAdmin = (member) => !!member?.roles?.cache?.has(ADMIN_ROLE_ID);
const tell    = (interaction, content) => interaction.reply({ content, flags: EPHEMERAL });

// อีโมจิดิสคอร์ด ('<:ชื่อ:id>' / '<a:ชื่อ:id>') → รูปแบบที่เมนู/ปุ่มรับได้
const emojiObj = (s) => {
    const m = /<(a?):(\w+):(\d+)>/.exec(s || '');
    return m ? { animated: !!m[1], name: m[2], id: m[3] } : undefined;
};

// ใส่อีโมจิให้ปุ่มเฉพาะเมื่อมีค่า (รับได้ทั้งสตริงและ {id,name})
const withEmoji = (btn, e) => {
    const em = typeof e === 'string' ? emojiObj(e) : (e?.id ? e : undefined);
    return em ? btn.setEmoji(em) : btn;
};

// ถ้า modal เปิดมาจากปุ่ม/เมนู → แก้ข้อความเดิม (ไม่เด้งข้อความซ้อน) ไม่งั้นตอบใหม่แบบ ephemeral
function replyOrUpdate(interaction, payload) {
    if (interaction.isModalSubmit() && interaction.isFromMessage()) return interaction.update(payload);
    return interaction.reply({ ...payload, flags: EPHEMERAL });
}

async function safeExecute(interaction, fn) {
    try {
        await fn();
    } catch (err) {
        console.error('❌ Error:', err);
        try {
            if (!interaction) return;
            const msg = { content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่', flags: EPHEMERAL };
            if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
            else await interaction.reply(msg);
        } catch (_) {}
    }
}

// ==========================================
// [ 6. Client ]
// ==========================================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ==========================================
// [ 13. EMBED CREATOR — ระบบสร้างประกาศ (Embed) ]
// ==========================================
//  !embed                → เมนูเลือก "หัวข้อ" (เทมเพลต)
//  !embed stock          → ใช้คีย์ลัดเปิดเทมเพลตนั้นทันที  (ใส่ #ห้อง ต่อท้ายเพื่อกำหนดห้องปลายทางได้)
//  ตัวแปรที่ใส่ในข้อความได้:
//     {time}   ← เวลาปัจจุบัน (แสดงตามเขตเวลาของคนอ่าน)
const EMBED_TEMPLATES = {
    new: {
        icon: '🆕', name: 'สินค้าใหม่', desc: 'ประกาศสินค้า/บริการใหม่เข้าร้าน', color: '#3498DB',
        title: '🆕 สินค้าใหม่เข้าร้าน!',
        description: '✨ มีสินค้าใหม่มาให้เลือกแล้ว\n\n• (ใส่รายการสินค้าตรงนี้)\n\nอัปเดตเมื่อ: {time}'
    },
    open: {
        icon: '🟢', name: 'เปิดร้าน', desc: 'ร้านเปิดให้บริการแล้ว', color: '#2ECC71',
        title: '🟢 ร้านเปิดแล้ว!',
        description: `ร้าน ${BRAND.name} เปิดให้บริการแล้วค่ะ ☄️\nเข้ามาสั่งสินค้าได้เลย\n\nเปิดเมื่อ: {time}`
    },
    close: {
        icon: '🔴', name: 'ปิดร้าน / พักร้าน', desc: 'ปิดชั่วคราว พร้อมเวลากลับมา', color: '#E74C3C',
        title: '🔴 ร้านปิดชั่วคราว',
        description: 'ขออภัยค่ะ ตอนนี้ร้านปิดให้บริการชั่วคราว\n\n🕒 กลับมาเปิด: (ใส่เวลา)\n\nประกาศเมื่อ: {time}'
    },
    queue: {
        icon: '📋', name: 'คิวเต็ม / งดรับออเดอร์', desc: 'แจ้งคิวเต็มหรือหยุดรับงานชั่วคราว', color: '#E67E22',
        title: '📋 คิวเต็มชั่วคราว',
        description: 'ตอนนี้คิวเต็มแล้ว ขอปิดรับออเดอร์ชั่วคราวนะคะ\n\n⏳ จะเปิดรับอีกครั้ง: (ใส่เวลา)\n\nประกาศเมื่อ: {time}'
    },
    promo: {
        icon: '🎉', name: 'โปรโมชั่น / กิจกรรม', desc: 'โปรโมชั่น ส่วนลด หรือกิจกรรม', color: '#FF6FAF',
        title: '🎉 โปรโมชั่นพิเศษ!',
        description: '✨ **(ชื่อโปรโมชั่น)**\n\n🎁 รายละเอียด: (ใส่รายละเอียด)\n📅 ระยะเวลา: (ใส่ช่วงเวลา)\n\nประกาศเมื่อ: {time}'
    },
    maint: {
        icon: '🔧', name: 'แจ้งปรับปรุง / ระบบขัดข้อง', desc: 'แจ้งปิดปรับปรุงหรือบอทมีปัญหา', color: '#95A5A6',
        title: '🔧 แจ้งปรับปรุงระบบ',
        description: 'ขณะนี้ระบบอยู่ระหว่างปรับปรุง อาจใช้งานบางฟังก์ชันไม่ได้ชั่วคราว\nขออภัยในความไม่สะดวกค่ะ 🙏\n\nประกาศเมื่อ: {time}'
    },
    notice: {
        icon: '📢', name: 'ประกาศทั่วไป', desc: 'ประกาศข่าวสารทั่วไป', color: BRAND.color,
        title: '📢 ประกาศ',
        description: '(ใส่เนื้อหาประกาศ)\n\nประกาศเมื่อ: {time}'
    },
    custom: {
        icon: '✏️', name: 'กำหนดเอง (ว่างเปล่า)', desc: 'เริ่มจากว่าง ๆ เขียนเอง', color: BRAND.color,
        title: '', description: ''
    }
};

const roleName = (id) => {
    for (const g of client.guilds.cache.values()) { const r = g.roles.cache.get(id); if (r) return r.name; }
    return null;
};
const pingOptions = (current) => [
    { label: 'ไม่แท็ก', value: 'none', default: current === 'none' },
    ...PING_ROLE_IDS.map((rid, i) => ({ label: (roleName(rid) ?? `ยศแท็ก ${i + 1}`).slice(0, 100), value: rid, default: current === rid }))
];

function createDraft(ownerId, key, channelId = null) {
    const t = EMBED_TEMPLATES[key] || EMBED_TEMPLATES.custom;
    const draft = {
        ownerId, key: EMBED_TEMPLATES[key] ? key : 'custom',
        title: t.title, description: t.description, color: t.color,
        image: '', footer: `${BRAND.name} • ประกาศ`,
        ping: 'none', channelId,
        linkRows: []        // ปุ่มลิงก์ใต้ประกาศ: [[{label,emoji,url}, ...แถวละไม่เกิน 5], ...ไม่เกิน 5 แถว]
    };
    embedDrafts.set(ownerId, draft);
    return draft;
}

/** แทนตัวแปร {xxx} ในข้อความประกาศ ณ ตอนแสดง/ตอนส่ง */
function expandVars(text) {
    const map = { time: `<t:${nowTs()}:F>` };
    return String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (map[k] !== undefined ? map[k] : m));
}

/** อีโมจิปุ่ม: '' → undefined (ไม่มี) | อีโมจิดิส <:ชื่อ:id> / <a:ชื่อ:id> | อีโมจิปกติ 🎫 | ผิดรูปแบบ → null */
function parseBtnEmoji(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return undefined;
    const custom = emojiObj(s);
    if (custom) return custom;
    const uni = /^\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u.exec(s);
    return uni ? uni[0] : null;
}

/** ลิงก์ปลายทางของปุ่ม: รับ https://... | ไอดีห้อง | <#ห้อง> → คืน URL (ผิดรูปแบบ = null) */
function resolveLinkTarget(raw, guildId) {
    const s = String(raw ?? '').trim();
    if (/^https?:\/\/\S+$/i.test(s)) return s;
    const id = /^<#(\d{17,20})>$/.exec(s)?.[1] || /^(\d{17,20})$/.exec(s)?.[1];
    return id && guildId ? `https://discord.com/channels/${guildId}/${id}` : null;
}

const LINK_PER_ROW = 5, LINK_MAX_ROWS = 5;   // ข้อจำกัดของดิสคอร์ด: 1 ข้อความมีได้ 5 แถว × 5 ปุ่ม = 25 ปุ่ม

/** แยกอีโมจิที่ขึ้นต้นบรรทัดออกจากชื่อปุ่ม: '🎫 เปิด Ticket' → { emoji:'🎫', label:'เปิด Ticket' } */
function splitLeadingEmoji(text) {
    const t = String(text ?? '').trim();
    const m = /^(<a?:\w+:\d+>|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u.exec(t);
    return m ? { emoji: m[1], label: t.slice(m[0].length).trim() } : { emoji: '', label: t };
}

/**
 * อ่านข้อความจากหน้า "ปุ่มลิงก์" → แถวปุ่ม
 *   1 บรรทัด = 1 ปุ่ม  รูปแบบ  [อีโมจิ] ชื่อปุ่ม | ลิงก์หรือไอดีห้อง
 *   เว้นบรรทัดว่าง = ขึ้นแถวใหม่ (ไม่เว้น = เรียงแถวละ 5 ปุ่มอัตโนมัติ)
 * คืน { rows, errors, dropped }
 */
function parseLinkLines(text, guildId) {
    const groups = [[]], errors = [];
    String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
        const line = raw.trim();
        if (!line) { if (groups[groups.length - 1].length) groups.push([]); return; }

        const m = /^(.*?)\s*\|\s*(https?:\/\/\S+|<#\d{17,20}>|\d{17,20})\s*$/u.exec(line);
        const url = m && resolveLinkTarget(m[2], guildId);
        if (!url) { errors.push(`บรรทัด ${i + 1}: \`${line.slice(0, 40)}\` — ต้องเป็น \`ชื่อปุ่ม | ลิงก์/ไอดีห้อง\``); return; }

        const { emoji, label } = splitLeadingEmoji(m[1]);
        if (!label && !emoji) { errors.push(`บรรทัด ${i + 1}: \`${line.slice(0, 40)}\` — ไม่มีชื่อปุ่ม`); return; }
        groups[groups.length - 1].push({ label: label.slice(0, 80), emoji, url });
    });

    let rows = [];
    for (const g of groups) for (let i = 0; i < g.length; i += LINK_PER_ROW) rows.push(g.slice(i, i + LINK_PER_ROW));
    const dropped = rows.slice(LINK_MAX_ROWS).reduce((n, r) => n + r.length, 0);
    return { rows: rows.slice(0, LINK_MAX_ROWS), errors, dropped };
}

/** แปลงแถวปุ่มกลับเป็นข้อความ เพื่อเติมในหน้าแก้ไข */
const linkRowsToText = (rows) =>
    rows.map(r => r.map(b => `${b.emoji ? b.emoji + ' ' : ''}${b.label} | ${b.url}`).join('\n')).join('\n\n');

const linkCount = (draft) => (draft?.linkRows ?? []).reduce((n, r) => n + r.length, 0);

/** แถวปุ่มลิงก์ใต้ประกาศ (กดแล้วเด้งไปหน้านั้น) — ไม่มีปุ่ม = [] */
function buildLinkRows(draft) {
    return (draft?.linkRows ?? []).filter(r => r.length).map(r => new ActionRowBuilder().addComponents(
        r.map(b => {
            const btn = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(b.url);
            if (b.label) btn.setLabel(b.label);
            const em = parseBtnEmoji(b.emoji);
            if (em) btn.setEmoji(em);
            return btn;
        })
    ));
}

function buildLinkModal(draft) {
    const value = draft.linkRows.length ? linkRowsToText(draft.linkRows) : '';
    const input = new TextInputBuilder()
        .setCustomId('links')
        .setLabel('ปุ่มลิงก์ (1 บรรทัด = 1 ปุ่ม)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(4000)
        .setPlaceholder('🎫 ชื่อปุ่ม | ไอดีห้อง หรือ https://...\n(เว้นบรรทัดว่าง = ขึ้นแถวใหม่)'.slice(0, 100));
    if (value) input.setValue(value.slice(0, 4000));
    return new ModalBuilder()
        .setCustomId(`emb_linkmodal:${draft.ownerId}`)
        .setTitle('🔗 ปุ่มลิงก์ใต้ประกาศ')
        .addComponents(new ActionRowBuilder().addComponents(input));
}

function buildDraftEmbed(draft) {
    const embed = new EmbedBuilder().setColor(/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : BRAND.color);

    const title = expandVars(draft.title).trim();
    let   desc  = expandVars(draft.description).trim();
    if (desc.length > 4096) desc = desc.slice(0, 4093) + '...';

    if (title)        embed.setTitle(title.slice(0, 256));
    if (desc)         embed.setDescription(desc);
    if (!title && !desc) embed.setDescription('*(ยังไม่มีเนื้อหา — กดปุ่ม ✏️ แก้ไข เพื่อเขียนประกาศ)*');
    if (draft.image)  embed.setImage(draft.image);
    if (draft.footer) embed.setFooter({ text: draft.footer.slice(0, 2048) });
    return embed;
}

/** ข้อความตัวอย่าง + ปุ่มควบคุม (เมนูเลือกห้อง / ส่ง / แก้ไข / แท็ก / ยกเลิก) */
function draftPayload(draft, notice = '') {
    const o = draft.ownerId;
    return {
        content:
            `**${EMOJI.announce} ตัวอย่างประกาศ** → ` +
            (draft.channelId ? `<#${draft.channelId}>` : '*(ยังไม่ได้เลือกห้อง — เลือกจากเมนูด้านล่าง)*') +
            (draft.linkRows.length > 2 ? `\n🔗 ปุ่มลิงก์ ${linkCount(draft)} ปุ่ม ${draft.linkRows.length} แถว (ตัวอย่างแสดงแค่ 2 แถวแรก — ตอนส่งจริงขึ้นครบ)` : '') +
            (notice ? `\n${notice}` : ''),
        embeds: [buildDraftEmbed(draft)],
        components: [
            ...buildLinkRows(draft).slice(0, 2),   // ตัวอย่างปุ่มลิงก์ (หน้าตาเหมือนตอนส่งจริง · แผงควบคุมกินไปแล้ว 3 แถว เหลือโชว์ได้ 2 แถว)
            new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(`emb_chan:${o}`)
                    .setPlaceholder('📌 เลือกห้องที่จะส่งประกาศ...')
                    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                    .setMinValues(1).setMaxValues(1)
            ),
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`emb_ping:${o}`)
                    .setPlaceholder('🔔 แท็กยศ (ไม่แท็ก / ยศที่กำหนด)')
                    .setMinValues(1).setMaxValues(1)
                    .addOptions(pingOptions(draft.ping))
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`emb_send:${o}`).setLabel('ส่งประกาศ').setEmoji(EMOJI.ok).setStyle(ButtonStyle.Success).setDisabled(!draft.channelId),
                new ButtonBuilder().setCustomId(`emb_edit:${o}`).setLabel('แก้ไข').setEmoji('✏️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`emb_link:${o}`).setLabel('ปุ่มลิงก์').setEmoji('🔗').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`emb_cancel:${o}`).setLabel('ยกเลิก').setEmoji(EMOJI.no).setStyle(ButtonStyle.Danger)
            )
        ]
    };
}

function buildEditModal(draft) {
    const field = (customId, label, style, value, max, placeholder) => {
        const input = new TextInputBuilder().setCustomId(customId).setLabel(label).setStyle(style).setRequired(false).setMaxLength(max);
        if (value)       input.setValue(String(value).slice(0, max));
        if (placeholder) input.setPlaceholder(placeholder.slice(0, 100));
        return new ActionRowBuilder().addComponents(input);
    };
    return new ModalBuilder()
        .setCustomId(`emb_modal:${draft.ownerId}`)
        .setTitle('✏️ แก้ไขประกาศ')
        .addComponents(
            field('title',  'หัวข้อ',                           TextInputStyle.Short,     draft.title,       256),
            field('desc',   'รายละเอียด (ใส่ {time} ได้)', TextInputStyle.Paragraph, draft.description, 4000,
                  'ตัวแปร: {time}'),
            field('color',  'สี (hex เช่น #FFB6C1)',            TextInputStyle.Short,     draft.color,       7),
            field('image',  'ลิงก์รูปภาพ (ไม่ใส่ก็ได้)',         TextInputStyle.Short,     draft.image,       500, 'https://...'),
            field('footer', 'ข้อความท้าย (Footer)',             TextInputStyle.Short,     draft.footer,      100)
        );
}

const embedExpired = (i) => i.isMessageComponent()
    ? i.update({ content: '⌛ หมดเวลา (บอทอาจรีสตาร์ท) — เริ่มใหม่ด้วย `!embed`', embeds: [], components: [] })
    : tell(i, '⌛ หมดเวลา — เริ่มใหม่ด้วย `!embed`');

async function handleEmbedCreator(interaction) {
    const id = interaction.customId;
    if (!id.startsWith('emb_')) return false;

    const [action, ownerId] = id.split(':');
    if (!isAdmin(interaction.member)) { await tell(interaction, '❌ เฉพาะแอดมินเท่านั้น'); return true; }
    if (ownerId && ownerId !== interaction.user.id) { await tell(interaction, '❌ แผงนี้เป็นของแอดมินคนอื่น กรุณาใช้ `!embed` เปิดของตัวเอง'); return true; }
    const uid = interaction.user.id;

    // ── เลือกหัวข้อ (เทมเพลต) ──
    if (interaction.isStringSelectMenu() && action === 'emb_tpl') {
        const key   = interaction.values[0];
        const draft = createDraft(uid, key, embedTargets.get(uid) ?? (ANNOUNCE_CHANNEL_ID || null));
        if (key === 'custom') { await interaction.showModal(buildEditModal(draft)); return true; }
        await interaction.update(draftPayload(draft));
        return true;
    }

    const draft = embedDrafts.get(uid);
    if (!draft) { await embedExpired(interaction); return true; }

    // ── เลือกห้องปลายทาง ──
    if (interaction.isChannelSelectMenu() && action === 'emb_chan') {
        draft.channelId = interaction.values[0];
        await interaction.update(draftPayload(draft));
        return true;
    }

    // ── บันทึกจากหน้าแก้ไข ──
    if (interaction.isModalSubmit() && action === 'emb_modal') {
        const get = (k) => interaction.fields.getTextInputValue(k).trim();
        const notices = [];

        draft.title       = get('title');
        draft.description = get('desc');
        draft.footer      = get('footer');

        const color = get('color');
        if (color) {
            if (/^#?[0-9a-f]{6}$/i.test(color)) draft.color = '#' + color.replace('#', '').toUpperCase();
            else notices.push('⚠️ สีไม่ถูกต้อง — ใช้สีเดิมไปก่อน');
        }
        const image = get('image');
        if (!image) draft.image = '';
        else if (/^https?:\/\/\S+$/i.test(image)) draft.image = image;
        else { draft.image = ''; notices.push('⚠️ ลิงก์รูปไม่ถูกต้อง — ไม่ใส่รูป'); }

        await replyOrUpdate(interaction, draftPayload(draft, notices.join('\n')));
        return true;
    }

    // ── บันทึกปุ่มลิงก์ ──
    if (interaction.isModalSubmit() && action === 'emb_linkmodal') {
        const { rows, errors, dropped } = parseLinkLines(interaction.fields.getTextInputValue('links'), interaction.guildId);
        const notices = [];

        draft.linkRows = rows;
        const n = linkCount(draft);
        notices.push(n ? `🔗 ตั้งปุ่มลิงก์แล้ว ${n} ปุ่ม` : '🗑️ ไม่มีปุ่มลิงก์');
        if (dropped) notices.push(`⚠️ ดิสให้ใส่ได้สูงสุด ${LINK_MAX_ROWS * LINK_PER_ROW} ปุ่ม (${LINK_MAX_ROWS} แถว × ${LINK_PER_ROW}) — ตัดปุ่มที่เกินออก ${dropped} ปุ่ม`);
        if (errors.length) notices.push('⚠️ ข้ามบรรทัดที่ผิดรูปแบบ:\n' + errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\n…และอีก ${errors.length - 5} บรรทัด` : ''));

        await replyOrUpdate(interaction, draftPayload(draft, notices.join('\n')));
        return true;
    }

    if (interaction.isStringSelectMenu() && action === 'emb_ping') {
        draft.ping = interaction.values[0];
        await interaction.update(draftPayload(draft));
        return true;
    }

    if (!interaction.isButton()) return false;

    if (action === 'emb_edit') { await interaction.showModal(buildEditModal(draft)); return true; }
    if (action === 'emb_link') { await interaction.showModal(buildLinkModal(draft)); return true; }

    if (action === 'emb_cancel') {
        embedDrafts.delete(uid);
        await interaction.update({ content: '❌ ยกเลิกการสร้างประกาศแล้ว', embeds: [], components: [] });
        return true;
    }

    if (action === 'emb_send') {
        const channel = draft.channelId && interaction.guild.channels.cache.get(draft.channelId);
        if (!channel?.isTextBased()) { await tell(interaction, '❌ ห้องที่เลือกส่งข้อความไม่ได้ กรุณาเลือกห้องใหม่'); return true; }

        const need = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
        if (!channel.permissionsFor(interaction.guild.members.me)?.has(need)) {
            await tell(interaction, `❌ บอทไม่มีสิทธิ์ส่งในห้อง <#${channel.id}> (ต้องมี ส่งข้อความ / แนบลิงก์ / )`);
            return true;
        }

        await interaction.deferUpdate();

        const payload = {
            content:         draft.ping !== 'none' ? `|| <@&${draft.ping}> ||` : undefined,
            embeds:          [buildDraftEmbed(draft)],
            allowedMentions: { roles: draft.ping === 'none' ? [] : [draft.ping] }
        };
        const linkRows = buildLinkRows(draft);
        if (linkRows.length) payload.components = linkRows;
        const sticker = STICKERS[draft.key];
        if (sticker) payload.stickers = [sticker];

        let sent, warn = '';
        try {
            sent = await channel.send(payload);
        } catch (err) {
            if (!sticker) throw err;
            console.error('Sticker send failed:', err.message);
            delete payload.stickers;
            sent = await channel.send(payload);
            warn = '\n⚠️ แนบสติกเกอร์ไม่สำเร็จ (ตรวจ ID ใน STICKERS) — ส่งประกาศโดยไม่มีสติกเกอร์แล้ว';
        }

        embedDrafts.delete(uid);
        await interaction.editReply({ content: `✅ ส่งประกาศแล้ว → ${sent.url}${warn}`, embeds: [], components: [] });
        return true;
    }

    return false;
}


// ==========================================
// [ 14. COMMANDS (แอดมินเท่านั้น) ]
// ==========================================
client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith('!')) return;
    if (!isAdmin(message.member)) return;

    const args    = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        switch (command) {
            case '!adminhelp':
            case '!help':  return await cmdHelp(message);
            case '!embed': return await cmdEmbed(message, args);
            case '!open':  return await cmdStatus(message, true, args);
            case '!close': return await cmdStatus(message, false, args);
            case '!statuspanel':
            case '!setupstatus': return await cmdStatusPanel(message);
        }
    } catch (err) {
        console.error('❌ Command Error:', err);
        message.reply('❌ เกิดข้อผิดพลาดในการใช้คำสั่ง').catch(() => {});
    }
});

async function cmdHelp(message) {
    const tpl = Object.entries(EMBED_TEMPLATES).map(([k, t]) => `\`${k}\` ${t.icon} ${t.name}`).join('\n');
    return message.channel.send({ embeds: [new EmbedBuilder()
        .setTitle('📖 คำสั่งแอดมิน')
        .setColor(BRAND.color)
        .addFields(
            { name: '📢 ประกาศ (Embed)', value: '`!embed` เมนูเลือกหัวข้อ\n`!embed <คีย์ลัด> [#ห้อง]` เช่น `!embed notice #ประกาศ`\nกดปุ่ม 🔗 **ปุ่มลิงก์** ในหน้าตัวอย่างเพื่อใส่ปุ่มกดแล้วเด้งไปหน้า/ห้องที่ต้องการ (ใส่ได้หลายปุ่ม บรรทัดละปุ่ม)' },
            { name: '🟢 สถานะร้าน', value: '`!statuspanel` โพสต์แผงปุ่ม เปิดร้าน / ปิดร้าน (กดแล้วสลับสถานะ ลบประกาศเก่า ส่งประกาศใหม่)\n`!open` / `!close [ข้อความ]` ใช้พิมพ์สั่งตรง ๆ ได้เหมือนกัน เช่น `!close กลับมา 15:00`' },
            { name: '🔑 คีย์ลัดประกาศ', value: tpl }
        )] });
}

async function cmdEmbed(message, args) {
    const uid     = message.author.id;
    const mention = message.mentions.channels.first();
    const target  = mention?.id ?? (ANNOUNCE_CHANNEL_ID || message.channel.id);
    const key     = args.map(a => a.toLowerCase()).find(a => EMBED_TEMPLATES[a]);

    // คีย์ลัด: !embed stock  → เปิดตัวอย่างทันที
    if (key) {
        const draft = createDraft(uid, key, target);
        return message.channel.send(draftPayload(draft));
    }

    // เมนูเลือกหัวข้อ
    embedTargets.set(uid, target);
    const select = new StringSelectMenuBuilder()
        .setCustomId(`emb_tpl:${uid}`)
        .setPlaceholder('เลือกหัวข้อประกาศ...')
        .addOptions(Object.entries(EMBED_TEMPLATES).map(([k, t]) => ({
            label: t.name, value: k, description: `!embed ${k} — ${t.desc}`.slice(0, 100), emoji: t.icon
        })));

    return message.channel.send({
        embeds: [new EmbedBuilder()
            .setTitle(`${EMOJI.announce} ตัวสร้างประกาศ (Embed Creator)`)
            .setColor(BRAND.color)
            .setDescription(
                `เลือก **หัวข้อ** จากเมนูด้านล่าง ระบบจะเติมข้อความให้ แล้วกด ✏️ แก้ไขได้\n\n` +
                `⚡ **คีย์ลัด** — พิมพ์ตรง ๆ ได้เลย เช่น \`!embed notice\` / \`!embed promo #ประกาศ\`\n\n` +
                Object.entries(EMBED_TEMPLATES).map(([k, t]) => `\`${k}\` ${t.icon} ${t.name}`).join('\n') +
                `\n\n📍 ห้องปลายทางตอนนี้: <#${target}> (เปลี่ยนได้ในหน้าตัวอย่าง)`
            )],
        components: [new ActionRowBuilder().addComponents(select)]
    });
}

// ==========================================
// [ 14.1 STATUS — เปิด/ปิดร้าน ]
// ==========================================
/** แปลง embed สถานะเป็นกล่อง Components V2 — รูปใหญ่บนสุด, หัวข้อใหญ่, ปุ่มอยู่ในกล่องใต้เส้นคั่น */
function buildStatusMessage(embed, banner, row) {
    const D = require('discord.js');
    const hasButtons = row.components.length > 0;
    const hasV2 = D.ContainerBuilder && D.MediaGalleryBuilder && D.MediaGalleryItemBuilder
        && D.TextDisplayBuilder && D.SeparatorBuilder && D.MessageFlags && D.MessageFlags.IsComponentsV2;
    if (!hasV2) return { embeds: [embed], components: hasButtons ? [row] : [] };   // discord.js เก่าไป → ใช้ embed เดิม

    // บรรทัดแรก (ตัวหนา) ทำเป็นหัวข้อรอง ที่เหลือเป็นข้อความตัวเล็ก
    const [first, ...rest] = String(embed.data.description || '').split('\n');
    const headline = first.replace(/\*\*/g, '').trim();
    const body = rest.join('\n').trim();

    const sep = () => new D.SeparatorBuilder().setDivider(true).setSpacing(D.SeparatorSpacingSize.Small);
    const container = new D.ContainerBuilder();
    if (embed.data.color != null) container.setAccentColor(embed.data.color);

    if (banner) {
        container.addMediaGalleryComponents(
            new D.MediaGalleryBuilder().addItems(new D.MediaGalleryItemBuilder().setURL(banner))
        );
    }
    container.addSeparatorComponents(sep());
    container.addTextDisplayComponents(
        new D.TextDisplayBuilder().setContent(`## ${embed.data.title}\n### ${headline}${body ? `\n${body}` : ''}`)
    );
    if (hasButtons) {
        container.addSeparatorComponents(sep());
        container.addActionRowComponents(row);
    }
    return { components: [container], flags: D.MessageFlags.IsComponentsV2 };
}

/** ส่งประกาศสถานะร้าน (ลบอันเก่าออกก่อน ห้องจะมีประกาศล่าสุดอันเดียว) + เปลี่ยนชื่อห้องสถานะ */
async function postStatus(isOpen, chan, note = '') {
    const hours = `${STATUS_OPEN_TIME}-${STATUS_CLOSE_TIME}`;
    const embed = new EmbedBuilder().setColor(isOpen ? STATUS_COLOR_OPEN : STATUS_COLOR_CLOSE);
    const banner = isOpen ? STATUS_BANNER_OPEN : STATUS_BANNER_CLOSE;
    if (banner) embed.setImage(banner);

    if (isOpen) {
        embed.setTitle('<a:1494640282170556607:1562510690780975134>  ร้านเปิดให้บริการแล้วครับ')
            .setDescription(
                `**เปิด Ticket ซื้อของ หรือ สอบถาม มาได้เลย 🎁**\n` +
                `> เปิดร้าน ${hours} ของทุกวัน\n> ขอบคุณที่ไว้วางใจและใช้บริการกับทางร้าน 🥰`
            );
    } else {
        embed.setTitle('<a:1494640238822428702:1562510708246061188>  ร้านปิดให้บริการชั่วคราวครับ')
            .setDescription(
                `**ทิ้งข้อความไว้ได้เลย เปิดร้านแล้วจะรีบตอบนะครับ 🙏**\n` +
                (note ? `> ${note}\n` : '') +
                `> เวลาเปิดร้าน ${hours} ของทุกวัน`
            );
    }

    const row = new ActionRowBuilder();
    for (const b of STATUS_BUTTONS) {
        // ลิงก์ปลายทาง: ใช้ url ถ้ามี ไม่งั้นสร้างจากไอดีห้อง (trim กันช่องว่างหลุดมา)
        const target = String(b.url || '').trim() ||
            (b.channelId ? `https://discord.com/channels/${chan.guild.id}/${String(b.channelId).trim()}` : '');
        if (!/^https?:\/\/\S+$/i.test(target)) continue;   // ไม่มีลิงก์ที่ใช้ได้ = ไม่แสดงปุ่ม

        const btn = new ButtonBuilder().setLabel(b.label).setStyle(ButtonStyle.Link).setURL(target);
        withEmoji(btn, (b.emoji || '').trim());           // แปลงอีโมจิเป็น object + ตัดช่องว่างท้ายสตริง
        row.addComponents(btn);
    }

    // ลบประกาศสถานะอันเก่า
    if (statusState.messageId && statusState.channelId) {
        const oldCh  = await client.channels.fetch(statusState.channelId).catch(() => null);
        const oldMsg = oldCh ? await oldCh.messages.fetch(statusState.messageId).catch(() => null) : null;
        if (oldMsg) await oldMsg.delete().catch(() => {});
    }

    const sent = await chan.send(buildStatusMessage(embed, banner, row));
    statusState.messageId = sent.id;
    statusState.channelId = chan.id;
    statusState.open      = isOpen;
    saveStatus();

    // เปลี่ยนชื่อห้องสถานะตาม เปิด/ปิด (ดิสจำกัดเปลี่ยนชื่อห้อง 2 ครั้ง/10 นาที เลยไม่ await กันประกาศค้าง)
    if (STATUS_RENAME && STATUS_CHANNEL_ID && chan.id === STATUS_CHANNEL_ID) {
        const name = isOpen ? STATUS_NAME_OPEN : STATUS_NAME_CLOSE;
        if (chan.name !== name)
            chan.setName(name, isOpen ? 'เปิดร้าน' : 'ปิดร้าน')
                .catch(e => console.error('❌ เปลี่ยนชื่อห้องสถานะไม่ได้ (ตรวจสิทธิ์ Manage Channels):', e.message));
    }
    return sent;
}

/** ห้องประกาศสถานะ: STATUS_CHANNEL_ID ถ้ามี ไม่งั้นใช้ห้องที่สั่งคำสั่ง/กดปุ่ม */
const getStatusChannel = (fallback) =>
    STATUS_CHANNEL_ID ? client.channels.fetch(STATUS_CHANNEL_ID).catch(() => null) : Promise.resolve(fallback);

// !open  /  !close [ข้อความเพิ่มเติม เช่น กลับมา 15:00]
async function cmdStatus(message, isOpen, args) {
    const chan = await getStatusChannel(message.channel);
    if (!chan) return message.reply('❌ หาห้องประกาศสถานะไม่เจอ ตรวจ `STATUS_CHANNEL_ID` ในโค้ด');
    await postStatus(isOpen, chan, args.join(' ').trim());
    return message.reply(`${isOpen ? '🟢 ประกาศเปิดร้านแล้ว' : '🔴 ประกาศปิดร้านแล้ว'} → <#${chan.id}>`);
}

// ------------------------------------------
// แผงปุ่มเปิด/ปิดร้าน  (!statuspanel) — กดแล้วสลับสถานะ ลบประกาศเก่า ส่งประกาศใหม่ เปลี่ยนชื่อห้อง
// ------------------------------------------
const statusLabel = () =>
    statusState.open === true  ? '🟢 **เปิดอยู่**' :
    statusState.open === false ? '🔴 **ปิดอยู่**'  : '⚪ *ยังไม่เคยประกาศ*';

function statusPanelPayload(notice = '') {
    const embed = new EmbedBuilder()
        .setTitle('🏪 แผงควบคุมสถานะร้าน')
        .setColor(statusState.open === false ? STATUS_COLOR_CLOSE : STATUS_COLOR_OPEN)
        .setDescription(
            `สถานะตอนนี้: ${statusLabel()}\n\n` +
            `🟢 **เปิดร้าน** — ประกาศเปิดร้าน ลบประกาศเก่า และเปลี่ยนชื่อห้อง\n` +
            `🔴 **ปิดร้าน** — ประกาศปิดร้านแบบเดียวกัน\n` +
            `📝 **ปิดร้าน + หมายเหตุ** — ปิดร้านพร้อมข้อความ เช่น กลับมา 15:00\n\n` +
            `📍 ห้องประกาศ: ${STATUS_CHANNEL_ID ? `<#${STATUS_CHANNEL_ID}>` : '*(ห้องที่กดปุ่ม)*'}\n` +
            `🔒 ใช้ได้เฉพาะแอดมิน` + (notice ? `\n\n${notice}` : '')
        )
        .setFooter({ text: `${BRAND.name} • Shop Status` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('st_open').setLabel('เปิดร้าน').setEmoji('🟢').setStyle(ButtonStyle.Success).setDisabled(statusState.open === true),
        new ButtonBuilder().setCustomId('st_close').setLabel('ปิดร้าน').setEmoji('🔴').setStyle(ButtonStyle.Danger).setDisabled(statusState.open === false),
        new ButtonBuilder().setCustomId('st_closenote').setLabel('ปิดร้าน + หมายเหตุ').setEmoji('📝').setStyle(ButtonStyle.Secondary).setDisabled(statusState.open === false)
    );
    return { embeds: [embed], components: [row] };
}

async function cmdStatusPanel(message) {
    return message.channel.send(statusPanelPayload());
}

async function handleStatusPanel(interaction) {
    const id = interaction.customId;
    if (!id.startsWith('st_')) return false;
    if (!isAdmin(interaction.member)) { await tell(interaction, '❌ เฉพาะแอดมินเท่านั้น'); return true; }

    // ปิดพร้อมหมายเหตุ → เปิดหน้ากรอก
    if (interaction.isButton() && id === 'st_closenote') {
        const input = new TextInputBuilder()
            .setCustomId('note').setLabel('หมายเหตุ (ไม่ใส่ก็ได้)')
            .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)
            .setPlaceholder('เช่น กลับมา 15:00');
        await interaction.showModal(new ModalBuilder()
            .setCustomId('st_modal').setTitle('🔴 ปิดร้าน')
            .addComponents(new ActionRowBuilder().addComponents(input)));
        return true;
    }

    let isOpen, note = '';
    if (interaction.isButton() && (id === 'st_open' || id === 'st_close')) isOpen = id === 'st_open';
    else if (interaction.isModalSubmit() && id === 'st_modal') { isOpen = false; note = interaction.fields.getTextInputValue('note').trim(); }
    else return false;

    // แผงเก่าค้าง (สถานะเปลี่ยนไปแล้วจากที่อื่น) → แค่รีเฟรชแผง ไม่ประกาศซ้ำ
    if (statusState.open === isOpen) {
        await interaction.update(statusPanelPayload('ℹ️ สถานะเป็นแบบนี้อยู่แล้ว — รีเฟรชแผงให้แล้ว'));
        return true;
    }

    await interaction.deferUpdate();
    const chan = await getStatusChannel(interaction.channel);
    if (!chan) {
        await interaction.editReply(statusPanelPayload('❌ หาห้องประกาศสถานะไม่เจอ ตรวจ `STATUS_CHANNEL_ID` ในโค้ด'));
        return true;
    }
    const sent = await postStatus(isOpen, chan, note);
    await interaction.editReply(statusPanelPayload(`${isOpen ? '🟢 ประกาศเปิดร้านแล้ว' : '🔴 ประกาศปิดร้านแล้ว'} → ${sent.url}`));
    return true;
}

// ==========================================
// [ 15. INTERACTION ROUTER ]
// ==========================================
client.on('interactionCreate', async (interaction) => {
    await safeExecute(interaction, async () => {
        if (!interaction.customId) return;
        for (const handler of [handleStatusPanel, handleEmbedCreator]) {
            if (await handler(interaction)) return;
        }
    });
});

// ==========================================
// [ 16. Ready / Login ]
// ==========================================
client.once(Events.ClientReady, () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
