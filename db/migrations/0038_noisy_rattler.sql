ALTER TABLE "workforce_profiles" ALTER COLUMN "created_by" SET DEFAULT 'master-data';--> statement-breakpoint
ALTER TABLE "workforce_profiles" ALTER COLUMN "updated_by" SET DEFAULT 'master-data';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "default_service_line_code" text;--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_project_default_service_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.default_service_line_code IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM dimension_values d
     WHERE d.organization_id = NEW.organization_id
       AND d.kind = 'service_line'
       AND d.code = NEW.default_service_line_code
       AND d.is_active
  ) THEN
    RAISE EXCEPTION 'Project default service line must reference an active service_line dimension value'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER projects_default_service_line_valid
BEFORE INSERT OR UPDATE OF organization_id, default_service_line_code
ON projects
FOR EACH ROW
EXECUTE FUNCTION validate_project_default_service_line();--> statement-breakpoint

CREATE OR REPLACE FUNCTION protect_project_default_service_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  invalidating boolean;
BEGIN
  invalidating := TG_OP = 'DELETE';
  IF TG_OP = 'UPDATE' THEN
    invalidating := NEW.is_active = false OR NEW.code <> OLD.code OR NEW.kind <> OLD.kind;
  END IF;

  IF OLD.kind = 'service_line'
     AND invalidating
     AND EXISTS (
       SELECT 1
         FROM projects p
        WHERE p.organization_id = OLD.organization_id
          AND p.default_service_line_code = OLD.code
     ) THEN
    RAISE EXCEPTION 'Service line is assigned as a project default and cannot be removed or deactivated'
      USING ERRCODE = '23503';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint

CREATE TRIGGER dimension_values_project_default_service_line_protected
BEFORE UPDATE OF kind, code, is_active OR DELETE
ON dimension_values
FOR EACH ROW
EXECUTE FUNCTION protect_project_default_service_line();
