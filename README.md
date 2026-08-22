# NAAI ERP

**ERP AI-native dành cho doanh nghiệp một người.**

![Overview](https://screenshot.naai.studio/snapzy/1786436880-87c97427-snapzy_2026-08-11_15-26-35_675.png)

NAAI ERP giúp một chủ doanh nghiệp tự vận hành tài chính, doanh thu, chi phí, dự án và dòng tiền trong một hệ thống thống nhất. Sản phẩm được thiết kế cho mô hình solopreneur: người sở hữu có thể trực tiếp khai báo, kiểm soát và tự duyệt nghiệp vụ theo chính sách đã cấu hình, nhưng mọi thay đổi tài chính vẫn đi qua phân quyền, audit, idempotency, khóa kỳ và các nguyên tắc kế toán kép.

Giao diện web, REST API, CLI và các tác nhân AI cùng sử dụng một lớp dịch vụ nghiệp vụ. AI không truy cập PostgreSQL trực tiếp và không được bỏ qua các kiểm soát kế toán.

Repository chính thức: <https://github.com/leolionart/naai-erp>

## Hệ thống quản lý những gì?

<details open>
<summary><strong>Doanh thu, hóa đơn và công nợ</strong></summary>

- Quản lý khách hàng, hóa đơn bán hàng, hóa đơn mua hàng và ghi nhận doanh thu.
- Tách biệt giá trị hợp đồng, doanh thu đã xuất hóa đơn, doanh thu đã ghi nhận và tiền đã thu.
- Theo dõi công nợ phải thu/phải trả, tuổi nợ, thanh toán, phân bổ và credit note.
- Xuất bảng kê bán ra, bảng kê mua vào và workbook phục vụ kế toán.

</details>

<details>
<summary><strong>Chi phí, thuế và tiền chủ sở hữu</strong></summary>

- Quản lý chi phí có hóa đơn, không hóa đơn, hoàn ứng, phí ngân hàng, trả trước và tài sản cố định.
- Theo dõi độc lập tính hợp lệ quản trị, khả năng khấu trừ VAT và khả năng khấu trừ CIT.
- Hỗ trợ mô hình `solopreneur` cho doanh nghiệp một người, trong đó chủ doanh nghiệp có thể tự duyệt nhưng mọi thao tác vẫn được lưu vết.
- Phân loại khoản chủ sở hữu trả thay, vốn chủ đưa vào, hoàn trả và rút tiền mà không ghi nhận trùng doanh thu hoặc chi phí.

</details>

<details>
<summary><strong>Ngân hàng, tiền mặt và đối soát</strong></summary>

- Quản lý tài khoản ngân hàng, quỹ tiền mặt và lịch sử biến động tiền.
- Nhập giao dịch idempotent, gợi ý ghép, đối soát và khóa kết quả đã đối soát.
- Hỗ trợ chuyển tiền nội bộ không ảnh hưởng P&L.
- Hiển thị tiền công ty, nghĩa vụ với chủ sở hữu và nguồn tiền ròng của doanh nghiệp.

</details>

<details>
<summary><strong>Dự án, nguồn lực và lợi nhuận</strong></summary>

- Quản lý khách hàng, nhà cung cấp, nhân sự, dự án, chiều phân tích và danh mục sản phẩm mua vào.
- Theo dõi ngân sách, timesheet, chi phí trực tiếp, phân bổ overhead và ghi nhận doanh thu theo dự án.
- Phân tích gross margin, contribution margin và lợi nhuận đầy đủ theo dự án.
- Quản lý dự án bằng danh sách hoặc Kanban với trạng thái được đồng bộ qua API chuẩn.

</details>

<details>
<summary><strong>Kế toán, báo cáo và dự báo</strong></summary>

- Sổ nhật ký kép, hệ thống tài khoản, kỳ tài chính, posting rules, đảo bút toán và số dư đầu kỳ.
- Trial Balance, General Ledger, P&L, Balance Sheet, Cash Flow, VAT và báo cáo quản trị.
- Dashboard có drill-down về sổ, chứng từ và nguồn dữ liệu đã ghi sổ.
- Target, forecast, MoM/YoY, KPI và snapshot báo cáo có thể tái lập.

</details>

<details>
<summary><strong>Dữ liệu, tích hợp và vận hành</strong></summary>

- REST/OpenAPI có version, CLI chính chủ và webhook cho Paperless-ngx/n8n hoặc hệ thống ngoài.
- External identity, idempotency key, correlation ID, lỗi theo từng trường và audit trail.
- Nhập nhanh doanh thu hoặc hóa đơn mua bằng **một lần gọi API/CLI**; backend tự match hoặc tạo
  khách hàng/nhà cung cấp, role và danh mục an toàn. Không cần nối nhiều API chỉ để nhập một nghiệp
  vụ cơ bản.
- Import/export workbook theo quy trình inventory → dry-run → commit → reconciliation.
- Gói dữ liệu tổ chức có thể xuất, kiểm tra và khôi phục vào tenant trống theo kiểm soát được phê duyệt.

</details>

## Vì sao gọi là AI-native?

- Mọi tài nguyên nghiệp vụ có hợp đồng máy đọc được qua REST/OpenAPI và CLI.
- AI dùng cùng organization scope, RBAC, state machine và application service như người dùng web.
- Mutation có idempotency, version, audit reference và danh sách hành động tiếp theo.
- Tiền được truyền bằng chuỗi chính xác hoặc minor unit, không dùng số thực nhị phân.
- Quan hệ giữa khách hàng, dự án, chứng từ, chi phí, journal và thanh toán được xác thực; AI không tự đoán ID hay sửa trực tiếp dữ liệu đã ghi sổ.
- Chứng từ đã phát hành và journal đã post được sửa bằng cancel, reversal hoặc replacement để giữ lịch sử.
- Metadata nghiệp vụ (customer/supplier, project, category, mô tả) sửa được bằng một thao tác trên
  UI hoặc một API request. Backend tự match và, với bản ghi đã post, tự tạo reversal/replacement mà
  không ghi đè lịch sử kế toán.

## Workflow tổng thể và cách dùng hệ thống

NAAI ERP đi theo một luồng thống nhất, dù thao tác từ web, REST API, CLI hay tác nhân AI:

1. **Thiết lập tổ chức**: chọn tổ chức, kỳ tài chính, hệ thống tài khoản, thuế, danh mục và chính sách vận hành (`solopreneur` hoặc `controlled`).
2. **Khai báo dữ liệu nền**: tạo party (khách hàng/nhà cung cấp), dự án, sản phẩm mua vào, tài khoản ngân hàng và chiều phân tích. Luôn đọc ID và `nextActions` từ API trước khi tạo bản ghi phụ thuộc.
3. **Tiếp nhận nghiệp vụ**: nhập doanh thu, hóa đơn mua vào, chi phí, giao dịch ngân hàng, timesheet hoặc dữ liệu từ Paperless/n8n. Dùng external identity, idempotency key và correlation ID cho các lần đồng bộ/lặp lại.
4. **Kiểm tra và ghi nhận**: bản ghi hợp lệ được lưu theo organization scope; nghiệp vụ tài chính đi qua trạng thái draft → review/approved → posted (hoặc luồng solopreneur được phép hoàn tất ngay). Journal phải cân bằng và kỳ khóa vẫn được tôn trọng.
5. **Đối soát và điều chỉnh**: ghép thanh toán/ngân hàng, xử lý công nợ, phân bổ overhead và sửa sai bằng cancel, reversal hoặc replacement; không sửa/xóa lịch sử đã post.
6. **Theo dõi và báo cáo**: dashboard và báo cáo chỉ đọc read model từ dữ liệu canonical đã ghi nhận, có drill-down về chứng từ, journal và nguồn. VAT/CIT, tính hợp lệ quản trị và tính đủ điều kiện thuế được hiển thị độc lập.
7. **Vận hành an toàn**: mọi mutation có audit, phân quyền, version và idempotency; log hoạt động nền có retention mặc định để tránh phình lưu trữ. Backup, nâng cấp và rollback tuân theo runbook.

### Các use flow chính

- **Bán hàng**: khách hàng → dự án (nếu có) → hóa đơn/doanh thu → ghi nhận → thu tiền → công nợ/báo cáo.
- **Mua hàng/chi phí**: nhà cung cấp → hóa đơn mua hoặc chi phí trực tiếp → phân loại/VAT → thanh toán hoặc chủ sở hữu trả thay → công nợ và chi phí.
- **Ngân hàng**: nhập giao dịch → chuẩn hóa/ghép → đối soát → khóa kết quả; chuyển khoản nội bộ không tạo doanh thu/chi phí.
- **Dự án**: dự án + ngân sách → timesheet/chi phí/phân bổ → doanh thu liên quan → margin và KPI.
- **Tích hợp**: Paperless/n8n gửi payload có external identity → API validate/idempotent upsert → trả stable IDs/next actions → worker xử lý event và ghi log.

Đọc hướng dẫn chi tiết từng nghiệp vụ, trạng thái và điểm kiểm soát tại [Business workflows](./docs/product/business-workflows.md). Các quy tắc bất biến nằm trong [Business Rules Catalog](./docs/product/business-rules.md); hợp đồng máy đọc được và ví dụ tích hợp nằm trong [API documentation](./docs/api/README.md).

Để tích hợp nhanh, dùng `quick-sales-invoices create` cho doanh thu/hóa đơn bán hoặc
`quick-purchase-invoices create` cho hóa đơn mua. Cả hai nhận một payload nghiệp vụ tối giản, hỗ trợ
retry bằng idempotency key và trả về ID chuẩn cùng `nextActions`.

## Triển khai bằng Docker Compose

Yêu cầu: Docker Engine có Compose v2 và quyền pull image từ `ghcr.io/leolionart` nếu package không công khai.

Không cần clone source code để chạy bản phát hành. Máy chủ chỉ cần hai file trong cùng một thư mục:

```text
naai-erp/
├── compose.yaml
└── .env.production
```

### 1. Tạo `compose.yaml`

Tạo một thư mục triển khai, sau đó copy nội dung dưới đây vào file `compose.yaml`.

<details>
<summary><strong>Nội dung compose.yaml</strong></summary>

```yaml
name: naai-erp

x-service-defaults: &service-defaults
  init: true
  restart: unless-stopped
  logging:
    driver: json-file
    options:
      max-size: 10m
      max-file: "3"

services:
  postgres:
    image: postgres:16.9-bookworm
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-naai_erp}
      POSTGRES_USER: ${POSTGRES_USER:-naai_erp}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 10s
    restart: unless-stopped

  migrate:
    image: ghcr.io/leolionart/naai-erp-migrate:${IMAGE_TAG}
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-naai_erp}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-naai_erp}
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"

  api:
    <<: *service-defaults
    image: ghcr.io/leolionart/naai-erp-api:${IMAGE_TAG}
    environment:
      NODE_ENV: production
      PORT: 3001
      HOST: 0.0.0.0
      DATABASE_URL: postgresql://${POSTGRES_USER:-naai_erp}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-naai_erp}
      APP_BASE_URL: ${APP_BASE_URL}
      SESSION_SECRET: ${SESSION_SECRET}
      WEBHOOK_SIGNING_SECRET: ${WEBHOOK_SIGNING_SECRET}
      NAAI_ERP_SOLOPRENEUR: ${NAAI_ERP_SOLOPRENEUR:-true}
      NAAI_ERP_LOGIN_ORGANIZATION: ${NAAI_ERP_LOGIN_ORGANIZATION}
    ports:
      - "${API_PORT:-3001}:3001"
    depends_on:
      migrate:
        condition: service_completed_successfully
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3001/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
        ]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s

  worker:
    <<: *service-defaults
    image: ghcr.io/leolionart/naai-erp-worker:${IMAGE_TAG}
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER:-naai_erp}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-naai_erp}
    depends_on:
      migrate:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD", "node", "-e", "try{process.kill(1,0)}catch{process.exit(1)}"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s

  web:
    <<: *service-defaults
    image: ghcr.io/leolionart/naai-erp-web:${IMAGE_TAG}
    environment:
      NODE_ENV: production
      PORT: 3000
      HOSTNAME: 0.0.0.0
      API_BASE_URL: http://api:3001
      SESSION_SECRET: ${SESSION_SECRET}
      NAAI_ERP_LOGIN_USERNAME: ${NAAI_ERP_LOGIN_USERNAME}
      NAAI_ERP_LOGIN_PASSWORD: ${NAAI_ERP_LOGIN_PASSWORD}
      NAAI_ERP_LOGIN_ORGANIZATION: ${NAAI_ERP_LOGIN_ORGANIZATION}
      NAAI_ERP_LOGIN_API_TOKEN: ${NAAI_ERP_LOGIN_API_TOKEN}
    ports:
      - "${WEB_PORT:-3000}:3000"
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
        ]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s

volumes:
  postgres-data:
```

</details>

### 2. Tạo `.env.production`

Tạo file `.env.production` cùng thư mục với `compose.yaml`:

```dotenv
POSTGRES_DB=naai_erp
POSTGRES_USER=naai_erp
POSTGRES_PASSWORD=replace-with-a-strong-random-password

APP_BASE_URL=https://erp.example.com
SESSION_SECRET=replace-with-at-least-32-random-characters
WEBHOOK_SIGNING_SECRET=replace-with-at-least-32-random-characters

NAAI_ERP_LOGIN_USERNAME=owner
NAAI_ERP_LOGIN_PASSWORD=replace-with-a-strong-random-password
NAAI_ERP_LOGIN_ORGANIZATION=naai
NAAI_ERP_LOGIN_API_TOKEN=replace-with-the-provisioned-owner-api-token
NAAI_ERP_SOLOPRENEUR=true

IMAGE_TAG=sha-000000000000
API_PORT=3001
WEB_PORT=3000
```

Không commit file `.env.production`. Bốn service `migrate`, `api`, `worker`, `web` phải dùng cùng một `IMAGE_TAG`; môi trường production nên dùng tag bất biến `sha-*` thay vì `main` hoặc `latest`.

Kiểm tra Compose đã đọc đúng file cấu hình trước khi chạy:

```bash
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production config --images
```

### 3. Pull image và khởi động

```bash
docker compose --env-file .env.production pull
docker compose --env-file .env.production up -d --wait
```

Compose sẽ khởi động PostgreSQL, chạy migration một lần, sau đó mới bật API, worker và web theo healthcheck.

### 4. Kiểm tra trạng thái

```bash
docker compose --env-file .env.production ps -a
docker compose --env-file .env.production logs migrate
curl --fail http://localhost:3001/health/ready
curl --fail http://localhost:3000/health
```

Mặc định:

- Web: <http://localhost:3000>
- API: <http://localhost:3001>
- API readiness: <http://localhost:3001/health/ready>
- Web health: <http://localhost:3000/health>

<details>
<summary><strong>Build image trực tiếp từ source</strong></summary>

Chỉ quy trình này mới cần clone repository vì Docker phải đọc source code và các Dockerfile:

```bash
git clone https://github.com/leolionart/naai-erp.git
cd naai-erp
```

```bash
POSTGRES_PASSWORD=local-only docker compose \
  -f compose.yaml -f compose.build.yaml build

POSTGRES_PASSWORD=local-only docker compose \
  -f compose.yaml -f compose.build.yaml up -d --wait
```

File `compose.build.yaml` thay các image phát hành bằng image build từ các Dockerfile trong repo.

</details>

<details>
<summary><strong>Nâng cấp, rollback và dữ liệu PostgreSQL</strong></summary>

Để nâng cấp, đổi `IMAGE_TAG` sang SHA mới rồi chạy lại `pull` và `up -d --wait`. Để rollback ứng dụng, dùng SHA đã xác nhận tương thích với schema hiện tại.

Dữ liệu PostgreSQL được lưu trong volume `postgres-data`. Kiểm tra volume trước khi bảo trì:

```bash
docker compose --env-file .env.production config --volumes
docker volume inspect naai-erp_postgres-data
```

Không chạy `docker compose down --volumes` trên production. Migration là forward-only; rollback schema cần quy trình backup/restore đã được kiểm thử.

</details>

Reverse proxy production cần chuyển `/api/*` tới service API và các route còn lại tới service web trên cùng origin HTTPS. Chi tiết đầy đủ nằm trong [Docker Compose release runbook](./docs/runbooks/docker-compose-release.md).

## Chạy môi trường phát triển không build Docker

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm install --frozen-lockfile
pnpm db:native-setup
pnpm dev:preview
```

Môi trường này cần PostgreSQL và `DATABASE_URL` hợp lệ. Có thể kiểm tra bằng `pnpm db:native-status`.

## REST API và CLI

```bash
export NAAI_ERP_TOKEN="<scoped-api-credential>"
export NAAI_ERP_ORGANIZATION="<organization-id>"

pnpm cli -- parties list
pnpm cli -- projects list
pnpm cli -- expenses list
```

CLI gọi REST API và trả JSON mặc định; CLI không kết nối trực tiếp tới PostgreSQL. Xem [OpenAPI v1](./docs/api/openapi-v1.json), [AI-native interface contract](./docs/api/ai-native-interface-contract.md) và [data relationship contract](./docs/api/data-relationships-and-ingestion.md).

## Tài liệu kỹ thuật

- [Business Rules Catalog](./docs/product/business-rules.md)
- [Executable Test Specification](./docs/testing/test-specification.md)
- [API documentation](./docs/api/README.md)
- [Architecture Decision Records](./docs/architecture/README.md)
- [Docker Compose release runbook](./docs/runbooks/docker-compose-release.md)
- [Machine-readable Task Ledger](./docs/implementation/task-ledger.yaml)

NAAI ERP hỗ trợ ra quyết định và kiểm soát dữ liệu tài chính, nhưng không tự tuyên bố tính đúng đắn pháp lý hoặc thuế nếu chưa có chính sách và xác nhận phù hợp từ kế toán.
