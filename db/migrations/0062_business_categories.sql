CREATE TYPE business_category_type AS ENUM ('expense', 'revenue');

CREATE TABLE business_categories (
  organization_id text NOT NULL REFERENCES organizations(id),
  kind business_category_type NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  account_code text,
  tax_code text,
  is_active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1,
  created_by text NOT NULL DEFAULT 'master-data',
  updated_by text NOT NULL DEFAULT 'master-data',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, kind, code),
  CONSTRAINT business_categories_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT business_categories_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT business_categories_version_positive CHECK (version > 0),
  CONSTRAINT business_categories_account_fk FOREIGN KEY (organization_id, account_code)
    REFERENCES accounts(organization_id, code) ON DELETE RESTRICT
);

CREATE INDEX business_categories_active_name_idx
  ON business_categories (organization_id, kind, is_active, name);

-- Backfill existing expense catalog entries so consumers can migrate incrementally.
INSERT INTO business_categories
  (organization_id, kind, code, name, is_active, version, created_by, updated_by, created_at, updated_at)
SELECT organization_id, 'expense', code, name, is_active, version, created_by, updated_by, created_at, updated_at
FROM expense_categories
ON CONFLICT (organization_id, kind, code) DO NOTHING;

INSERT INTO business_categories (organization_id, kind, code, name, account_code)
SELECT o.id, 'revenue', v.code, v.name, v.account_code
FROM organizations o
CROSS JOIN (VALUES
  ('SOFTWARE_DEV','Doanh thu Phát triển phần mềm / App','5113'),
  ('WEB','Doanh thu Thiết kế và phát triển web','5113'),
  ('CONSULTING','Doanh thu Dịch vụ tư vấn / Giải pháp','5113'),
  ('DESIGN_MEDIA','Doanh thu Thiết kế / Truyền thông','5113'),
  ('SYSTEM_MAINTENANCE','Doanh thu Bảo trì / Vận hành hệ thống','5113'),
  ('PRODUCT_SALES','Doanh thu Bán hàng hóa / Thiết bị','5111'),
  ('RETAINER_FEE','Doanh thu Phí Retainer hàng tháng','5113'),
  ('OTHER_REVENUE','Doanh thu bán ra khác','5113')
) AS v(code,name,account_code)
WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.organization_id=o.id AND a.code=v.account_code AND a.is_active)
ON CONFLICT (organization_id, kind, code) DO NOTHING;
