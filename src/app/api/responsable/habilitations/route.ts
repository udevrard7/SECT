import { NextRequest, NextResponse } from '''next/server'''
import { db } from '''@/lib/db'''
import { getAuth } from '''@/lib/session'''
import { z } from '''zod'''

export async function GET(request: NextRequest) {
  try {
    const session = await getAuth()
    if (session?.user?.role !== '''RESPONSABLE''') {
      return NextResponse.json({ error: '''Non autorisé''' }, { status: 403 })
    }

    const responsableId = session.user.id;

    // Get the establishment of the responsable
    const userEtablissement = await db.user.findUnique({
        where: { id: responsableId },
        select: { etablissementId: true }
    });

    if (!userEtablissement?.etablissementId) {
        return NextResponse.json({ error: '''Le responsable n\'est associé à aucun établissement.''' }, { status: 404 })
    }

    // 1. Fetch all teachers from the same establishment
    const enseignants = await db.user.findMany({
      where: {
        role: '''ENSEIGNANT''',
        etablissementId: userEtablissement.etablissementId
      },
      select: {
        id: true,
        name: true,
        email: true,
        filiere: {
            select: {
                id: true,
                nom: true
            }
        },
        filiereId: true
      },
      orderBy: {
        name: '''asc'''
      }
    })

    // 2. Fetch all filières managed by the responsable
    const filieres = await db.filiere.findMany({
        where: {
            responsables: {
                some: { id: responsableId }
            }
        },
        select: {
            id: true,
            nom: true
        },
        orderBy: {
            nom: '''asc'''
        }
    })

    return NextResponse.json({ enseignants, filieres });

  } catch (error) {
    console.error('''[API_RESPONSABLE_HABILITATIONS] ''', error)
    return NextResponse.json(
      { error: '''Erreur lors de la récupération des données d\'habilitation.''' },
      { status: 500 }
    )
  }
}

const updateHabilitationsSchema = z.object({
  changes: z.record(z.string(), z.string().nullable()),
});

export async function POST(request: NextRequest) {
    try {
        const session = await getAuth();
        if (session?.user?.role !== '''RESPONSABLE''') {
            return NextResponse.json({ error: '''Non autorisé''' }, { status: 403 });
        }

        const body = await request.json();
        const validation = updateHabilitationsSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: '''Données invalides''', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { changes } = validation.data;
        const responsableId = session.user.id;

        const userEtablissement = await db.user.findUnique({
            where: { id: responsableId },
            select: { etablissementId: true }
        });

        if (!userEtablissement?.etablissementId) {
            return NextResponse.json({ error: '''Responsable non associé à un établissement.''' }, { status: 403 });
        }

        const teacherIds = Object.keys(changes);
        
        const teachersInDb = await db.user.findMany({
            where: {
                id: { in: teacherIds },
                etablissementId: userEtablissement.etablissementId
            },
            select: { id: true }
        });

        if (teachersInDb.length !== teacherIds.length) {
            return NextResponse.json({ error: '''Modification d\'enseignants non autorisée.''' }, { status: 403 });
        }

        const updateTransactions = teacherIds.map(enseignantId => 
            db.user.update({
                where: { id: enseignantId },
                data: { filiereId: changes[enseignantId] },
            })
        );

        await db.$transaction(updateTransactions);

        return NextResponse.json({ message: '''Habilitations mises à jour avec succès''' });

    } catch (error) {
        console.error('''[API_RESPONSABLE_HABILITATIONS_POST]''', error);
        return NextResponse.json(
            { error: '''Erreur lors de la sauvegarde des habilitations.''' },
            { status: 500 }
        );
    }
}
