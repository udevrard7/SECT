// Package cache — cache en mémoire RAM thread-safe pour les sessions actives.
//
// CACHE-RAM-1 : pattern "write-behind" pour les réponses d'examen.
//
// Au lieu d'écrire dans Neon à chaque clic de l'étudiant (latence ~50-100ms
// par requête réseau + DB), on écrit en RAM (< 1ms). Un worker goroutine
// synchronise le cache vers Neon toutes les 30s en une seule transaction
// bulk (WithTx + RLS).
//
// Le submit examen force un flush immédiat (avant la soumission finale).
//
// OWNERSHIP-CACHE-1 : cache d'ownership vérifiée. Après la première vérification
// DB qu'un étudiant possède bien une session, on stocke ce fait en mémoire.
// Les saves ultérieurs n'ont plus besoin de requêter la DB pour l'ownership.
// Invalidation : à la suppression de la session du cache (submit/remove).
//
// Render Free : le plan gratuit s'endort après 15 min d'inactivité et
// l'instance est détruite (perte RAM). Ce n'est pas grave pour un examen :
// tant qu'un étudiant compose, l'API est active et Render ne s'endort pas.
// De plus, l'auto-save frontend (30s) + le flush au submit garantissent
// que les données sont sur Neon avant la fin.
package cache

import (
	"sync"
	"time"
)

// CachedSession représente les réponses d'une session d'examen en cache RAM.
type CachedSession struct {
	SessionID  string
	EpreuveID  string
	EtudiantID string
	Reponses   map[string]string
	UpdatedAt  time.Time
	Dirty      bool
	mu         sync.RWMutex
}

// SessionCache — store en mémoire thread-safe (sync.Map).
type SessionCache struct {
	store           sync.Map // sessionID → *CachedSession
	verifiedOwners  sync.Map // sessionID → ownerEtudiantID (OWNERSHIP-CACHE-1)
}

// NewSessionCache crée un nouveau cache de sessions vide.
func NewSessionCache() *SessionCache {
	return &SessionCache{}
}

// SaveAnswers met à jour les réponses d'une session en RAM (< 1ms).
func (c *SessionCache) SaveAnswers(sessionID, epreuveID, etudiantID string, reponses map[string]string) {
	val, _ := c.store.LoadOrStore(sessionID, &CachedSession{
		SessionID:  sessionID,
		EpreuveID:  epreuveID,
		EtudiantID: etudiantID,
		Reponses:   make(map[string]string),
	})
	sess := val.(*CachedSession)

	sess.mu.Lock()
	defer sess.mu.Unlock()

	for k, v := range reponses {
		sess.Reponses[k] = v
	}
	sess.UpdatedAt = time.Now()
	sess.Dirty = true
}

// MarkOwnershipVerified enregistre qu'une session a été vérifiée comme
// appartenant à un étudiant (OWNERSHIP-CACHE-1). Les saves ultérieurs
// pourront skip la vérification DB.
func (c *SessionCache) MarkOwnershipVerified(sessionID, etudiantID string) {
	c.verifiedOwners.Store(sessionID, etudiantID)
}

// IsOwnershipVerified vérifie si l'ownership d'une session a déjà été
// validée pour un étudiant donné. Retourne true si la session a été
// vérifiée et appartient bien à l'étudiant.
func (c *SessionCache) IsOwnershipVerified(sessionID, etudiantID string) bool {
	if owner, ok := c.verifiedOwners.Load(sessionID); ok {
		return owner.(string) == etudiantID
	}
	return false
}

// GetDirtySessions retourne les sessions modifiées et les marque clean.
func (c *SessionCache) GetDirtySessions() []*CachedSession {
	var dirty []*CachedSession

	c.store.Range(func(key, val any) bool {
		sess := val.(*CachedSession)
		sess.mu.Lock()
		defer sess.mu.Unlock()

		if sess.Dirty {
			cp := &CachedSession{
				SessionID:  sess.SessionID,
				EpreuveID:  sess.EpreuveID,
				EtudiantID: sess.EtudiantID,
				Reponses:   make(map[string]string, len(sess.Reponses)),
				UpdatedAt:  sess.UpdatedAt,
			}
			for k, v := range sess.Reponses {
				cp.Reponses[k] = v
			}
			sess.Dirty = false
			dirty = append(dirty, cp)
		}
		return true
	})

	return dirty
}

// FlushAndGetDirty force dirty sur une session et retourne toutes les dirty.
func (c *SessionCache) FlushAndGetDirty(sessionID string) []*CachedSession {
	if val, ok := c.store.Load(sessionID); ok {
		sess := val.(*CachedSession)
		sess.mu.Lock()
		sess.Dirty = true
		sess.mu.Unlock()
	}
	return c.GetDirtySessions()
}

// RemoveSession supprime une session du cache (après submit).
// Invalide aussi le cache d'ownership (OWNERSHIP-CACHE-1).
func (c *SessionCache) RemoveSession(sessionID string) {
	c.store.Delete(sessionID)
	c.verifiedOwners.Delete(sessionID)
}

// Count retourne le nombre de sessions en cache.
func (c *SessionCache) Count() int {
	count := 0
	c.store.Range(func(_, _ any) bool {
		count++
		return true
	})
	return count
}
