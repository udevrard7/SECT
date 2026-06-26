-- name: GetUserByID :one
SELECT "id", "email", "name", "role", "etablissementId", "filiereId",
       "image", "actif", "mustChangePwd", "niveau"
FROM "User"
WHERE "id" = $1;

-- name: GetUserByEmail :one
SELECT "id", "email", "name", "role", "etablissementId", "filiereId",
       "image", "actif", "mustChangePwd", "niveau"
FROM "User"
WHERE "email" = $1 AND "actif" = true;

-- name: ListUsersByEtablissement :many
SELECT "id", "email", "name", "role", "etablissementId", "filiereId",
       "image", "actif", "mustChangePwd", "niveau"
FROM "User"
WHERE "etablissementId" = $1
ORDER BY "name";

-- name: CountUsersByRole :one
SELECT count(*) FROM "User" WHERE "role" = $1;
