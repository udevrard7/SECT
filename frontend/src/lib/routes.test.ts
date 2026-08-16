import { describe, it, expect } from 'vitest'
import { getPageIdFromSlug, PAGE_ROUTES, ROUTE_TO_PAGE } from '@/lib/routes'

describe('routes', () => {
  describe('PAGE_ROUTES', () => {
    it('should map dashboard to /dashboard', () => {
      expect(PAGE_ROUTES.dashboard).toBe('/dashboard')
    })

    it('should map epreuves to /epreuves', () => {
      expect(PAGE_ROUTES.epreuves).toBe('/epreuves')
    })

    it('should map profil to /profil', () => {
      expect(PAGE_ROUTES.profil).toBe('/profil')
    })

    it('should map all critical pages to valid routes', () => {
      const criticalPages = ['dashboard', 'epreuves', 'documents', 'correction', 'mes-epreuves', 'login', 'profil']
      criticalPages.forEach((page) => {
        if (page === 'login') return // login is not a PageId
        expect(PAGE_ROUTES[page as keyof typeof PAGE_ROUTES]).toMatch(/^\//)
      })
    })

    it('should have no undefined routes', () => {
      Object.values(PAGE_ROUTES).forEach((route) => {
        expect(route).toBeDefined()
        expect(route).toMatch(/^\//)
      })
    })
  })

  describe('ROUTE_TO_PAGE', () => {
    it('should reverse map /dashboard to dashboard', () => {
      expect(ROUTE_TO_PAGE['/dashboard']).toBe('dashboard')
    })

    it('should reverse map /epreuves to epreuves', () => {
      expect(ROUTE_TO_PAGE['/epreuves']).toBe('epreuves')
    })
  })

  describe('getPageIdFromSlug', () => {
    it('should return dashboard for ["dashboard"]', () => {
      expect(getPageIdFromSlug(['dashboard'])).toBe('dashboard')
    })

    it('should return epreuves for ["epreuves"]', () => {
      expect(getPageIdFromSlug(['epreuves'])).toBe('epreuves')
    })

    it('should return null for unknown slug', () => {
      expect(getPageIdFromSlug(['unknown-page'])).toBeNull()
    })

    it('should return epreuves for ["banque-questions"] (legacy redirect)', () => {
      expect(getPageIdFromSlug(['banque-questions'])).toBe('epreuves')
    })
  })
})
