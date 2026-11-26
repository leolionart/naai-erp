# Kế hoạch: đọc dữ liệu có giới hạn cho AI/CLI và kiểm soát kích thước file

Trạng thái: **kế hoạch để agy implement** (task ERP-993 → ERP-999). Tài liệu này không đổi hành vi hệ thống.
Đọc theo thứ tự `AGENTS.md` (business rules → test specification → task ledger) trước khi bắt đầu.

## 0. Mục tiêu và nguyên tắc

1. **Mọi lệnh đọc có kích thước giới hạn mặc định**, kể cả khi người gọi (AI, n8n, CLI) quên truyền tham số. Giới hạn do **server** áp, không phụ thuộc client.
2. **AI hỏi câu hỏi, không đọc cả bảng**: có truy vấn đếm, tổng hợp, tìm kiếm, lọc; danh sách chỉ trả cột chính.
3. **Kết quả lớn đi vào file**, không vào stdout/context.
4. **Không có file mã nguồn tăng thêm quá 500 dòng**; file cũ chỉ được giảm. Tách theo nghiệp vụ, không đổi hành vi.
5. Mọi thay đổi có test hợp đồng tự động để không tái phạm; không có chức năng nào bị "mất": cái gì từng đọc toàn bộ thì có cách thay thế (phân trang, tổng hợp, xuất file).

## 1. Hiện trạng đã đo (26/11/2026)

### 1.1 Danh sách không phân trang (đã xác nhận bằng đọc truy vấn)

| Route                                                                  | Hành vi hiện tại                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /expenses` (`pg-expense.store.ts` `list`)                         | `select e.*` + nhiều truy vấn con, `order by expense_date desc,id`, **không `limit`**; bỏ qua `limit` ở CLI |
| `GET /commercial-documents` (`pg-commercial-document.store.ts` `list`) | không `limit`, lồng dòng/phân bổ                                                                            |
| `GET /journals` (`pg-journal.store.ts`)                                | trả **mọi bút toán kèm mọi dòng** (`json_agg(l)`), không `limit`                                            |
| ~30 controller khác không nhắc tới `limit`                             | cần rà từng route (một số là báo cáo tổng hợp hoặc bản ghi đơn nên có thể hợp lệ)                           |

Đã đúng chuẩn, dùng làm mẫu: `master-data` (mặc định 50, tối đa 100, `nextCursor` dạng offset base64url) và nhật ký hoạt động (khóa `(occurred_at,source,id)`).
Tài liệu `ai-native-interface-contract.md` đã yêu cầu "cursor pagination with deterministic ordering" nhưng code lệch.

Ước lượng thô: ≈ 2–3 KB cho mỗi chi phí một dòng → 1.000 bản ghi ≈ 2–3 MB ≈ vài trăm nghìn token.
`docs/api/openapi-v1.json` nặng 329 KB; AI không nên đọc cả file.

### 1.2 File vượt 500 dòng

60 file mã nguồn (không tính test) và 12 file test vượt 500 dòng (đếm cả dòng trống/chú thích). Nặng nhất:

| Dòng                  | File                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------- |
| 4.895                 | `packages/database/src/schema.ts`                                                      |
| 2.800                 | `apps/api/src/commercial-documents/pg-commercial-document.store.ts`                    |
| 2.577                 | `apps/api/src/expenses/pg-expense.store.ts`                                            |
| 1.951                 | `apps/web/src/app/workspaces/dashboard-workspaces.tsx`                                 |
| 1.847                 | `apps/web/src/app/workspaces/financial-statement-workspaces.tsx`                       |
| 1.771                 | `scripts/seed-local-demo.mjs`                                                          |
| 1.746                 | `apps/api/src/report-exports/pg-report-export.store.ts`                                |
| 1.628                 | `apps/web/src/components/forms/document-expense-forms.tsx`                             |
| 1.383                 | `apps/web/src/app/workspaces/business-directory-workspace.tsx`                         |
| 1.298                 | `apps/web/src/app/workspaces/customer-subscription-workspace.tsx`                      |
| 1.222                 | `apps/web/src/app/workspaces/focused-record-list-workspace.tsx`                        |
| 1.209                 | `apps/cli/src/import-workbooks.ts`                                                     |
| 1.138 / 1.122 / 1.060 | `pg-banking.store.ts` / `pg-reconciliation.store.ts` / `pg-internal-transfer.store.ts` |
| 901                   | `apps/cli/src/client.ts` (chuỗi ternary lồng hàng chục tầng để chọn URL)               |

ESLint hiện chỉ `warn` (70 cảnh báo); `AGENTS.md` yêu cầu file **mới** ≤ 500 dòng.

## 2. Phần A — Kiểm soát kích thước file (ERP-993, ERP-994)

### A1. Ratchet tự động (ERP-993)

- Script `scripts/check-file-size.mjs` (Node, không phụ thuộc ngoài) đếm dòng **giống ESLint** (`skipBlankLines`, `skipComments`) cho
  `apps/*/src`, `packages/*/src`, `scripts` (`.ts .tsx .mjs .js`), loại trừ: `*.test.*`, `*.spec.*`, `db/migrations`, `.next`, `dist`, snapshot, fixture sinh tự động.
- Tệp mốc `scripts/file-size-baseline.json`: `{ "<path>": <số dòng hiện tại> }` cho mọi file đang vượt 500. Quy tắc:
  1. file **không có trong mốc** và > 500 dòng → lỗi;
  2. file có trong mốc và số dòng **> mốc** → lỗi (không được tăng);
  3. file có trong mốc nhưng ≤ 500 → lỗi yêu cầu xóa khỏi mốc (khóa thành quả);
  4. `--update` chỉ cho phép **giảm** mốc hoặc xóa mục, không bao giờ thêm file mới hoặc nâng số.
- Chạy trong `pnpm check`, hook pre-commit (`.githooks`) và workflow CI hiện có (không thêm quyền/secret mới).
- Test: `scripts/check-file-size.test.mjs` hoặc vitest trong `tests/` cho 4 quy tắc trên với thư mục tạm.
- Cập nhật `AGENTS.md` (mục kích thước file) mô tả mốc và cách giảm mốc; ESLint `max-lines` giữ `warn` cho phần mốc, `error` cho file không có trong mốc.
- Chấp nhận: thêm 1 dòng vào file đang trong mốc làm `pnpm check` đỏ; giảm file làm script yêu cầu hạ mốc.

### A2. Tách file lớn (ERP-994, theo từng đợt, mỗi đợt một commit, **không đổi hành vi**)

Quy tắc chung cho mọi lần tách:

- giữ nguyên API công khai: file gốc trở thành **facade/barrel** re-export (import cũ không đổi); không đổi tên lớp Nest/provider token;
- file mới ≤ 500 dòng, tên theo nghiệp vụ (`create`, `post`, `reverse`, `metadata`, `reports`…), không dùng `utils`/`helpers` chung chung;
- không di chuyển và sửa logic trong cùng commit; test hiện có pass không sửa (ngoại trừ đường dẫn import);
- cập nhật mốc ở A1 trong cùng commit; chạy test tích hợp của module trên Postgres tạm.

Thiết kế tách đề xuất (agy có thể điều chỉnh nếu thấy ranh giới tự nhiên hơn):

| File                                                                                                                                           | Cách tách                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/database/src/schema.ts`                                                                                                              | `schema/` theo bounded context (`organization`, `accounting`, `commercial`, `expenses`, `banking`, `planning`, `reporting`, `integration`, `audit`…) + `schema/index.ts` re-export; `drizzle.config.ts` trỏ `./src/schema/*.ts`. **Điều kiện bắt buộc:** `drizzle-kit generate` không sinh migration mới và `pnpm db:check` pass; thứ tự khai báo giữ để tham chiếu khóa ngoại không vòng. |
| `pg-commercial-document.store.ts`                                                                                                              | facade `PgCommercialDocumentStore` + `create/update/delete`, `transitions` (issue/post), `reverse` (void, reverse-replace), `funding` (reclassify), `tax` (resolve/review), `ingestion`, `queries` (list/get), `relationship-backfill`. Dùng chung transaction helper hiện có.                                                                                                             |
| `pg-expense.store.ts`                                                                                                                          | tương tự: `create/update/discard`, `transitions`, `review` + `tax-finalization`, `funding-inference` + `reclassify`, `reverse`, `metadata/category`, `queries`.                                                                                                                                                                                                                            |
| `dashboard-workspaces.tsx`, `financial-statement-workspaces.tsx`                                                                               | mỗi thẻ/biểu đồ/bảng một component, hook tải dữ liệu tách riêng, hàm định dạng/tính toán sang module thuần có test.                                                                                                                                                                                                                                                                        |
| `document-expense-forms.tsx`                                                                                                                   | `DocumentForm`, `ExpenseForm`, trường dùng chung, hàm dựng payload thuần.                                                                                                                                                                                                                                                                                                                  |
| `business-directory`, `customer-subscription`, `focused-record-list`, `report-export`, `reconciliation`, `ledger-master`, `banking` workspaces | một màn hình = thư mục: `index`, `hooks/`, `components/`, `model.ts`.                                                                                                                                                                                                                                                                                                                      |
| `pg-report-export.store.ts`, `pg-banking`, `pg-reconciliation`, `pg-internal-transfer`                                                         | theo từng loại báo cáo/luồng nghiệp vụ như trên.                                                                                                                                                                                                                                                                                                                                           |
| `apps/cli/src/client.ts`                                                                                                                       | **bảng định tuyến** `resources/*.ts`: mỗi tài nguyên khai báo `{ path, actions: { <action>: { method, suffix, needsKey, versioned } } }`; hàm `resolve(resource, action, key)` thay chuỗi ternary. Dựng **test vàng** trước khi tách (xem ERP-998) để chứng minh mọi URL/phương thức hiện có không đổi.                                                                                    |
| `scripts/seed-local-demo.mjs`, `apps/cli/src/import-workbooks.ts`                                                                              | tách theo miền dữ liệu/bước.                                                                                                                                                                                                                                                                                                                                                               |

Thứ tự khuyến nghị: schema → hai store lớn → CLI client → các workspace theo mức độ thay đổi gần đây. Không bắt buộc tách hết trong một đợt; mốc A1 đảm bảo không tăng.

## 3. Phần B — Hợp đồng đọc có giới hạn (ERP-995, ERP-996, ERP-997)

### B1. Hợp đồng chung (ERP-995)

Đặt trong `packages/contracts/src/paging.ts` (dùng chung API/CLI/web):

- Truy vấn: `limit` (số nguyên), `cursor` (opaque), `view` (`summary|full`), `fields` (danh sách phân tách bằng phẩy, allow-list theo tài nguyên), `sort` (allow-list), `q`, `includeTotal` (bool, mặc định false).
- Quy tắc: `limit` mặc định **50**, tối đa **100** (tối đa **200** cho dạng gọn `view=summary`); giá trị ngoài khoảng bị **kẹp** (không lỗi) và trả `meta.limitClamped=true`; giá trị không phải số → `400 LIMIT_INVALID`.
- Phản hồi: `data: { items, nextCursor?, hasMore, limit, total? }`, `meta: { count, bytes, truncated, limitClamped }`. `total` chỉ khi `includeTotal=true` (đếm tốn kém).
- **Cursor khóa (keyset), không offset**: mã hóa `{ v:1, sortKey…, id }` base64url, có kiểm tra định dạng (`400 CURSOR_INVALID`); thứ tự xác định với `id` làm khóa phụ; truy vấn dạng `where (sort_key,id) < ($cursor…)`; hỗ trợ `desc/asc`. (Master-data đang dùng offset — chuyển sang keyset ở ERP-997 hoặc giữ nếu bảng nhỏ và ghi rõ ngoại lệ.)
- **Ngân sách kích thước phản hồi**: helper `paginate(rows, options)` cắt bớt `items` khi JSON vượt `MAX_RESPONSE_BYTES` (mặc định **256 KB**, cấu hình bằng `API_MAX_LIST_RESPONSE_BYTES`, tối thiểu 32 KB) và đặt `meta.truncated=true`, `nextCursor` đúng bản ghi kế tiếp, kèm `meta.hint` ("thu hẹp bằng ngày/trạng thái/q hoặc dùng view=summary").
- Test đơn vị: kẹp giới hạn, mã hóa/giải mã cursor (hỏng, sai phiên bản), cắt theo ngân sách, thứ tự ổn định khi trùng khóa sắp xếp.
- Cập nhật `docs/api/ai-native-interface-contract.md` (mục truy vấn) và OpenAPI `components/parameters` (`Limit`, `Cursor`, `View`, `Fields`, `Sort`, `Q`).

### B2. Kiểm kê và hợp đồng kiểm thử tự động (ERP-995)

- `scripts/list-endpoint-inventory.mjs`: đọc OpenAPI + controller để xuất `docs/api/list-endpoint-inventory.md` (route, có `limit`/`cursor`, mặc định/tối đa, `view`, ghi chú ngoại lệ) — dùng để theo dõi tiến độ ERP-996/997.
- Test hợp đồng `apps/api/src/list-contract.integration.test.ts`: với mỗi route được gắn `x-naai-list: true` trong OpenAPI, seed ≥ 150 bản ghi trên Postgres tạm rồi khẳng định: không truyền `limit` → ≤ 50 mục; `limit=100000` → kẹp ≤ trần; có `nextCursor` và duyệt hết không trùng/không sót; thứ tự ổn định; `meta.bytes` ≤ ngân sách; `view=summary` không chứa `lines`/`allocations`. Route danh sách mới **không gắn thẻ** → test kiểm kê thất bại (buộc khai báo).
- Mốc ngoại lệ (báo cáo tổng hợp, bản ghi đơn) ghi trong `docs/api/list-endpoint-inventory.md` với lý do; ngoại lệ phải có trần số dòng.

### B3. Chuyển các danh sách trọng yếu (ERP-996)

Thứ tự: **expenses → commercial-documents → journals → ledger-reports (chi tiết sổ cái theo dòng) → banking (transactions/accounts/imports) → customer-receipts → evidence → project-freelance-payables → internal-transfers → funding-plans/owner-funding → forecast-components → customer-service-subscriptions → các route còn lại theo bảng kiểm kê**.
Mỗi route:

1. `limit/cursor/sort/q` + bộ lọc hiện có (state, party, project, category, ngày, nguồn tiền, phương thức thanh toán);
2. `view=summary` mặc định: chỉ cột chính (ví dụ chi phí: `id, expenseDate, state, payee{id,name}, businessPurpose, grossMinor, currency, categoryCode, fundingLabel, paymentMethod, flags[], externalReference{system,externalId}`), **không** lồng `lines/allocations`, không lộ cột nội bộ (`select e.*` bị thay bằng danh sách cột tường minh);
3. `view=full` (hoặc `include=lines,allocations`) chỉ cho `limit ≤ 25`; chi tiết đầy đủ lấy bằng `GET …/{id}` (giữ nguyên);
4. chỉ mục hỗ trợ keyset (ví dụ `(organization_id, expense_date desc, id)`), kèm migration và kiểm tra kế hoạch truy vấn (EXPLAIN) không quét toàn bảng trên 10.000 bản ghi;
5. endpoint tổng hợp cho AI/biểu đồ: `GET …/{expenses|commercial-documents}/count` (theo bộ lọc) và `GET …/{resource}/summary?groupBy=month|category|party|project|funding|state&from&to` trả ≤ 120 nhóm cùng tổng tiền/số lượng/phần trăm (thay cho việc tải mọi bản ghi để cộng);
6. cập nhật OpenAPI, gate matrix (nếu có thay đổi POST/PATCH — không), CLI (ERP-998) và test hợp đồng B2.

### B4. Web và các client hiện có (thuộc ERP-996)

Hiện UI danh sách tải **toàn bộ** rồi sắp xếp, lọc, dựng biểu đồ ở trình duyệt (`focused-record-list-workspace.tsx`, `focused-record-chart.ts`). Cần:

- tải theo trang với "Tải thêm"/cuộn vô hạn; sắp xếp, tìm kiếm, bộ lọc chuyển lên server (`sort`, `q`, bộ lọc);
- biểu đồ theo tháng/danh mục dùng endpoint `summary` (không cộng ở client); giữ quy tắc hiển thị hiện tại (phiếu giảm trừ âm, bỏ chứng từ hủy/từ chối, tiền tệ gốc);
- xuất danh sách (`accounting-list-exports`) giữ nguyên, chạy phía server theo bộ lọc (đây là đường "lấy hết" hợp lệ cho người dùng);
- n8n/script tự viết: tài liệu hóa trong release notes rằng danh sách nay phân trang (mặc định 50); hướng dẫn duyệt `nextCursor` hoặc dùng `summary`.
- Test: e2e Playwright (API giả) cho tải thêm và đổi sắp xếp; kiểm chứng UI thật theo `ui-verification-harness` (ERP-991 trong kế hoạch khác) trên dữ liệu ≥ 500 bản ghi.

### B5. Các route còn lại (ERP-997)

Hoàn tất danh sách kiểm kê B2: mỗi route hoặc có phân trang theo B1 hoặc có ngoại lệ ghi rõ (kèm trần dòng). Đổi master-data sang cursor keyset nếu bảng có thể lớn (parties, projects, accounts đã nhỏ → giữ offset được ghi chú).

## 4. Phần C — CLI thân thiện với AI (ERP-998)

### C1. Tham số và đầu ra

- Tham số: `--limit`, `--cursor`, `--view summary|full`, `--fields a,b`, `--sort`, `--q`, `--count` (chỉ đếm), `--summary-by month|category|…`.
- **Ngân sách stdout**: mặc định cắt ở `--max-bytes 200000`; khi vượt, in phần đầu hợp lệ (JSON hoàn chỉnh, không cắt giữa chừng), đặt `meta.truncated=true` và thông điệp stderr chỉ cách thu hẹp. Có thể đổi bằng `NAAI_ERP_MAX_BYTES`.
- **Đầu ra lớn vào file:** `--all --output <đường dẫn>` tự duyệt `nextCursor` và ghi **NDJSON** (hoặc CSV nếu `--format csv`) ra file, hiển thị chỉ `{ file, records, bytes, nextCursor? }`; có `--max-records` (mặc định 5.000) để chống chạy vô hạn; `--all` mà không có `--output` bị từ chối nếu vượt `--max-bytes`.
- Đầu ra gọn: bỏ trường `null`/rỗng, không xuống dòng thừa (trừ `--human`); luôn trả `meta` (`count, bytes, truncated, nextCursor`).
- `naai-erp describe <resource>`: trả tối đa vài KB (trường của `summary`, bộ lọc, sắp xếp, hành động hợp lệ) thay cho việc đọc OpenAPI; `discovery capabilities` giữ ngắn; `discovery openapi --tag <tag>` chỉ trả phần của một tag.

### C2. Bảng định tuyến (nền tảng cho A2)

- **Test vàng trước, tách sau:** sinh bảng `{resource, action, key?} → {method, url}` từ hành vi hiện tại (dùng bộ test `client.test.ts` hiện có và chạy mọi tổ hợp đã khai báo), lưu thành fixture; sau khi tách `client.ts` thành `resources/*.ts`, test vàng phải khớp 100%.
- Thêm tài nguyên mới = thêm một mục bảng; không thêm nhánh ternary.

### C3. Kiểm thử

Đơn vị cho cắt `--max-bytes`, `--all --output`, `--fields`, `--count`; test chạy thật `tsx src/main.ts` với server giả (mẫu `main.test.ts`) khẳng định không bao giờ in vượt ngân sách và JSON luôn hợp lệ.

## 5. Phần D — Hướng dẫn cho AI và quan sát (ERP-999)

- Tài liệu `docs/api/ai-reading-guide.md` (ngắn, ≤ 150 dòng): quy trình "đếm/tổng hợp trước → lọc → trang đầu `view=summary` → chi tiết theo id → xuất file nếu cần"; ví dụ CLI/REST cho các câu hỏi thường gặp (chi tiêu tháng này theo danh mục, khoản chưa xác định nguồn tiền, nhà cung cấp lớn nhất…); quy tắc "không `--all` vào stdout".
- Cập nhật `.agent/skills/manage-naai-erp` và `docs/api/ai-native-interface-contract.md` trỏ tới hướng dẫn này; nếu sau này có công cụ MCP, công cụ trả bản tóm tắt + đường dẫn tài nguyên thay vì bảng thô.
- Quan sát: `RequestLifecycleInterceptor` ghi thêm `responseBytes` và `itemCount` vào chi tiết nhật ký; phản hồi > ngân sách hoặc > 1 MB ghi mức `warning`; trang Nhật ký hoạt động lọc được "phản hồi lớn".
- Test: nhật ký chứa `responseBytes`; cảnh báo xuất hiện khi vượt ngưỡng (đặt ngưỡng nhỏ trong test).

## 6. Nhiệm vụ

| Task    | Nội dung                                                                                                                                                                | Phụ thuộc        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| ERP-993 | Ratchet kích thước file: script, mốc, hook/CI, ESLint, test, cập nhật `AGENTS.md`                                                                                       | —                |
| ERP-994 | Tách file lớn theo A2 (schema, hai store, CLI client, workspace) theo từng đợt                                                                                          | ERP-993          |
| ERP-995 | Hợp đồng đọc chung (`paging.ts`, `paginate`, ngân sách kích thước), kiểm kê route, test hợp đồng danh sách, cập nhật tài liệu/OpenAPI                                   | —                |
| ERP-996 | Chuyển danh sách trọng yếu (chi phí, hóa đơn, bút toán, sổ cái, ngân hàng…) sang keyset + `view=summary` + `count`/`summary`; di chuyển web sang phân trang/server-side | ERP-995          |
| ERP-997 | Hoàn tất các route còn lại theo bảng kiểm kê, master-data keyset hoặc ngoại lệ ghi rõ                                                                                   | ERP-996          |
| ERP-998 | CLI: `--limit/--cursor/--fields/--view/--max-bytes/--all --output/--count`, `describe`, bảng định tuyến + test vàng                                                     | ERP-995          |
| ERP-999 | Hướng dẫn AI, cập nhật skill/tài liệu, ghi `responseBytes` và cảnh báo phản hồi lớn                                                                                     | ERP-996, ERP-998 |

Thứ tự gợi ý: 993 → 995 → 996 (chi phí trước, đo thực tế) → 998 → 994 (xen kẽ) → 997 → 999.

## 7. Quy tắc nghiệp vụ dự kiến

- `BR-READ-001`: mọi danh sách có giới hạn mặc định (50) và trần cứng do server áp dụng; giá trị vượt trần bị kẹp và báo `limitClamped`.
- `BR-READ-002`: danh sách dùng cursor khóa với thứ tự xác định; không dùng offset cho bảng có thể lớn.
- `BR-READ-003`: phản hồi danh sách không vượt ngân sách kích thước; khi vượt thì cắt có kiểm soát và đặt `truncated` kèm `nextCursor`.
- `BR-READ-004`: danh sách trả dạng gọn mặc định; dòng chi tiết/phân bổ chỉ qua `view=full` giới hạn nhỏ hoặc truy vấn theo id.
- `BR-READ-005`: có truy vấn đếm và tổng hợp để trả lời câu hỏi thống kê mà không tải bản ghi.
- `BR-READ-006`: CLI không in vượt ngân sách mặc định; kết quả lớn ghi ra file; luôn trả `meta`.
- `BR-SIZE-001`: file mã nguồn không được vượt 500 dòng (không tính dòng trống/chú thích); file đang vượt chỉ được giảm, được thực thi bằng mốc tự động.

## 8. Rủi ro và lưu ý

- **Thay đổi hành vi có chủ đích**: client nào đang giả định danh sách đầy đủ sẽ nhận trang đầu. Ghi vào release notes; web được chuyển trong cùng task; n8n/script tự viết của chủ cần duyệt `nextCursor`.
- **Biểu đồ/chỉ số** từng tính ở client phải chuyển sang endpoint tổng hợp, nếu không số liệu sẽ chỉ đúng trên trang đang tải.
- **Truy vấn có `group by` + keyset**: dùng khóa sắp xếp xuất hiện trong `select`; kiểm tra bằng test duyệt hết không trùng/sót.
- **Đếm tổng** tốn kém: chỉ khi `includeTotal=true`; không dùng trong đường nóng.
- **Tách schema**: rủi ro lớn nhất là sinh migration ngoài ý muốn; bắt buộc kiểm `db:check`.
- Không thêm phụ thuộc mới; không nới quyền CI.
