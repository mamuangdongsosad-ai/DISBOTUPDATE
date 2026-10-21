require('dotenv').config();

// ==========================================
// [ 1. Global Error Handlers ]
// ==========================================
process.on('unhandledRejection', (reason) => { console.error('❌ Unhandled Rejection:', reason); });
process.on('uncaughtException',  (err)    => { console.error('💥 Uncaught Exception:',  err);    });

// ==========================================
// [ 2. Imports ]
// ==========================================
// หมายเหตุ: ต้องใช้ discord.js v14.8 ขึ้นไป (มี UserSelectMenu / ChannelSelectMenu)
const {
    Client, GatewayIntentBits, Events,
    ActionRowBuilder, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    StringSelectMenuBuilder, UserSelectMenuBuilder, ChannelSelectMenuBuilder,
    PermissionFlagsBits, ChannelType,
    ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');

const fs    = require('fs');
const axios = require('axios');

const EPHEMERAL = MessageFlags.Ephemeral;

// ==========================================
// [ 3. CONFIG — ID ห้อง / ยศ ]
// ==========================================
const ADMIN_ROLE_ID           = '1555146265958944878';  // แอดมิน: มอบหมายงาน / จัดการสต็อก / สร้างประกาศ
const TICKET_CATEGORY_ID      = '1561040455020585000';  // หมวดห้องออเดอร์
const DONE_CATEGORY_ID        = '1554881839745994884';  // หมวดห้องที่เสร็จแล้ว
const REVIEW_CHANNEL_ID       = '1554881839745994883';  // ห้องรีวิว   
const COOLDOWN_LOG_CHANNEL_ID = '1561040139894132836';  // ห้อง log คูลดาวน์
const STOCK_FOOD_LOG          = '1561062608692453508';  // ห้อง log สต็อกอาหาร
const STOCK_BUY_LOG           = '1561062734139752590';  // ห้อง log สต็อกของซื้อ
const PING_ROLE_IDS = ['1561043784270225508', '1554881838382579763'];  // ยศเดียวที่แท็กได้ตอนส่งประกาศ
const ANNOUNCE_CHANNEL_ID     = '';                     // ← ใส่ ID ห้องประกาศ (ไม่ใส่ก็ได้ เลือกห้องตอนส่งได้)
const TICKET_LOG_CHANNEL_ID = '1555884270680145960';  // ห้องที่ส่งสรุป logs ตอนปิดห้อง
const AUTO_CLOSE_MS         = 10 * 60 * 1000;         // กด "เสร็จสิ้น" แล้วรอ 10 นาทีก่อนจัดการห้องอัตโนมัติ

// อีโมจิในข้อความ "เสร็จสิ้น" — รูปแบบ <:ชื่อ:ไอดี>  (อีโมจิขยับใช้ <a:ชื่อ:ไอดี>)
const DONE_EMOJI_THANKS = '<a:1519189573941465138:1562047900047908954> ';   // หน้าหัวข้อ "ขอบคุณที่ใช้บริการ"
const DONE_EMOJI_REVIEW = '<a:905201hellokittyblush:1562083083346378872> ';   // ท้ายข้อความขอรีวิว

const ENFORCE_LIMIT  = true;            // true = บล็อกถ้าลูกค้าสั่งเกิน "limit" ของสินค้านั้น

const QUEUE_FILE    = './queue.txt';
const STOCK_FILE    = './stock_data.json';
const COOLDOWN_FILE = './cooldowns.json';
const TICKET_FILE   = './active_tickets.json';
const RATE_FILE    = './rate_messages.json';
const RATE_OVERRIDE_FILE = './rate_overrides.json';   // เรท/ลิมิตที่แก้ผ่านแผง !ratepanel

// ==========================================
// [ 3.1 BRAND / อีโมจิ / สติกเกอร์ ]
// ==========================================
const BRAND = { name: 'COMET NEW', color: '#FFB6C1', accent: '#FF6FAF' };

const SHOP_BANNER   = 'https://cdn.discordapp.com/attachments/1484909065435090966/1501504612505616555/9517a7917490adb7d3c955015755d34e.gif?ex=69fc50a4&is=69faff24&hm=454dd77b92e53af0277eff192bd136ee55a5b251c2e66d4aa13395452415e554&';
const TICKET_BANNER = 'https://cdn.discordapp.com/attachments/1484914126336819342/1495230755473719389/764ad376534627cb2cadddfbf4c74a78.gif?ex=69fbe728&is=69fa95a8&hm=b3d278dbc32a83e8b70f681f96a18e6b0224850452313c608bed3790b70e704b&';

// อีโมจิที่ใช้ทั้งระบบ — เปลี่ยนเป็นอีโมจิของเซิร์ฟเวอร์ได้เลย เช่น  stock: '<:stock:123456789012345678>'
// (ใช้ได้กับปุ่ม / เมนู / หัวข้อ / เนื้อหา embed — ยกเว้นข้อความ author และ footer ที่ดิสไม่แสดงอีโมจิเซิร์ฟเวอร์)
const EMOJI = {
    buy: '🛒', sell: '💰', farm: '⛏️', food: '🍱',
    stock: '📦', rate: '📊', announce: '📢', assign: '👤',
    work: '🛠️', progress: '⏳', done: '✅', cancel: '❌',
    ok: '✅', no: '❌'
};

// สติกเกอร์ของเซิร์ฟเวอร์ที่จะส่งแนบไปกับประกาศ (ใส่ ID สติกเกอร์ ถ้าเว้นว่างจะไม่แนบ)
// key = ชื่อเทมเพลตของ !embed
const STICKERS = {
    stock: '', new: '', rate: '', open: '', close: '',
    queue: '', promo: '', maint: '', notice: '', custom: ''
};

// อีโมจิของปุ่ม (อีโมจิดิสคอร์ด) — id ว่าง = ปุ่มนั้นไม่มีอีโมจิ
const BTN_EMOJI = {
    work:    { id: '1561005772597493930', name: 'work' },            // รับงาน
    done:    { id: '1556884242041020456', name: 'blackverified', animated: true },  // เสร็จสิ้น
    close:   { id: '1285847714076033114', name: 'close' },           // ปิดห้อง
    contact: { id: '1561005772597493930', name: 'contact' }          // ติดต่อ/สอบถาม
};

// ==========================================
// [ 3.2 อีโมจิดิสคอร์ด — เฉพาะ "หน้าเรทราคา" ]
// ==========================================
// ใช้กับห้องเรท (!rate / ปุ่มดูเรททั้งหมด) และประกาศที่ใส่ {rate_xxx}
// ใส่อีโมจิของเซิร์ฟเวอร์ได้เลย รูปแบบ:  '<:ชื่ออีโมจิ:ไอดี>'   (อีโมจิขยับ: '<a:ชื่ออีโมจิ:ไอดี>')
// วิธีเอาไอดี: พิมพ์ \:ชื่ออีโมจิ: ในดิส แล้วคัดลอกข้อความที่ขึ้นมาวางตรงนี้
// เว้นว่าง '' = ไม่แสดงอีโมจิ (หน้ารายการสินค้าจะขึ้นเป็นจุด • แทน)
const RATE_ICON = {
    price:    '',   // หน้าตัวเลขราคา
    limit:    '1561005752028635237',   // หน้าบรรทัด "จำกัด ... / รอบ"
    cooldown: ' 1561005733577752586'    // หน้าเวลาคูลดาวน์
};

// key ต้องตรงกับชื่อสินค้าใน CATALOG ด้านล่าง
const RATE_EMOJI = {
    buy: {
        wire: '<:emoji_9:1560921644715872337>', // สายไฟ
        cement: '<:emoji_8:1560921422929330236>', // ปูน
        redmoney: '<:emoji_7:1560921390214025338>', // เงินแดง
        armor: '<:emoji_511:1560922141396959392>', // เกราะ
        weapon_card: '<:IMG_9474:1560942016513179678>', // บัตรตี
        selljade: '<:IMG_9500removebgpreview:1560997829978099802>', // เจด
        selljade_shard: '<:emoji_471:1561232487064272916>', // เศษเจด
        vibranium: '<:IMG_9499removebgpreview:1560997859049078814>', // ไวเบ
        vibranium_shard: '<:IMG_9473:1560942040856924210>', // เศษไวเบ
        powerc: '<:IMG_9475:1560942065419034654>', // Power C
        gem: '<:emoji_492:1560922175018369044>'  // Gem
    },
    sell: {
        sellredmoney: '<:emoji_7:1560921390214025338>', // ขายเงินแดง
        selliron: '<:IMG_9476:1560941988109492295>', // ขายเหล็ก
        sellgold: '<:IMG_9501removebgpreview:1561229476090745002>', // ขายทอง
        sellcement: '<:emoji_8:1560921422929330236>', // ขายปูน
        sellwire: '<:emoji_9:1560921644715872337>', // ขายสายไฟ
        selljade: '<:IMG_9500removebgpreview:1560997829978099802>', // ขายเจด
        selljade_shard: '<:emoji_471:1561232487064272916>', // ขายเศษเจด
        sellweapon_card: '<:IMG_9474:1560942016513179678>'  // ขายบัตรตี
    },
    farm: {
        gunpowder: '<:emoji_43:1561618758802473030>',  // ดินปืน
        copper: '<:IMG_9486:1560991623020544000>', // ทองแดง
        stone: '<:IMG_9498removebgpreview:1560996257164562462>', // หิน
        iron: '<:IMG_9476:1560941988109492295>', // เหล็ก
        gold: '<:IMG_9501removebgpreview:1561229476090745002>', // ทอง
        diamond: '<:IMG_9487:1560991487829876887>', // ไดมอนด์
        ruby: '<:IMG_9477:1560941970824896512>', // รูบี้
        emerald: '<:IMG_9488:1560991371064647790>', // มรกต
        paper: '<:IMG_9478:1560941953418272768>', // กระดาษ
        strawberry: '<:IMG_9491:1560993445227790406>', // สตรอเบอร์รี่
        lettuce: '<:IMG_9493:1560993478291230780>', // ผักกาด
        tomato: '<:IMG_9490:1560993599322329170>', // มะเขือเทศ
        radish: '', // หัวไชเท้า
        apple: '<:IMG_9492:1560993631748489318>', // แอปเปิ้ล
        pork: '<:IMG_9494:1560993524625707058>', // เนื้อหมู
        beef: '<:IMG_9495:1560993413766189116>', // เนื้อวัว
        wood: '<:IMG_9489:1560991683317858304>' // ไม้
    },
    food: {
        applejuice: '<:emoji_55:1560922089244860476>', // น้ำแอปเปิ้ล
        strawberryjuice: '<:emoji_561:1560922072450990110>', // น้ำสตรอเบอร์รี่
        porksteak: '<:emoji_521:1560922121956360283>', // สเต็กหมู
        beefsteak: '<:IMG_9510removebgpreview:1561234155268997211>', // สเต็กวัว
        salad: '<:emoji_54:1560922105745252352>',  // สลัด,
        set_pork_beef: '<:emoji_521:1560922121956360283>+<:IMG_9510removebgpreview:1561234155268997211>',           // สเต็กหมู + สเต็กเนื้อวัว
        set_porksteak_salad: '<:emoji_521:1560922121956360283>+<:emoji_54:1560922105745252352>',     // สเต็กเนื้อหมู + สลัดผัก
        set_beef_salad: '<:IMG_9510removebgpreview:1561234155268997211>+<:emoji_54:1560922105745252352>',          // สเต็กเนื้อวัว + สลัดผัก
        set_juice_duo: '<:emoji_561:1560922072450990110>+<:emoji_55:1560922089244860476>',           // น้ำสตรอเบอร์รี่ + น้ำแอปเปิ้ล
        set_bulk_pork_juice: '<:IMG_9494:1560993524625707058>+<:emoji_55:1560922089244860476>',     // เนื้อหมู + น้ำแอปเปิ้ล
        set_bulk_steak_pair: '<:emoji_521:1560922121956360283>+<:IMG_9510removebgpreview:1561234155268997211>',     // สเต็กหมู + สเต็กวัว (Set 50)
    }
};

// ==========================================
// [ 4. CATALOG — เรทราคา / สินค้า (แก้เรทใหม่ที่ "ที่เดียว" ตรงนี้)
// ==========================================
//  rate      = ราคา / ชิ้น
//  limit     = ลิมิตต่อรอบ (ไม่ใส่ = ไม่จำกัด)
//  stock     = สต็อกเริ่มต้น (เฉพาะหมวดที่ trackStock: true)
//  emoji     = อีโมจิของสินค้า (ไม่ใส่ = ใช้อีโมจิของหมวด)
//  ทุกข้อความเรท (!rate), เมนูเลือกสินค้า, ประกาศ {rate_xxx} จะอ่านจากตรงนี้อัตโนมัติ
const CATALOG = {
    buy: {
        label: 'ซื้อของ', emoji: RATE_EMOJI.buy.cement, color: '#2ECC71', btnStyle: ButtonStyle.Success,
        maxSelect: 2, cooldown: 0, trackStock: true,
        rateChannel: '1561038832579645681', stockLog: STOCK_BUY_LOG, stockColor: '#3498DB',
        items: {
            wire:               { label: 'สายไฟ',  rate: 4500,   stock: 0 },
            cement:             { label: 'ปูน',     rate: 5500,   stock: 0 },
            armor:              { label: 'เกราะ',   rate: 11000,  stock: 0 },
            weapon_card:        { label: 'บัตรตี',  rate: 800,   stock: 0 },
            selljade:           { label: 'เจด',     rate: 240000, stock: 0 },
            selljade_shard:     { label: 'เศษเจด',  rate: 12000,  stock: 0 },
            vibranium:          { label: 'ไวเบ',    rate: 2100000,      stock: 0 },
            vibranium_shard:    { label: 'เศษไวเบ', rate: 21000,      stock: 0 },
            powerc:             { label: 'Power C', rate: 10000,      stock: 0 },
            gem:                { label: 'Gem',     rate: 100000,      stock: 0 }
        }
    },
    sell: {
        label: 'ขายของ', emoji: RATE_EMOJI.buy.wire, color: '#E74C3C', btnStyle: ButtonStyle.Danger,
        maxSelect: 2, cooldown: 0, trackStock: false,
        rateChannel: '1561038832579645681',
        items: {
            sellredmoney:    { label: 'ขายเงินแดง', rate: 80    },
            selliron:        { label: 'ขายเหล็ก',   rate: 100   },
            sellgold:        { label: 'ขายทอง',     rate: 70    },
            sellcement:      { label: 'ขายปูน',     rate: 5100  },
            sellwire:        { label: 'ขายสายไฟ',   rate: 4100   },
            selljade:        { label: 'ขายเจด',     rate: 230000 },
            selljade_shard:  { label: 'ขายเศษเจด',  rate: 11000  },
            sellweapon_card: { label: 'ขายบัตรตี',  rate: 700   }
        }
    },
    farm: {
        label: 'จ้างฟาร์ม', buttonLabel: 'ฟาร์ม', emoji: RATE_EMOJI.farm.wood, color: '#F1C40F', btnStyle: ButtonStyle.Primary,
        maxSelect: 2, cooldown: 24 * 60 * 60 * 1000, trackStock: false,
        rateChannel: '1561038578832908310', cooldownLog: '1561040139894132836',
        rateTitle: '🕊️ เรทราคาฟาร์มงานขาว',
        rateNote:  '🚫 งดเร่งงาน • เรียงตามคิวเท่านั้น',
        items: {
            copper:     { emoji: '🟠', label: 'ทองแดง',       rate: 55,  limit: 3500},
            stone:      { emoji: '🪨', label: 'หิน',             rate: 50,  limit: 5000 },
            iron:       { emoji: '⚙️', label: 'เหล็ก',         rate: 110, limit: 5000  },
            gold:       { emoji: '🪙', label: 'ทอง',            rate: 75, limit: 1000 },
            diamond:    { emoji: '💎', label: 'ไดมอนด์',       rate: 145, limit: 2000 },
            ruby:       { emoji: '🔴', label: 'รูบี้',           rate: 290, limit: 500 },
            emerald:    { emoji: '🟢', label: 'มรกต',         rate: 880, limit: 250  },
            paper:      { emoji: '📄', label: 'กระดาษ(ยังไม่รับ)',rate: 2,  limit: 0 },
            strawberry: { emoji: '🍓', label: 'สตรอเบอร์รี่',     rate: 55,  limit: 5000 },
            lettuce:    { emoji: '🥬', label: 'ผักกาด',        rate: 55,  limit: 5000 },
            tomato:     { emoji: '🍅', label: 'มะเขือเทศ',     rate: 55,  limit: 5000 },
            radish:     { emoji: '🫜', label: 'บีทรูท',         rate: 55,  limit: 5000 },
            apple:      { emoji: '🍎', label: 'แอปเปิ้ล',      rate: 55,  limit: 5000 },
            pork:       { emoji: '🐷', label: 'เนื้อหมู',       rate: 55,  limit: 5000 },
            beef:       { emoji: '🐮', label: 'เนื้อวัว',       rate: 55,  limit: 5000 },
            wood:       { emoji: '🪵', label: 'ไม้',           rate: 50,  limit: 5000  },
            gunpowder:  { emoji: '💣', label: 'ดินปืน',       rate: 55,  limit: 3000 },

        }
    },
    food: {
        label: 'อาหาร', emoji: RATE_EMOJI.food.porksteak, color: '#9B59B6', btnStyle: ButtonStyle.Secondary,
        maxSelect: 5, cooldown: 5 * 60 * 60 * 1000, cooldownLog: '1561039811194921122', trackStock: true,
        rateChannel: '1561039647373791354', stockLog: STOCK_FOOD_LOG, stockColor: '#FFB6C1',
        items: {
            // เซ็ทอาหาร (ไม่ขายแยก) — rate = ราคาต่อเซ็ท, limit = จำกัดต่อรอบ, stock = จำนวนเซ็ทที่มี
            set_pork_beef:        { label: 'สเต็กหมู 10 + สเต็กเนื้อวัว 10', rate: 35000,  limit: 10, stock: 0 },
            set_porksteak_salad:  { label: 'สเต็กเนื้อหมู 10 + สลัดผัก 10',  rate: 26000,  limit: 9,  stock: 0  },
            set_beef_salad:       { label: 'สเต็กเนื้อวัว 10 + สลัดผัก 10',  rate: 25000,  limit: 11, stock: 0 },
            set_juice_duo:        { label: 'น้ำสตรอเบอร์รี่ 10 + น้ำแอปเปิ้ล 10', rate: 19000, limit: 31, stock: 0 },
            set_bulk_pork_juice:  { label: 'เนื้อหมู 50 + น้ำแอปเปิ้ล 50 (Set 50 จาน/แก้ว)', rate: 98000,  limit: 15, stock: 0 },
            set_bulk_steak_pair:  { label: 'สเต็กหมู 50 + สเต็กวัว 50 (Set 50 จาน/แก้ว)', rate: 180000, limit: 19, stock: 0 }
        }
    }
};

// ใช้อีโมจิดิสคอร์ดจาก RATE_EMOJI กับทุกที่ที่โชว์สินค้า (เมนูกดสั่งซื้อ/ฟาร์ม, ออเดอร์, สต็อก, เรท)
// ช่องไหนว่าง = ไม่มีอีโมจิ (ไม่ใช้อีโมจิอื่นแทน)
for (const [type, cat] of Object.entries(CATALOG))
    for (const [key, item] of Object.entries(cat.items))
        item.emoji = RATE_EMOJI[type]?.[key] || undefined;

const TYPES       = Object.keys(CATALOG);
const STOCK_TYPES = TYPES.filter(t => CATALOG[t].trackStock);

// ==========================================
// [ 5. Runtime State ]
// ==========================================
let orderFlow        = {};          // { userId: { type, items, ign, phone, amounts, total, detail } }
let activeTicketData = {};          // { channelId: ticket }
let rateMsgs         = {};   // { 'channelId:type': [messageId, ...] } ข้อความเรทที่โพสต์ไว้
let rateOverrides     = {};   // { type: { key: { rate?, limit? } } } เฉพาะรายการที่แก้ผ่านดิส
let userCooldowns    = {};
let queueCount       = 1;
const stockFlow      = {};          // { userId: { mode, picks, announce } }
const embedDrafts    = new Map();   // userId -> draft ของตัวสร้างประกาศ
const embedTargets   = new Map();   // userId -> ห้องปลายทางที่เลือกตอนใช้ !embed

// ==========================================
// [ 6. Helpers ]
// ==========================================
const nowTs = () => Math.floor(Date.now() / 1000);
const LINE  = '━━━━━━━━━━━━━━━━━━━━━━';
const box   = (text) => `╭${LINE}╮\n${text}\n╰${LINE}╯`;
const fmt   = (v) => Number(v ?? 0).toLocaleString('en-US');

const isAdmin   = (member) => !!member?.roles?.cache?.has(ADMIN_ROLE_ID);
// แอดมิน หรือ คนที่ถูกมอบหมายงานนั้น ๆ
const canHandle = (member, data) => isAdmin(member) || (!!data?.assigneeId && data.assigneeId === member?.id);

const itemName  = (it) => `${it.emoji ? it.emoji + ' ' : ''}${it.label}`;
const tell      = (interaction, content) => interaction.reply({ content, flags: EPHEMERAL });

// อีโมจิดิสคอร์ด ('<:ชื่อ:id>' / '<a:ชื่อ:id>') → รูปแบบที่เมนู/ปุ่มรับได้ · ค่าว่าง = undefined (ไม่แสดงอีโมจิ)
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

function fmtShort(v) {
    if (v >= 1_000_000 && v % 1_000_000 === 0) return `${v / 1_000_000}m`;
    if (v >= 1_000     && v % 1_000     === 0) return `${v / 1_000}k`;
    return fmt(v);
}

function fmtDuration(ms) {
    const H = 3600_000, D = 24 * H;
    if (ms >= D && ms % D === 0) return `${ms / D} วัน`;
    if (ms >= H && ms % H === 0) return `${ms / H} ชม.`;
    return `${Math.round(ms / 60_000)} นาที`;
}

function formatCooldownTime(seconds) {
    if (seconds > 3600)
        return `${Math.floor(seconds / 3600)} ชม. ${Math.floor((seconds % 3600) / 60)} นาที`;
    return `${Math.floor(seconds / 60)} นาที`;
}

/**
 * อ่านตัวเลขแบบยืดหยุ่น: 5k, 1.2k, 3.3 (→3300), 5พัน, 1หมื่น, 1,200, 2m, 1ล้าน
 * คืน null ถ้าอ่านไม่ได้ (ต่างจาก parseAmount ที่ปัดเป็น 1)
 */
const SUFFIXES = [['ล้าน', 1_000_000], ['แสน', 100_000], ['หมื่น', 10_000], ['พัน', 1_000], ['m', 1_000_000], ['k', 1_000]];

function parseNumber(input) {
    if (input === undefined || input === null) return null;
    let raw = String(input).trim().toLowerCase().replace(/[,\s]/g, '');
    if (!raw) return null;

    let multiplier = 1, hasSuffix = false;
    for (const [suffix, m] of SUFFIXES) {
        if (raw.endsWith(suffix)) { multiplier = m; raw = raw.slice(0, -suffix.length); hasSuffix = true; break; }
    }

    const num = Number(raw);
    if (raw === '' || !Number.isFinite(num) || num < 0) return null;

    // เลขทศนิยมเล็ก ๆ ไม่มีหน่วย = หลักพัน: 3.3 → 3300, 1.5 → 1500
    if (!hasSuffix && !Number.isInteger(num) && num < 1000) multiplier = 1_000;

    return Math.floor(num * multiplier);
}

/** จำนวนในออเดอร์: อ่านไม่ได้/0 = 1 */
function parseAmount(input) {
    const v = parseNumber(input);
    return v && v > 0 ? v : 1;
}

const userSpamMap = new Map();
function isSpam(userId, delay = 2000) {
    const now  = Date.now();
    const last = userSpamMap.get(userId);
    userSpamMap.set(userId, now);
    return !!(last && now - last < delay);
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

function loadJSON(filePath, fallback = {}) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        console.error(`❌ โหลดไฟล์ ${filePath} ไม่ได้`, err);
        return fallback;
    }
}

const DEFAULT_PFP = 'https://tr.rbxcdn.com/38c6ed8c63333055ae701358385392e2/420/420/AvatarHeadshot/Png';
/** รอผลไม่เกิน ms — เกินเวลาใช้ค่า fallback (กัน interaction หมดเวลา 3 วินาที) */
const withTimeout = (promise, ms, fallback) =>
    Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(fallback), ms))]);

async function getRobloxPfp(username) {
    try {
        const userRes = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username], excludeBannedUsers: true
        });
        if (!userRes.data.data.length) throw new Error('User not found');
        const userId   = userRes.data.data[0].id;
        const thumbRes = await axios.get(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`
        );
        return thumbRes.data.data[0].imageUrl;
    } catch (err) {
        console.error('❌ Roblox API Error:', err.message);
        return 'https://tr.rbxcdn.com/38c6ed8c63333055ae701358385392e2/420/420/AvatarHeadshot/Png';
    }
}

/** สร้างรายละเอียดออเดอร์ + ยอดรวม จาก items [{key,label,emoji,rate}] และ amounts {key: number} */
function buildOrderDetail(items, amounts) {
    let total = 0, detail = '';
    for (const item of items) {
        const qty = amounts[item.key] ?? 1;
        total  += item.rate * qty;
        detail += `🔹 ${itemName(item)} × ${fmt(qty)} = **${fmt(item.rate * qty)}฿**\n`;
    }
    return { total, detail };
}

/** รายการสต็อกของหมวด (ใช้ใน ticket / log / ประกาศ) */
function stockLines(type) {
    return Object.values(CATALOG[type].items)
        .map(it => `${it.stock > 0 ? '✅' : '❌'} **${itemName(it)}**: \`${fmt(it.stock)}\``)
        .join('\n');
}

function allStockText() {
    return STOCK_TYPES.map(t => `**${CATALOG[t].emoji} ${CATALOG[t].label}**\n${stockLines(t)}`).join('\n\n');
}

/** รายการเรทของหมวด (อ่านจาก CATALOG ตรง ๆ) — อีโมจิหน้าเรทมาจาก RATE_ICON / RATE_EMOJI */
const withSp = (e) => (e ? `${e} ` : '');
function rateLines(type, detail = false) {
    const cat = CATALOG[type];
    return Object.entries(cat.items).map(([key, it]) => {
        const lead = withSp(it.emoji) || '• ';
        let line   = `${lead}**${it.label}** ┊ ${withSp(RATE_ICON.price)}${fmt(it.rate)}`;
        if (detail && it.limit)
            line += `\n${withSp(RATE_ICON.limit)}จำกัด ${fmtShort(it.limit)} / รอบ` + (cat.cooldown ? ` • ${withSp(RATE_ICON.cooldown)}${fmtDuration(cat.cooldown)}` : '');
        return line;
    }).join(detail ? '\n\n' : '\n');
}

// ==========================================
// [ 6.1 หน้าเรทแบบข้อความ — ฟาร์ม (งานขาว + งานแร่) / อาหาร ]
// ==========================================
// หน้าเรทของ farm และ food โพสต์เป็น "ข้อความธรรมดา" (ไม่ใช่ embed) เพื่อให้หัวข้อ # / ## และอีโมจิขยับแสดงผลได้
// ฟาร์ม: ราคา/ลิมิตอ่านจาก CATALOG.farm (แก้ผ่าน !ratepanel ได้) | อาหาร: แก้ราคาในลิสต์ foodSets / foodSingles ด้านล่าง
const RATE_PAGE = {
    arrow:    '<a:1427603143377551381:1561657371288150086>',
    title:    '<a:936387643124633681:1561005752028635237>',
    kitty:    '<a:905201hellokittyblush:1562083083346378872>',
    sparkle:  '<a:1557232356551688272:1561709072137326784>',
    hearts:   '<a:237291pinkhearts:1557040976973795438>',
    warn:     '<a:Warnflash:1561005772597493930>',
    divider1: '# ────୨ৎ────────୨ৎ────────୨ৎ────────୨ৎ───────ৎ',
    divider2: '────୨ৎ────────୨ৎ────────୨ৎ',
    maxChars: 1900,                           // ความยาวสูงสุดต่อข้อความ (ดิสจำกัด 2000)

    // ── ฟาร์ม ──
    whiteMax: 5000,                           // MAX ของงานขาว (หัวข้อ)
    oreKeys:  ['copper', 'stone', 'iron', 'gold', 'diamond', 'ruby', 'emerald','gunpowder'],   // ที่เหลือใน CATALOG.farm = งานขาว
    fallbackEmoji: { radish: '🫜' },          // ใช้เมื่อ RATE_EMOJI.farm ของสินค้านั้นว่าง

    // ── อาหาร ──
    readRoomChannelId: '1561039310336303114', // ห้องที่ให้อ่านก่อนสั่งอาหาร
    foodNames: {                              // key = key ใน RATE_EMOJI.food
        beefsteak: 'เสต็กวัว', porksteak: 'เสต็กหมู', salad: 'สลัด',
        applejuice: 'น้ำแอปเปิ้ล', strawberryjuice: 'น้ำสตอเบอรี่'
    },
    foodSets: [                               // [สินค้า 1, สินค้า 2, ราคาเซ็ท]
        ['beefsteak',       'strawberryjuice', '45 K'],
        ['beefsteak',       'applejuice',      '45 K'],
        ['beefsteak',       'porksteak',       '50 K'],
        ['porksteak',       'salad',           '25 K'],
        ['applejuice',      'strawberryjuice', '20 K']
    ],
    foodSingles: [                            // [สินค้า, ราคา/ชิ้น]
        ['porksteak',       '2,600'],
        ['beefsteak',       '2,700'],
        ['salad',           '1,200'],
        ['applejuice',      '1,100'],
        ['strawberryjuice', '1,100']
    ]
};

const fmtK = (v) => {
    if (v < 1000) return fmt(v);
    const k = v / 1000;
    return `${Number.isInteger(k) ? k : +k.toFixed(1)}K`;
};

/** รวมบล็อกข้อความเป็นหลายข้อความ ไม่เกิน maxChars (ตัดที่ขอบบล็อก ไม่ตัดกลางบล็อก) */
function packBlocks(blocks) {
    const out = [];
    let cur = '';
    for (const b of blocks) {
        const next = cur ? `${cur}\n\n${b}` : b;
        if (cur && next.length > RATE_PAGE.maxChars) { out.push(cur); cur = b; }
        else cur = next;
    }
    if (cur) out.push(cur);
    return out;
}

/** หน้าเรทฟาร์ม: งานขาว + งานแร่ (แต่ละส่วนขึ้นข้อความใหม่) */
function buildFarmRatePages() {
    const P = RATE_PAGE, A = P.arrow;
    const entries = Object.entries(CATALOG.farm.items).filter(([, it]) => it.limit !== 0);
    const emojiOf = ([key, it]) => it.emoji || P.fallbackEmoji[key] || '';

    const white = entries.filter(([k]) => !P.oreKeys.includes(k)).map((e) => {
        const [, it] = e;
        const max = it.limit || P.whiteMax;
        return `**${A} ${emojiOf(e)}${it.label} ${A} ${fmt(it.rate)} (MAX ${fmtK(max)})**`;
    });
    const ore = entries.filter(([k]) => P.oreKeys.includes(k)).map((e) => {
        const [, it] = e;
        return `**${A} ${emojiOf(e)}${it.label} ${A} ${fmt(it.rate)}${it.limit ? ` (MAX ${fmtK(it.limit)})` : ''}**`;
    });

    return [
        ...packBlocks([
            `# ${P.title} เรทรับฟาร์มงานขาว - งานแร่`,
            `## ${P.kitty} เรทงานขาว`,
            ...white,
        ]),
        ...packBlocks([
            `${P.divider1}\n# ${P.sparkle} เรทงานแร่${P.sparkle}`,
            ...ore,
        ]),
    ];
}

/** หน้าเรทอาหาร: เซ็ท + ขายแยก */
function buildFoodRatePages() {
    const P = RATE_PAGE, A = P.arrow, E = RATE_EMOJI.food;
    const nm = (k) => `${P.foodNames[k]}${E[k] || ''}`;

    return [
        ...packBlocks([
            `# ${P.title} เรทอาหาร`,
            `## ${P.sparkle} อาหารมีขายแยกน้าา ${P.sparkle}`,
            `# ${P.hearts} FOOD SET`,
            ...P.foodSets.map(([a, b, price]) => `**${A} SET FOOD ${nm(a)} + ${nm(b)} ${A} (${price})**`),
            `# ${P.warn} ลิมิตเต็มตัวแบบเซ็ท สั่งได้สองเซ็ท คลูดาวน์ 5ชม.นะคะ ${P.warn}`
        ]),
        ...packBlocks([
            `${P.divider2}\n# ${A} FOOD ขายแยก`,
            ...P.foodSingles.map(([k, price]) => `**${A} ${nm(k)}** **${A} (${price}/ชิ้น)**`),
            `# ${P.warn} แบบแยกลิมิตเต็มตัว สั่งได้สูงสุด 5 อย่างนะคะ ${P.warn}`,
            `## ${P.sparkle} รบกวนอ่านห้องนี้ก่อนสั่งอาหารนะคะ ${P.sparkle}\n<#${P.readRoomChannelId}>`
        ])
    ];
}

// หมวดที่โพสต์เป็นข้อความธรรมดา (นอกนั้นโพสต์เป็น embed ตามเดิม)
const TEXT_RATE_BUILDERS = { farm: buildFarmRatePages, food: buildFoodRatePages };

// ==========================================
// [ 7. Persistence ]
// ==========================================
function loadPersistentData() {
    userCooldowns    = loadJSON(COOLDOWN_FILE, {});
    activeTicketData = loadJSON(TICKET_FILE,   {});
    rateMsgs         = loadJSON(RATE_FILE, {});

    // เรท/ลิมิตที่แก้ผ่านแผง !ratepanel → ทับค่าในโค้ดเฉพาะรายการที่เคยแก้
    rateOverrides    = loadJSON(RATE_OVERRIDE_FILE, {});
    for (const [type, items] of Object.entries(rateOverrides))
        for (const [key, ov] of Object.entries(items || {})) {
            const item = CATALOG[type]?.items?.[key];
            if (!item) continue;
            if (typeof ov.rate === 'number')  item.rate = ov.rate;
            if (typeof ov.limit === 'number') { if (ov.limit > 0) item.limit = ov.limit; else delete item.limit; }
        }

    if (fs.existsSync(QUEUE_FILE))
        queueCount = parseInt(fs.readFileSync(QUEUE_FILE, 'utf8')) || 1;

    // สต็อก: รองรับทั้งไฟล์ใหม่ { food:{key:n}, buy:{key:n} } และไฟล์เก่า { FOOD_RATES:{key:{stock}}, BUY_RATES:{...} }
    const saved  = loadJSON(STOCK_FILE, {});
    const legacy = { food: saved.FOOD_RATES, buy: saved.BUY_RATES };
    for (const type of STOCK_TYPES) {
        for (const [key, item] of Object.entries(CATALOG[type].items)) {
            const v = saved[type]?.[key] ?? legacy[type]?.[key]?.stock;
            if (typeof v === 'number') item.stock = v;
        }
    }
}

function saveStock() {
    const out = {};
    for (const type of STOCK_TYPES) {
        out[type] = {};
        for (const [key, item] of Object.entries(CATALOG[type].items)) out[type][key] = item.stock;
    }
    fs.writeFileSync(STOCK_FILE, JSON.stringify(out, null, 2));
}
function saveTickets() { fs.writeFileSync(TICKET_FILE, JSON.stringify(activeTicketData, null, 2)); }
function saveRateMsgs() { fs.writeFileSync(RATE_FILE, JSON.stringify(rateMsgs, null, 2)); }
function saveRateOverrides() { fs.writeFileSync(RATE_OVERRIDE_FILE, JSON.stringify(rateOverrides, null, 2)); }
function saveData() {
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(userCooldowns, null, 2));
    fs.writeFileSync(QUEUE_FILE, queueCount.toString());
}

loadPersistentData();

// ==========================================
// [ 8. Client ]
// ==========================================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ==========================================
// [ 9. Embed / Ticket Builders ]
// ==========================================
function buildRateEmbed(type) {
    const cat  = CATALOG[type];
    const note = cat.rateNote ? `\n${box(cat.rateNote)}\n` : '';
    return new EmbedBuilder()
        .setTitle(cat.rateTitle || `${cat.emoji} เรทราคา${cat.label}`)
        .setColor(cat.color)
        .setDescription(
            `${box(` ✨ เรท${cat.label}ทั้งหมด ✨`)}\n\n${rateLines(type, true)}\n${note}\nอัปเดตเมื่อ: <t:${nowTs()}:F>`
        )
        .setFooter({ text: `${BRAND.name} • ระบบเรทราคา` });
}

function buildStockOverviewEmbed() {
    return new EmbedBuilder()
        .setTitle(`${EMOJI.stock} สต็อกคงเหลือทั้งหมด`)
        .setColor('#3498DB')
        .setDescription(`${allStockText()}\n\n${LINE}\nอัปเดตเมื่อ: <t:${nowTs()}:F>`)
        .setFooter({ text: `${BRAND.name} • Stock System` });
}

/** บันทึก log สต็อก changes = [{ item, before, after }] */
async function sendStockLog(type, { action = '', adminId = null, changes = [] } = {}) {
    const cat = CATALOG[type];
    if (!cat?.trackStock) return;
    const channel = client.channels.cache.get(cat.stockLog);
    if (!channel) return;

    let head = '';
    if (changes.length) {
        head = `${action}${adminId ? ` • โดย <@${adminId}>` : ''}\n` +
               changes.map(formatChange).join('\n') + `\n\n${LINE}\n`;
    }

    try {
        await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle(`${EMOJI.stock} สต็อก — ${cat.emoji} หมวด${cat.label}`)
                .setColor(cat.stockColor || cat.color)
                .setDescription(`${head}**สรุปสต็อกคงเหลือ**\n${stockLines(type)}\n\n${LINE}\nอัปเดตเมื่อ: <t:${nowTs()}:F>`)
                .setFooter({ text: `${BRAND.name} • Stock System` })]
        });
    } catch (err) { console.error('Stock Log Error:', err); }
}

function formatChange(c) {
    const d    = c.after - c.before;
    const sign = d > 0 ? `+${fmt(d)}` : d < 0 ? fmt(d) : '±0';
    return `• **${itemName(c.item)}**: \`${fmt(c.before)}\` → \`${fmt(c.after)}\` (${sign})`;
}

const assigneeText = (data) => data.assigneeId ? `<@${data.assigneeId}>` : '— ยังไม่มีผู้รับผิดชอบ';

/** Embed หลักในห้องออเดอร์ — สร้างจากข้อมูลออเดอร์ทุกครั้ง (สถานะ/ผู้รับผิดชอบอัปเดตตามจริง) */
function buildTicketEmbed(data) {
    const cat          = CATALOG[data.type];
    const stockSummary = cat?.trackStock ? stockLines(data.type) : '';

    return new EmbedBuilder()
        .setAuthor({ name: `☄️ ${BRAND.name} ORDER • คิวที่ ${data.qNum}`, iconURL: client.user.displayAvatarURL() })
        .setColor(BRAND.accent)
        .setThumbnail(data.pfp)
        .setImage(TICKET_BANNER)
        .setDescription(
            `${box(`   ${cat?.emoji ?? ''} **ออเดอร์ใหม่ — คิวที่ ${data.qNum}**`)}\n\n` +
            `🎮 IGN(user ของโรบอค ไม่ต้องมี@): \`${data.ign}\`\n📞 Phone: \`${data.phone}\`\n🆔 User: <@${data.userId}>\n` +
            `📦 หมวด: **${cat?.label ?? data.type}**\n\nอัปเดตเมื่อ: <t:${nowTs()}:F>`
        )
        .addFields(
            { name: '📦 รายการทั้งหมด',  value: `╭──────────────╮\n${data.detail}╰──────────────╯`, inline: false },
            { name: '💰 ยอดรวมทั้งหมด', value: `╭──────────────╮\n💵 **${fmt(data.total)} บาท**\n╰──────────────╯`, inline: false },
            ...(stockSummary ? [{ name: '📊 สต็อกคงเหลือ (ล่าสุด)', value: `╭──────────────╮\n${stockSummary}\n╰──────────────╯`, inline: false }] : []),
            { name: '👤 ผู้รับผิดชอบ', value: assigneeText(data),         inline: true }
        )
        .setFooter({ text: `${BRAND.name} • Premium Order System`, iconURL: client.user.displayAvatarURL() });
}

/** ปุ่มในห้องออเดอร์: รับงาน / เสร็จสิ้น / ปิดห้อง (หลังเสร็จสิ้นเหลือแค่ปิดห้อง) */
function ticketButtons({ finished = false } = {}) {
    const btns = [];
    if (!finished) {
        btns.push(withEmoji(new ButtonBuilder().setCustomId('btn_work').setLabel('รับงาน').setStyle(ButtonStyle.Primary), BTN_EMOJI.work));
        btns.push(withEmoji(new ButtonBuilder().setCustomId('btn_done').setLabel('เสร็จสิ้น').setStyle(ButtonStyle.Success), BTN_EMOJI.done));
    }
    btns.push(withEmoji(new ButtonBuilder().setCustomId('btn_close').setLabel('ปิดห้อง').setStyle(ButtonStyle.Secondary), BTN_EMOJI.close));
    return new ActionRowBuilder().addComponents(btns);
}

/** รีเฟรช embed หลักในห้องออเดอร์ให้ตรงกับข้อมูลล่าสุด */
async function refreshTicketEmbed(channelId) {
    const data = activeTicketData[channelId];
    if (!data?.mainMsgId) return;
    const chan = client.channels.cache.get(channelId);
    if (!chan) return;
    try {
        const msg = await chan.messages.fetch(data.mainMsgId);
        await msg.edit({ embeds: [buildTicketEmbed(data)] });
    } catch (err) { console.error('Refresh Ticket Error:', err); }
}

// ── ปิด/ลบห้องอัตโนมัติหลังเสร็จสิ้น + สรุป logs ─────────────
const closeTimers = new Map();   // channelId -> timeout

function cancelAutoClose(channelId) {
    const t = closeTimers.get(channelId);
    if (t) { clearTimeout(t); closeTimers.delete(channelId); }
}

function scheduleAutoClose(channelId, at) {
    cancelAutoClose(channelId);
    const wait = Math.max(0, at - Date.now());
    closeTimers.set(channelId, setTimeout(() => {
        closeTimers.delete(channelId);
        closeTicket(channelId, { by: 'auto' }).catch(err => console.error('Auto Close Error:', err));
    }, wait));
}

const fmtSpan = (ms) => {
    const m = Math.max(0, Math.round(ms / 60000));
    return m >= 60 ? `${Math.floor(m / 60)} ชม. ${m % 60} นาที` : `${m} นาที`;
};

/** ส่งสรุป logs ของออเดอร์ไปห้อง TICKET_LOG_CHANNEL_ID */
async function sendCloseLog(chan, data, { by, fate = '🗑️ ลบห้องแล้ว' }) {
    const logChan = client.channels.cache.get(TICKET_LOG_CHANNEL_ID);
    if (!logChan) { console.error('❌ ไม่พบห้อง log ปิดออเดอร์:', TICKET_LOG_CHANNEL_ID); return; }

    const cat      = CATALOG[data.type];
    const closedAt = Date.now();
    const ts       = (ms) => `<t:${Math.floor(ms / 1000)}:f>`;
    const status   = data.status === 'done'     ? `${EMOJI.done} เสร็จสิ้น`
                   : data.status === 'accepted' ? `${EMOJI.work} รับงานแล้ว (ยังไม่กดเสร็จสิ้น)`
                   :                              `${EMOJI.progress} รอรับงาน (ยังไม่กดเสร็จสิ้น)`;

    const times = [`🟢 เปิดห้อง: ${ts(data.createdAt)}`];
    if (data.doneAt) times.push(`✅ เสร็จสิ้น: ${ts(data.doneAt)}`);
    times.push(`🔒 ปิดห้อง: ${ts(closedAt)}`);
    times.push(`⏱️ รวมเวลา: ${fmtSpan(closedAt - data.createdAt)}`);

    const embed = new EmbedBuilder()
        .setAuthor({ name: `🧾 ${BRAND.name} • สรุปออเดอร์คิวที่ ${data.qNum}`, iconURL: client.user.displayAvatarURL() })
        .setColor(data.status === 'done' ? '#2ECC71' : '#E67E22')
        .setThumbnail(data.pfp)
        .addFields(
            { name: '👤 ลูกค้า',        value: `<@${data.userId}>`,                          inline: true },
            { name: '🎮 IGN',           value: `\`${data.ign}\``,                            inline: true },
            { name: '📞 เบอร์',         value: `\`${data.phone}\``,                          inline: true },
            { name: '📦 หมวด',          value: `${cat?.emoji ?? ''} ${cat?.label ?? data.type}`, inline: true },
            { name: '🛠️ ผู้รับผิดชอบ',  value: assigneeText(data),                           inline: true },
            { name: '📌 สถานะ',         value: status,                                       inline: true },
            { name: '🧾 รายการ',        value: String(data.detail || '-').slice(0, 1024) },
            { name: '💰 ยอดรวม',        value: `**${fmt(data.total)} บาท**`,                 inline: true },
            { name: '🔚 ปิดโดย',        value: by === 'auto' ? '🤖 ระบบ (อัตโนมัติ)' : `<@${by}>`, inline: true },
            { name: '📍 ห้อง',          value: `${chan ? `#${chan.name}` : '(ห้องถูกลบไปก่อนแล้ว)'} — ${fate}`, inline: true },
            { name: '🕒 เวลา',          value: times.join('\n') }
        )
        .setFooter({ text: `${BRAND.name} • Ticket Log` })
        .setTimestamp();

    await logChan.send({ embeds: [embed], allowedMentions: { parse: [] } })
        .catch(err => console.error('Close Log Error:', err));
}

/**
 * ปิดห้องออเดอร์ = ส่งสรุป logs แล้วลบห้องทิ้ง (ไม่ส่งข้อความแจ้งในห้อง)
 * by = userId ของคนกดปิด หรือ 'auto' (ตัวจับเวลา 10 นาทีหลังกดเสร็จสิ้น)
 */
async function closeTicket(channelId, { by = 'auto' } = {}) {
    const data = activeTicketData[channelId];
    if (!data) return;                       // ปิดไปแล้ว (กันปิดซ้ำ)

    cancelAutoClose(channelId);
    delete activeTicketData[channelId];
    saveTickets();

    const chan = client.channels.cache.get(channelId);
    await sendCloseLog(chan, data, { by });
    if (chan) await chan.delete(`ปิดออเดอร์คิว ${data.qNum}`).catch(console.error);
}

// ==========================================
// [ 10. SHOP FLOW — ลูกค้าสั่งของ ]
// ==========================================
//  Step 1 ► main_*            ปุ่ม      → เมนูเลือกสินค้า
//  Step 2 ► sel_*             เมนู      → เก็บรายการ → modal IGN + เบอร์
//  Step 3 ► order_info_submit modal     → ยืนยันข้อมูล + ปุ่ม NEXT
//  Step 4 ► flow_next_amount  ปุ่ม      → modal กรอกจำนวน (1 ช่อง / สินค้า)
//  Step 5 ► flow_amount_submit modal    → สรุปออเดอร์ + ยืนยัน / แก้ไข / ยกเลิก
//  Step 6 ► flow_confirm      ปุ่ม      → สร้างห้องออเดอร์
async function handleShopFlow(interaction) {
    const id  = interaction.customId;
    const uid = interaction.user.id;

    // ── STEP 1 ───────────────────────────────────────────────
    if (interaction.isButton() && id.startsWith('main_')) {
        const type = id.split('_')[1];
        const cat  = CATALOG[type];
        if (!cat) { await tell(interaction, '❌ ไม่พบหมวดนี้ในระบบ'); return true; }

        const now   = Date.now();
        const until = userCooldowns[uid]?.[type] || 0;
        if (cat.cooldown > 0 && until > now && !isAdmin(interaction.member)) {   // แอดมินไม่ติดคูลดาวน์
            const left = Math.ceil((until - now) / 1000);
            await tell(interaction, `🧊 **หมวด ${cat.label} ติดคูลดาวน์!**\n⏳ สั่งได้อีกครั้งใน: **${formatCooldownTime(left)}**`);
            return true;
        }

        orderFlow[uid] = { type };

        const entries = Object.entries(cat.items).slice(0, 25);
        const select  = new StringSelectMenuBuilder()
            .setCustomId(`sel_${type}`)
            .setPlaceholder('เลือกรายการที่ต้องการ...')
            .setMinValues(1)
            .setMaxValues(Math.min(cat.maxSelect, entries.length));

        for (const [key, item] of entries) {
            const out   = cat.trackStock && item.stock <= 0;
            const parts = [`💰 ${fmt(item.rate)} / ชิ้น`];
            if (item.limit)      parts.push(`ลิมิต: ${fmt(item.limit)}`);
            if (cat.trackStock)  parts.push(`📦 ${fmt(item.stock)}`);
            select.addOptions({
                label:       out ? `❌ ${item.label} (หมด)` : item.label,
                value:       key,
                description: out ? 'สินค้าหมด — ไม่สามารถสั่งได้' : parts.join(' | '),
                emoji:       emojiObj(item.emoji)
            });
        }

        const embed = new EmbedBuilder()
            .setAuthor({ name: `☄️ ${BRAND.name} SHOP`, iconURL: client.user.displayAvatarURL() })
            .setTitle(`${cat.emoji} หมวด ${cat.label.toUpperCase()}`)
            .setColor(cat.color)
            .setDescription(
                `${box('✨ **เลือกสินค้าที่ต้องการ**')}\n\n📦 หมวด: **${cat.label}**\n` +
                `🎯 เลือกได้สูงสุด: **${cat.maxSelect} รายการ**\n\n💡 กดเลือกสินค้าจากเมนูด้านล่าง\n\nอัปเดตเมื่อ: <t:${nowTs()}:F>`
            )
            .setFooter({ text: `${BRAND.name} SHOP • Step 1/5 — เลือกสินค้า` });

        await interaction.reply({
            embeds: [embed],
            components: [
                new ActionRowBuilder().addComponents(select),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`view_rate_${type}`).setLabel('ดูเรททั้งหมด').setEmoji(EMOJI.rate).setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('cancel_order').setLabel('ยกเลิก').setEmoji(EMOJI.cancel).setStyle(ButtonStyle.Danger)
                )
            ],
            flags: EPHEMERAL
        });
        return true;
    }

    // ── STEP 2 ───────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && id.startsWith('sel_')) {
        const type = id.split('_')[1];
        const cat  = CATALOG[type];
        const flow = orderFlow[uid];
        if (!cat || !flow || flow.type !== type) { await tell(interaction, '❌ ไม่พบออเดอร์ กรุณาเริ่มใหม่'); return true; }

        for (const key of interaction.values) {
            const item = cat.items[key];
            // เมนูเก่าอาจมีสินค้าที่ถูกลบ/เปลี่ยนเรทไปแล้ว
            if (!item) { await tell(interaction, '❌ รายการนี้ถูกอัปเดตแล้ว กรุณากดเริ่มสั่งใหม่อีกครั้ง'); return true; }
            if (cat.trackStock && item.stock <= 0) { await tell(interaction, `❌ **${item.label}** ของหมดแล้ว`); return true; }
        }

        flow.items = interaction.values.map(key => ({
            key,
            label: cat.items[key].label,
            emoji: cat.items[key].emoji || '',
            rate:  cat.items[key].rate
        }));

        const modal = new ModalBuilder().setCustomId('order_info_submit').setTitle('👤 ข้อมูลลูกค้า');
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('ign_input')
                    .setLabel('🎮 NAME (ชื่อ Roblox ของคุณ)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('เช่น PlayerXYZ')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('phone_input')
                    .setLabel('📞 เบอร์โทรศัพท์ (5–6หลัก)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('เช่น 123456')
                    .setMinLength(5)
                    .setMaxLength(6)
                    .setRequired(true)
            )
        );
        await interaction.showModal(modal);
        return true;
    }

    // ── ติดต่อ/สอบถาม: สร้างห้องเปล่า ๆ ให้เลย (ไม่มีข้อความ/ฟอร์ม) ──
    if (interaction.isButton() && id === 'contact_open') {
        if (isSpam(uid)) { await tell(interaction, '⏳ กรุณารอสักครู่ก่อนกดอีกครั้ง'); return true; }
        await interaction.deferReply({ flags: EPHEMERAL });
        const channel = await interaction.guild.channels.create({
            name:   `💬-ติดต่อ-${interaction.user.username}`,
            parent: TICKET_CATEGORY_ID,
            permissionOverwrites: [
                { id: interaction.guild.id, deny:  [PermissionFlagsBits.ViewChannel] },
                { id: uid,                  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: ADMIN_ROLE_ID,        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ]
        });
        await interaction.editReply({ content: `✅ สร้างห้องติดต่อสอบถามแล้ว: ${channel}` });
        return true;
    }

    // ── ปุ่มอื่น ๆ ของลูกค้า ───────────────────────────────────
    if (interaction.isButton() && id === 'cancel_order') {
        delete orderFlow[uid];
        await interaction.update({ content: '❌ ยกเลิกการสั่งซื้อเรียบร้อย', embeds: [], components: [] });
        return true;
    }

    if (interaction.isButton() && id.startsWith('view_rate_')) {
        if (isSpam(uid)) { await tell(interaction, '⏳ กรุณารอสักครู่ก่อนกดอีกครั้ง'); return true; }
        const channelId = CATALOG[id.split('_')[2]]?.rateChannel;
        if (!channelId) { await tell(interaction, '❌ ไม่พบห้องเรท'); return true; }
        await tell(interaction, `📊 ดูเรททั้งหมดได้ที่นี่ 👉 <#${channelId}>`);
        return true;
    }

    // ── STEP 3 ───────────────────────────────────────────────
    if (interaction.isModalSubmit() && id === 'order_info_submit') {
        const flow = orderFlow[uid];
        if (!flow?.items) { await tell(interaction, '❌ ไม่พบออเดอร์ กรุณาเริ่มใหม่'); return true; }

        flow.ign   = interaction.fields.getTextInputValue('ign_input').trim();
        flow.phone = interaction.fields.getTextInputValue('phone_input').trim();
        // ดึงรูปโปรไฟล์ Roblox ทันทีหลังกรอกชื่อ (รอไม่เกิน 2.5 วินาที กันอินเทอร์แอคชันหมดเวลา)
        flow.pfp = await withTimeout(getRobloxPfp(flow.ign), 2500, DEFAULT_PFP);

        const cat      = CATALOG[flow.type];
        const itemList = flow.items.map(i => `🔹 **${itemName(i)}** — ราคา ${fmt(i.rate)}฿ / ชิ้น`).join('\n');

        const embed = new EmbedBuilder()
            .setAuthor({ name: `☄️ ${BRAND.name} SHOP`, iconURL: client.user.displayAvatarURL() })
            .setTitle(`${cat.emoji} ยืนยันข้อมูลลูกค้า`)
            .setColor(cat.color)
            .setThumbnail(flow.pfp)
            .setDescription(
                `${box('✅ **ข้อมูลของคุณ**')}\n\n🎮 IGN: **${flow.ign}**\n📞 เบอร์: **${flow.phone}**\n\n${LINE}\n` +
                `📦 **สินค้าที่เลือก:**\n${itemList}\n${LINE}\n\n💡 กด **NEXT ➡️** เพื่อระบุจำนวนสินค้า\n\nอัปเดตเมื่อ: <t:${nowTs()}:F>`
            )
            .setFooter({ text: `${BRAND.name} SHOP • Step 2/5 — ยืนยันข้อมูล` });

        await replyOrUpdate(interaction, {
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('flow_next_amount').setLabel('NEXT ➡️ กรอกข้อมูลจำนวน').setEmoji(EMOJI.stock).setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancel_order').setLabel('ยกเลิก').setEmoji(EMOJI.cancel).setStyle(ButtonStyle.Danger)
            )]
        });
        return true;
    }

    // ── STEP 4 (และปุ่มแก้ไขจำนวน) ─────────────────────────────
    if (interaction.isButton() && (id === 'flow_next_amount' || id === 'flow_edit_amount')) {
        const flow = orderFlow[uid];
        if (!flow?.items) { await tell(interaction, '❌ ไม่พบออเดอร์ กรุณาเริ่มใหม่'); return true; }

        const editing = id === 'flow_edit_amount';
        const modal   = new ModalBuilder()
            .setCustomId('flow_amount_submit')
            .setTitle(editing ? '✏️ แก้ไขจำนวนสินค้า' : '📦 กรอกจำนวนสินค้า');

        modal.addComponents(flow.items.slice(0, 5).map(item => {
            const input = new TextInputBuilder()
                .setCustomId(`qty_${item.key}`)
                .setLabel(`จำนวน: ${item.label}`.slice(0, 45))
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('เช่น 5k / 3.3 / 5พัน / 10000')
                .setRequired(true);
            if (editing && flow.amounts?.[item.key]) input.setValue(String(flow.amounts[item.key]));
            return new ActionRowBuilder().addComponents(input);
        }));

        await interaction.showModal(modal);
        return true;
    }

    // ── STEP 5 ───────────────────────────────────────────────
    if (interaction.isModalSubmit() && id === 'flow_amount_submit') {
        const flow = orderFlow[uid];
        if (!flow?.items) { await tell(interaction, '❌ ไม่พบออเดอร์ กรุณาเริ่มใหม่'); return true; }

        const cat     = CATALOG[flow.type];
        const amounts = {};
        for (const item of flow.items)
            amounts[item.key] = parseAmount(interaction.fields.getTextInputValue(`qty_${item.key}`));

        if (ENFORCE_LIMIT) {
            const over = flow.items.filter(i => cat.items[i.key]?.limit && amounts[i.key] > cat.items[i.key].limit);
            if (over.length) {
                await tell(interaction,
                    `❌ **เกินลิมิตต่อรอบ**\n` +
                    over.map(i => `• ${itemName(i)}: สั่ง ${fmt(amounts[i.key])} (สูงสุด ${fmt(cat.items[i.key].limit)})`).join('\n') +
                    `\n\nกดปุ่ม **NEXT / แก้ไขจำนวน** เพื่อกรอกใหม่อีกครั้ง`);
                return true;
            }
        }

        flow.amounts = amounts;
        const { total, detail } = buildOrderDetail(flow.items, amounts);
        flow.total  = total;
        flow.detail = detail;

        const embed = new EmbedBuilder()
            .setAuthor({ name: `☄️ ${BRAND.name} SHOP`, iconURL: client.user.displayAvatarURL() })
            .setTitle('🧾 สรุปออเดอร์ของคุณ')
            .setColor(cat.color)
            .setDescription(`${box('📋 **ORDER SUMMARY**')}\n\n${flow.detail}${LINE}`)
            .addFields(
                { name: '🎮 IGN',     value: `\`${flow.ign}\``,                  inline: true  },
                { name: '📞 เบอร์',   value: `\`${flow.phone}\``,                inline: true  },
                { name: '📦 หมวด',    value: `${cat.emoji} ${cat.label}`,        inline: true  },
                { name: '💰 ยอดรวม',  value: `**${fmt(total)} บาท**`,            inline: false }
            )
            .setFooter({ text: `${BRAND.name} SHOP • Step 3/5 — ยืนยันออเดอร์ | ${new Date().toLocaleString('th-TH')}` });

        await replyOrUpdate(interaction, {
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('flow_confirm')    .setLabel('✅ ยืนยันการสั่งซื้อ').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('flow_edit_amount').setLabel('✏️ แก้ไขจำนวน')      .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('cancel_order')    .setLabel('❌ ยกเลิก')           .setStyle(ButtonStyle.Danger)
            )]
        });
        return true;
    }

    // ── STEP 6 ───────────────────────────────────────────────
    if (interaction.isButton() && id === 'flow_confirm') {
        const flow = orderFlow[uid];
        if (!flow?.items || !flow.ign || !flow.amounts) { await tell(interaction, '❌ ไม่พบออเดอร์ กรุณาเริ่มใหม่'); return true; }
        if (flow.submitting || isSpam(uid)) { await tell(interaction, '⏳ กำลังสร้างออเดอร์ กรุณารอสักครู่'); return true; }

        const cat = CATALOG[flow.type];

        // เช็กสต็อกก่อนสร้างห้อง
        if (cat.trackStock) {
            for (const item of flow.items) {
                const stockItem = cat.items[item.key];
                const qty       = flow.amounts[item.key] ?? 1;
                if (!stockItem) { await tell(interaction, '❌ รายการนี้ถูกอัปเดตแล้ว กรุณากดเริ่มสั่งใหม่'); return true; }
                if (stockItem.stock < qty) {
                    await tell(interaction, `❌ **${item.label}** มีไม่พอ (สต็อกเหลือ ${fmt(stockItem.stock)})`);
                    return true;
                }
            }
        }

        flow.submitting = true;
        await interaction.deferReply({ flags: EPHEMERAL });

        try {
            const qNum = queueCount++;
            saveData();

            const pfpUrl  = flow.pfp || await getRobloxPfp(flow.ign);
            const channel = await interaction.guild.channels.create({
                name:   `คิว-${flow.type}-${qNum}`,
                parent: TICKET_CATEGORY_ID,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny:  [PermissionFlagsBits.ViewChannel] },
                    { id: uid,                  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: ADMIN_ROLE_ID,        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const data = {
                type:       flow.type,
                items:      flow.items,
                amounts:    flow.amounts,
                total:      flow.total,
                detail:     flow.detail,
                ign:        flow.ign,
                phone:      flow.phone,
                userId:     uid,
                pfp:        pfpUrl,
                qNum,
                status:     'waiting',
                assigneeId: null,
                createdAt:  Date.now()
            };
            activeTicketData[channel.id] = data;
            saveTickets();

            const msg = await channel.send({
                content:    `🔔 <@&${ADMIN_ROLE_ID}> ออเดอร์ใหม่!`,
                embeds:     [buildTicketEmbed(data)],
                components: [ticketButtons()]
            });
            data.mainMsgId = msg.id;
            saveTickets();

            delete orderFlow[uid];
            await interaction.editReply({ content: `✅ สร้าง Ticket สำเร็จ! คลิก: ${channel}` });
        } catch (err) {
            flow.submitting = false;
            throw err;
        }
        return true;
    }

    return false;
}

// ==========================================
// [ 11. TICKET — ปุ่มในห้องออเดอร์: รับงาน / เสร็จสิ้น / ปิดห้อง ]
// ==========================================
const TICKET_IDS = ['btn_work', 'btn_done', 'btn_close'];

async function handleTicketButtons(interaction) {
    const id = interaction.customId;
    if (!TICKET_IDS.includes(id)) return false;

    const uid  = interaction.user.id;
    const data = activeTicketData[interaction.channelId];
    if (!data) { await tell(interaction, '❌ ไม่พบข้อมูลออเดอร์นี้ (อาจปิดไปแล้ว)'); return true; }

    const deny     = () => tell(interaction, '❌ เฉพาะแอดมินหรือผู้รับงานเท่านั้น');
    const finished = data.status === 'done';

    // ── รับงาน ───────────────────────────────────────────────
    if (id === 'btn_work') {
        if (!canHandle(interaction.member, data)) { await deny(); return true; }
        if (finished) { await tell(interaction, '✅ ออเดอร์นี้เสร็จสิ้นแล้ว'); return true; }
        if (data.assigneeId && data.assigneeId !== uid) {
            await tell(interaction, `📌 งานนี้มีผู้รับงานแล้ว: <@${data.assigneeId}>`);
            return true;
        }

        data.assigneeId = uid;
        data.status     = 'accepted';
        saveTickets();

        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('🛠️ รับออเดอร์แล้ว')
            .setDescription(
                `${box('👨‍💻 ทีมงานรับออเดอร์แล้ว')}\n\n👤 ผู้รับผิดชอบ: <@${uid}>\n` +
                `📦 ออเดอร์ของคุณกำลังเข้าสู่ขั้นตอนดำเนินการ\n⏳ กรุณารอสักครู่นะคะ\n\nอัปเดตเมื่อ: <t:${nowTs()}:F>`
            )
            .setFooter({ text: `${BRAND.name} • In Progress` });

        await interaction.reply({ content: `<@${data.userId}>`, embeds: [embed] });
        interaction.channel.setName(`🛠️-รับงาน-${data.qNum}`).catch(() => {});
        await refreshTicketEmbed(interaction.channelId);
        return true;
    }

    // ── เสร็จสิ้น ────────────────────────────────────────────
    if (id === 'btn_done') {
        if (!canHandle(interaction.member, data)) { await deny(); return true; }
        if (finished) { await tell(interaction, '✅ ออเดอร์นี้เสร็จสิ้นแล้ว'); return true; }

        await interaction.deferUpdate();

        if (!data.assigneeId) data.assigneeId = uid;
        data.status      = 'done';
        data.doneAt      = Date.now();
        data.autoCloseAt = data.doneAt + AUTO_CLOSE_MS;
        saveTickets();
        scheduleAutoClose(interaction.channelId, data.autoCloseAt);

        // ตัดสต็อกตามจำนวนจริงของแต่ละรายการ
        const cat = CATALOG[data.type];
        if (cat?.trackStock && data.items && data.amounts) {
            const changes = [];
            for (const it of data.items) {
                const item = cat.items[it.key];
                if (!item) continue;
                const qty    = Number(data.amounts[it.key]) || 0;
                const before = item.stock;
                item.stock   = Math.max(0, before - qty);
                changes.push({ item, before, after: item.stock });
            }
            saveStock();
            await sendStockLog(data.type, { action: `🧾 ตัดสต็อกจากออเดอร์ #${data.qNum}`, adminId: uid, changes });
        }

        // คูลดาวน์ + ส่ง log ไปห้องคูลดาวน์ของหมวดนั้น (ลูกค้าที่มียศแอดมินไม่ติดคูลดาวน์)
        const customerMember = await interaction.guild.members.fetch(data.userId).catch(() => null);
        if (cat?.cooldown > 0 && !isAdmin(customerMember)) {
            if (!userCooldowns[data.userId]) userCooldowns[data.userId] = {};
            userCooldowns[data.userId][data.type] = Date.now() + cat.cooldown;
            saveData();

            const cooldownChannel = client.channels.cache.get(cat.cooldownLog || COOLDOWN_LOG_CHANNEL_ID);
            if (cooldownChannel) {
                const expire = Math.floor((Date.now() + cat.cooldown) / 1000);
                cooldownChannel.send({ embeds: [
                    new EmbedBuilder()
                        .setAuthor({ name: `🧊 ${BRAND.name} COOLDOWN SYSTEM`, iconURL: client.user.displayAvatarURL() })
                        .setColor('#00D1FF').setThumbnail(data.pfp)
                        .setDescription(
                            `${box('   🧊 **COOLDOWN ACTIVATED**')}\n\n👤 **ลูกค้า:** <@${data.userId}>\n` +
                            `📦 **หมวด:** \`${data.type.toUpperCase()}\`\n\n⏳ **ใช้งานได้อีกครั้ง:**\n<t:${expire}:F>  (<t:${expire}:R>)\n\n` +
                            `${LINE}\n💡 ระบบคูลดาวน์อัตโนมัติ\n\nอัปเดตเมื่อ: <t:${nowTs()}:F>`
                        )
                        .setFooter({ text: `Queue #${data.qNum} • ${BRAND.name}`, iconURL: client.user.displayAvatarURL() })
                ]}).catch(console.error);
            }
        }

        // ข้อความเสร็จสิ้น: รูป Roblox ของลูกค้า + ข้อความขอบคุณ (ไม่มีหัวข้อ/ฟุตเตอร์ ไม่ตัดข้อความ)
        const cooldownRoom    = cat?.cooldownLog || COOLDOWN_LOG_CHANNEL_ID;
        const completionEmbed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setThumbnail(data.pfp)
            .setDescription(
                `# ${DONE_EMOJI_THANKS} ขอบคุณที่ใช้บริการร้านเรานะคะ\n` +

                `__เช็ค คลูดาวสั่งฟามได้ที่ห้อง         <#${cooldownRoom}>__\n` +
                ` ถ้าไม่รบกวนทางเราฝากลูกค้ารีวิวในห้องนี้ <#${REVIEW_CHANNEL_ID}> ให้หน่อยนะคะ ${DONE_EMOJI_REVIEW}`
            );

        await interaction.editReply({ embeds: [buildTicketEmbed(data)], components: [ticketButtons({ finished: true })] }).catch(console.error);
        await interaction.channel.send({ content: `<@${data.userId}>`, embeds: [completionEmbed] });
        interaction.channel.setName(`✅-เสร็จงาน-${data.qNum}`).catch(() => {});
        return true;
    }

    // ── ปิดห้อง: ส่งสรุป logs แล้วลบห้อง (ไม่มีข้อความแจ้งในห้อง) ──
    if (id === 'btn_close') {
        if (!canHandle(interaction.member, data)) { await deny(); return true; }

        await interaction.deferUpdate().catch(() => {});
        await closeTicket(interaction.channelId, { by: uid });
        return true;
    }

    return false;
}

// ==========================================
// [ 12. STOCK PANEL — เติม/ลด/ตั้งค่าสต็อกในดิส ]
// ==========================================
//  !stockpanel → แผงปุ่ม  ➕เติม  ➖ลด  ✏️ตั้งค่า  📊ดู  📢ประกาศ
//  กดปุ่ม → เลือกสินค้า (ได้สูงสุด 5 อย่าง) → กรอกจำนวน → อัปเดต + log + ปุ่ม "ประกาศ"
const STOCK_MODES = {
    add: { title: '➕ เติมสต็อก',     hint: 'จำนวนที่จะเติมเพิ่ม', log: '➕ เติมสต็อก',     color: '#2ECC71' },
    sub: { title: '➖ ลดสต็อก',       hint: 'จำนวนที่จะลดออก',    log: '➖ ลดสต็อก',       color: '#E74C3C' },
    set: { title: '✏️ ตั้งค่าสต็อก',  hint: 'จำนวนสต็อกใหม่',     log: '✏️ ตั้งค่าสต็อก',  color: '#F1C40F' }
};

function applyStock(type, key, mode, amount) {
    const item   = CATALOG[type].items[key];
    const before = item.stock;
    item.stock   = mode === 'add' ? before + amount
                 : mode === 'sub' ? Math.max(0, before - amount)
                 : amount;
    return { item, before, after: item.stock };
}

function stockOptions() {
    return STOCK_TYPES.flatMap(type =>
        Object.entries(CATALOG[type].items).map(([key, item]) => ({
            label:       item.label,
            value:       `${type}:${key}`,
            description: `${CATALOG[type].label} • คงเหลือ ${fmt(item.stock)}`,
            emoji:       emojiObj(item.emoji)
        }))
    ).slice(0, 25);
}

async function handleStockPanel(interaction) {
    const id = interaction.customId;
    if (!id.startsWith('stk_')) return false;

    if (!isAdmin(interaction.member)) { await tell(interaction, '❌ เฉพาะแอดมินเท่านั้น'); return true; }
    const uid = interaction.user.id;

    // ── ดูสต็อก ──
    if (interaction.isButton() && id === 'stk_view') {
        await interaction.reply({ embeds: [buildStockOverviewEmbed()], flags: EPHEMERAL });
        return true;
    }

    // ── ประกาศสต็อกทั้งหมด (จากแผง) ──
    if (interaction.isButton() && id === 'stk_announce_all') {
        const draft = createDraft(uid, 'stock', {}, ANNOUNCE_CHANNEL_ID || null);
        await interaction.reply({ ...draftPayload(draft), flags: EPHEMERAL });
        return true;
    }

    // ── เริ่ม เติม / ลด / ตั้งค่า ──
    if (interaction.isButton() && ['stk_add', 'stk_sub', 'stk_set'].includes(id)) {
        const mode    = id.slice(4);
        const options = stockOptions();
        if (!options.length) { await tell(interaction, '❌ ไม่มีสินค้าที่นับสต็อก'); return true; }

        stockFlow[uid] = { mode };
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle(STOCK_MODES[mode].title)
                .setColor(STOCK_MODES[mode].color)
                .setDescription('เลือกสินค้าที่ต้องการจากเมนูด้านล่าง (เลือกได้สูงสุด **5 อย่าง** ต่อครั้ง)\nจากนั้นระบบจะให้กรอกจำนวนทีละรายการ')],
            components: [new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('stk_pick')
                    .setPlaceholder('เลือกสินค้า...')
                    .setMinValues(1)
                    .setMaxValues(Math.min(5, options.length))
                    .addOptions(options)
            )],
            flags: EPHEMERAL
        });
        return true;
    }

    // ── เลือกสินค้าแล้ว → modal กรอกจำนวน ──
    if (interaction.isStringSelectMenu() && id === 'stk_pick') {
        const flow = stockFlow[uid];
        if (!flow) { await interaction.update({ content: '⌛ หมดเวลา กรุณากดปุ่มจากแผงสต็อกใหม่', embeds: [], components: [] }); return true; }

        const picks = interaction.values
            .map(v => { const [type, key] = v.split(':'); return CATALOG[type]?.trackStock && CATALOG[type].items[key] ? { type, key } : null; })
            .filter(Boolean);
        if (!picks.length) { await tell(interaction, '❌ ไม่พบสินค้าที่เลือก (เรทอาจถูกอัปเดต) กรุณากดใหม่'); return true; }

        flow.picks = picks;
        const mode  = STOCK_MODES[flow.mode];
        const modal = new ModalBuilder().setCustomId('stk_modal').setTitle(mode.title);
        picks.forEach((p, i) => {
            const item = CATALOG[p.type].items[p.key];
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(`qty_${i}`)
                    .setLabel(`${item.label} (ตอนนี้ ${fmt(item.stock)})`.slice(0, 45))
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(`${mode.hint} เช่น 50 / 1k / 5พัน`)
                    .setRequired(true)
            ));
        });
        await interaction.showModal(modal);
        return true;
    }

    // ── กรอกจำนวนเสร็จ → อัปเดตสต็อก ──
    if (interaction.isModalSubmit() && id === 'stk_modal') {
        const flow = stockFlow[uid];
        if (!flow?.picks) { await tell(interaction, '⌛ หมดเวลา กรุณากดปุ่มจากแผงสต็อกใหม่'); return true; }

        const mode   = STOCK_MODES[flow.mode];
        const parsed = flow.picks.map((p, i) => ({ ...p, qty: parseNumber(interaction.fields.getTextInputValue(`qty_${i}`)) }));
        const bad    = parsed.filter(p => p.qty === null || (flow.mode !== 'set' && p.qty <= 0));
        if (bad.length) {
            await tell(interaction, `❌ จำนวนไม่ถูกต้อง: ${bad.map(p => `**${CATALOG[p.type].items[p.key].label}**`).join(', ')}\nกรอกเป็นตัวเลข เช่น 50 / 1k / 5พัน แล้วกดปุ่มใหม่อีกครั้ง`);
            return true;
        }

        const changes = parsed.map(p => ({ type: p.type, ...applyStock(p.type, p.key, flow.mode, p.qty) }));
        saveStock();

        for (const type of new Set(changes.map(c => c.type)))
            await sendStockLog(type, { action: mode.log, adminId: uid, changes: changes.filter(c => c.type === type) });

        // ข้อความสำหรับปุ่ม "ประกาศ" — เฉพาะรายการที่สต็อกเพิ่มขึ้น
        const refilled = changes.filter(c => c.after > c.before);
        flow.announce  = refilled.map(c =>
            `• ${itemName(c.item)} — เติมเพิ่ม **+${fmt(c.after - c.before)}** (คงเหลือ **${fmt(c.after)}**)`
        ).join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`${mode.title} สำเร็จ`)
            .setColor(mode.color)
            .setDescription(changes.map(c => `${CATALOG[c.type].emoji} ${formatChange(c).slice(2)}`).join('\n'))
            .setFooter({ text: 'บันทึก log ในห้องสต็อกแล้ว' });

        const components = refilled.length ? [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('stk_announce').setLabel('ประกาศเติมสต็อกนี้').setEmoji(EMOJI.announce).setStyle(ButtonStyle.Primary)
        )] : [];

        await replyOrUpdate(interaction, { embeds: [embed], components });
        return true;
    }

    // ── ปุ่มประกาศหลังเติมสต็อก → เปิดตัวสร้างประกาศ (เทมเพลต "เติมสต็อก") ──
    if (interaction.isButton() && id === 'stk_announce') {
        const flow = stockFlow[uid];
        if (!flow?.announce) { await interaction.update({ content: '⌛ ไม่พบข้อมูลที่จะประกาศ', embeds: [], components: [] }); return true; }
        const draft = createDraft(uid, 'stock', { refill: flow.announce }, ANNOUNCE_CHANNEL_ID || null);
        await interaction.update({ ...draftPayload(draft), embeds: [buildDraftEmbed(draft)] });
        return true;
    }

    return false;
}

// ==========================================
// [ 12.5 RATE PANEL — แก้เรทราคา / ลิมิต ในดิส (ไม่ต้องแตะโค้ด) ]
// ==========================================
//  !ratepanel → แผงปุ่ม  ✏️แก้เรทราคา  🎯แก้ลิมิต  📊ดูเรท  🔄อัปเดตห้องเรท
//  กดปุ่มแก้ → เลือกหมวด → เลือกสินค้า (สูงสุด 5 อย่าง) → กรอกค่าใหม่
//  → บันทึกลง rate_overrides.json + แก้ข้อความในห้องเรทให้เอง + เมนูสั่งซื้อใช้เรทใหม่ทันที
const RATE_MODES = {
    price: { field: 'rate',  title: '✏️ แก้เรทราคา',     hint: 'ราคาใหม่ต่อชิ้น เช่น 55 / 5k',            color: '#F1C40F' },
    limit: { field: 'limit', title: '🎯 แก้ลิมิตต่อรอบ', hint: 'ลิมิตใหม่ เช่น 5000 / 5k (0 = ไม่จำกัด)', color: '#3498DB' }
};
const rateFlow = {};   // { userId: { mode, type, picks } }
const rateValue = (item, field) => (field === 'rate' ? item.rate : (item.limit || 0));

async function handleRatePanel(interaction) {
    const id = interaction.customId;
    if (!id.startsWith('rt_')) return false;

    if (!isAdmin(interaction.member)) { await tell(interaction, '❌ เฉพาะแอดมินเท่านั้น'); return true; }
    const uid     = interaction.user.id;
    const expired = () => interaction.isMessageComponent()
        ? interaction.update({ content: '⌛ หมดเวลา กรุณากดปุ่มจากแผงเรทใหม่', embeds: [], components: [] })
        : tell(interaction, '⌛ หมดเวลา กรุณากดปุ่มจากแผงเรทใหม่');

    // ── ดูเรททั้งหมด ──
    if (interaction.isButton() && id === 'rt_view') {
        const embed = new EmbedBuilder()
            .setTitle(`${EMOJI.rate} เรทราคาปัจจุบัน`)
            .setColor(BRAND.color)
            .addFields(TYPES.map(t => ({
                name:  CATALOG[t].label,
                value: Object.values(CATALOG[t].items)
                    .map(it => `• ${it.label} — **${fmt(it.rate)}**${it.limit ? ` (ลิมิต ${fmtShort(it.limit)})` : ''}`)
                    .join('\n').slice(0, 1024)
            })));
        await interaction.reply({ embeds: [embed], flags: EPHEMERAL });
        return true;
    }

    // ── อัปเดตข้อความในห้องเรททุกหมวด ──
    if (interaction.isButton() && id === 'rt_sync') {
        await interaction.deferReply({ flags: EPHEMERAL });
        const lines = [];
        for (const t of TYPES) {
            const ok = await publishRate(t, CATALOG[t].rateChannel).catch(() => false);
            lines.push(`${ok ? '✅' : '❌'} ${CATALOG[t].label}`);
        }
        await interaction.editReply({ content: `📊 อัปเดตห้องเรทแล้ว\n${lines.join('\n')}` });
        return true;
    }

    // ── เริ่มแก้ราคา / ลิมิต → เลือกหมวด ──
    if (interaction.isButton() && (id === 'rt_price' || id === 'rt_limit')) {
        const mode = id.slice(3);   // 'price' | 'limit'
        rateFlow[uid] = { mode };
        const select = new StringSelectMenuBuilder()
            .setCustomId('rt_cat')
            .setPlaceholder('เลือกหมวดสินค้า...')
            .addOptions(TYPES.map(t => ({ label: CATALOG[t].label, value: t, description: `${Object.keys(CATALOG[t].items).length} รายการ` })));
        await interaction.reply({
            embeds: [new EmbedBuilder().setTitle(RATE_MODES[mode].title).setColor(RATE_MODES[mode].color).setDescription('เลือก **หมวดสินค้า** ที่ต้องการแก้')],
            components: [new ActionRowBuilder().addComponents(select)],
            flags: EPHEMERAL
        });
        return true;
    }

    // ── เลือกหมวดแล้ว → เลือกสินค้า ──
    if (interaction.isStringSelectMenu() && id === 'rt_cat') {
        const flow = rateFlow[uid];
        const type = interaction.values[0];
        const cat  = CATALOG[type];
        if (!flow || !cat) { await expired(); return true; }

        flow.type = type;
        const mode    = RATE_MODES[flow.mode];
        const entries = Object.entries(cat.items).slice(0, 25);
        const select  = new StringSelectMenuBuilder()
            .setCustomId('rt_pick')
            .setPlaceholder('เลือกสินค้า (สูงสุด 5 อย่างต่อครั้ง)')
            .setMinValues(1)
            .setMaxValues(Math.min(5, entries.length))
            .addOptions(entries.map(([key, it]) => ({
                label:       it.label.slice(0, 100),
                value:       key,
                description: `ตอนนี้: ${flow.mode === 'limit' && !it.limit ? 'ไม่จำกัด' : fmt(rateValue(it, mode.field))}`,
                emoji:       emojiObj(it.emoji)
            })));
        await interaction.update({
            embeds: [new EmbedBuilder().setTitle(`${mode.title} — ${cat.label}`).setColor(mode.color).setDescription('เลือก **สินค้า** ที่ต้องการแก้ (เลือกได้สูงสุด 5 อย่าง)')],
            components: [new ActionRowBuilder().addComponents(select)]
        });
        return true;
    }

    // ── เลือกสินค้าแล้ว → กรอกค่าใหม่ ──
    if (interaction.isStringSelectMenu() && id === 'rt_pick') {
        const flow = rateFlow[uid];
        const cat  = flow?.type && CATALOG[flow.type];
        if (!cat) { await expired(); return true; }

        const picks = interaction.values.filter(k => cat.items[k]);
        if (!picks.length) { await tell(interaction, '❌ ไม่พบสินค้าที่เลือก กรุณากดปุ่มจากแผงเรทใหม่'); return true; }

        flow.picks = picks;
        const mode  = RATE_MODES[flow.mode];
        const modal = new ModalBuilder().setCustomId('rt_modal').setTitle(mode.title.slice(0, 45));
        picks.forEach((key, i) => {
            const it = cat.items[key];
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(`v_${i}`)
                    .setLabel(String(it.label).slice(0, 45))
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(rateValue(it, mode.field)))
                    .setPlaceholder(mode.hint)
                    .setRequired(true)
            ));
        });
        await interaction.showModal(modal);
        return true;
    }

    // ── กรอกเสร็จ → บันทึก + แก้ข้อความในห้องเรท ──
    if (interaction.isModalSubmit() && id === 'rt_modal') {
        const flow = rateFlow[uid];
        const cat  = flow?.picks && CATALOG[flow.type];
        if (!cat) { await expired(); return true; }

        const mode   = RATE_MODES[flow.mode];
        const parsed = flow.picks.map((key, i) => ({
            key, item: cat.items[key], value: parseNumber(interaction.fields.getTextInputValue(`v_${i}`))
        }));
        const bad = parsed.filter(p => !p.item || p.value === null || (mode.field === 'rate' && p.value <= 0));
        if (bad.length) {
            await tell(interaction, `❌ ค่าไม่ถูกต้อง: ${bad.map(p => `**${p.item?.label ?? p.key}**`).join(', ')}\nกรอกเป็นตัวเลข เช่น 55 / 5k แล้วกดปุ่มจากแผงใหม่อีกครั้ง`);
            return true;
        }

        if (interaction.isFromMessage()) await interaction.deferUpdate();
        else await interaction.deferReply({ flags: EPHEMERAL });

        const changes = parsed.map(({ key, item, value }) => {
            const before = rateValue(item, mode.field);
            if (mode.field === 'rate') item.rate = value;
            else if (value > 0)        item.limit = value;
            else                       delete item.limit;

            ((rateOverrides[flow.type] ??= {})[key] ??= {})[mode.field] = value;
            return { item, before, after: value };
        });
        saveRateOverrides();

        const refreshed = await publishRate(flow.type, cat.rateChannel).catch(() => false);
        delete rateFlow[uid];

        const show  = (v) => (mode.field === 'limit' && !v ? 'ไม่จำกัด' : fmt(v));
        const lines = changes.map(c => `• ${itemName(c.item)}: \`${show(c.before)}\` → \`${show(c.after)}\``).join('\n');
        await interaction.editReply({
            content: '',
            embeds: [new EmbedBuilder()
                .setTitle(`${mode.title} สำเร็จ`)
                .setColor(mode.color)
                .setDescription(`**${cat.label}**\n${lines}`)
                .setFooter({ text: refreshed ? 'อัปเดตข้อความในห้องเรทแล้ว' : 'บันทึกแล้ว แต่อัปเดตห้องเรทไม่สำเร็จ — กดปุ่ม 🔄 ในแผงเรท' })],
            components: []
        });
        return true;
    }

    return false;
}

// ==========================================
// [ 13. EMBED CREATOR — ระบบสร้างประกาศ (Embed) ]
// ==========================================
//  !embed                → เมนูเลือก "หัวข้อ" (เทมเพลต)
//  !embed stock          → ใช้คีย์ลัดเปิดเทมเพลตนั้นทันที  (ใส่ #ห้อง ต่อท้ายเพื่อกำหนดห้องปลายทางได้)
//  ตัวแปรที่ใส่ในข้อความได้:
//     {time}  {refill}  {stock_all}  {stock_food}  {stock_buy}
//     {rate_buy}  {rate_sell}  {rate_farm}  {rate_food}   ← อ่านจาก CATALOG อัตโนมัติ
const EMBED_TEMPLATES = {
    stock: {
        icon: '📦', name: 'เติมสต็อกแล้ว', desc: 'ประกาศสินค้าเติมใหม่ / พร้อมขาย', color: '#2ECC71',
        title: '📦 เติมสต็อกแล้ว!',
        description: '✨ **สินค้าเติมสต็อกแล้ว พร้อมให้สั่งซื้อ!**\n\n{refill}\n\n🛒 สั่งซื้อได้ที่ห้องร้านค้าเลยนะคะ\n\nอัปเดตเมื่อ: {time}'
    },
    new: {
        icon: '🆕', name: 'สินค้าใหม่', desc: 'ประกาศสินค้า/บริการใหม่เข้าร้าน', color: '#3498DB',
        title: '🆕 สินค้าใหม่เข้าร้าน!',
        description: '✨ มีสินค้าใหม่มาให้เลือกแล้ว\n\n• (ใส่รายการสินค้าตรงนี้)\n\nอัปเดตเมื่อ: {time}'
    },
    rate: {
        icon: '💰', name: 'ปรับเรทราคา', desc: 'แจ้งเรทราคาใหม่ (ดึงจากเรทปัจจุบัน)', color: '#F1C40F',
        title: '💰 อัปเดตเรทราคาใหม่!',
        description: '📢 ร้านปรับเรทราคาใหม่ทั้งหมด\n\n**🛒 ซื้อของ**\n{rate_buy}\n\n**💰 ขายของ**\n{rate_sell}\n\nเรทฟาร์ม / อาหาร ดูได้ที่ห้องเรทค่ะ\n\nมีผลตั้งแต่: {time}'
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

function createDraft(ownerId, key, vars = {}, channelId = null) {
    const t = EMBED_TEMPLATES[key] || EMBED_TEMPLATES.custom;
    const draft = {
        ownerId, key: EMBED_TEMPLATES[key] ? key : 'custom',
        title: t.title, description: t.description, color: t.color,
        image: '', footer: `${BRAND.name} • ประกาศ`,
        ping: 'none', channelId, vars
    };
    embedDrafts.set(ownerId, draft);
    return draft;
}

/** แทนตัวแปร {xxx} ในข้อความประกาศ ณ ตอนแสดง/ตอนส่ง (ค่าสต็อก/เรทจึงเป็นค่าล่าสุดเสมอ) */
function expandVars(text, draft) {
    const map = {
        time:       `<t:${nowTs()}:F>`,
        refill:     draft?.vars?.refill || allStockText(),
        stock_all:  allStockText()
    };
    for (const t of TYPES)       map[`rate_${t}`]  = rateLines(t);
    for (const t of STOCK_TYPES) map[`stock_${t}`] = stockLines(t);
    return String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (map[k] !== undefined ? map[k] : m));
}

function buildDraftEmbed(draft) {
    const embed = new EmbedBuilder().setColor(/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : BRAND.color);

    const title = expandVars(draft.title, draft).trim();
    let   desc  = expandVars(draft.description, draft).trim();
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
            (notice ? `\n${notice}` : ''),
        embeds: [buildDraftEmbed(draft)],
        components: [
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
            field('desc',   'รายละเอียด (ใส่ {time} {stock_all} ได้)', TextInputStyle.Paragraph, draft.description, 4000,
                  'ตัวแปร: {time} {refill} {stock_all} {rate_buy} {rate_sell} {rate_farm} {rate_food}'),
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
        const draft = createDraft(uid, key, {}, embedTargets.get(uid) ?? (ANNOUNCE_CHANNEL_ID || null));
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

    if (interaction.isStringSelectMenu() && action === 'emb_ping') {
        draft.ping = interaction.values[0];
        await interaction.update(draftPayload(draft));
        return true;
    }

    if (!interaction.isButton()) return false;

    if (action === 'emb_edit') { await interaction.showModal(buildEditModal(draft)); return true; }

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
const RATE_ALIASES = { '!farmrate': 'farm', '!buyrate': 'buy', '!sellrate': 'sell', '!foodrate': 'food' };

client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith('!')) return;
    if (!isAdmin(message.member)) return;

    const args    = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        if (RATE_ALIASES[command]) return await sendRates(message, RATE_ALIASES[command]);

        switch (command) {
            case '!adminhelp':
            case '!help':           return await cmdHelp(message);
            case '!setupshop':
            case '!setupxin': return await cmdSetupShop(message);
            case '!stockpanel':     return await cmdStockPanel(message);
            case '!ratepanel':      return await cmdRatePanel(message);
            case '!embed':          return await cmdEmbed(message, args);
            case '!rate':           return await sendRates(message, args[0]?.toLowerCase());
            case '!addstock':       return await cmdStockText(message, args, 'add', command);
            case '!delstock':       return await cmdStockText(message, args, 'sub', command);
            case '!clearallstock':  return await cmdClearStock(message, args);
        }
    } catch (err) {
        console.error('❌ Command Error:', err);
        message.reply('❌ เกิดข้อผิดพลาดในการใช้คำสั่ง').catch(() => {});
    }
});

async function cmdRatePanel(message) {
    const embed = new EmbedBuilder()
        .setTitle(`${EMOJI.rate} แผงจัดการเรทราคา`)
        .setColor('#F1C40F')
        .setDescription(
            `${box('   💲 **RATE CONTROL**')}\n\n` +
            `✏️ **แก้เรทราคา** — เลือกหมวด/สินค้า แล้วกรอกราคาใหม่\n` +
            `🎯 **แก้ลิมิต** — แก้ลิมิตต่อรอบ (0 = ไม่จำกัด)\n` +
            `📊 **ดูเรท** — ดูเรทปัจจุบันทั้งหมด\n` +
            `🔄 **อัปเดตห้องเรท** — แก้ข้อความเรททุกห้องให้ตรงกับเรทล่าสุด\n\n` +
            `💡 แก้แล้วบอทแก้ข้อความในห้องเรทให้เอง และเมนูสั่งซื้อใช้เรทใหม่ทันที (ออเดอร์ที่เปิดอยู่แล้วใช้ราคาเดิม)\n` +
            `🔒 ใช้ได้เฉพาะแอดมิน`
        )
        .setFooter({ text: `${BRAND.name} • Rate System` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rt_price').setLabel('แก้เรทราคา').setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rt_limit').setLabel('แก้ลิมิต').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rt_view').setLabel('ดูเรท').setEmoji(EMOJI.rate).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('rt_sync').setLabel('อัปเดตห้องเรท').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
    );
    return message.channel.send({ embeds: [embed], components: [row] });
}

async function cmdHelp(message) {
    const tpl = Object.entries(EMBED_TEMPLATES).map(([k, t]) => `\`${k}\` ${t.icon} ${t.name}`).join('\n');
    return message.channel.send({ embeds: [new EmbedBuilder()
        .setTitle('📖 คำสั่งแอดมิน')
        .setColor(BRAND.color)
        .addFields(
            { name: '🛍️ ร้านค้า',  value: '`!setupshop` โพสต์แผงร้านค้า\n`!rate [buy|sell|farm|food|all]` อัปเดตเรทในห้องเรท (แก้ข้อความเดิม ไม่โพสต์ซ้ำ)' },
            { name: '📦 สต็อก',    value: '`!stockpanel` แผงเติม/ลด/ตั้งค่าสต็อก (ใช้ปุ่ม)\n`!addstock [food|buy] [item] [จำนวน]`\n`!delstock [food|buy] [item] [จำนวน]`\n`!clearallstock [food|buy]`' },
            { name: '💲 เรทราคา', value: '`!ratepanel` แผงแก้เรท/ลิมิตสินค้าในดิส (ไม่ต้องแตะโค้ด)' },
            { name: '📢 ประกาศ (Embed)', value: '`!embed` เมนูเลือกหัวข้อ\n`!embed <คีย์ลัด> [#ห้อง]` เช่น `!embed stock #ประกาศ`' },
            { name: '🔑 คีย์ลัดประกาศ', value: tpl },
            { name: '🛠️ ออเดอร์', value: 'ในห้องออเดอร์: **รับงาน** → **เสร็จสิ้น** (ตัดสต็อก/คูลดาวน์) → **ปิดห้อง**' }
        )] });
}

async function cmdSetupShop(message) {
    const services = TYPES.map(t => `${CATALOG[t].emoji}  ${CATALOG[t].label}`).join('\n');
    const embed = new EmbedBuilder()
        .setAuthor({ name: `☄️ ${BRAND.name} SHOP`, iconURL: client.user.displayAvatarURL() })
        .setTitle(`🛍️ SHOP XIN COMET NEW`)
        .setDescription(
            `${box(`✨ **ยินดีต้อนรับสู่ร้าน ${BRAND.name}** ✨`)}\n\n📌 **เลือกบริการที่ต้องการด้านล่าง**\n\n` +
            `┌───────────────┐\n${services}\n└───────────────┘\n\n💡 *กดปุ่มเพื่อเริ่มใช้งานทันที*`
        )
        .setColor(BRAND.color)
        .setImage(SHOP_BANNER)
        .setFooter({ text: `${BRAND.name} SHOP • ระบบร้านค้าอัตโนมัติ` });

    const buttons = new ActionRowBuilder().addComponents([
        ...TYPES.map(t => withEmoji(
            new ButtonBuilder()
                .setCustomId(`main_${t}`)
                .setLabel(CATALOG[t].buttonLabel || CATALOG[t].label)
                .setStyle(CATALOG[t].btnStyle),
            CATALOG[t].emoji
        )),
        withEmoji(
            new ButtonBuilder().setCustomId('contact_open').setLabel('ติดต่อ/สอบถาม').setStyle(ButtonStyle.Secondary),
            BTN_EMOJI.contact
        )
    ]);
    return message.channel.send({ embeds: [embed], components: [buttons] });
}

/** โพสต์เรทของหมวดในห้องเรท หรือแก้ข้อความเรทเดิมในห้องนั้น (ไม่โพสต์ซ้ำ)
 *  farm / food = embed หลายก้อน (ดู TEXT_RATE_BUILDERS) | หมวดอื่น = embed ก้อนเดียว */
async function publishRate(type, channelId) {
    const chan = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
    if (!chan) return false;

    const key      = `${channelId}:${type}`;
    const builder  = TEXT_RATE_BUILDERS[type];
    const payloads = builder
        ? builder().map(text => ({ content: '', embeds: [new EmbedBuilder().setDescription(text).setColor(CATALOG[type].color || BRAND.color)] }))
        : [{ content: '', embeds: [buildRateEmbed(type)] }];

    const oldIds = [].concat(rateMsgs[key] || []);   // รองรับไฟล์เก่าที่เก็บเป็น id เดียว
    const newIds = [];
    for (let i = 0; i < payloads.length; i++) {
        const old = oldIds[i] ? await chan.messages.fetch(oldIds[i]).catch(() => null) : null;
        const msg = old ? await old.edit(payloads[i]) : await chan.send(payloads[i]);
        newIds.push(msg.id);
    }
    // ข้อความเก่าที่เกินจำนวนก้อนใหม่ → ลบทิ้ง
    for (const id of oldIds.slice(payloads.length)) {
        const extra = await chan.messages.fetch(id).catch(() => null);
        if (extra) await extra.delete().catch(() => {});
    }

    rateMsgs[key] = newIds;
    saveRateMsgs();
    return true;
}

async function sendRates(message, type) {
    const targets = type === 'all' ? TYPES : (CATALOG[type] ? [type] : null);
    if (!targets)
        return message.reply(`❌ ระบุหมวดให้ถูกต้อง\nรูปแบบ: \`!rate [${TYPES.join('|')}|all]\``);

    const lines = [];
    for (const t of targets) {
        const ok = await publishRate(t, CATALOG[t].rateChannel);
        lines.push(`${ok ? '✅' : '❌'} ${CATALOG[t].label}`);
    }
    return message.reply(`📊 อัปเดตเรทแล้ว\n${lines.join('\n')}`);
}

async function cmdStockPanel(message) {
    const embed = new EmbedBuilder()
        .setTitle(`${EMOJI.stock} แผงจัดการสต็อก`)
        .setColor('#3498DB')
        .setDescription(
            `${box('   📦 **STOCK CONTROL**')}\n\n` +
            `➕ **เติมสต็อก** — เลือกสินค้า แล้วกรอกจำนวนที่เติมเพิ่ม\n` +
            `➖ **ลดสต็อก** — ลดตามจำนวนที่กรอก\n` +
            `✏️ **ตั้งค่า** — กำหนดจำนวนสต็อกใหม่ตรง ๆ\n` +
            `📊 **ดูสต็อก** — ดูสต็อกคงเหลือทั้งหมด\n` +
            `${EMOJI.announce} **ประกาศ** — สร้างประกาศ "เติมสต็อกแล้ว"\n\n` +
            `💡 กรอกจำนวนได้เช่น \`50\` \`1k\` \`5พัน\`\n🔒 ใช้ได้เฉพาะแอดมิน`
        )
        .setFooter({ text: `${BRAND.name} • Stock System` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('stk_add')         .setLabel('เติมสต็อก').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('stk_sub')         .setLabel('ลดสต็อก')  .setEmoji('➖').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('stk_set')         .setLabel('ตั้งค่า')   .setEmoji('✏️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('stk_view')        .setLabel('ดูสต็อก')  .setEmoji(EMOJI.rate).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('stk_announce_all').setLabel('ประกาศ')   .setEmoji(EMOJI.announce).setStyle(ButtonStyle.Secondary)
    );
    return message.channel.send({ embeds: [embed], components: [row] });
}

async function cmdEmbed(message, args) {
    const uid     = message.author.id;
    const mention = message.mentions.channels.first();
    const target  = mention?.id ?? (ANNOUNCE_CHANNEL_ID || message.channel.id);
    const key     = args.map(a => a.toLowerCase()).find(a => EMBED_TEMPLATES[a]);

    // คีย์ลัด: !embed stock  → เปิดตัวอย่างทันที
    if (key) {
        const draft = createDraft(uid, key, {}, target);
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
                `⚡ **คีย์ลัด** — พิมพ์ตรง ๆ ได้เลย เช่น \`!embed stock\` / \`!embed rate #ประกาศ\`\n\n` +
                Object.entries(EMBED_TEMPLATES).map(([k, t]) => `\`${k}\` ${t.icon} ${t.name}`).join('\n') +
                `\n\n📍 ห้องปลายทางตอนนี้: <#${target}> (เปลี่ยนได้ในหน้าตัวอย่าง)`
            )],
        components: [new ActionRowBuilder().addComponents(select)]
    });
}

async function cmdStockText(message, args, mode, cmdName) {
    const type   = args[0]?.toLowerCase();
    const key    = args[1];
    const amount = parseNumber(args[2]);
    const cat    = CATALOG[type];

    if (!cat?.trackStock || !cat.items[key])
        return message.reply(
            `❌ ไม่พบหมวดหมู่หรือสินค้า\nรูปแบบ: \`${cmdName} [${STOCK_TYPES.join('|')}] [item] [จำนวน]\`` +
            (cat?.trackStock ? `\nitem ของหมวดนี้: ${Object.keys(cat.items).map(k => `\`${k}\``).join(' ')}` : '')
        );
    if (amount === null || amount <= 0)
        return message.reply('❌ จำนวนไม่ถูกต้อง (ใส่เป็นตัวเลข เช่น 50 / 1k)');

    const change = applyStock(type, key, mode, amount);
    saveStock();
    await sendStockLog(type, { action: STOCK_MODES[mode].log, adminId: message.author.id, changes: [change] });
    return message.reply(`✅ ${STOCK_MODES[mode].title} **${itemName(change.item)}** | \`${fmt(change.before)}\` → \`${fmt(change.after)}\``);
}

async function cmdClearStock(message, args) {
    const type = args[0]?.toLowerCase();
    const cat  = CATALOG[type];
    if (!cat?.trackStock)
        return message.reply(`❌ ระบุหมวดหมู่ให้ถูกต้อง\nรูปแบบ: \`!clearallstock [${STOCK_TYPES.join('|')}]\``);

    const changes = Object.values(cat.items).map(item => {
        const before = item.stock;
        item.stock = 0;
        return { item, before, after: 0 };
    });
    saveStock();
    await sendStockLog(type, { action: '🧹 รีเซ็ตสต็อกทั้งหมด', adminId: message.author.id, changes });
    return message.reply(`✅ รีเซ็ตสต็อกทั้งหมดในหมวด **${cat.label}** เป็น 0 เรียบร้อย!`);
}

// ==========================================
// [ 15. INTERACTION ROUTER ]
// ==========================================
client.on('interactionCreate', async (interaction) => {
    await safeExecute(interaction, async () => {
        if (!interaction.customId) return;
        const handlers = [handleRatePanel, handleStockPanel, handleEmbedCreator, handleTicketButtons, handleShopFlow];
        for (const handler of handlers) {
            if (await handler(interaction)) return;
        }
    });
});

// ==========================================
// [ 16. Ready / Login ]
// ==========================================
client.once(Events.ClientReady, () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // ออเดอร์ที่กดเสร็จสิ้นแล้วแต่ยังไม่ครบ 10 นาทีตอนบอทดับ → ตั้งเวลาต่อ (ถ้าเลยเวลาแล้วจะจัดการทันที)
    for (const [channelId, data] of Object.entries(activeTicketData))
        if (data.status === 'done' && data.autoCloseAt) scheduleAutoClose(channelId, data.autoCloseAt);
});

client.login(process.env.TOKEN);