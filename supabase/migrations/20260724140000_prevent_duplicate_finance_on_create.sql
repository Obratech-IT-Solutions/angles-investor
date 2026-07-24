-- When creating a batch, reuse an existing solo finance (same name + date) instead of inserting a duplicate.
-- Block new solo finances when a batch line with the same name + date already exists.

CREATE OR REPLACE FUNCTION public.admin_create_finance_group(
  p_financing_date date,
  p_lines jsonb,
  p_financier_ids uuid[] DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_status text DEFAULT 'open_for_funding',
  p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group public.finance_groups;
  v_line jsonb;
  v_project_id uuid;
  v_existing_id uuid;
  v_project_ids uuid[] := ARRAY[]::uuid[];
  v_max_financiers int;
  v_invite_ids uuid[];
  v_group_name text;
  v_first_name text;
  v_capital numeric(18,2);
  v_profit numeric(18,2);
  v_duration int;
  v_line_name text;
  v_line_idx int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_financing_date IS NULL THEN
    RAISE EXCEPTION 'Financing date is required';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 1 THEN
    RAISE EXCEPTION 'At least one finance line is required';
  END IF;

  IF p_financier_ids IS NOT NULL AND coalesce(array_length(p_financier_ids, 1), 0) > 0 THEN
    v_invite_ids := p_financier_ids;
    SELECT count(*)::int INTO v_max_financiers
    FROM public.profiles p
    WHERE p.id = ANY (p_financier_ids)
      AND p.role = 'financier'
      AND p.account_status = 'active';
    IF v_max_financiers < 1 THEN
      RAISE EXCEPTION 'Select at least one active financier';
    END IF;
  ELSE
    v_invite_ids := NULL;
    SELECT count(*)::int INTO v_max_financiers
    FROM public.profiles
    WHERE role = 'financier' AND account_status = 'active';
    v_max_financiers := greatest(v_max_financiers, 1);
  END IF;

  v_first_name := nullif(trim(coalesce(p_lines->0->>'name', '')), '');
  v_group_name := coalesce(
    nullif(trim(coalesce(p_name, '')), ''),
    CASE
      WHEN jsonb_array_length(p_lines) = 1 THEN coalesce(v_first_name, 'Finance batch')
      ELSE coalesce(v_first_name, 'Finance') || ' +' || (jsonb_array_length(p_lines) - 1)::text
    END
  );

  INSERT INTO public.finance_groups (
    name, financing_date, status, description, notes, created_by
  ) VALUES (
    v_group_name,
    p_financing_date,
    coalesce(nullif(trim(p_status), ''), 'open_for_funding'),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  RETURNING * INTO v_group;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_idx := v_line_idx + 1;
    v_line_name := nullif(trim(coalesce(v_line->>'name', '')), '');
    IF v_line_name IS NULL THEN
      RAISE EXCEPTION 'Finance line % needs a name', v_line_idx;
    END IF;

    v_capital := round(coalesce((v_line->>'capital_required')::numeric, 0), 2);
    v_profit := round(coalesce((v_line->>'expected_profit')::numeric, 0), 2);
    v_duration := coalesce((v_line->>'duration_days')::int, 0);

    IF v_capital <= 0 THEN
      RAISE EXCEPTION 'Finance line "%" needs a positive budget', v_line_name;
    END IF;
    IF v_profit < 0 THEN
      RAISE EXCEPTION 'Finance line "%" profit cannot be negative', v_line_name;
    END IF;
    IF v_duration < 1 THEN
      RAISE EXCEPTION 'Finance line "%" needs a positive duration', v_line_name;
    END IF;

    v_existing_id := NULL;
    SELECT p.id INTO v_existing_id
    FROM public.projects p
    WHERE p.group_id IS NULL
      AND lower(trim(p.name)) = lower(trim(v_line_name))
      AND p.financing_date = p_financing_date
    ORDER BY p.created_at
    LIMIT 1
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.projects
      SET
        group_id = v_group.id,
        duration_days = v_duration,
        capital_required = v_capital,
        expected_profit = v_profit,
        calculated_expected_release = (p_financing_date + v_duration),
        status = v_group.status,
        description = coalesce(v_group.description, description),
        notes = coalesce(v_group.notes, notes),
        max_financiers = v_max_financiers,
        invite_financier_ids = v_invite_ids,
        updated_at = now()
      WHERE id = v_existing_id;
      v_project_id := v_existing_id;
    ELSE
      IF EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.group_id IS NOT NULL
          AND lower(trim(p.name)) = lower(trim(v_line_name))
          AND p.financing_date = p_financing_date
      ) THEN
        RAISE EXCEPTION 'Finance "%" on % already exists in a batch', v_line_name, p_financing_date;
      END IF;

      INSERT INTO public.projects (
        name,
        financing_date,
        duration_days,
        capital_required,
        expected_profit,
        max_financiers,
        invite_financier_ids,
        release_date,
        calculated_expected_release,
        description,
        notes,
        status,
        created_by,
        group_id
      ) VALUES (
        v_line_name,
        p_financing_date,
        v_duration,
        v_capital,
        v_profit,
        v_max_financiers,
        v_invite_ids,
        NULL,
        (p_financing_date + v_duration),
        v_group.description,
        v_group.notes,
        v_group.status,
        auth.uid(),
        v_group.id
      )
      RETURNING id INTO v_project_id;
    END IF;

    v_project_ids := array_append(v_project_ids, v_project_id);
  END LOOP;

  IF array_length(v_project_ids, 1) = 1 THEN
    UPDATE public.projects SET group_id = NULL WHERE id = v_project_ids[1];
    DELETE FROM public.finance_groups WHERE id = v_group.id;
    PERFORM public.write_audit(
      'projects',
      v_project_ids[1],
      'admin_create_finance_group_single',
      NULL,
      jsonb_build_object('project_ids', to_jsonb(v_project_ids))
    );
    RETURN jsonb_build_object(
      'group_id', NULL,
      'project_ids', to_jsonb(v_project_ids),
      'name', v_line_name
    );
  END IF;

  PERFORM public.write_audit(
    'finance_groups',
    v_group.id,
    'admin_create_finance_group',
    NULL,
    jsonb_build_object(
      'group_id', v_group.id,
      'project_ids', to_jsonb(v_project_ids),
      'financing_date', p_financing_date,
      'line_count', array_length(v_project_ids, 1)
    )
  );

  RETURN jsonb_build_object(
    'group_id', v_group.id,
    'project_ids', to_jsonb(v_project_ids),
    'name', v_group.name
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_solo_finance_duplicate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.group_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id <> NEW.id
        AND p.group_id IS NOT NULL
        AND lower(trim(p.name)) = lower(trim(NEW.name))
        AND p.financing_date = NEW.financing_date
    ) THEN
      RAISE EXCEPTION 'Finance "%" on % already exists in a batch. Edit the batch instead of creating a duplicate.', NEW.name, NEW.financing_date;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_solo_finance_duplicate ON public.projects;
CREATE TRIGGER trg_prevent_solo_finance_duplicate
  BEFORE INSERT OR UPDATE OF name, financing_date, group_id ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_solo_finance_duplicate();
