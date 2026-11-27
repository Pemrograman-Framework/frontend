import { useState } from 'react'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { Modal } from '../../../components/ui/ui.jsx'
import { apiBaseUrl } from '../../../../lib/api.js'

const PASS = 'Anna2026!'
export default function Login({ onLogin }) {
  const [email, setEmail] = useState('ayupatricia@gmail.com'), [pw, setPw] = useState(''), [show, setShow] = useState(false)
  const [err, setErr] = useState({}), [left, setLeft] = useState(3), [forgot, setForgot] = useState(false), [sent, setSent] = useState(false), [forgotErr, setForgotErr] = useState(false)
  const [loading, setLoading] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const n = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) n.email = 'Pastikan format email sudah benar.'
    if (!pw) n.pw = 'Kata sandi wajib diisi.'
    if (Object.keys(n).length) return setErr(n)
    setLoading(true)
    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw }),
      })
      if (!response.ok) throw new Error('Login gagal.')
      const { user } = await response.json()
      onLogin(user)
    } catch {
      const remaining = left - 1
      setLeft(remaining)
      setErr({ form: true, pw: remaining > 0 ? `Kata sandi salah atau backend tidak tersedia. Sisa percobaan: ${remaining} kali.` : 'Akun terkunci sementara. Silakan reset password.' })
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="login">
      <div className="hero">
        <span className="hero-orb o1" /><span className="hero-orb o2" />
        <img className="hero-logo" src="/anna-brew-logo-white.png" alt="Anna Brew" />
        <small>© 2026 ANNA BREW Coffee Roasters. All rights reserved.</small></div>
      <form onSubmit={submit} noValidate>
        <img className="form-logo" src="/anna-brew-logo.png" alt="Anna Brew" />
        <h2>Masuk ke Dashboard</h2><p className="muted">Gunakan kredensial staff resmi Anda untuk mengakses sistem.</p>
        {err.form && <div className="alert"><AlertCircle size={16} /><div><b>Email atau kata sandi tidak sesuai</b><p>Periksa kembali email dan kata sandi Anda, lalu coba lagi.</p></div></div>}
        <div className={`field ${err.email || err.form ? 'bad' : ''}`}><label>Alamat Email</label><input value={email} onChange={(e) => { setEmail(e.target.value); setErr({}) }} />{err.email && <small className="msg">{err.email}</small>}</div>
        <div className={`field ${err.pw ? 'bad' : ''}`}><label>Kata Sandi</label><div className="pw"><input type={show ? 'text' : 'password'} value={pw} placeholder="Masukkan kata sandi" onChange={(e) => { setPw(e.target.value); setErr({}) }} /><button type="button" onClick={() => setShow(!show)}>{show ? <Eye size={16} /> : <EyeOff size={16} />}</button></div>{err.pw && <small className="msg">{err.pw}</small>}</div>
        <button className="btn primary big" disabled={left <= 0 || loading}>{loading ? 'Memeriksa...' : 'Masuk Sekarang'}</button>
        <a className="link" onClick={() => { setForgot(true); setSent(false); setForgotErr(false) }}>Lupa Password?</a>
        <p className="hint">Demo: ayupatricia@gmail.com · kata sandi {PASS}</p>
      </form>
      {forgot && (
        <Modal title="Lupa Password" sub="Masukkan email Anda untuk menerima tautan reset." onClose={() => setForgot(false)}>
          {sent ? <p className="okmsg">Simulasi berhasil untuk {email}. Aplikasi demo ini tidak mengirim email sungguhan.</p> : <div className={`field ${forgotErr ? 'bad' : ''}`}><label>Alamat Email</label><input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setForgotErr(false) }} />{forgotErr && <small className="msg">Masukkan alamat email dengan format yang benar.</small>}</div>}
          <div className="mfoot"><button className="btn" onClick={() => setForgot(false)}>Tutup</button>{!sent && <button className="btn primary" onClick={() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? setSent(true) : setForgotErr(true)}>Kirim Tautan</button>}</div>
        </Modal>)}
    </div>
  )
}