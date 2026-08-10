-- Convert legacy category managers (visitor with grants) to the dedicated writer role.
UPDATE "User"
SET role = 'writer'
WHERE role = 'visitor'
  AND (
    "canManageSchedule" = true
    OR EXISTS (SELECT 1 FROM "_CategoryAdmins" WHERE "B" = "User".id)
  );