# ERP-886 acceptance

- Quick create exposes only Tên dịch vụ and Giá mặc định mỗi kỳ: proven by desktop/mobile E2E and
  rendered browser inspection.
- Code is derived as uppercase ASCII and collision-safe: proven by unit and PostgreSQL integration
  (`DICH-VU-QUAN-TRI-WEBSITE`, then `DICH-VU-QUAN-TRI-WEBSITE-2`).
- Technical service-line input is omitted: PostgreSQL integration resolves RETAINER_FEE from active
  organization master data and returns a successful create response.
- Currency and recurrence defaults are real persisted values: integration readback proves VND,
  month, interval 1 and billing day 1.
- The minimal shape is versioned in TypeScript and OpenAPI; CLI continues to send the same typed JSON
  through the canonical REST route.
- Mobile dialog remains aligned with document scroll width equal to client width at 390 px.
