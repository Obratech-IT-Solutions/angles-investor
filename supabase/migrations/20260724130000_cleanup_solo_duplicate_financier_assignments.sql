-- Remove solo project_financiers when the same financier already has the grouped batch line.
WITH financier_identity AS (
  SELECT
    pf.id AS project_financier_id,
    pf.financier_id,
    pf.project_id,
    p.group_id,
    lower(trim(p.name)) || '|' || p.financing_date::text AS identity_key
  FROM project_financiers pf
  JOIN projects p ON p.id = pf.project_id
),
grouped AS (
  SELECT DISTINCT financier_id, identity_key
  FROM financier_identity
  WHERE group_id IS NOT NULL
),
solo_dupes AS (
  SELECT fi.project_financier_id, fi.project_id
  FROM financier_identity fi
  JOIN grouped g
    ON g.financier_id = fi.financier_id
   AND g.identity_key = fi.identity_key
  WHERE fi.group_id IS NULL
)
DELETE FROM project_financiers pf
USING solo_dupes sd
WHERE pf.id = sd.project_financier_id;

-- Delete orphan solo project records superseded by a group batch.
DELETE FROM projects p
WHERE p.group_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM project_financiers pf WHERE pf.project_id = p.id)
  AND EXISTS (
    SELECT 1
    FROM projects g
    WHERE g.group_id IS NOT NULL
      AND lower(trim(g.name)) = lower(trim(p.name))
      AND g.financing_date = p.financing_date
  );
