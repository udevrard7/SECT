#!/usr/bin/env python3
"""PROG-ACAD-CRITICAL-FIX-1 — Fix createEnseignantFilieres handler.

Replace single-decode handler with bulk-aware (backward-compatible) handler.
Preserves TAB indentation in Go source file.
"""
import sys

PATH = "/home/z/SECT/backend/internal/transport/http/academique_handlers.go"

# Old block (exact, with tabs).
OLD = (
    "// createEnseignantFilieres \u2014 POST /api/enseignant-filieres\n"
    "func (s *Server) createEnseignantFilieres(w http.ResponseWriter, r *http.Request) {\n"
    "\tclaims, ok := middleware.ClaimsFromContext(r.Context())\n"
    "\tif !ok {\n"
    "\t\twriteJSONError(w, http.StatusUnauthorized, \"authentication required\")\n"
    "\t\treturn\n"
    "\t}\n"
    "\tvar input domain.CreateAssignmentInput\n"
    "\tif err := json.NewDecoder(r.Body).Decode(&input); err != nil {\n"
    "\t\twriteJSONError(w, http.StatusBadRequest, \"JSON invalide\")\n"
    "\t\treturn\n"
    "\t}\n"
    "\tef, err := s.efUC.Create(r.Context(), claims, input)\n"
    "\tif err != nil {\n"
    "\t\tmiddleware.MapDomainError(w, err)\n"
    "\t\treturn\n"
    "\t}\n"
    "\tw.Header().Set(\"Content-Type\", \"application/json\")\n"
    "\tw.WriteHeader(http.StatusCreated)\n"
    "\tjson.NewEncoder(w).Encode(map[string]any{\"assignments\": []any{ef}})\n"
    "}\n"
)

# New block — bulk decode + single retro-compat.
NEW = (
    "// createEnseignantFilieres \u2014 POST /api/enseignant-filieres\n"
    "//\n"
    "// BUGFIX (PROG-ACAD-CRITICAL-FIX-1) : le frontend enseignants-page.tsx envoie\n"
    "// du bulk `{assignments: [...]}` (CreateAssignmentsInput) mais l'ancien handler\n"
    "// d\u00e9codait un seul `CreateAssignmentInput` \u2192 Go's json.Decoder ignore les champs\n"
    "// inconnus, donc le d\u00e9codage r\u00e9ussissait mais tous les champs \u00e9taient vides \u2192\n"
    "// `efUC.Create` retournait `ValidationError{enseignantId: \"requis\"}` \u2192 400\n"
    "// silencieux c\u00f4t\u00e9 UI. On accepte d\u00e9sormais les deux formats (bulk ET single\n"
    "// r\u00e9tro-compatible) en une seule passe de d\u00e9codage.\n"
    "func (s *Server) createEnseignantFilieres(w http.ResponseWriter, r *http.Request) {\n"
    "\tclaims, ok := middleware.ClaimsFromContext(r.Context())\n"
    "\tif !ok {\n"
    "\t\twriteJSONError(w, http.StatusUnauthorized, \"authentication required\")\n"
    "\t\treturn\n"
    "\t}\n"
    "\n"
    "\t// PROG-ACAD-CRITICAL-FIX-1 : d\u00e9codage bulk {assignments:[...]} ET single\n"
    "\t// (r\u00e9tro-compat) en une seule passe. Si `assignments` est non vide, on est\n"
    "\t// en bulk ; sinon on retombe sur les champs single (EnseignantID/FiliereID/Niveau).\n"
    "\tvar body struct {\n"
    "\t\tAssignments  []domain.CreateAssignmentInput `json:\"assignments\"`\n"
    "\t\tEnseignantID string                          `json:\"enseignantId\"`\n"
    "\t\tFiliereID    string                          `json:\"filiereId\"`\n"
    "\t\tNiveau       string                          `json:\"niveau\"`\n"
    "\t}\n"
    "\tif err := json.NewDecoder(r.Body).Decode(&body); err != nil {\n"
    "\t\twriteJSONError(w, http.StatusBadRequest, \"JSON invalide (attendu: {assignments: [...]} ou {enseignantId, filiereId, niveau})\")\n"
    "\t\treturn\n"
    "\t}\n"
    "\n"
    "\t// Branche bulk (format par d\u00e9faut du frontend enseignants-page.tsx).\n"
    "\tif len(body.Assignments) > 0 {\n"
    "\t\tcreated := make([]any, 0, len(body.Assignments))\n"
    "\t\terrs := make([]any, 0)\n"
    "\t\tfor _, input := range body.Assignments {\n"
    "\t\t\tef, err := s.efUC.Create(r.Context(), claims, input)\n"
    "\t\t\tif err != nil {\n"
    "\t\t\t\terrs = append(errs, map[string]any{\n"
    "\t\t\t\t\t\"input\": input,\n"
    "\t\t\t\t\t\"error\": err.Error(),\n"
    "\t\t\t\t})\n"
    "\t\t\t\tcontinue\n"
    "\t\t\t}\n"
    "\t\t\tcreated = append(created, ef)\n"
    "\t\t}\n"
    "\n"
    "\t\tstatus := http.StatusCreated\n"
    "\t\tswitch {\n"
    "\t\tcase len(created) == 0 && len(errs) > 0:\n"
    "\t\t\tstatus = http.StatusBadRequest // 400 si tout a \u00e9chou\u00e9 (validation pattern)\n"
    "\t\tcase len(errs) > 0:\n"
    "\t\t\tstatus = http.StatusMultiStatus // 207 partial\n"
    "\t\t}\n"
    "\n"
    "\t\tw.Header().Set(\"Content-Type\", \"application/json\")\n"
    "\t\tw.WriteHeader(status)\n"
    "\t\tjson.NewEncoder(w).Encode(map[string]any{\n"
    "\t\t\t\"assignments\": created,\n"
    "\t\t\t\"errors\":      errs,\n"
    "\t\t})\n"
    "\t\treturn\n"
    "\t}\n"
    "\n"
    "\t// Branche single (r\u00e9tro-compat \u2014 non utilis\u00e9e par le frontend actuel mais\n"
    "\t// on pr\u00e9serve l'API pour d'\u00e9ventuels clients directs).\n"
    "\tinput := domain.CreateAssignmentInput{\n"
    "\t\tEnseignantID: body.EnseignantID,\n"
    "\t\tFiliereID:    body.FiliereID,\n"
    "\t\tNiveau:       body.Niveau,\n"
    "\t}\n"
    "\tif input.EnseignantID == \"\" && input.FiliereID == \"\" && input.Niveau == \"\" {\n"
    "\t\twriteJSONError(w, http.StatusBadRequest, \"assignments requis (format attendu: {assignments: [...]})\")\n"
    "\t\treturn\n"
    "\t}\n"
    "\tef, err := s.efUC.Create(r.Context(), claims, input)\n"
    "\tif err != nil {\n"
    "\t\tmiddleware.MapDomainError(w, err)\n"
    "\t\treturn\n"
    "\t}\n"
    "\tw.Header().Set(\"Content-Type\", \"application/json\")\n"
    "\tw.WriteHeader(http.StatusCreated)\n"
    "\tjson.NewEncoder(w).Encode(map[string]any{\"assignments\": []any{ef}})\n"
    "}\n"
)

with open(PATH, "r", encoding="utf-8") as f:
    content = f.read()

count = content.count(OLD)
if count != 1:
    print(f"ERROR: expected exactly 1 occurrence of OLD block, found {count}", file=sys.stderr)
    sys.exit(1)

content = content.replace(OLD, NEW)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(content)

print(f"OK: replaced createEnseignantFilieres handler in {PATH}")
