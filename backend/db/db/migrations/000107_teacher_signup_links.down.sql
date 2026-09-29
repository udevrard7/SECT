-- 000107 DOWN — TeacherSignupLink : rollback complet (SECT-TEACHER-REG-LINK-1)
-- Ordre inverse des dépendances FK : TeacherRegistrationEvent → fonctions → table.

DROP POLICY IF EXISTS "TeacherRegistrationEvent_select" ON "TeacherRegistrationEvent";
DROP FUNCTION IF EXISTS public.log_teacher_registration_event(text, text, text, text, text, boolean, text);
DROP TABLE IF EXISTS "TeacherRegistrationEvent";

DROP FUNCTION IF EXISTS public.expire_teacher_signup_links();
DROP FUNCTION IF EXISTS public.accept_teacher_signup(text, text, text, text);
DROP FUNCTION IF EXISTS public.find_teacher_signup_link_by_token(text);

DROP POLICY IF EXISTS "TeacherSignupLink_delete" ON "TeacherSignupLink";
DROP POLICY IF EXISTS "TeacherSignupLink_update" ON "TeacherSignupLink";
DROP POLICY IF EXISTS "TeacherSignupLink_insert" ON "TeacherSignupLink";
DROP POLICY IF EXISTS "TeacherSignupLink_select" ON "TeacherSignupLink";
DROP TABLE IF EXISTS "TeacherSignupLink";
