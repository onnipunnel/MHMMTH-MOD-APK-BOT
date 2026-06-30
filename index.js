import TelegramBot from "node-telegram-bot-api";
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_ID = String(process.env.ADMIN_ID || "");
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 2048);
const SITES_FILE = "./sites.json";
const DOWNLOAD_DIR = "./downloads";

if (!fs.existsSync(SITES_FILE)) fs.writeFileSync(SITES_FILE, "[]");
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

function admin(msg) {
  return String(msg.from.id) === ADMIN_ID;
}

function loadSites() {
  return JSON.parse(fs.readFileSync(SITES_FILE, "utf8"));
}

function saveSites(data) {
  fs.writeFileSync(SITES_FILE, JSON.stringify(data, null, 2));
}

function blocked(text) {
  return /mod|crack|premium|patched|hack|unlocked/i.test(text);
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `MHMMTH APK BOT ✅

User:
/search appname
/sites

Admin:
/addsite Name | HomeURL | SearchBox | ResultLink | DownloadButton
/deletesite Name`);
});

bot.onText(/\/sites/, (msg) => {
  const sites = loadSites();
  if (!sites.length) return bot.sendMessage(msg.chat.id, "Site add pannala da.");
  bot.sendMessage(msg.chat.id, sites.map((s, i) => `${i + 1}. ${s.name}\n${s.homeUrl}`).join("\n\n"));
});

bot.onText(/\/addsite (.+)/, (msg, match) => {
  if (!admin(msg)) return bot.sendMessage(msg.chat.id, "Admin only.");
  const parts = match[1].split("|").map(x => x.trim());

  if (parts.length !== 5) {
    return bot.sendMessage(msg.chat.id, `Format:
 /addsite Name | HomeURL | SearchBox | ResultLink | DownloadButton`);
  }

  const [name, homeUrl, searchBox, resultLink, downloadButton] = parts;
  const sites = loadSites();
  sites.push({ name, homeUrl, searchBox, resultLink, downloadButton });
  saveSites(sites);

  bot.sendMessage(msg.chat.id, "Site added ✅");
});

bot.onText(/\/deletesite (.+)/, (msg, match) => {
  if (!admin(msg)) return bot.sendMessage(msg.chat.id, "Admin only.");
  const name = match[1].trim().toLowerCase();

  const sites = loadSites().filter(s => s.name.toLowerCase() !== name);
  saveSites(sites);

  bot.sendMessage(msg.chat.id, "Deleted if existed ✅");
});

bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const appName = match[1].trim();

  if (blocked(appName)) {
    return bot.sendMessage(chatId, "Mod/crack/premium bypass apps support illa da.");
  }

  const sites = loadSites();
  if (!sites.length) return bot.sendMessage(chatId, "Admin site add pannala da.");

  await bot.sendMessage(chatId, `Searching: ${appName}`);

  for (const site of sites) {
    try {
      const filePath = await downloadFromSite(site, appName);
      if (!filePath) continue;

      const sizeMB = fs.statSync(filePath).size / 1024 / 1024;
      if (sizeMB > MAX_FILE_MB) {
        fs.unlinkSync(filePath);
        return bot.sendMessage(chatId, `File too large: ${Math.round(sizeMB)}MB`);
      }

      await bot.sendMessage(chatId, "Uploading...");
      await bot.sendDocument(chatId, filePath);
      fs.unlinkSync(filePath);
      return;
    } catch (e) {
      console.log(site.name, e.message);
    }
  }

  bot.sendMessage(chatId, "App file kidaikkala da.");
});

async function downloadFromSite(site, appName) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    userAgent: "Mozilla/5.0 Chrome/120 Safari/537.36"
  });

  const page = await context.newPage();

  try {
    await page.goto(site.homeUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    await page.waitForSelector(site.searchBox, { timeout: 30000 });
    await page.fill(site.searchBox, appName);
    await page.keyboard.press("Enter");

    await page.waitForLoadState("domcontentloaded", { timeout: 60000 });

    await page.waitForSelector(site.resultLink, { timeout: 30000 });
    await page.locator(site.resultLink).first().click();

    await page.waitForLoadState("domcontentloaded", { timeout: 60000 });

    await page.waitForSelector(site.downloadButton, { timeout: 30000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 90000 });
    await page.locator(site.downloadButton).first().click();

    const download = await downloadPromise;
    const filename = download.suggestedFilename() || `${appName}.apk`;
    const filePath = path.join(DOWNLOAD_DIR, `${Date.now()}-${filename}`);

    await download.saveAs(filePath);
    await browser.close();

    return filePath;
  } catch (err) {
    await browser.close();
    throw err;
  }
}

console.log("Bot running...");
