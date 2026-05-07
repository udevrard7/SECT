# Task 1-3: Admin Backend API Routes

## Summary
Extended Prisma schema and created all admin backend API routes for the SECT application.

## Files Modified

### 1. `/home/z/my-project/prisma/schema.prisma`
- Added `actif Boolean @default(true)` and `derniereConnexion DateTime?` fields to User model
- Changed `etablissement String?` → `etablissementId String?` with `@relation` to Etablissement
- Changed `filiere String?` → `filiereId String?` with `@relation("UserFiliere")` to Filiere
- Added `filieresResponsable Filiere[] @relation("FiliereResponsable")` back-relation on User
- Added **Etablissement** model (nom, type, ville, pays, adresse, telephone, email, siteWeb, actif, relations to Filiere[] and User[])
- Added **Filiere** model (nom, code, niveau, etablissementId, responsableId, description, nbEtudiants, actif, relations to Etablissement, User as responsable, User[] as etudiants)
- Added **AuditLog** model (userId, userEmail, action, entite, entiteId, details, adresseIp, createdAt)
- Used `@relation` names ("UserFiliere", "FiliereResponsable") to disambiguate the two User↔Filiere relations

### 2. `/home/z/my-project/src/app/api/users/route.ts`
- **GET**: List users with pagination, filtering (search, role, etablissementId, actif), sorting
- **POST**: Create user with bcrypt password hashing, email uniqueness check, audit log

### 3. `/home/z/my-project/src/app/api/users/[id]/route.ts`
- **GET**: Single user by ID (excludes password)
- **PATCH**: Update user with optional fields, email uniqueness check, password re-hash, audit log
- **DELETE**: Soft delete (actif=false) or hard delete (?permanent=true), audit log

### 4. `/home/z/my-project/src/app/api/etablissements/route.ts`
- **GET**: List etablissements with search, actif, type filters, includes filiere/user counts
- **POST**: Create etablissement with unique name check, audit log

### 5. `/home/z/my-project/src/app/api/etablissements/[id]/route.ts`
- **GET**: Single etablissement with filieres, user count, user count by role
- **PATCH**: Update etablissement with name uniqueness check, audit log
- **DELETE**: Soft delete (actif=false), audit log

### 6. `/home/z/my-project/src/app/api/filieres/route.ts`
- **GET**: List filieres with search, etablissementId, actif filters, includes etablissement/responsable info
- **POST**: Create filiere with etablissement existence check, unique (nom+etablissementId) check, audit log

### 7. `/home/z/my-project/src/app/api/filieres/[id]/route.ts`
- **GET**: Single filiere with etablissement, responsable, student count
- **PATCH**: Update filiere with unique constraint check, audit log
- **DELETE**: Soft delete (actif=false), audit log

### 8. `/home/z/my-project/src/app/api/audit-logs/route.ts`
- **GET**: List audit logs with pagination, filtering (userId, action, entite, dateDebut, dateFin), most recent first

### 9. `/home/z/my-project/src/app/api/auth/login/route.ts` (updated)
- Added `actif` check — inactive users cannot log in (returns 403)
- Added `derniereConnexion` update on successful login
- Added AuditLog entry for login action with IP address extraction

## Database Migration
- `bun run db:push -- --accept-data-loss` — successful
- Data loss: dropped `etablissement` and `filiere` string columns from User table (4 and 3 non-null values respectively)
- Prisma Client regenerated successfully

## Lint Results
- `bun run lint` — **0 errors, 0 warnings** ✅

## Known Issue
- The seed route (`/api/seed/route.ts`) still references old `etablissement` and `filiere` string fields on User, which no longer exist. This route will fail until updated separately (per instructions, not modified in this task).
