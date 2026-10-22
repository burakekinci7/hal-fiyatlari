// İBB Avrupa Yakası hal fiyatlarını sayfayı bir tarayıcı gibi açarak okur.
// Sayfadaki "Göster" butonuna her kategori için basar ve tabloyu okur.
// İBB sitesi yavaşlarsa 3 kez dener.
import { chromium } from "playwright";
import fs from "node:fs";

const URL = "https://tarim.ibb.istanbul/avrupa-yakasi-hal-mudurlugu/hal-fiyatlari.html";
const OUT = "hal.json";
const DENEME = 3;

const sayi = (s) => Number(s.replace(/TL/i, "").replace(/\./g, "").replace(",", ".").trim());
const bugunTR = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date()); // YYYY-MM-DD
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function cek() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ locale: "tr-TR", timezoneId: "Europe/Istanbul" });
    // "networkidle" yerine sayfanın iskeleti gelince devam et (analiz/izleme scriptleri beklenmez)
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });

    const select = page.locator("select").first();
    await select.waitFor({ timeout: 60000 });
    const goster = page.getByText("Göster", { exact: true }).first();
    await goster.waitFor({ timeout: 60000 });

    const kategoriler = await select.locator("option").evaluateAll((o) =>
      o.map((x) => ({ value: x.value, text: x.textContent.trim() }))
    );

    const urunler = [];
    for (const k of kategoriler) {
      await select.selectOption(k.value);
      const yanit = page.waitForResponse((r) => r.url().includes("gunluk_fiyatlar"), { timeout: 60000 });
      await goster.click();
      await yanit;
      await page.waitForTimeout(800);

      const satirlar = await page.locator("#gunluk_result table tr").evaluateAll((trs) =>
        trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim()))
      );
      for (const c of satirlar.slice(1)) {
        if (c.length < 4 || !c[0]) continue;
        urunler.push({ kategori: k.text, urun: c[0], birim: c[1], en_dusuk: sayi(c[2]), en_yuksek: sayi(c[3]) });
      }
    }
    return urunler;
  } finally {
    await browser.close();
  }
}

let urunler = null;
for (let i = 1; i <= DENEME; i++) {
  try {
    urunler = await cek();
    break;
  } catch (e) {
    console.log(`Deneme ${i}/${DENEME} başarısız: ${e.message.split("\n")[0]}`);
    if (i === DENEME) {
      console.log("İBB sitesine ulaşılamadı. Mevcut fiyatlar korunuyor.");
      process.exit(1);
    }
    await bekle(30000 * i);
  }
}

if (urunler.length === 0) {
  console.log("Henüz veri yok (fiyatlar açıklanmamış olabilir). Dosya değiştirilmedi.");
  process.exit(0);
}

// Sadece fiyatlar gerçekten değiştiyse dosyayı güncelle
const onceki = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
if (onceki && JSON.stringify(onceki.urunler) === JSON.stringify(urunler)) {
  console.log("Fiyatlar değişmemiş.");
  process.exit(0);
}

const simdi = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" });
fs.writeFileSync(
  OUT,
  JSON.stringify(
    { tarih: bugunTR(), guncellenme: simdi, kaynak: "İBB Avrupa Yakası Hal Şube Müdürlüğü", urunler },
    null,
    1
  )
);
console.log(`${urunler.length} ürün kaydedildi (${simdi}).`);
