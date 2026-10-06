// İBB Avrupa Yakası hal fiyatlarını sayfayı bir tarayıcı gibi açarak okur.
// Sayfadaki "Göster" butonuna her kategori için basar ve tabloyu okur.
import { chromium } from "playwright";
import fs from "node:fs";

const URL = "https://tarim.ibb.istanbul/avrupa-yakasi-hal-mudurlugu/hal-fiyatlari.html";
const OUT = "hal.json";

const sayi = (s) => Number(s.replace(/TL/i, "").replace(/\./g, "").replace(",", ".").trim());
const bugunTR = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date()); // YYYY-MM-DD

const browser = await chromium.launch();
const page = await browser.newPage({ locale: "tr-TR", timezoneId: "Europe/Istanbul" });
await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });

const select = page.locator("select").first();
const kategoriler = await select.locator("option").evaluateAll((o) =>
  o.map((x) => ({ value: x.value, text: x.textContent.trim() }))
);

const urunler = [];
for (const k of kategoriler) {
  await select.selectOption(k.value);
  const yanit = page.waitForResponse((r) => r.url().includes("gunluk_fiyatlar"), { timeout: 30000 });
  await page.getByText("Göster", { exact: true }).first().click();
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
await browser.close();

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
