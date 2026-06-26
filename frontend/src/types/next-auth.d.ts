import NextAuth from 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    role: string
    etablissementId: string | null
    filiereId: string | null
    etablissement: { id: string; nom: string } | null
    filiere: { id: string; nom: string } | null
    actif: boolean
    matricule: string | null
    mustChangePwd: boolean
  }

  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role: string
      etablissementId: string | null
      filiereId: string | null
      etablissement: { id: string; nom: string } | null
      filiere: { id: string; nom: string } | null
      actif: boolean
      matricule: string | null
      mustChangePwd: boolean
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string
    role: string
    etablissementId: string | null
    filiereId: string | null
    etablissement: { id: string; nom: string } | null
    filiere: { id: string; nom: string } | null
    actif: boolean
    matricule: string | null
    mustChangePwd: boolean
  }
}
