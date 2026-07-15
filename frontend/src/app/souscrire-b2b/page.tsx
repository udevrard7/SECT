'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Building2, ArrowLeft, AlertCircle, CheckCircle2, Phone, Mail, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * /souscrire-b2b — Page d'inscription self-service pour les institutions B2B.
 *
 * SECT-B2B-FACTURATION (Priorité 3) : un établissement s'inscrit lui-même.
 * Crée : Établissement + RESPONSABLE + abonnement ESSAI (14 jours).
 * L'admin SECT valide ensuite (ESSAI → ACTIF).
 */
export default function SouscrireB2BPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    etabNom: '', etabType: 'UNIVERSITE', etabVille: '', etabPays: "Côte d'Ivoire",
    etabTelephone: '', respName: '', respEmail: '', respPassword: '', nbEtudiants: '50',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/subscriptions/b2b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          nbEtudiants: parseInt(form.nbEtudiants) || 50,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l\'inscription')
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'inscription')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-orange-50/30 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200/60 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-100 mb-4">
            <CheckCircle2 className="h-9 w-9 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Inscription reçue !</h1>
          <p className="text-sm text-slate-600 mb-6">
            Un <strong>email de vérification</strong> vous a été envoyé. Cliquez sur le lien
            qu'il contient pour confirmer votre adresse email.
          </p>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-xs text-slate-600 mb-2">Prochaines étapes :</p>
            <ol className="text-sm text-slate-700 list-decimal list-inside space-y-1">
              <li>Vérifiez votre email (boîte de réception)</li>
              <li>Cliquez sur le lien de vérification</li>
              <li>Notre équipe valide votre établissement sous 24h</li>
              <li>Vous recevez un email de confirmation → essai 14 jours</li>
            </ol>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
            <p className="text-xs text-blue-700">
              💡 Vous pouvez utiliser un email Gmail, Yahoo ou Outlook. Notre équipe
              vérifiera votre établissement avant l'activation de l'essai.
            </p>
          </div>
          <Button onClick={() => router.push('/')} variant="outline" className="w-full">
            Retour à l'accueil
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/30 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="h-4 w-4" /> Retour à l'accueil
        </button>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/60 p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-50 mb-4">
              <Building2 className="h-7 w-7 text-orange-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Inscription Institutionnel</h1>
            <p className="text-sm text-slate-600">
              Inscrivez votre établissement. Période d'essai de 14 jours, sans engagement.
              Modèle capitation : 900 FCFA/étudiant/an (plancher 50 étudiants).
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Établissement */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Établissement</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-slate-500">Nom de l'établissement *</Label>
                  <Input value={form.etabNom} onChange={(e) => setForm({...form, etabNom: e.target.value})} required className="h-11" placeholder="Université..." />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Ville</Label>
                  <Input value={form.etabVille} onChange={(e) => setForm({...form, etabVille: e.target.value})} className="h-11" placeholder="Abidjan" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Téléphone</Label>
                  <Input value={form.etabTelephone} onChange={(e) => setForm({...form, etabTelephone: e.target.value})} className="h-11" placeholder="+225..." />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Nb étudiants estimé</Label>
                  <Input type="number" min="50" value={form.nbEtudiants} onChange={(e) => setForm({...form, nbEtudiants: e.target.value})} className="h-11" />
                </div>
              </div>
            </div>

            {/* Responsable */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Responsable (compte administrateur)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-slate-500">Nom complet *</Label>
                  <Input value={form.respName} onChange={(e) => setForm({...form, respName: e.target.value})} required className="h-11" placeholder="Jean Kouassi" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Email *</Label>
                  <Input type="email" value={form.respEmail} onChange={(e) => setForm({...form, respEmail: e.target.value})} required className="h-11" placeholder="responsable@etablissement.ci" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs text-slate-500">Mot de passe * (min 8 caractères)</Label>
                  <Input type="password" value={form.respPassword} onChange={(e) => setForm({...form, respPassword: e.target.value})} required minLength={8} className="h-11" />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold">
              {loading ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Inscription...</> : 'Inscrire mon établissement'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
