import { chromium } from "/Volumes/DATA/Coding Projects/NAAI ERP/node_modules/.pnpm/playwright-core@1.58.0/node_modules/playwright-core/index.mjs";
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
const failures = [];
page.on("response", async (r) => {
  if (r.url().includes("/api/v1/") && r.status() >= 400) {
    let body = "";
    try {
      body = (await r.text()).slice(0, 200);
    } catch {
      body = "(body unavailable)";
    }
    failures.push(
      `${r.status()} ${r.request().method()} ${r.url().replace(/.*organizations\/org-ui/, "")} ${body}`,
    );
  }
});
const step = async (name, fn) => {
  const before = failures.length;
  try {
    await fn();
  } catch (e) {
    failures.push(`STEP-ERROR ${name}: ${String(e.message).split("\n")[0]}`);
    await page.screenshot({ path: `/tmp/ui-fail-${name}.png` });
  }
  console.log(
    failures.length === before ? "OK  " : "FAIL",
    name,
    failures.slice(before).join(" | "),
  );
};
const base = "http://127.0.0.1:3000";
await step("expenses-list", async () => {
  await page.goto(`${base}/expenses`);
  await page.getByText("Thuê văn phòng").first().waitFor({ timeout: 20000 });
});
await step("expense-posted-edit-metadata", async () => {
  await page.goto(`${base}/expenses`);
  const row = page.getByRole("row").filter({ hasText: "Thuê văn phòng" });
  await row.getByRole("button", { name: "Xem" }).click();
  const dlg = page.getByRole("dialog", { name: /Chi tiết & Chỉnh sửa/ });
  await dlg.getByLabel("Mục đích chi / Diễn giải").fill("Thuê văn phòng tháng 11 (sửa)");
  await dlg.getByRole("button", { name: "Lưu thay đổi" }).click();
  await page.waitForTimeout(2500);
  await dlg
    .getByText("Thuê văn phòng tháng 11 (sửa)")
    .first()
    .waitFor({ timeout: 8000 })
    .catch(() => undefined);
});
await step("expense-posted-reclassify-custody", async () => {
  const dlg = page.getByRole("dialog", { name: /Chi tiết & Chỉnh sửa/ });
  if (!(await dlg.isVisible())) {
    await page.goto(`${base}/expenses`);
    await page
      .getByRole("row")
      .filter({ hasText: "Thuê văn phòng" })
      .getByRole("button", { name: "Xem" })
      .click();
  }
  await page.getByRole("button", { name: "Đổi nguồn thanh toán" }).click();
  const d2 = page.getByRole("dialog", { name: "Đổi sang nguồn thanh toán khác?" });
  await d2.getByLabel("Nguồn thanh toán mới").click();
  await page.getByRole("option", { name: /Tiền công ty chủ giữ hộ/ }).click();
  await d2.getByLabel("Lý do điều chỉnh").fill("Chi từ tiền công ty chủ giữ hộ");
  await d2.getByRole("button", { name: /Xác nhận/ }).click();
  await page
    .getByText(/Đã (đảo bút toán|chuyển)/)
    .first()
    .waitFor({ timeout: 10000 });
});
console.log("--- failures ---");
for (const f of failures) console.log(f);
await b.close();
