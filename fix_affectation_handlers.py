#!/usr/bin/env python3
"""PROG-ACAD-CRITICAL-FIX-1 — Fix 4 affectation handlers (BUG #3).

Replace `_ = appdb.WithTx(...)` (silent SQL error swallowing) with proper
error handling in listAffectations, createAffectation, updateAffectation,
deleteAffectation. Detects FK violations, unique constraints, not-found,
enum errors via strings.Contains (no new imports needed).
Preserves TAB indentation.
"""
import sys

PATH = "/home/z/SECT/backend/internal/transport/http/affectation_handlers.go"

with open(PATH, "r", encoding="utf-8") as f:
    content = f.read()

# ─── Step 1: replace all 4 `_ = appdb.WithTx(...)` openings with `err :=` ───
OLD_OPEN = "\t_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {\n"
NEW_OPEN = "\terr := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {\n"

count_open = content.count(OLD_OPEN)
if count_open != 4:
    print(f"ERROR: expected 4 opening occurrences, found {count_open}", file=sys.stderr)
    sys.exit(1)
content = content.replace(OLD_OPEN, NEW_OPEN)

# ─── Step 2: replace closing block of listAffectations ───
OLD_LIST = (
    "\t\treturn rows.Err()\n"
    "\t})\n"
    "\n"
    "\tw.Header().Set(\"Content-Type\", \"application/json\")\n"
    "\tjson.NewEncoder(w).Encode(map[string]any{\n"
    "\t\t\"affectations\": result,\n"
    "\t})\n"
    "}\n"
)
NEW_LIST = (
    "\t\treturn rows.Err()\n"
    "\t})\n"
    "\n"
    "\t// PROG-ACAD-CRITICAL-FIX-1 : ne plus avaler l'erreur SQL (BUG #3).\n"
    "\t// Avant, `_ = appdb.WithTx(...)` jetait l'erreur \u2192 si la query fail\n"
    "\t// (RLS policy block, syntax error, etc.), `result` restait `[]affRow{}`\n"
    "\t// \u2192 response `{\"affectations\": []}` \u2192 l'utilisateur voyait une liste\n"
    "\t// vide au lieu d'une erreur.\n"
    "\tif err != nil {\n"
    "\t\terrMsg := err.Error()\n"
    "\t\tswitch {\n"
    "\t\tcase strings.Contains(errMsg, \"foreign key constraint\"):\n"
    "\t\t\twriteJSONError(w, http.StatusBadRequest, \"R\u00e9f\u00e9rence FK invalide (enseignant ou UE introuvable)\")\n"
    "\t\tcase strings.Contains(errMsg, \"unique constraint\"), strings.Contains(errMsg, \"duplicate key\"):\n"
    "\t\t\twriteJSONError(w, http.StatusConflict, \"Conflit de donn\u00e9es\")\n"
    "\t\tdefault:\n"
    "\t\t\twriteJSONError(w, http.StatusInternalServerError, \"Erreur lors de la lecture des affectations: \"+errMsg)\n"
    "\t\t}\n"
    "\t\treturn\n"
    "\t}\n"
    "\n"
    "\tw.Header().Set(\"Content-Type\", \"application/json\")\n"
    "\tjson.NewEncoder(w).Encode(map[string]any{\n"
    "\t\t\"affectations\": result,\n"
    "\t})\n"
    "}\n"
)
if content.count(OLD_LIST) != 1:
    print(f"ERROR: listAffectations closing block not found uniquely", file=sys.stderr)
    sys.exit(1)
content = content.replace(OLD_LIST, NEW_LIST)

# ─── Step 3: replace closing block of createAffectation ───
OLD_CREATE = (
    "\t\t).Scan(\n"
    "\t\t\t&row.ID, &row.EnseignantID, &row.UniteEnseignementID,\n"
    "\t\t\t&row.TypeSeance, &row.Groupe, &row.VolumeHeures,\n"
    "\t\t\t&row.AnneeUniversitaire, &row.Statut, &row.Commentaire,\n"
    "\t\t)\n"
    "\t})\n"
    "\n"
    "\tw.Header().Set(\"Content-Type\", \"application/json\")\n"
    "\tw.WriteHeader(http.StatusCreated)\n"
    "\tjson.NewEncoder(w).Encode(map[string]any{\n"
    "\t\t\"affectation\": map[string]any{\n"
    "\t\t\t\"id\":                  row.ID,\n"
    "\t\t\t\"enseignantId\":        row.EnseignantID,\n"
    "\t\t\t\"uniteEnseignementId\": row.UniteEnseignementID,\n"
    "\t\t\t\"typeSeance\":          row.TypeSeance,\n"
    "\t\t\t\"groupe\":              row.Groupe,\n"
    "\t\t\t\"volumeHeures\":        row.VolumeHeures,\n"
    "\t\t\t\"anneeUniversitaire\":  row.AnneeUniversitaire,\n"
    "\t\t\t\"statut\":              row.Statut,\n"
    "\t\t\t\"commentaire\":         row.Commentaire,\n"
    "\t\t},\n"
    "\t})\n"
    "}\n"
)
NEW_CREATE = (
    "\t\t).Scan(\n"
    "\t\t\t&row.ID, &row.EnseignantID, &row.UniteEnseignementID,\n"
    "\t\t\t&row.TypeSeance, &row.Groupe, &row.VolumeHeures,\n"
    "\t\t\t&row.AnneeUniversitaire, &row.Statut, &row.Commentaire,\n"
    "\t\t)\n"
    "\t})\n"
    "\n"
    "\t// PROG-ACAD-CRITICAL-FIX-1 : ne plus avaler l'erreur SQL (BUG #3).\n"
    "\t// Avant, `_ = appdb.WithTx(...)` jetait l'erreur \u2192 si l'INSERT fail\n"
    "\t// (unique violation sur (enseignantId, uniteEnseignementId, typeSeance,\n"
    "\t// groupe, anneeUniversitaire), FK violation, enum invalide pour\n"
    "\t// typeSeance/statut, RLS policy block), la response \u00e9tait 201 Created\n"
    "\t// avec `{affectation: {id: \"\", ...}}` (tous les champs vides) \u2192 le\n"
    "\t// frontend voyait un 201, affichait un toast succ\u00e8s, mais aucune\n"
    "\t// affectation n'\u00e9tait cr\u00e9\u00e9e. Silent data loss.\n"
    "\tif err != nil {\n"
    "\t\terrMsg := err.Error()\n"
    "\t\tswitch {\n"
    "\t\tcase strings.Contains(errMsg, \"Affectation_enseignantId_fkey\"),\n"
    "\t\t\tstrings.Contains(errMsg, \"foreign key constraint\") && strings.Contains(errMsg, \"enseignantId\"):\n"
    "\t\t\twriteJSONError(w, http.StatusBadRequest, \"Enseignant introuvable\")\n"
    "\t\tcase strings.Contains(errMsg, \"Affectation_uniteEnseignementId_fkey\"),\n"
    "\t\t\tstrings.Contains(errMsg, \"foreign key constraint\") && strings.Contains(errMsg, \"uniteEnseignementId\"):\n"
    "\t\t\twriteJSONError(w, http.StatusBadRequest, \"Unit\u00e9 d'enseignement introuvable\")\n"
    "\t\tcase strings.Contains(errMsg, \"foreign key constraint\"):\n"
    "\t\t\twriteJSONError(w, http.StatusBadRequest, \"R\u00e9f\u00e9rence FK invalide\")\n"
    "\t\tcase strings.Contains(errMsg, \"unique constraint\"), strings.Contains(errMsg, \"duplicate key\"):\n"
    "\t\t\twriteJSONError(w, http.StatusConflict, \"Cette affectation existe d\u00e9j\u00e0 (doublon enseignant/UE/type/groupe/ann\u00e9e)\")\n"
    "\t\tcase strings.Contains(errMsg, \"invalid_enum_value\"), strings.Contains(errMsg, \"invalid input value for enum\"):\n"
    "\t\t\twriteJSONError(w, http.StatusBadRequest, \"Valeur d'enum invalide (typeSeance ou statut)\")\n"
    "\t\tdefault:\n"
    "\t\t\twriteJSONError(w, http.StatusInternalServerError, \"Erreur lors de la cr\u00e9ation: \"+errMsg)\n"
    "\t\t}\n"
    "\t\treturn\n"
    "\t}\n"
    "\n"
    "\tw.Header().Set(\"Content-Type\", \"application/json\")\n"
    "\tw.WriteHeader(http.StatusCreated)\n"
    "\tjson.NewEncoder(w).Encode(map[string]any{\n"
    "\t\t\"affectation\": map[string]any{\n"
    "\t\t\t\"id\":                  row.ID,\n"
    "\t\t\t\"enseignantId\":        row.EnseignantID,\n"
    "\t\t\t\"uniteEnseignementId\": row.UniteEnseignementID,\n"
    "\t\t\t\"typeSeance\":          row.TypeSeance,\n"
    "\t\t\t\"groupe\":              row.Groupe,\n"
    "\t\t\t\"volumeHeures\":        row.VolumeHeures,\n"
    "\t\t\t\"anneeUniversitaire\":  row.AnneeUniversitaire,\n"
    "\t\t\t\"statut\":              row.Statut,\n"
    "\t\t\t\"commentaire\":         row.Commentaire,\n"
    "\t\t},\n"
    "\t})\n"
    "}\n"
)
if content.count(OLD_CREATE) != 1:
    print(f"ERROR: createAffectation closing block not found uniquely", file=sys.stderr)
    sys.exit(1)
content = content.replace(OLD_CREATE, NEW_CREATE)

# ─── Step 4: replace closing block of updateAffectation ───
OLD_UPDATE = (
    "\t).Scan(&row.ID, &row.Statut)\n"
    "\t})\n"
    "\n"
    "\tw.Header().Set(\"Content-Type\", \"application/json\")\n"
    "\tjson.NewEncoder(w).Encode(map[string]any{\n"
    "\t\t\"affectation\": map[string]any{\n"
    "\t\t\t\"id\":     row.ID,\n"
    "\t\t\t\"statut\": row.Statut,\n"
    "\t\t},\n"
    "\t})\n"
    "}\n"
)
NEW_UPDATE = (
    "\t).Scan(&row.ID, &row.Statut)\n"
    "\t})\n"
    "\n"
    "\t// PROG-ACAD-CRITICAL-FIX-1 : ne plus avaler l'erreur SQL (BUG #3).\n"
    "\t// Si l'UPDATE fail (not found \u2192 Scan retourne pgx.ErrNoRows, FK violation,\n"
    "\t// unique constraint, enum invalide), on retourne le code HTTP appropri\u00e9\n"
    "\t// au lieu d'une response 200 avec `{affectation: {id: \"\", statut: \"\"}}`.\n"
    "\tif err != nil {\n"
    "\t\terrMsg := err.Error()\n"
    "\t\tswitch {\n"
    "\t\tcase strings.Contains(errMsg, \"no rows in result set\"):\n"
    "\t\t\twriteJSONError(w, http.StatusNotFound, \"Affectation introuvable\")\n"
    "\t\tcase strings.Contains(errMsg, \"Affectation_enseignantId_fkey\"),\n"
    "\t\t\tstrings.Contains(errMsg, \"foreign key constraint\") && strings.Contains(errMsg, \"enseignantId\"):\n"
    "\t\t\twriteJSONError(w, http.StatusBadRequest, \"Enseignant introuvable\")\n"
    "\t\tcase strings.Contains(errMsg, \"Affectation_uniteEnseignementId_fkey\"),\n"
    "\t\t\tstrings.Contains(errMsg, \"foreign key constraint\") && strings.Contains(errMsg, \"uniteEnseignementId\"):\n"
    "\t\t\twriteJSONError(w, http.StatusBadRequest, \"Unit\u00e9 d'enseignement introuvable\")\n"
    "\t\tcase strings.Contains(errMsg, \"foreign key constraint\"):\n"
    "\t\t\twriteJSONError(w, http.StatusBadRequest, \"R\u00e9f\u00e9rence FK invalide\")\n"
    "\t\tcase strings.Contains(errMsg, \"unique constraint\"), strings.Contains(errMsg, \"duplicate key\"):\n"
    "\t\t\twriteJSONError(w, http.StatusConflict, \"Cette affectation existe d\u00e9j\u00e0 (doublon)\")\n"
    "\t\tcase strings.Contains(errMsg, \"invalid_enum_value\"), strings.Contains(errMsg, \"invalid input value for enum\"):\n"
    "\t\t\twriteJSONError(w, http.StatusBadRequest, \"Valeur d'enum invalide (typeSeance ou statut)\")\n"
    "\t\tdefault:\n"
    "\t\t\twriteJSONError(w, http.StatusInternalServerError, \"Erreur lors de la mise \u00e0 jour: \"+errMsg)\n"
    "\t\t}\n"
    "\t\treturn\n"
    "\t}\n"
    "\n"
    "\tw.Header().Set(\"Content-Type\", \"application/json\")\n"
    "\tjson.NewEncoder(w).Encode(map[string]any{\n"
    "\t\t\"affectation\": map[string]any{\n"
    "\t\t\t\"id\":     row.ID,\n"
    "\t\t\t\"statut\": row.Statut,\n"
    "\t\t},\n"
    "\t})\n"
    "}\n"
)
if content.count(OLD_UPDATE) != 1:
    print(f"ERROR: updateAffectation closing block not found uniquely", file=sys.stderr)
    sys.exit(1)
content = content.replace(OLD_UPDATE, NEW_UPDATE)

# ─── Step 5: replace closing block of deleteAffectation ───
OLD_DELETE = (
    "\t\tdeleted = cmd.RowsAffected() > 0\n"
    "\t\treturn nil\n"
    "\t})\n"
    "\n"
    "\tw.Header().Set(\"Content-Type\", \"application/json\")\n"
    "\tjson.NewEncoder(w).Encode(map[string]any{\n"
    "\t\t\"deleted\": deleted,\n"
    "\t\t\"id\":      id,\n"
    "\t})\n"
    "}\n"
)
NEW_DELETE = (
    "\t\tdeleted = cmd.RowsAffected() > 0\n"
    "\t\treturn nil\n"
    "\t})\n"
    "\n"
    "\t// PROG-ACAD-CRITICAL-FIX-1 : ne plus avaler l'erreur SQL (BUG #3).\n"
    "\t// `deleted` refl\u00e8te RowsAffected (true si ligne supprim\u00e9e, false si not\n"
    "\t// found ou erreur) \u2014 mais les erreurs SQL \u00e9taient quand m\u00eame silencieuses.\n"
    "\t// On retourne d\u00e9sormais le code HTTP appropri\u00e9 en cas d'erreur.\n"
    "\tif err != nil {\n"
    "\t\terrMsg := err.Error()\n"
    "\t\tswitch {\n"
    "\t\tcase strings.Contains(errMsg, \"foreign key constraint\"):\n"
    "\t\t\t// Une affectation est r\u00e9f\u00e9renc\u00e9e par une table enfant (Epreuve, etc.).\n"
    "\t\t\twriteJSONError(w, http.StatusConflict, \"Affectation r\u00e9f\u00e9renc\u00e9e par d'autres entit\u00e9s (suppression impossible)\")\n"
    "\t\tdefault:\n"
    "\t\t\twriteJSONError(w, http.StatusInternalServerError, \"Erreur lors de la suppression: \"+errMsg)\n"
    "\t\t}\n"
    "\t\treturn\n"
    "\t}\n"
    "\n"
    "\tw.Header().Set(\"Content-Type\", \"application/json\")\n"
    "\tjson.NewEncoder(w).Encode(map[string]any{\n"
    "\t\t\"deleted\": deleted,\n"
    "\t\t\"id\":      id,\n"
    "\t})\n"
    "}\n"
)
if content.count(OLD_DELETE) != 1:
    print(f"ERROR: deleteAffectation closing block not found uniquely", file=sys.stderr)
    sys.exit(1)
content = content.replace(OLD_DELETE, NEW_DELETE)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(content)

print(f"OK: fixed 4 affectation handlers in {PATH}")
