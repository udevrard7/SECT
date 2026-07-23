import { describe, it, expect } from 'vitest'
import { getPageIdFromSlug, PAGE_ROUTES, ROUTE_TO_PAGE, getDefaultRoute } from '../routes'
import type { PageId } from '../routes'

describe('routes', () => {
  describe('getPageIdFromSlug', () => {
    it('returns correct pageId for dashboard', () => {
      expect(getPageIdFromSlug(['dashboard'])).toBe('dashboard')
    })

    it('returns correct pageId for epreuves', () => {
      expect(getPageIdFromSlug(['epreuves'])).toBe('epreuves')
    })

    it('returns correct pageId for nested paths', () => {
      expect(getPageIdFromSlug(['mes-epreuves'])).toBe('mes-epreuves')
    })

    it('returns null for unknown paths', () => {
      expect(getPageIdFromSlug(['unknown-page'])).toBeNull()
    })

    it('handles legacy banque-questions redirect', () => {
      expect(getPageIdFromSlug(['banque-questions'])).toBe('epreuves')
    })
  })

  describe('PAGE_ROUTES', () => {
    it('maps every PageId to a valid URL path', () => {
      Object.entries(PAGE_ROUTES).forEach(([pageId, route]) => {
        expect(route).toMatch(/^\//)
      })
    })

    it('dashboard maps to /dashboard', () => {
      expect(PAGE_ROUTES.dashboard).toBe('/dashboard')
    })
  })

  describe('ROUTE_TO_PAGE', () => {
    it('maps every route back to a PageId whose PAGE_ROUTES resolves to the same route', () => {
      // This is the correct round-trip: route → pageId → route
      Object.entries(ROUTE_TO_PAGE).forEach(([route, pageId]) => {
        expect(PAGE_ROUTES[pageId as PageId]).toBe(route)
      })
    })
  })

  describe('getDefaultRoute', () => {
    it('returns /dashboard for any role', () => {
      expect(getDefaultRoute('ADMIN')).toBe('/dashboard')
      expect(getDefaultRoute('RESPONSABLE')).toBe('/dashboard')
      expect(getDefaultRoute('ENSEIGNANT')).toBe('/dashboard')
      expect(getDefaultRoute('ETUDIANT')).toBe('/dashboard')
    })
  })
})
