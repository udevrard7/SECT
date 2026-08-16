'use client'

import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

export default function AppPage({ params }: { params: Promise<{ slug: string[] }> }) {
  // Next.js 16 requires params to be awaited as a Promise
  // We use a client-side wrapper to handle this
  return <AppPageInner params={params} />
}

function AppPageInner({ params }: { params: Promise<{ slug: string[] }> }) {
  // For the catch-all route, we need the slug synchronously
  // We'll use React's use() hook or handle it differently
  return <SlugHandler params={params} />
}

import { use } from 'react'

function SlugHandler({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = use(params)
  return <AuthenticatedLayout slug={slug} />
}
