'use client'

import { useEffect, useState, useCallback } from 'react'
import { Users, Filter, ServerCrash, RefreshCw, CheckCircle, Shield, MoreHorizontal, Save, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Types ───

interface Enseignant {
  id: string;
  name: string;
  email: string;
  filiereId: string | null;
}

interface Filiere {
  id: string;
  nom: string;
}

interface HabilitationsData {
  enseignants: Enseignant[];
  filieres: Filiere[];
}

// ─── Skeleton Loader ───

const HabilitationsSkeleton = () => (
  <div className="space-y-6">
      <Skeleton className="h-10 w-3/4" />
      <Card>
        <CardHeader>
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-4 w-1/2 mt-1" />
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead><Skeleton className="h-5 w-24" /></TableHead>
                        <TableHead><Skeleton className="h-5 w-32" /></TableHead>
                        <TableHead><Skeleton className="h-5 w-16" /></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Array.from({length: 5}).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                            <TableCell><Skeleton className="h-9 w-full" /></TableCell>
                            <TableCell><Skeleton className="h-9 w-12" /></TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
  </div>
);

// ─── Main Page Component ───

export default function HabilitationsPage() {
  const [data, setData] = useState<HabilitationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, string | null>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/responsable/habilitations');
      if (!res.ok) throw new Error('Failed to fetch');
      const fetchedData: HabilitationsData = await res.json();
      setData(fetchedData);
    } catch (e) {
      setError(true);
      toast.error("Impossible de charger les données d'habilitation.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFiliereChange = (enseignantId: string, filiereId: string) => {
    const originalFiliereId = data?.enseignants.find(e => e.id === enseignantId)?.filiereId;
    // Handle 'unassigned' case
    const newFiliereId = filiereId === '__null__' ? null : filiereId

    if (originalFiliereId === newFiliereId) {
        const newChanges = { ...pendingChanges };
        delete newChanges[enseignantId];
        setPendingChanges(newChanges);
    } else {
        setPendingChanges({ ...pendingChanges, [enseignantId]: newFiliereId });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const promise = fetch('/api/responsable/habilitations', {
        method: 'POST',
        body: JSON.stringify({ changes: pendingChanges })
    });

    toast.promise(promise, {
        loading: 'Sauvegarde des modifications en cours...',
        success: () => {
            setSaving(false);
            // Optimistically update the local state
            if(data) {
                const updatedEnseignants = data.enseignants.map(ens => 
                    pendingChanges[ens.id] !== undefined ? { ...ens, filiereId: pendingChanges[ens.id] } : ens
                );
                setData({ ...data, enseignants: updatedEnseignants });
            }
            setPendingChanges({});
            return 'Habilitations mises à jour avec succès !';
        },
        error: (err) => {
            setSaving(false);
            return 'Une erreur est survenue lors de la sauvegarde.';
        }
    });
  }

  if (loading) return <HabilitationsSkeleton />;

  if (error || !data) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24 text-center">
            <ServerCrash className="mb-4 h-16 w-16 text-destructive/80" />
            <h3 className="text-xl font-semibold">Erreur de chargement</h3>
            <p className="mt-2 text-sm text-muted-foreground">Le service est actuellement indisponible.</p>
            <Button onClick={fetchData} className="mt-4"> <RefreshCw className="mr-2 h-4 w-4" /> Réessayer </Button>
        </div>
    );
  }

  const { enseignants, filieres } = data;
  const nbChanges = Object.keys(pendingChanges).length;

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight flex items-center">
                <Shield className="mr-3 text-blue-500" /> Gestion des Habilitations
            </h1>
            <Button onClick={handleSave} disabled={nbChanges === 0 || saving}>
                {saving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Sauvegarde...</>
                ) : (
                    <><Save className="mr-2 h-4 w-4"/> Enregistrer {nbChanges > 0 ? `les ${nbChanges} changement(s)` : ''}</>
                )}
            </Button>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Enseignants de l'établissement</CardTitle>
                <CardDescription>
                    Assignez une filière principale à chaque enseignant. Ils pourront créer des épreuves pour cette filière.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Enseignant</TableHead>
                            <TableHead className="w-[300px]">Filière Assignée</TableHead>
                            <TableHead className="text-right w-[100px]">Statut</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {enseignants.map(enseignant => {
                            const currentFiliereId = pendingChanges[enseignant.id] !== undefined ? pendingChanges[enseignant.id] : enseignant.filiereId;
                            const hasChanged = pendingChanges[enseignant.id] !== undefined;

                            return (
                                <TableRow key={enseignant.id}>
                                    <TableCell>
                                        <div className="font-medium">{enseignant.name}</div>
                                        <div className="text-xs text-muted-foreground">{enseignant.email}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Select 
                                            value={currentFiliereId || '__null__'} 
                                            onValueChange={(value) => handleFiliereChange(enseignant.id, value)}
                                            disabled={saving}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Aucune filière assignée" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__null__">Aucune filière</SelectItem>
                                                {filieres.map(f => (
                                                    <SelectItem key={f.id} value={f.id}>{f.nom}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {hasChanged && (
                                            <Badge variant="outline" className="text-amber-600 border-amber-500/50">
                                                Modifié
                                            </Badge>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    </div>
  )
}
