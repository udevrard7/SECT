'use client'
import { useEffect, useState, useCallback } from 'react'
import { AlertTriangle, User, BookOpen, ChevronRight, Inbox, RefreshCw, ServerCrash } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
import { toast } from 'sonner'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Types ───

interface Alerte {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  epreuve: {
    id: string;
    titre: string;
    enseignant: {
      id: string;
      name: string;
    };
  };
  resolu: boolean;
}

// ─── Helpers ───

const getAlertTypeDetails = (type: string) => {
    switch (type) {
      case 'PERFORMANCE':
        return { label: 'Performance', color: '#e74c3c', description: 'Taux de réussite anormalement bas.' };
      case 'FRAUDE':
        return { label: 'Fraude', color: '#f39c12', description: 'Tentative de fraude détectée.' };
      case 'SYSTEME':
        return { label: 'Système', color: '#3498db', description: 'Alerte système.' };
      case 'RAPPEL':
        return { label: 'Rappel', color: '#2ecc71', description: 'Rappel de date limite.' };
      default:
        return { label: type, color: '#95a5a6', description: 'Alerte de type non défini.' };
    }
}

// ─── AlertList Skeleton ───

const AlertListSkeleton = () => (
  <div className="space-y-4">
    <Skeleton className="h-10 w-1/4" />
    <Card className="p-4 space-y-3">
        <div className="flex justify-between items-center">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-6 w-1/4" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
    </Card>
    <Card className="p-4 space-y-3">
        <div className="flex justify-between items-center">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-6 w-1/4" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
    </Card>
  </div>
);

// ─── Main Component ───

export default function CentreAlertesPage() {
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchAlertes = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/responsable/alertes', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch');
      const data: Alerte[] = await res.json();
      setAlertes(data);
    } catch (e) {
      setError(true);
      toast.error('Impossible de charger les alertes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlertes();
  }, [fetchAlertes]);

  if (loading) return <AlertListSkeleton />;

  if (error) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24 text-center">
            <ServerCrash className="mb-4 h-16 w-16 text-destructive/80" />
            <h3 className="text-xl font-semibold">Erreur de chargement</h3>
            <p className="mt-2 text-sm text-muted-foreground">Le service d'alertes est actuellement indisponible.</p>
            <Button onClick={fetchAlertes} className="mt-4"> <RefreshCw className="mr-2 h-4 w-4" /> Réessayer </Button>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight flex items-center">
          <AlertTriangle className="mr-3 text-amber-500" /> Centre d'Alertes
        </h1>
        <Badge variant="outline">{alertes.length} alerte(s) active(s)</Badge>
      </div>

      {alertes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24 text-center">
            <Inbox className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <h3 className="text-xl font-semibold">Boîte de réception vide</h3>
            <p className="mt-2 text-sm text-muted-foreground">Aucune alerte à signaler pour le moment. Excellent travail !</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alertes.map((alerte) => {
            const { label, color, description } = getAlertTypeDetails(alerte.type);
            return (
              <Card key={alerte.id} className="p-4 transition-all hover:shadow-md">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center">
                      <Badge style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40`}} className="border mb-2 sm:mb-0">{label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(alerte.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                  </div>
                  <p className="my-2 text-muted-foreground">{alerte.description}</p>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-muted/50 p-3 rounded-md">
                    <div className="space-y-1 mb-2 sm:mb-0">
                      <div className="flex items-center text-sm">
                          <BookOpen className="mr-2 h-4 w-4 text-muted-foreground"/>
                          <span className="font-semibold">{alerte.epreuve.titre}</span>
                      </div>
                      <div className="flex items-center text-xs">
                          <User className="mr-2 h-3 w-3 text-muted-foreground"/>
                          <span>{alerte.epreuve.enseignant.name}</span>
                      </div>
                    </div>
                    <Link href={`/epreuves/${alerte.epreuve.id}`} passHref>
                      <Button variant="outline" size="sm">
                        Voir l'épreuve <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
