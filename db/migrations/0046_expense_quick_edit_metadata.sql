CREATE OR REPLACE FUNCTION prevent_final_expense_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IN ('posted','reversed')
    AND current_setting('app.tax_finalization',true)='on'
    AND (to_jsonb(NEW)-ARRAY['cit_state','vat_state'])=(to_jsonb(OLD)-ARRAY['cit_state','vat_state']) THEN
    RETURN NEW;
  END IF;
  IF OLD.state = 'posted'
    AND current_setting('app.expense_metadata_correction',true)='on'
    AND (to_jsonb(NEW)-ARRAY['payee_party_id','business_purpose'])
      =(to_jsonb(OLD)-ARRAY['payee_party_id','business_purpose']) THEN
    RETURN NEW;
  END IF;
  IF OLD.state IN ('posted','reversed') AND (
    NEW.expense_class IS DISTINCT FROM OLD.expense_class OR
    NEW.payee_party_id IS DISTINCT FROM OLD.payee_party_id OR
    NEW.employee_party_id IS DISTINCT FROM OLD.employee_party_id OR
    NEW.expense_date IS DISTINCT FROM OLD.expense_date OR
    NEW.service_period_start IS DISTINCT FROM OLD.service_period_start OR
    NEW.service_period_end IS DISTINCT FROM OLD.service_period_end OR
    NEW.business_purpose IS DISTINCT FROM OLD.business_purpose OR
    NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.net_minor IS DISTINCT FROM OLD.net_minor OR
    NEW.vat_minor IS DISTINCT FROM OLD.vat_minor OR
    NEW.gross_minor IS DISTINCT FROM OLD.gross_minor OR
    NEW.counter_account_code IS DISTINCT FROM OLD.counter_account_code OR
    NEW.cit_state IS DISTINCT FROM OLD.cit_state OR
    NEW.vat_state IS DISTINCT FROM OLD.vat_state OR
    NEW.evidence_checklist IS DISTINCT FROM OLD.evidence_checklist OR
    NEW.journal_id IS DISTINCT FROM OLD.journal_id OR
    (OLD.state = 'reversed' AND NEW.state IS DISTINCT FROM OLD.state) OR
    (OLD.state = 'posted' AND NEW.state NOT IN ('posted','reversed'))
  ) THEN
    RAISE EXCEPTION 'FINAL_EXPENSE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_final_expense_child_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state expense_state;
BEGIN
  SELECT state INTO parent_state FROM expenses
  WHERE organization_id=COALESCE(OLD.organization_id,NEW.organization_id)
    AND id=COALESCE(OLD.expense_id,NEW.expense_id);
  IF parent_state IN ('posted','reversed') THEN
    IF parent_state = 'posted' AND TG_OP='UPDATE' AND TG_TABLE_NAME='expense_lines'
      AND current_setting('app.tax_finalization',true)='on'
      AND (to_jsonb(NEW)-ARRAY['management_state','cit_state','vat_state','cit_eligible_minor','vat_eligible_minor','reviewed_by','reviewed_at','review_reason','review_reference'])
        =(to_jsonb(OLD)-ARRAY['management_state','cit_state','vat_state','cit_eligible_minor','vat_eligible_minor','reviewed_by','reviewed_at','review_reason','review_reference']) THEN
      RETURN NEW;
    END IF;
    IF parent_state = 'posted' AND TG_OP='UPDATE' AND TG_TABLE_NAME='expense_lines'
      AND current_setting('app.expense_metadata_correction',true)='on'
      AND (to_jsonb(NEW)-ARRAY['description','dimensions'])
        =(to_jsonb(OLD)-ARRAY['description','dimensions'])
      AND (COALESCE(NEW.dimensions,'{}'::jsonb)-'category')
        =(COALESCE(OLD.dimensions,'{}'::jsonb)-'category') THEN
      RETURN NEW;
    END IF;
    IF parent_state = 'posted' AND TG_OP='UPDATE' AND TG_TABLE_NAME='expense_lines'
      AND (to_jsonb(NEW)-'dimensions')=(to_jsonb(OLD)-'dimensions')
      AND (COALESCE(NEW.dimensions,'{}'::jsonb)-'category')=(COALESCE(OLD.dimensions,'{}'::jsonb)-'category') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'FINAL_EXPENSE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
