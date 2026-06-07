import NextAuth, { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db, withRetry } from '@/lib/db'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    // ─── Personnel login (email + password) ───
    CredentialsProvider({
      id: 'credentials-email',
      name: 'Personnel',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email et mot de passe requis')
        }

        const user = await withRetry(() =>
          db.user.findUnique({
            where: { email: credentials.email },
            include: {
              etablissement: { select: { id: true, nom: true } },
              filiere: { select: { id: true, nom: true } },
            },
          })
        )

        if (!user) {
          throw new Error('Identifiants incorrects')
        }

        const passwordMatch = await bcrypt.compare(credentials.password, user.password)
        if (!passwordMatch) {
          throw new Error('Identifiants incorrects')
        }

        if (!user.actif) {
          throw new Error('Votre compte a été désactivé. Contactez un administrateur.')
        }

        // Update last connection
        await withRetry(() =>
          db.user.update({
            where: { id: user.id },
            data: { derniereConnexion: new Date() },
          })
        ).catch(() => {})

        // Create audit log
        await db.auditLog.create({
          data: {
            userId: user.id,
            userEmail: user.email,
            action: 'LOGIN',
            entite: 'User',
            entiteId: user.id,
            details: JSON.stringify({ name: user.name, role: user.role }),
          },
        }).catch(() => {})

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          etablissementId: user.etablissementId,
          filiereId: user.filiereId,
          etablissement: user.etablissement,
          filiere: user.filiere,
          actif: user.actif,
          matricule: user.matricule,
          mustChangePwd: user.mustChangePwd,
          image: user.image,
        }
      },
    }),

    // ─── Student login (matricule + password) ───
    CredentialsProvider({
      id: 'credentials-matricule',
      name: 'Étudiant',
      credentials: {
        matricule: { label: 'Matricule', type: 'text' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.matricule || !credentials?.password) {
          throw new Error('Matricule et mot de passe requis')
        }

        const user = await withRetry(() =>
          db.user.findUnique({
            where: { matricule: credentials.matricule },
            include: {
              etablissement: { select: { id: true, nom: true } },
              filiere: { select: { id: true, nom: true } },
            },
          })
        )

        if (!user) {
          throw new Error('Matricule ou mot de passe incorrect')
        }

        if (user.role !== 'ETUDIANT') {
          throw new Error("Ce matricule n'est pas associé à un compte étudiant")
        }

        const passwordMatch = await bcrypt.compare(credentials.password, user.password)
        if (!passwordMatch) {
          throw new Error('Matricule ou mot de passe incorrect')
        }

        if (!user.actif) {
          throw new Error('Votre compte a été désactivé. Contactez un administrateur.')
        }

        // Update last connection
        await withRetry(() =>
          db.user.update({
            where: { id: user.id },
            data: { derniereConnexion: new Date() },
          })
        ).catch(() => {})

        // Create audit log
        await db.auditLog.create({
          data: {
            userId: user.id,
            userEmail: user.email,
            action: 'LOGIN_MATRICULE',
            entite: 'User',
            entiteId: user.id,
            details: JSON.stringify({ name: user.name, role: user.role, matricule: user.matricule }),
          },
        }).catch(() => {})

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          etablissementId: user.etablissementId,
          filiereId: user.filiereId,
          etablissement: user.etablissement,
          filiere: user.filiere,
          actif: user.actif,
          matricule: user.matricule,
          mustChangePwd: user.mustChangePwd,
          image: user.image,
        }
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },

  jwt: {
    maxAge: 24 * 60 * 60, // 24 hours
  },

  callbacks: {
    async jwt({ token, user }) {
      // On initial sign in, add user data to the JWT token
      if (user) {
        token.userId = user.id
        token.role = user.role
        token.etablissementId = user.etablissementId
        token.filiereId = user.filiereId
        token.etablissement = user.etablissement
        token.filiere = user.filiere
        token.actif = user.actif
        token.matricule = user.matricule
        token.mustChangePwd = user.mustChangePwd
      }
      return token
    },

    async session({ session, token }) {
      // Expose JWT data to the client session
      if (session.user) {
        session.user.id = token.userId as string
        session.user.role = token.role as string
        session.user.etablissementId = token.etablissementId as string | null
        session.user.filiereId = token.filiereId as string | null
        session.user.etablissement = token.etablissement as { id: string; nom: string } | null
        session.user.filiere = token.filiere as { id: string; nom: string } | null
        session.user.actif = token.actif as boolean
        session.user.matricule = token.matricule as string | null
        session.user.mustChangePwd = token.mustChangePwd as boolean
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    callbackUrl: {
      name: `__Secure-next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: `__Host-next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
