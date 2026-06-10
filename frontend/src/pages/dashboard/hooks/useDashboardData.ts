import { useState, useCallback } from 'react'
import apiClient from '../../../utils/api'
import type { ReportGroupRow, FindingRow, HacktivityRow, HacktivityConversationRow, CurrentPlan, MyPlanResponse } from '../types'
import { normalizeReportGroupRow, hacktivityListEqual, hacktivityConversationsEqual } from '../utils'

/**
 * Data loading hooks for reports, hacktivity, plan, settings, profile, models.
 * Returns state + loaders. Each function is stable (wrapped in useCallback where needed).
 */
export function useDashboardData(showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void) {
  // ─── Reports ───
  const [reports, setReports] = useState<ReportGroupRow[]>([])
  const [isLoadingReports, setIsLoadingReports] = useState(false)
  const [reportDetailKey, setReportDetailKey] = useState<{ domain: string; date: string; conversationId: string | null } | null>(null)
  const [reportFindings, setReportFindings] = useState<FindingRow[]>([])
  const [reportFindingsLoading, setReportFindingsLoading] = useState(false)
  const [_selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [selectedFinding, setSelectedFinding] = useState<FindingRow | null>(null)

  const loadReports = useCallback(async () => {
    try {
      setIsLoadingReports(true)
      const res = await apiClient.get('/reports')
      const raw = res.data
      const rows = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray((raw as any).items) ? (raw as any).items : [])
      setReports(rows.map((r: Record<string, unknown>) => normalizeReportGroupRow(r)))
    } catch (error: any) {
      console.error('Failed to load reports:', error)
      showToast(error.response?.data?.message || 'Failed to load reports.', 'error')
    } finally {
      setIsLoadingReports(false)
    }
  }, [showToast])

  const loadFindingsForDomainAndDate = useCallback(async (domain: string, date: string, conversationId?: string | null) => {
    try {
      setReportFindingsLoading(true)
      const params: { domain: string; date: string; conversationId?: string } = { domain, date }
      if (conversationId) params.conversationId = conversationId
      const res = await apiClient.get('/reports/by-domain-date', { params })
      setReportFindings(res.data || [])
    } catch (error: any) {
      console.error('Failed to load findings:', error)
      showToast(error.response?.data?.message || 'Failed to load findings.', 'error')
    } finally {
      setReportFindingsLoading(false)
    }
  }, [showToast])

  const closeReportModal = useCallback(() => {
    setReportDetailKey(null); setReportFindings([]); setSelectedFindingId(null); setSelectedFinding(null)
  }, [])

  // ─── Hacktivity ───
  const [hacktivityList, setHacktivityList] = useState<HacktivityRow[]>([])
  const [hacktivityConversations, setHacktivityConversations] = useState<HacktivityConversationRow[]>([])
  const [selectedHacktivityConversationId, setSelectedHacktivityConversationId] = useState<string | null>(null)
  const [hacktivityPage, setHacktivityPage] = useState(1)
  const [hacktivityPageSize] = useState(20)
  const [hacktivityTotal, setHacktivityTotal] = useState(0)
  const [isLoadingHacktivity, setIsLoadingHacktivity] = useState(false)
  const [hacktivityLoadError, setHacktivityLoadError] = useState<string | null>(null)
  const [_selectedHacktivityId, setSelectedHacktivityId] = useState<string | null>(null)
  const [selectedHacktivity, setSelectedHacktivity] = useState<HacktivityRow | null>(null)

  const loadHacktivityConversations = useCallback(async () => {
    try {
      const res = await apiClient.get('/hacktivity/conversations')
      const next = Array.isArray(res.data) ? res.data : []
      setHacktivityConversations((prev) => (hacktivityConversationsEqual(prev, next) ? prev : next))
    } catch (error: any) {
      console.error('Failed to load Hacktivity conversations', error)
      showToast('Failed to load hacktivity conversations.', 'error')
    }
  }, [showToast])

  const loadHacktivity = useCallback(async (page: number = 1, conversationId: string | null = null, options?: { isBackgroundPoll?: boolean }) => {
    const isBackgroundPoll = options?.isBackgroundPoll === true
    try {
      if (!isBackgroundPoll) { setIsLoadingHacktivity(true); setHacktivityLoadError(null) }
      const params = new URLSearchParams()
      params.set('limit', String(hacktivityPageSize))
      params.set('offset', String((page - 1) * hacktivityPageSize))
      if (conversationId) params.set('conversationId', conversationId)
      const res = await apiClient.get(`/hacktivity?${params.toString()}`)
      const data = res.data || {}
      const items = Array.isArray(data.items) ? data.items : []
      const total = typeof data.total === 'number' ? data.total : 0
      setHacktivityList((prev) => {
        if (hacktivityListEqual(prev, items)) return prev
        if (isBackgroundPoll && page === 1 && prev.length > 0) {
          const prevIds = new Set(prev.map((p) => p.id))
          const newRows = items.filter((i: HacktivityRow) => !prevIds.has(i.id))
          if (newRows.length === 0) return items
          const apiOrder = items.map((i: HacktivityRow) => i.id)
          return apiOrder.map((id: string) => items.find((i: HacktivityRow) => i.id === id) ?? prev.find((p: HacktivityRow) => p.id === id)).filter(Boolean) as HacktivityRow[]
        }
        return items
      })
      setHacktivityTotal(total)
      if (!isBackgroundPoll) setHacktivityPage(page)
    } catch (error: any) {
      console.error('Failed to load hacktivity:', error)
      if (!isBackgroundPoll) setHacktivityLoadError(error.response?.data?.message || 'Failed to load hacktivity.')
    } finally {
      if (!isBackgroundPoll) setIsLoadingHacktivity(false)
    }
  }, [hacktivityPageSize])

  const closeHacktivityModal = useCallback(() => {
    setSelectedHacktivity(null); setSelectedHacktivityId(null)
  }, [])

  const getHacktivityActionLabel = useCallback((toolArgs: Record<string, unknown> | null): string => {
    if (!toolArgs || typeof toolArgs !== 'object') return '—'
    const name = (toolArgs.name ?? toolArgs.tool ?? toolArgs.command ?? toolArgs.path) as string | undefined
    if (name && typeof name === 'string') { const s = name.trim(); return s.length > 30 ? s.slice(0, 30) + '…' : s }
    return Object.keys(toolArgs)[0] || '—'
  }, [])

  // ─── Plan ───
  const [currentPlan, _setCurrentPlan] = useState<CurrentPlan | null>(null)
  const [myPlan, setMyPlan] = useState<MyPlanResponse | null>(null)
  const [subscriptionForSettings, setSubscriptionForSettings] = useState<{ planId: string; providerSubscriptionId: string | null } | null>(null)
  const [isLoadingPlan, setIsLoadingPlan] = useState(false)

  const loadPlan = useCallback(async () => {
    try { setIsLoadingPlan(true); const res = await apiClient.get('/plans/me'); setMyPlan(res.data) }
    catch (e) { console.warn('Failed to load plan:', e) }
    finally { setIsLoadingPlan(false) }
  }, [])

  // ─── Settings ───
  const [settingsData, setSettingsData] = useState({ email: '', password: '' })
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  const loadUserProfile = useCallback(async () => {
    try {
      const res = await apiClient.get('/auth/profile')
      const profile = res.data
      setSettingsData({ email: profile.email || '', password: '' })
      if (profile.planId) setSubscriptionForSettings({ planId: profile.planId, providerSubscriptionId: profile.providerSubscriptionId || null })
    } catch (e) { console.warn('Failed to load profile:', e) }
  }, [])

  const handleSaveSettings = useCallback(async (refreshUser: () => void) => {
    try { setIsSavingSettings(true); await apiClient.put('/auth/profile', settingsData); showToast('Settings saved!', 'success'); refreshUser() }
    catch (e: any) { showToast(e.response?.data?.message || 'Failed to save settings.', 'error') }
    finally { setIsSavingSettings(false) }
  }, [settingsData, showToast])

  return {
    // Reports
    reports, isLoadingReports, reportDetailKey, setReportDetailKey,
    reportFindings, setReportFindings, reportFindingsLoading, selectedFinding, setSelectedFinding,
    setSelectedFindingId, loadReports, loadFindingsForDomainAndDate, closeReportModal,
    // Hacktivity
    hacktivityList, hacktivityConversations, selectedHacktivityConversationId, setSelectedHacktivityConversationId,
    hacktivityPage, setHacktivityPage, hacktivityPageSize, hacktivityTotal,
    isLoadingHacktivity, hacktivityLoadError, selectedHacktivity, setSelectedHacktivity,
    setSelectedHacktivityId, loadHacktivityConversations, loadHacktivity, closeHacktivityModal, getHacktivityActionLabel,
    // Plan
    currentPlan, myPlan, subscriptionForSettings, setSubscriptionForSettings, isLoadingPlan, loadPlan,
    // Settings
    settingsData, setSettingsData, isSavingSettings, loadUserProfile, handleSaveSettings,
    // Derived
    atScanLimit: myPlan?.scan_limit != null && myPlan.scan_limit.sessions_per_day != null && myPlan.scan_limit.sessions_started_today >= myPlan.scan_limit.sessions_per_day,
  }
}
