const defaultState = {
  name: "باب",
  mood: "دوستانه و معمولی",
  groups: {},
  quick: {}
};

let memCache = null;
let adminStates = {};

async function getConfig(env) {
  if (env.DB) {
    const data = await env.DB.get("bot_config");
    if (data) return JSON.parse(data);
  }
  if (!memCache) memCache = { ...defaultState };
  return memCache;
}

async function saveConfig(env, config) {
  if (env.DB) {
    await env.DB.put("bot_config", JSON.stringify(config));
  }
  memCache = config;
}

async function sendMessage(token, chatId, text, replyMarkup = null) {
  const payload = { chat_id: chatId, text: text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await res.json();
}

async function editMessageText(token, chatId, messageId, text, replyMarkup = null) {
  const payload = { chat_id: chatId, message_id: messageId, text: text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function deleteMessage(token, chatId, messageId) {
  await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}

async function answerCallbackQuery(token, callbackQueryId, text = "", showAlert = false) {
  const payload = { callback_query_id: callbackQueryId, text: text, show_alert: showAlert };
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function sendChatAction(token, chatId, action = "typing") {
  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: action }),
  });
}

async function askGemini(prompt, apiKey, config) {
  if (!apiKey) return "خطا: کلید API تنظیم نشده است.";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: {
      role: "system",
      parts: [{
        text: `تو یک ربات تلگرامی به اسم «${config.name}» هستی. شخصیت و لحن پاسخگویی تو باید کاملاً ${config.mood} باشد. جواب‌هایت را کوتاه، مختصر (یک یا دو جمله) و به زبان عامیانه فارسی بده. از ایموجی استفاده کن.`
      }]
    }
  };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (data.error) return "مغزم هنگ کرد! چند دقیقه دیگه صدام کن.";
    if (data.candidates && data.candidates.length > 0) return data.candidates[0].content.parts[0].text;
    return "حرفی برای گفتن ندارم.";
  } catch (error) {
    return "ارتباطم با اینترنت قطعه!";
  }
}

function getMainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🎭 تنظیم لحن", callback_data: "panel_mood" },
        { text: "📝 تنظیم اسم", callback_data: "panel_name" }
      ],
      [
        { text: "⚡️ پاسخ‌های سریع", callback_data: "panel_quick" },
        { text: "👥 مدیریت گروه‌ها", callback_data: "panel_groups" }
      ]
    ]
  };
}

function getMoodKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "خوشحال 😄", callback_data: "mood_خوشحال و پرانرژی" }, { text: "ناراحت 😢", callback_data: "mood_ناراحت و دپرس" }],
      [{ text: "عصبانی 😡", callback_data: "mood_عصبانی و تهاجمی" }, { text: "بی‌ادب 🤬", callback_data: "mood_بی‌ادب و تندخو" }],
      [{ text: "لوس 🥺", callback_data: "mood_لوس و بچگانه" }, { text: "گنگستری 🕶", callback_data: "mood_لاتی و گنگستری" }],
      [{ text: "معمولی 🙂", callback_data: "mood_دوستانه و معمولی" }],
      [{ text: "🔙 بازگشت", callback_data: "panel_main" }]
    ]
  };
}

function getGroupsKeyboard(groups) {
  const keyboard = [];
  for (const [id, data] of Object.entries(groups)) {
    const status = data.active ? "🟢 فعال" : "🔴 غیرفعال";
    keyboard.push([{ text: `[${status}] ${data.title}`, callback_data: `grptgl_${id}` }]);
  }
  keyboard.push([{ text: "🔙 بازگشت", callback_data: "panel_main" }]);
  return { inline_keyboard: keyboard };
}

function getQuickKeyboard(quick) {
  const keyboard = [[{ text: "➕ افزودن پاسخ جدید", callback_data: "qk_add" }]];
  for (const trigger in quick) {
    keyboard.push([
      { text: `💬 ${trigger} (ویرایش)`, callback_data: `qke_${trigger}` },
      { text: "🗑 حذف", callback_data: `qkd_${trigger}` }
    ]);
  }
  keyboard.push([{ text: "🔙 بازگشت", callback_data: "panel_main" }]);
  return { inline_keyboard: keyboard };
}

function getBackKeyboard() {
  return { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "panel_main" }]] };
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("OK");
    const payload = await request.json();
    const adminId = parseInt(env.ADMIN_ID || "0");
    const config = await getConfig(env);

    if (payload.message && payload.message.new_chat_members) {
      const newMembers = payload.message.new_chat_members;
      const botId = parseInt(env.BOT_TOKEN.split(":")[0]);
      const isBotAdded = newMembers.some(m => m.id === botId);
      if (isBotAdded) {
        const chatId = payload.message.chat.id;
        if (!config.groups[chatId]) {
          const chatTitle = payload.message.chat.title || "گروه ناشناس";
          config.groups[chatId] = { title: chatTitle, active: false };
          await saveConfig(env, config);
          const text = `🚨 ربات به گروه جدیدی اضافه شد!\nنام گروه: ${chatTitle}\nآیا اجازه فعالیت می‌دهید؟`;
          const kb = {
            inline_keyboard: [
              [{ text: "✅ تایید و فعالسازی", callback_data: `grptgl_${chatId}` }],
              [{ text: "❌ مسدود ماندن", callback_data: "panel_groups" }]
            ]
          };
          await sendMessage(env.BOT_TOKEN, adminId, text, kb);
        }
      }
      return new Response("OK");
    }

    if (payload.callback_query) {
      const cb = payload.callback_query;
      const data = cb.data;
      const chatId = cb.message.chat.id;
      const msgId = cb.message.message_id;
      const userId = cb.from.id;

      if (userId !== adminId) {
        await answerCallbackQuery(env.BOT_TOKEN, cb.id, "شما دسترسی ادمین ندارید.", true);
        return new Response("OK");
      }

      if (data === "panel_main") {
        delete adminStates[userId];
        await editMessageText(env.BOT_TOKEN, chatId, msgId, `⚙️ پنل مدیریت ربات [ ${config.name} ]\nلحن فعلی: ${config.mood}\nیک گزینه را انتخاب کنید:`, getMainKeyboard());
      } else if (data === "panel_name") {
        adminStates[userId] = { step: "wait_name", msgId: msgId };
        await editMessageText(env.BOT_TOKEN, chatId, msgId, "لطفاً نام جدید ربات را ارسال کنید:", getBackKeyboard());
      } else if (data === "panel_mood") {
        await editMessageText(env.BOT_TOKEN, chatId, msgId, "یک لحن برای پاسخگویی ربات انتخاب کنید:", getMoodKeyboard());
      } else if (data.startsWith("mood_")) {
        const newMood = data.replace("mood_", "");
        config.mood = newMood;
        await saveConfig(env, config);
        await editMessageText(env.BOT_TOKEN, chatId, msgId, `✅ لحن ربات به "${newMood}" تغییر یافت.`, getMainKeyboard());
      } else if (data === "panel_groups") {
        await editMessageText(env.BOT_TOKEN, chatId, msgId, "لیست گروه‌های ربات (برای تغییر وضعیت کلیک کنید):", getGroupsKeyboard(config.groups));
      } else if (data.startsWith("grptgl_")) {
        const gId = data.replace("grptgl_", "");
        if (config.groups[gId]) {
          config.groups[gId].active = !config.groups[gId].active;
          await saveConfig(env, config);
          await editMessageText(env.BOT_TOKEN, chatId, msgId, "لیست گروه‌های ربات (برای تغییر وضعیت کلیک کنید):", getGroupsKeyboard(config.groups));
        }
      } else if (data === "panel_quick") {
        await editMessageText(env.BOT_TOKEN, chatId, msgId, "مدیریت پاسخ‌های سریع:", getQuickKeyboard(config.quick));
      } else if (data === "qk_add") {
        adminStates[userId] = { step: "wait_qk_trigger", msgId: msgId };
        await editMessageText(env.BOT_TOKEN, chatId, msgId, "لطفاً کلمه یا جمله‌ای که کاربر می‌گوید را ارسال کنید:", getBackKeyboard());
      } else if (data.startsWith("qke_")) {
        const trigger = data.replace("qke_", "");
        adminStates[userId] = { step: "wait_qk_edit", msgId: msgId, trigger: trigger };
        await editMessageText(env.BOT_TOKEN, chatId, msgId, `لطفاً پاسخ جدید برای "${trigger}" را ارسال کنید:`, getBackKeyboard());
      } else if (data.startsWith("qkd_")) {
        const trigger = data.replace("qkd_", "");
        delete config.quick[trigger];
        await saveConfig(env, config);
        await editMessageText(env.BOT_TOKEN, chatId, msgId, "مدیریت پاسخ‌های سریع:", getQuickKeyboard(config.quick));
      }
      
      await answerCallbackQuery(env.BOT_TOKEN, cb.id);
      return new Response("OK");
    }

    if (payload.message && payload.message.text) {
      const message = payload.message;
      const text = message.text;
      const cleanText = text.trim();
      const chatId = message.chat.id;
      const userId = message.from.id;
      const isGroup = chatId < 0;

      if (isGroup) {
        if (!config.groups[chatId]) {
          config.groups[chatId] = { title: message.chat.title || "گروه ناشناس", active: false };
          await saveConfig(env, config);
          const alertText = `🚨 ربات در یک گروه جدید شناسایی شد!\nنام گروه: ${message.chat.title}\nآیا اجازه فعالیت می‌دهید؟`;
          const kb = {
            inline_keyboard: [
              [{ text: "✅ تایید و فعالسازی", callback_data: `grptgl_${chatId}` }],
              [{ text: "❌ مسدود ماندن", callback_data: "panel_groups" }]
            ]
          };
          await sendMessage(env.BOT_TOKEN, adminId, alertText, kb);
          return new Response("OK");
        }
        if (!config.groups[chatId].active) {
          return new Response("OK");
        }
      }

      if (userId === adminId && adminStates[userId]) {
        const state = adminStates[userId];
        await deleteMessage(env.BOT_TOKEN, chatId, message.message_id);
        
        if (state.step === "wait_name") {
          config.name = cleanText;
          await saveConfig(env, config);
          delete adminStates[userId];
          await editMessageText(env.BOT_TOKEN, chatId, state.msgId, `✅ نام ربات با موفقیت به "${cleanText}" تغییر کرد.`, getMainKeyboard());
          return new Response("OK");
        }
        
        if (state.step === "wait_qk_trigger") {
          adminStates[userId] = { step: "wait_qk_response", msgId: state.msgId, trigger: cleanText };
          await editMessageText(env.BOT_TOKEN, chatId, state.msgId, `دریافت شد. حالا پاسخی که ربات باید در جواب "${cleanText}" بدهد را ارسال کنید:`, getBackKeyboard());
          return new Response("OK");
        }
        
        if (state.step === "wait_qk_response") {
          config.quick[state.trigger] = cleanText;
          await saveConfig(env, config);
          delete adminStates[userId];
          await editMessageText(env.BOT_TOKEN, chatId, state.msgId, `✅ پاسخ سریع ثبت شد:\nکاربر: ${state.trigger}\nربات: ${cleanText}`, getMainKeyboard());
          return new Response("OK");
        }

        if (state.step === "wait_qk_edit") {
          config.quick[state.trigger] = cleanText;
          await saveConfig(env, config);
          delete adminStates[userId];
          await editMessageText(env.BOT_TOKEN, chatId, state.msgId, `✅ پاسخ سریع بروزرسانی شد:\nکاربر: ${state.trigger}\nربات جدید: ${cleanText}`, getMainKeyboard());
          return new Response("OK");
        }
      }

      if (text === "/admin" && userId === adminId) {
        await sendMessage(env.BOT_TOKEN, chatId, `⚙️ پنل مدیریت ربات [ ${config.name} ]\nیک گزینه را انتخاب کنید:`, getMainKeyboard());
        return new Response("OK");
      }

      if (config.quick[cleanText]) {
        await sendMessage(env.BOT_TOKEN, chatId, config.quick[cleanText]);
        return new Response("OK");
      }

      const botId = parseInt(env.BOT_TOKEN.split(":")[0]);
      const isReplyToBot = message.reply_to_message && message.reply_to_message.from.id === botId;
      const startsWithBotName = cleanText.startsWith(config.name);

      if (startsWithBotName || isReplyToBot || !isGroup) {
        await sendChatAction(env.BOT_TOKEN, chatId, "typing");
        let userPrompt = cleanText;
        if (startsWithBotName) {
          userPrompt = cleanText.substring(config.name.length).trim();
        }
        if (!userPrompt) userPrompt = "سلام!";
        const answer = await askGemini(userPrompt, env.GEMINI_API_KEY, config);
        await sendMessage(env.BOT_TOKEN, chatId, answer);
      }
    }

    return new Response("OK");
  }
};
