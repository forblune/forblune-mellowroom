import { chromium } from "playwright";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4181";
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const results = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleErrors = [];
    const externalRequests = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("request", (request) => {
      const requestURL = new URL(request.url());
      if (!requestURL.hostname.includes("127.0.0.1") && requestURL.protocol !== "data:") {
        externalRequests.push(request.url());
      }
    });

    await page.goto(baseURL, { waitUntil: "networkidle" });
    const initial = await page.evaluate(() => ({
      language: document.documentElement.lang,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim(),
    }));

    await page.locator('[data-language-option="en"]').click();
    const english = await page.evaluate(() => ({
      language: document.documentElement.lang,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim(),
    }));

    await page.locator('[data-booking-service="calm"]').click();
    await page.locator('[data-date="2026-08-14"]').click();
    await page.locator('[data-time="11:00"]').click();
    await page.locator('[data-panel="3"] button[type="submit"]').click();
    const validation = {
      name: await page.locator('[data-error-for="name"]').textContent(),
      contact: await page.locator('[data-error-for="contact"]').textContent(),
    };

    await page.locator('[name="name"]').fill("Test Visitor");
    await page.locator('[name="contact"]').fill("010-0000-0000");
    await page.locator('[name="consent"]').check();
    await page.locator('[data-panel="3"] button[type="submit"]').click();
    await page.locator('[data-panel="4"]:not([hidden])').waitFor();

    const confirmation = {
      visible: await page.locator('[data-panel="4"]').isVisible(),
      summary: (await page.locator(".booking-summary").innerText()).replace(/\s+/g, " ").trim(),
      overflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };

    results.push({
      viewport: viewport.name,
      initial,
      english,
      validation,
      confirmation,
      consoleErrors,
      externalRequests: [...new Set(externalRequests)],
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) =>
  result.initial.language !== "ko" ||
  result.english.language !== "en" ||
  result.initial.overflow > 0 ||
  result.english.overflow > 0 ||
  result.confirmation.overflow > 0 ||
  !result.confirmation.visible ||
  !result.validation.name ||
  !result.validation.contact ||
  result.consoleErrors.length > 0 ||
  result.externalRequests.length > 0
);

console.log(JSON.stringify({ baseURL, pass: failures.length === 0, results }, null, 2));
if (failures.length) process.exitCode = 1;
