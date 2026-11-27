'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, FileText, AlertTriangle, Database, Users as UsersIcon, LogOut, Bell, Search, Check } from 'lucide-react'
import useStoredState from '../../hooks/useStoredState.js'
import { seed } from '../../data.js'
import { apiBaseUrl } from '../../lib/api.js'
import { Brand, Modal } from './ui/ui.jsx'
import Login from '../(auth)/login/components/Login.jsx'
import Dashboard from '../dashboard/components/Dashboard.jsx'
import Monitoring from '../monitoring/components/Monitoring.jsx'
import Discrepancy from '../discrepancy/components/Discrepancy.jsx'
import MasterData from '../master/components/MasterData.jsx'
import Users from '../users/components/Users.jsx'

const titles = {
  dashboard: ['Dashboard Analitik', 'Ringkasan purchase order & discrepancy terkini'],
  monitoring: ['Monitoring PO', 'Daftar {n} Purchase Order'],
  discrepancy: ['Review Discrepancy', ''],
  master: ['Kelola Master Data', 'Manajemen supplier & katalog produk kopi'],
  users: ['Kelola User Staff', 'Manajemen akun & hak akses pengguna sistem'],
}

export default function App() {
  const [user, setUser, userLoaded] = useStoredState('ab-user', null)
  const [db, setDb] = useState(seed)
  const [dbLoaded, setDbLoaded] = useState(false)
  const [apiError, setApiError] = useState('')
  const dbRef = useRef(seed)
  const writeQueue = useRef(Promise.resolve())
  const pending = useRef(0)
  const idMap = useRef({})
  const pathname = usePathname()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [toast, setToast] = useState(null)
  const [bye, setBye] = useState(false)
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t) } }, [toast])
  useEffect(() => {
    if (!userLoaded || !user) return
    let active = true
    fetch(`${apiBaseUrl}/data`, { credentials: 'include' })
      .then(async (response) => {
        if (response.status === 401) {
          setUser(null)
          throw new Error('Sesi berakhir. Silakan masuk kembali.')
        }
        if (!response.ok) throw new Error('Backend tidak dapat memuat data.')
        return response.json()
      })
      .then((data) => {
        if (!active) return
        dbRef.current = data
        setDb(data)
        setApiError('')
      })
      .catch(() => {
        if (active) setApiError('Backend tidak tersedia. Data demo hanya tersimpan sementara di browser.')
      })
      .finally(() => { if (active) setDbLoaded(true) })
    return () => { active = false }
  }, [setUser, user, userLoaded])
  const go = (p) => { router.push(p); window.scrollTo(0, 0) }
  // Kirim satu perubahan ke backend (id sementara dari item baru diganti id asli dari server)
  const send = async (key, op) => {
    const real = (id) => idMap.current[key + ':' + id] ?? id
    let path = `${apiBaseUrl}/data/${key}`
    let body
    if (op.method === 'POST') body = op.item
    else {
      path += `/${encodeURIComponent(real(op.item.id))}`
      if (op.method === 'PUT') {
        body = key === 'pos' ? { st: op.item.st, logs: op.item.logs.slice(op.old.logs.length) } : op.item
      }
    }
    const response = await fetch(path, {
      method: op.method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (response.status === 401) {
      setUser(null)
      throw new Error('Sesi berakhir. Silakan masuk kembali.')
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.message || 'Perubahan gagal disimpan ke backend.')
    if (op.method === 'POST' && data.item) idMap.current[key + ':' + op.item.id] = data.item.id
  }
  const reload = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/data`, { credentials: 'include' })
      if (!response.ok) return
      const data = await response.json()
      dbRef.current = data
      setDb(data)
    } catch {}
  }
  const set = (key, value) => {
    const prev = dbRef.current[key]
    const collection = typeof value === 'function' ? value(prev) : value
    dbRef.current = { ...dbRef.current, [key]: collection }
    setDb(dbRef.current)
    const before = new Map(prev.map((x) => [x.id, x]))
    const after = new Set(collection.map((x) => x.id))
    const ops = []
    for (const item of collection) {
      const old = before.get(item.id)
      if (!old) ops.push({ method: 'POST', item })
      else if (JSON.stringify(old) !== JSON.stringify(item)) ops.push({ method: 'PUT', item, old })
    }
    for (const item of prev) if (!after.has(item.id)) ops.push({ method: 'DELETE', item })
    if (!ops.length) return
    pending.current += 1
    writeQueue.current = writeQueue.current
      .then(async () => {
        try {
          for (const op of ops) await send(key, op)
          setApiError('')
        } catch (error) {
          setApiError(error.message || 'Perubahan belum tersimpan ke backend. Periksa server lalu muat ulang aplikasi.')
        }
      })
      .then(() => {
        pending.current -= 1
        // Setelah semua perubahan terkirim, ambil data asli dari server (id, total, status terbaru)
        if (pending.current === 0) return reload()
      })
  }
  const notify = (title, msg) => setToast({ title, msg, id: Date.now() })
  const logout = () => {
    fetch(`${apiBaseUrl}/auth/logout`, { method: 'POST', credentials: 'include' })
      .catch(() => {})
      .finally(() => { setDbLoaded(false); setUser(null); go('/') })
  }

  if (!userLoaded || (user && !dbLoaded)) {
    return <div className="app-loading" role="status" aria-label="Memuat aplikasi" />
  }

  if (!user) return <Login onLogin={(u) => { setDbLoaded(false); setUser(u); go('/dashboard') }} />

  const [, page = 'dashboard', sub] = pathname.split('/')
  const key = titles[page] ? page : 'dashboard'
  const open = db.discrepancies.filter((d) => !['Selesai', 'Ditutup'].includes(d.st)).length
  const c = { db, set, go, q, notify, user, open, sub }
  const nav = [['dashboard', 'Dashboard', LayoutDashboard, 0, 'Home'], ['monitoring', 'Monitoring PO', FileText, 0, 'PO'], ['discrepancy', 'Review Discrepancy', AlertTriangle, open, 'Review'], ['master', 'Master Data', Database, 0, 'Master'], ['users', 'Kelola User', UsersIcon, 0, 'User']]
  const [h, s] = titles[key]
  const Page = { dashboard: Dashboard, monitoring: Monitoring, discrepancy: Discrepancy, master: MasterData, users: Users }[key]

  return (
    <div className="app">
      <aside><Brand />
        <p className="sec">MENU UTAMA</p>
        {nav.slice(0, 3).map(([k, l, I, n, short]) => <a key={k} className={key === k ? 'on' : ''} aria-label={l} data-short={short} onClick={() => go('/' + k)}><I size={16} /><span className="nav-label">{l}</span>{n > 0 && <i className="count">{n}</i>}</a>)}
        <p className="sec">KONFIGURASI</p>
        {nav.slice(3).map(([k, l, I, , short]) => <a key={k} className={key === k ? 'on' : ''} aria-label={l} data-short={short} onClick={() => go('/' + k)}><I size={16} /><span className="nav-label">{l}</span></a>)}
        <a className="logout" aria-label="Keluar" data-short="Keluar" onClick={() => setBye(true)}><LogOut size={16} /><span className="nav-label">Keluar</span></a>
      </aside>
      <main>
        <header>
          <div><h1>{sub ? `${key === 'discrepancy' ? 'Review Discrepancy' : 'Monitoring PO'} / Detail ${sub}` : h}</h1><p>{s.replace('{nama}', user.nama).replace('{n}', db.pos.length)}</p></div>
          <div className="top"><div className="search"><Search size={14} /><input placeholder="Cari transaksi, supplier..." value={q} onChange={(e) => { setQ(e.target.value); if (key !== 'monitoring') go('/monitoring') }} /></div>
            <button className="icon bell" onClick={() => go('/discrepancy')}><Bell size={16} />{open > 0 && <i />}</button>
            <div className="me"><b>{user.nama}</b><small>{user.role === 'Manager' ? 'Purchasing Manager' : user.role}</small></div></div>
        </header>
        <section className="content page-transition" key={pathname}>
          {apiError && <div className="note warn" role="status">{apiError}</div>}
          {toast && <div key={toast.id} className="toast"><Check className="toast-check" size={16} /><div><b>{toast.title}</b><p>{toast.msg}</p></div><button onClick={() => setToast(null)}>×</button></div>}
          <Page c={c} />
        </section>
      </main>
      {bye && (
        <Modal title="Konfirmasi Keluar" sub="Anda akan keluar dari sesi ini. Semua pekerjaan yang belum disimpan akan tetap aman di sistem." onClose={() => setBye(false)} w={400}>
          <div className="mfoot"><button className="btn" onClick={() => setBye(false)}>Batal</button><button className="btn danger" onClick={() => { setBye(false); logout() }}>Ya, Keluar</button></div>
        </Modal>)}
    </div>
  )
}
