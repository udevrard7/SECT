'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Award, Star, Trophy, Zap, Flame, ThumbsUp, CheckCircle2, CalendarCheck,
  FileText, PenTool, Sparkles, GraduationCap, Library, Clock, ClipboardCheck,
  Users, Eye, Network, Shield, Target, Cpu, HeartHandshake, ChevronRight,
  Lock, X
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { NIVEAU_CONFIG, CATEGORIE_CONFIG, type BadgeWithProgress, type NiveauBadge } from '@/lib/badges-engine'

// ─── Icon renderer (avoids creating components during render) ───

function BadgeIcon({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case 'Award': return <Award className={className} />
    case 'Star': return <Star className={className} />
    case 'Trophy': return <Trophy className={className} />
    case 'Zap': return <Zap className={className} />
    case 'Flame': return <Flame className={className} />
    case 'ThumbsUp': return <ThumbsUp className={className} />
    case 'CheckCircle2': return <CheckCircle2 className={className} />
    case 'CalendarCheck': return <CalendarCheck className={className} />
    case 'FileText': return <FileText className={className} />
    case 'PenTool': return <PenTool className={className} />
    case 'Sparkles': return <Sparkles className={className} />
    case 'GraduationCap': return <GraduationCap className={className} />
    case 'Library': return <Library className={className} />
    case 'Clock': return <Clock className={className} />
    case 'ClipboardCheck': return <ClipboardCheck className={className} />
    case 'Users': return <Users className={className} />
    case 'Eye': return <Eye className={className} />
    case 'Network': return <Network className={className} />
    case 'Shield': return <Shield className={className} />
    case 'Target': return <Target className={className} />
    case 'Cpu': return <Cpu className={className} />
    case 'HeartHandshake': return <HeartHandshake className={className} />
    default: return <Award className={className} />
  }
}

// ─── Format date ───

function formatDateFR(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// ─── Badge Detail Modal ───

function BadgeDetailModal({ badge, onClose }: { badge: BadgeWithProgress; onClose: () => void }) {
  const niveauConfig = NIVEAU_CONFIG[badge.niveauActuel]
  const categorieConfig = CATEGORIE_CONFIG[badge.categorie]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25 }}
        className="bg-background rounded-xl shadow-2xl max-w-sm w-full p-6 border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className={`h-16 w-16 rounded-full flex items-center justify-center ${badge.debloque ? `${niveauConfig.bgColor} shadow-lg ${niveauConfig.glowColor}` : 'bg-muted'}`}>
            {badge.debloque ? (
              <span className={niveauConfig.color}><BadgeIcon name={badge.icone} className="h-8 w-8" /></span>
            ) : (
              <span className="text-muted-foreground"><Lock className="h-8 w-8" /></span>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <h3 className="text-lg font-bold mb-1">{badge.titre}</h3>
        <p className="text-sm text-muted-foreground mb-3">{badge.description}</p>

        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline" className={categorieConfig.color}>
            {categorieConfig.label}
          </Badge>
          {badge.debloque && (
            <Badge className={`${niveauConfig.color} ${niveauConfig.bgColor} border-0`}>
              {niveauConfig.label}
            </Badge>
          )}
        </div>

        {/* Niveaux progression */}
        <div className="space-y-2 mb-4">
          {badge.niveaux.map((niveau) => {
            const isCurrentLevel = badge.niveauActuel === niveau.niveau && badge.debloque
            const isAchieved = badge.valeurActuelle >= niveau.seuil
            const currentIdx = badge.niveaux.findIndex(n => n.niveau === badge.niveauActuel)
            const niveauIdx = badge.niveaux.findIndex(n => n.niveau === niveau.niveau)
            const isNextLevel = !isAchieved && niveauIdx === currentIdx + 1

            return (
              <div key={niveau.niveau} className={`flex items-center gap-3 p-2 rounded-lg ${isCurrentLevel ? NIVEAU_CONFIG[niveau.niveau].bgColor : isAchieved ? 'bg-muted/30' : ''}`}>
                <div className={`h-3 w-3 rounded-full ${isAchieved ? 'bg-emerald-500' : isNextLevel ? 'bg-amber-400 animate-pulse' : 'bg-muted-foreground/30'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${isCurrentLevel ? NIVEAU_CONFIG[niveau.niveau].color : isAchieved ? 'text-muted-foreground' : ''}`}>
                      {NIVEAU_CONFIG[niveau.niveau].label}
                    </span>
                    <span className="text-xs text-muted-foreground">{niveau.seuil}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{niveau.label}</p>
                </div>
                {isAchieved && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
              </div>
            )
          })}
        </div>

        {/* Progression bar */}
        {!badge.debloque && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Progression</span>
              <span className="font-medium">{badge.valeurActuelle} / {badge.valeurPalier}</span>
            </div>
            <Progress value={badge.progression} className="h-2" />
          </div>
        )}

        {badge.dateObtention && (
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Obtenu le {formatDateFR(badge.dateObtention)}
          </p>
        )}
      </motion.div>
    </motion.div>
  )
}

// ─── Badge Card Item ───

function BadgeItem({ badge, onClick }: { badge: BadgeWithProgress; onClick: () => void }) {
  const niveauConfig = NIVEAU_CONFIG[badge.niveauActuel]

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            onClick={onClick}
            className={`flex flex-col items-center justify-center text-center p-3 rounded-xl w-28 shrink-0 border-2 transition-all hover:scale-105 ${
              badge.debloque
                ? `${niveauConfig.borderColor} ${niveauConfig.bgColor} shadow-md ${niveauConfig.glowColor}`
                : 'border-dashed border-muted-foreground/30 bg-muted/30 hover:bg-muted/50'
            } ${badge.isNewlyUnlocked ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            {/* Niveau badge */}
            {badge.debloque && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${niveauConfig.color} ${niveauConfig.bgColor} mb-1`}>
                {niveauConfig.label}
              </span>
            )}

            {/* Icon */}
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
              badge.debloque
                ? `${niveauConfig.bgColor}`
                : 'bg-muted'
            }`}>
              {badge.debloque ? (
                <span className={niveauConfig.color}><BadgeIcon name={badge.icone} className="h-5 w-5" /></span>
              ) : (
                <span className="text-muted-foreground/60"><BadgeIcon name={badge.icone} className="h-5 w-5" /></span>
              )}
            </div>

            {/* Title */}
            <p className={`mt-1 text-[11px] font-semibold leading-tight line-clamp-2 ${badge.debloque ? '' : 'text-muted-foreground/60'}`}>
              {badge.titre}
            </p>

            {/* Progression bar for locked badges */}
            {!badge.debloque && badge.progression > 0 && (
              <div className="w-full mt-1.5">
                <Progress value={badge.progression} className="h-1" />
                <p className="text-[9px] text-muted-foreground mt-0.5">{badge.progression}%</p>
              </div>
            )}

            {/* Mini progression for unlocked badges with next level */}
            {badge.debloque && badge.valeurProchain !== null && (
              <div className="w-full mt-1">
                <Progress value={badge.progression} className="h-1" />
              </div>
            )}

            {/* Max level indicator */}
            {badge.debloque && badge.valeurProchain === null && (
              <span className="text-[9px] text-emerald-600 mt-0.5">★ Max</span>
            )}

            {/* Newly unlocked indicator */}
            {badge.isNewlyUnlocked && (
              <span className="text-[9px] text-amber-600 font-medium mt-0.5">Nouveau !</span>
            )}
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px]">
          <p className="font-medium text-xs">{badge.titre}</p>
          <p className="text-[10px] text-muted-foreground">{badge.description}</p>
          {!badge.debloque && (
            <p className="text-[10px] mt-1">
              {badge.valeurActuelle} / {badge.valeurPalier} ({badge.progression}%)
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─── Main BadgesCarousel Component ───

interface BadgesCarouselProps {
  badges: BadgeWithProgress[]
  onBadgeClick?: (badge: BadgeWithProgress) => void
}

export function BadgesCarousel({ badges, onBadgeClick }: BadgesCarouselProps) {
  const [selectedBadge, setSelectedBadge] = useState<BadgeWithProgress | null>(null)

  const unlockedBadges = useMemo(() => badges.filter(b => b.debloque), [badges])
  const lockedBadges = useMemo(() => badges.filter(b => !b.debloque), [badges])
  const sortedBadges = useMemo(
    () => [...unlockedBadges, ...lockedBadges],
    [unlockedBadges, lockedBadges]
  )

  const totalBadges = badges.length
  const progressPct = totalBadges > 0 ? Math.round((unlockedBadges.length / totalBadges) * 100) : 0

  const handleBadgeClick = (badge: BadgeWithProgress) => {
    setSelectedBadge(badge)
    onBadgeClick?.(badge)
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-5 w-5 text-amber-500" />
              Mes Succès
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {unlockedBadges.length}/{totalBadges}
              </Badge>
              {progressPct > 0 && (
                <span className="text-xs text-muted-foreground">{progressPct}%</span>
              )}
            </div>
          </div>
          {/* Global progress bar */}
          <div className="mt-2">
            <Progress value={progressPct} className="h-1.5" />
          </div>
        </CardHeader>
        <CardContent>
          {badges.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Award className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucun badge disponible pour votre rôle</p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
              {sortedBadges.map((badge) => (
                <BadgeItem
                  key={badge.cle}
                  badge={badge}
                  onClick={() => handleBadgeClick(badge)}
                />
              ))}
              {/* Scroll indicator */}
              {sortedBadges.length > 4 && (
                <div className="flex items-center justify-center w-8 shrink-0 text-muted-foreground/40">
                  <ChevronRight className="h-4 w-4" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Badge Detail Modal */}
      <AnimatePresence>
        {selectedBadge && (
          <BadgeDetailModal
            badge={selectedBadge}
            onClose={() => setSelectedBadge(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Badge unlock notification (toast-like) ───

interface BadgeUnlockNotificationProps {
  badge: BadgeWithProgress
  onClose: () => void
}

export function BadgeUnlockNotification({ badge, onClose }: BadgeUnlockNotificationProps) {
  const niveauConfig = NIVEAU_CONFIG[badge.niveauActuel]

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      className="fixed top-4 right-4 z-50 max-w-xs"
    >
      <Card className={`border-2 ${niveauConfig.borderColor} shadow-lg ${niveauConfig.glowColor}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${niveauConfig.bgColor}`}>
              <span className={niveauConfig.color}><BadgeIcon name={badge.icone} className="h-5 w-5" /></span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold">Badge débloqué !</p>
                <Badge className={`${niveauConfig.color} ${niveauConfig.bgColor} border-0 text-[10px]`}>
                  {niveauConfig.label}
                </Badge>
              </div>
              <p className="text-sm font-medium">{badge.titre}</p>
              <p className="text-xs text-muted-foreground">{badge.description}</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
