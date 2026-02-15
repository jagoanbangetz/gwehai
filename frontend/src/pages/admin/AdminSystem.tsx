import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

const WIPE_CONFIRM_PHRASE = 'WIPE_ALL_DATA'

export default function AdminSystem() {
  const [health, setHealth] = useState<{ ok: boolean; database: string; timestamp: string } | null>(null)
  const [settings, setSettings] = useState<Record<string, string> | null>(null)
  const [wipeConfirm, setWipeConfirm] = useState('')
  const [wiping, setWiping] = useState(false)
  const [wipeResult, setWipeResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [healthRes, settingsRes] = await Promise.all([
          apiClient.get('/admin/health'),
          apiClient.get('/admin/settings'),
        ])
        setHealth(healthRes.data)
        setSettings(settingsRes.data)
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load')
      }
    }
    load()
  }, [])

  const handleWipe = async () => {
    if (wipeConfirm !== WIPE_CONFIRM_PHRASE) {
      setWipeResult('Type WIPE_ALL_DATA exactly to confirm.')
      return
    }
    try {
      setWiping(true)
      setWipeResult(null)
      const res = await apiClient.post('/admin/wipe-chat-and-reports', { confirm: WIPE_CONFIRM_PHRASE })
      setWipeResult(`Done. Deleted: ${JSON.stringify(res.data.deleted)}`)
      setWipeConfirm('')
    } catch (e: any) {
      setWipeResult(e?.response?.data?.message || e?.message || 'Wipe failed')
    } finally {
      setWiping(false)
    }
  }

  return (
    <>
      <h2 className="admin-page-title">System</h2>
      {error && <div className="admin-error">{error}</div>}
      {health && (
        <div className="admin-card">
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Health</h3>
          <p style={{ margin: 0, color: health.ok ? 'oklch(0.7 0.15 145)' : 'oklch(0.7 0.2 25)' }}>
            Database: {health.database} · {health.timestamp}
          </p>
        </div>
      )}
      {settings && (
        <div className="admin-card">
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Settings</h3>
          <pre style={{ margin: 0, fontSize: '0.85rem', color: 'oklch(0.85 0 0)' }}>{JSON.stringify(settings, null, 2)}</pre>
        </div>
      )}
      <div className="admin-card" style={{ borderColor: 'oklch(0.4 0.15 25 / 0.5)' }}>
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: 'oklch(0.8 0.15 25)' }}>Danger zone</h3>
        <p style={{ margin: '0 0 0.75rem 0', color: 'oklch(0.7 0 0)', fontSize: '0.9rem' }}>
          Wipe all chat, reports, and hacktivity. This cannot be undone. Type <code>{WIPE_CONFIRM_PHRASE}</code> to confirm.
        </p>
        <input
          type="text"
          value={wipeConfirm}
          onChange={(e) => setWipeConfirm(e.target.value)}
          placeholder={WIPE_CONFIRM_PHRASE}
          style={{ padding: '0.5rem 0.75rem', width: '100%', maxWidth: 280, marginBottom: '0.5rem', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
        />
        <br />
        <button
          type="button"
          onClick={handleWipe}
          disabled={wiping || wipeConfirm !== WIPE_CONFIRM_PHRASE}
          style={{ padding: '0.5rem 1rem', borderRadius: 6, background: 'oklch(0.35 0.15 25)', border: 'none', color: 'white', cursor: wipeConfirm !== WIPE_CONFIRM_PHRASE ? 'not-allowed' : 'pointer', opacity: wipeConfirm !== WIPE_CONFIRM_PHRASE ? 0.6 : 1 }}
        >
          {wiping ? 'Wiping…' : 'Wipe all chat & reports'}
        </button>
        {wipeResult && <p style={{ margin: '0.75rem 0 0', color: 'oklch(0.85 0 0)', fontSize: '0.9rem' }}>{wipeResult}</p>}
      </div>
    </>
  )
}
