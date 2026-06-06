'use client'

import { useEffect, useState, useCallback } from 'react'
import { BarChart3, Users, ClipboardCheck, Percent, BookOpen, ServerCrash, RefreshCw, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getAuthHeaders } from '@/stores/auth-store'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Types ───

interface RapportFiliere {
  id: string;
  nom: string;
  nbEtudiants: number;
  nbEpreuves: number;
  tauxReussiteMoyen: number;
  nbUes: number;
}

// ─── Skeleton Loader ───

const RapportSkeleton = () => (
    <div className="space-y-6">
        <Skeleton className="h-10 w-3/4" />
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({length: 3}).map((_, i) => (
                <Card key={i}>
                    <CardHeader>
                        <Skeleton className="h-6 w-1/2" />
                        <Skeleton className="h-4 w-1/3 mt-1" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </CardContent>
                </Card>
            ))}
        </div>
    </div>
);

// ─── Stat Item Helper ───

const StatItem = ({ icon, label, value, unit, color }: { icon: React.ReactNode, label: string, value: string | number, unit?: string, color: string }) => (
    <div className="flex items-center space-x-3 rounded-md bg-muted/50 p-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full`} style={{backgroundColor: `${color}20`}}>
           <div style={{color}}>{icon}</div>
        </div>
        <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-xl font-bold">
                {value} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
            </p>
        </div>
    </div>
)

// ─── Main Page Component ───

export default function RapportsPage() {
  const [rapports, setRapports] = useState<RapportFiliere[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/responsable/rapports/filieres', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch');
      const data: RapportFiliere[] = await res.json();
      setRapports(data);
    } catch (e) {
      setError(true);
      toast.error("Impossible de charger les rapports de performance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <RapportSkeleton />;

  if (error) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24 text-center">
            <ServerCrash className="mb-4 h-16 w-16 text-destructive/80" />
            <h3 className="text-xl font-semibold">Erreur de chargement</h3>
            <p className="mt-2 text-sm text-muted-foreground">Le service de rapports est actuellement indisponible.</p>
            <Button onClick={fetchData} className="mt-4"> <RefreshCw className="mr-2 h-4 w-4" /> Réessayer </Button>
        </div>
    );
  }

  return (
    <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center">
            <BarChart3 className="mr-3 text-purple-500" /> Rapports de Performance
        </h1>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {rapports.map(rapport => (
                <Card key={rapport.id} className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center"><Trophy className="mr-2 text-amber-500"/>{rapport.nom}</CardTitle>
                        <CardDescription>{rapport.nbUes} Unités d'enseignement</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-3">
                        <StatItem icon={<Users/>} label="Étudiants Inscrits" value={rapport.nbEtudiants} color="#3498db"/>
                        <StatItem icon={<ClipboardCheck/>} label="Épreuves Évaluées" value={rapport.nbEpreuves} color="#e67e22"/>
                        <StatItem icon={<Percent/>} label="Taux de Réussite Moyen" value={rapport.tauxReussiteMoyen.toFixed(1)} unit="%" color="#27ae60"/>
                    </CardContent>
                </Card>
            ))}
        </div>
    </div>
  )
}
