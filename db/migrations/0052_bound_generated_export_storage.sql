ALTER TABLE "accountant_exports" ALTER COLUMN "content" DROP NOT NULL;
ALTER TABLE "accountant_exports" ADD COLUMN "content_pruned_at" timestamp with time zone;

ALTER TABLE "portable_data_packages" ALTER COLUMN "content" DROP NOT NULL;
ALTER TABLE "portable_data_packages" ADD COLUMN "content_pruned_at" timestamp with time zone;

CREATE OR REPLACE FUNCTION control_accountant_export_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'accountant exports cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF OLD.content IS NOT NULL
     AND NEW.content IS NULL
     AND OLD.content_pruned_at IS NULL
     AND NEW.content_pruned_at IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['content', 'content_pruned_at'])
        IS NOT DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['content', 'content_pruned_at']) THEN
    RETURN NEW;
  END IF;

  IF OLD.state <> 'generated'
     OR NEW.state <> 'superseded'
     OR (to_jsonb(NEW) - ARRAY['state', 'superseded_by', 'superseded_at', 'supersede_reason'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['state', 'superseded_by', 'superseded_at', 'supersede_reason']) THEN
    RAISE EXCEPTION 'accountant exports only allow the audited generated-to-superseded transition or content retention pruning' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;
