# NAAI ERP

**ERP AI-native dành cho doanh nghiệp một người.**

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

## Triển khai bằng Docker Compose

Yêu cầu: Docker Engine có Compose v2 và quyền pull image từ `ghcr.io/leolionart` nếu package không công khai.

Không cần clone source code để chạy bản phát hành. Máy chủ chỉ cần hai file trong cùng một thư mục:

```text
naai-erp/
├── compose.yaml
└── .env.production
```

### 1. Tải file Compose và mẫu cấu hình

```bash
mkdir -p naai-erp && cd naai-erp

# Thay giá trị này bằng Git tag hoặc full commit SHA đã phát hành.
export NAAI_ERP_REF="FULL_GIT_SHA_OR_TAG"

curl -fsSL \
  "https://raw.githubusercontent.com/leolionart/naai-erp/${NAAI_ERP_REF}/compose.yaml" \
  -o compose.yaml

curl -fsSL \
  "https://raw.githubusercontent.com/leolionart/naai-erp/${NAAI_ERP_REF}/deploy/env/.env.example" \
  -o .env.production
```

Không nên dùng `main` làm `NAAI_ERP_REF` cho production vì nội dung Compose có thể thay đổi. Git ref của `compose.yaml` nên tương ứng với release chứa image được chọn trong `IMAGE_TAG`.

### 2. Điền `.env.production`

Mở `.env.production` bằng trình soạn thảo trên máy chủ và cập nhật ít nhất các giá trị sau:

```dotenv
POSTGRES_PASSWORD=<mat-khau-postgres-manh>
APP_BASE_URL=https://erp.example.com
SESSION_SECRET=<chuoi-ngau-nhien-toi-thieu-32-ky-tu>
WEBHOOK_SIGNING_SECRET=<chuoi-ngau-nhien-toi-thieu-32-ky-tu>

NAAI_ERP_LOGIN_USERNAME=owner
NAAI_ERP_LOGIN_PASSWORD=<mat-khau-dang-nhap-manh>
NAAI_ERP_LOGIN_ORGANIZATION=<organization-id>
NAAI_ERP_LOGIN_API_TOKEN=<api-token-cua-organization>

IMAGE_TAG=sha-<12-ky-tu-dau-cua-commit>
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
