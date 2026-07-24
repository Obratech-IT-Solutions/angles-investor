-- Financiers must confirm funding before the financing date (not on or after it).

CREATE OR REPLACE FUNCTION public.financier_confirm_commitment(p_project_financier_id uuid, p_amount numeric)
 RETURNS project_financiers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.project_financiers;
  v_project public.projects;
  v_group_count int;
  v_amount numeric(18,2);
  v_confirmed_total numeric(18,2);
  v_others_confirmed numeric(18,2);
  v_ceiling numeric(18,2);
  v_new_status text;
BEGIN
  v_amount := round(coalesce(p_amount, 0), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Commitment amount must be positive';
  END IF;

  SELECT * INTO v_row FROM public.project_financiers WHERE id = p_project_financier_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commitment not found'; END IF;
  IF v_row.financier_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = v_row.project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;

  IF v_project.group_id IS NOT NULL THEN
    SELECT count(*) INTO v_group_count FROM public.projects WHERE group_id = v_project.group_id;
    IF v_group_count >= 2 THEN
      RAISE EXCEPTION 'This finance is part of a batch. Confirm the whole batch as one total amount instead.';
    END IF;
  END IF;

  IF v_project.status NOT IN ('open_for_funding', 'partially_funded') THEN
    RAISE EXCEPTION 'Project is not open for funding';
  END IF;

  IF v_project.financing_date IS NOT NULL AND CURRENT_DATE >= v_project.financing_date::date THEN
    RAISE EXCEPTION 'Funding confirmation closed. The financing date (%) has been reached — confirm before that date.', v_project.financing_date;
  END IF;

  SELECT coalesce(sum(confirmed_amount), 0) INTO v_confirmed_total
  FROM public.project_financiers
  WHERE project_id = v_project.id AND commitment_status = 'confirmed';

  v_others_confirmed := v_confirmed_total - coalesce(
    CASE WHEN v_row.commitment_status = 'confirmed' THEN v_row.confirmed_amount ELSE 0 END,
    0
  );
  v_ceiling := round(v_project.capital_required - v_others_confirmed, 2);

  IF v_amount > v_ceiling THEN
    RAISE EXCEPTION 'Amount exceeds remaining capacity (%)', v_ceiling;
  END IF;

  UPDATE public.project_financiers
  SET confirmed_amount = v_amount,
      willing_amount = v_amount,
      confirmed_percentage = round(v_amount / NULLIF(v_project.capital_required, 0), 6),
      commitment_status = 'confirmed',
      submitted_at = coalesce(submitted_at, now()),
      confirmed_at = now(),
      confirmed_by = auth.uid()
  WHERE id = p_project_financier_id
  RETURNING * INTO v_row;

  SELECT coalesce(sum(confirmed_amount), 0) INTO v_confirmed_total
  FROM public.project_financiers
  WHERE project_id = v_project.id AND commitment_status = 'confirmed';

  v_new_status := CASE
    WHEN v_confirmed_total >= v_project.capital_required THEN 'fully_funded'
    WHEN v_confirmed_total > 0 THEN 'partially_funded'
    ELSE 'open_for_funding'
  END;

  UPDATE public.projects SET status = v_new_status, updated_at = now() WHERE id = v_project.id;

  PERFORM public.write_audit('project_financiers', v_row.id, 'financier_confirm_commitment', NULL, to_jsonb(v_row));
  RETURN v_row;
END;
$function$;
