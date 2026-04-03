import { useState, useEffect, useCallback } from 'react'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TODAY = new Date()
const TODAY_STR = TODAY.toISOString().split('T')[0]
const NOW_H = TODAY.getHours()
const DAYS_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const DOW_LABELS = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM']
const STATUS_CYCLE = ['pending','done','fail','rest','skip']
const DEFAULT_TROPHIES = [
  {id:'t1',name:'PRIMERA SEMANA',desc:'7 días de racha',req:7,emoji:'🌱',reward:'Noche libre'},
  {id:'t2',name:'MES DE HIERRO',desc:'30 días consecutivos',req:30,emoji:'⚙️',reward:'Cena especial'},
  {id:'t3',name:'CENTURIÓN',desc:'100 días en órbita',req:100,emoji:'🏛️',reward:'Fin de semana'},
  {id:'t4',name:'MEDIO AÑO',desc:'180 días de disciplina',req:180,emoji:'🔭',reward:'Equipo nuevo'},
]
const DEFAULT_HABITS = [
  {id:'h1',name:'Meditación',emoji:'🧘',type:'daily',freq:1,active:true},
  {id:'h2',name:'Ejercicio',emoji:'💪',type:'weekly',freq:4,active:true},
  {id:'h3',name:'Lectura',emoji:'📖',type:'daily',freq:1,active:true},
  {id:'h4',name:'Sin alcohol',emoji:'🚫',type:'avoid',freq:1,active:true},
  {id:'h5',name:'Dormir 8h',emoji:'🌙',type:'daily',freq:1,active:true},
  {id:'h6',name:'Ducha fría',emoji:'🌊',type:'weekly',freq:3,active:true},
  {id:'h7',name:'Journaling',emoji:'✍️',type:'daily',freq:1,active:true},
]

function initState() {
  return {
    habits: DEFAULT_HABITS,
    log: {},
    trophies: DEFAULT_TROPHIES,
    travelMode: false,
    travelReason: '',
    selectedHabit: 'h1',
    intentionDate: '',
    nightReviewDate: '',
    energyToday: 'normal',
    currentTab: 'maestros',
  }
}

function loadState() {
  try { return JSON.parse(localStorage.getItem('ho_v3')) || null } catch { return null }
}

function seedDemo(state) {
  if (Object.keys(state.log).length > 10) return state
  const log = { ...state.log }
  const d = new Date(TODAY)
  for (let i = 1; i < 80; i++) {
    d.setDate(d.getDate() - 1)
    const ds = d.toISOString().split('T')[0]
    if (!log[ds]) log[ds] = {}
    state.habits.forEach(h => {
      const r = Math.random()
      log[ds][h.id] = r > 0.12 ? 'done' : r > 0.06 ? 'rest' : 'fail'
    })
  }
  return { ...state, log }
}

// ─── DATA HELPERS ─────────────────────────────────────────────────────────────
function getStatus(log, hid, ds) { return (log[ds] || {})[hid] || 'pending' }

function nextStatus(cur) {
  return STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length]
}

function currentStreak(log, hid) {
  let s = 0
  const d = new Date(TODAY)
  for (let i = 0; i < 500; i++) {
    const ds = d.toISOString().split('T')[0]
    const st = getStatus(log, hid, ds)
    if (st === 'done' || st === 'rest' || st === 'skip') s++
    else if (st === 'pending' && i === 0) { d.setDate(d.getDate() - 1); continue }
    else break
    d.setDate(d.getDate() - 1)
  }
  return s
}

function maxStreak(log, hid) {
  let max = 0, cur = 0
  const d = new Date(TODAY)
  for (let i = 0; i < 365; i++) {
    const ds = d.toISOString().split('T')[0]
    const st = getStatus(log, hid, ds)
    if (st === 'done' || st === 'rest' || st === 'skip') cur++
    else if (st === 'fail') { max = Math.max(max, cur); cur = 0 }
    d.setDate(d.getDate() - 1)
  }
  return Math.max(max, cur)
}

function weeklyProgress(log, h) {
  if (h.type !== 'weekly') return null
  const monday = new Date(TODAY)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  let done = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    if (d > TODAY) break
    if (getStatus(log, h.id, d.toISOString().split('T')[0]) === 'done') done++
  }
  return { done, goal: h.freq }
}

function avoidDaysSince(log, hid) {
  let days = 0
  const d = new Date(TODAY)
  for (let i = 0; i < 500; i++) {
    const ds = d.toISOString().split('T')[0]
    const st = getStatus(log, hid, ds)
    if (st === 'fail') return days
    days++
    d.setDate(d.getDate() - 1)
  }
  return days
}

function getTodayStats(log, habits) {
  const active = habits.filter(h => h.active)
  const done = active.filter(h => getStatus(log, h.id, TODAY_STR) === 'done').length
  return { total: active.length, done, pct: active.length ? Math.round(done / active.length * 100) : 0 }
}

function compliance30(log, habits) {
  let hits = 0, total = 0
  const d = new Date(TODAY)
  for (let i = 0; i < 30; i++) {
    const ds = d.toISOString().split('T')[0]
    habits.filter(h => h.active).forEach(h => {
      const s = getStatus(log, h.id, ds)
      if (s !== 'pending') { total++; if (s === 'done') hits++ }
    })
    d.setDate(d.getDate() - 1)
  }
  return total ? Math.round(hits / total * 100) : 0
}

function habitCompliance30(log, hid) {
  let done = 0, total = 0
  const d = new Date(TODAY)
  for (let i = 0; i < 30; i++) {
    const ds = d.toISOString().split('T')[0]
    const s = getStatus(log, hid, ds)
    if (s !== 'pending') { total++; if (s === 'done') done++ }
    d.setDate(d.getDate() - 1)
  }
  return total ? Math.round(done / total * 100) : 0
}

function dayOfWeekCompliance(log, habits) {
  const counts = Array(7).fill(0), totals = Array(7).fill(0)
  const d = new Date(TODAY)
  for (let i = 0; i < 60; i++) {
    const ds = d.toISOString().split('T')[0]
    const dow = (d.getDay() + 6) % 7
    habits.filter(h => h.active).forEach(h => {
      const s = getStatus(log, h.id, ds)
      if (s !== 'pending') { totals[dow]++; if (s === 'done') counts[dow]++ }
    })
    d.setDate(d.getDate() - 1)
  }
  return counts.map((c, i) => totals[i] ? Math.round(c / totals[i] * 100) : 0)
}

function build365(log, hid) {
  const days = []
  const start = new Date(TODAY); start.setDate(start.getDate() - 364)
  for (let i = 0; i < 365; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i)
    const ds = d.toISOString().split('T')[0]
    days.push({ date: ds, status: getStatus(log, hid, ds), dow: d.getDay(), month: d.getMonth(), isToday: ds === TODAY_STR })
  }
  // Mark inactive (5+ consecutive pending)
  let pendRun = 0
  return days.map(d => {
    if (d.status === 'pending') { pendRun++; if (pendRun >= 5) return { ...d, status: 'inactive' } }
    else pendRun = 0
    return d
  })
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  app: { position:'relative', zIndex:1, maxWidth:740, margin:'0 auto', padding:'0 16px 60px' },
  // Header
  header: { padding:'28px 0 0', borderBottom:'1px solid #2a2a3e', marginBottom:0 },
  logo: { fontFamily:"'Orbitron',monospace", fontSize:22, fontWeight:900, letterSpacing:2, color:'#39ff14', textShadow:'0 0 8px #39ff1488,0 0 20px #39ff1433', lineHeight:1, display:'inline-block' },
  headerDate: { fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:'#9090b0', marginTop:4, letterSpacing:1 },
  // Orbit badge
  badge: (cls) => ({ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:3, fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, letterSpacing:2, border:'1px solid', clipPath:'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)', ...cls }),
  // Nav
  nav: { display:'flex', gap:0, borderBottom:'1px solid #1e1e2e', overflowX:'auto', msOverflowStyle:'none', scrollbarWidth:'none' },
  navBtn: (active) => ({ background:'none', border:'none', padding:'14px 16px', color: active ? '#39ff14' : '#3a3a5a', fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, letterSpacing:2, cursor:'pointer', position:'relative', whiteSpace:'nowrap', transition:'color .15s', borderBottom: active ? '2px solid #39ff14' : '2px solid transparent', boxShadow: active ? '0 2px 8px #39ff1433' : 'none' }),
  // Habit row
  hRow: (status) => {
    const map = { done:{ border:'1px solid #39ff14', background:'rgba(57,255,20,0.04)', leftBar:'#39ff14', leftGlow:'0 0 6px #39ff14' }, fail:{ border:'1px solid #ff3a3a', background:'#1a0505', leftBar:'#ff3a3a', leftGlow:'none' }, rest:{ border:'1px solid #8a6fff', background:'#0d0a1a', leftBar:'#8a6fff', leftGlow:'none' }, skip:{ border:'1px solid #ffb800', background:'#1a1000', leftBar:'#ffb800', leftGlow:'none' } }
    const m = map[status] || { border:'1px solid #1e1e2e', background:'#0d0d12', leftBar:'#1e1e2e', leftGlow:'none' }
    return { display:'flex', alignItems:'center', gap:10, padding:'13px 14px 13px 18px', background:m.background, border:m.border, borderRadius:5, cursor:'pointer', transition:'border-color .15s,background .15s', position:'relative', overflow:'hidden', clipPath:'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%)', borderLeft:`3px solid ${m.leftBar}`, boxShadow: m.leftGlow !== 'none' ? m.leftGlow : 'none' }
  },
  // Check
  check: (status) => {
    const map = { done:{ bg:'#39ff14', border:'#39ff14', color:'#050507', shadow:'0 0 6px #39ff14' }, fail:{ bg:'#ff3a3a', border:'#ff3a3a', color:'#fff', shadow:'none' }, rest:{ bg:'#8a6fff', border:'#8a6fff', color:'#fff', shadow:'none' }, skip:{ bg:'#ffb800', border:'#ffb800', color:'#050507', shadow:'none' } }
    const m = map[status] || { bg:'transparent', border:'#2a2a3e', color:'#3a3a5a', shadow:'none' }
    return { width:22, height:22, border:`1.5px solid ${m.border}`, borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:11, fontWeight:700, transition:'all .15s', fontFamily:"'Share Tech Mono',monospace", background:m.bg, color:m.color, boxShadow:m.shadow }
  },
  // Text helpers
  habitName: (status) => ({ flex:1, fontSize:13, fontWeight:400, color: status==='fail' ? '#9090b0' : status==='done' ? '#f0f0ff' : '#f0f0ff', textDecoration: status==='fail' ? 'line-through' : 'none', textShadow: status==='done' ? '0 0 6px rgba(240,240,255,0.3)' : 'none' }),
  // Stat card
  statCard: { padding:14, background:'#0d0d12', border:'1px solid #1e1e2e', borderRadius:5, clipPath:'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)' },
  statVal: { fontFamily:"'Orbitron',monospace", fontSize:26, fontWeight:900, color:'#f0f0ff', textShadow:'0 0 8px rgba(240,240,255,0.4),0 0 20px rgba(200,200,255,0.15)', lineHeight:1 },
  statLabel: { fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:'#3a3a5a', marginTop:5, letterSpacing:.5 },
  // Section label
  sl: { fontFamily:"'Orbitron',monospace", fontSize:9, letterSpacing:3, color:'#3a3a5a', marginBottom:14, textTransform:'uppercase', display:'flex', alignItems:'center', gap:10 },
  // Buttons
  btnNeon: { background:'#1a4a0a', border:'1px solid #39ff14', color:'#39ff14', padding:'10px 18px', borderRadius:5, cursor:'pointer', fontFamily:"'Orbitron',monospace", fontSize:9, letterSpacing:2, fontWeight:700, transition:'all .15s', whiteSpace:'nowrap' },
  btnGhost: { background:'none', border:'1px solid #2a2a3e', color:'#9090b0', padding:'10px 18px', borderRadius:5, cursor:'pointer', fontFamily:"'Orbitron',monospace", fontSize:9, letterSpacing:1, transition:'all .15s', whiteSpace:'nowrap' },
  // Input
  input: { background:'#141420', border:'1px solid #2a2a3e', borderRadius:5, padding:'10px 14px', color:'#f0f0ff', fontFamily:"'Share Tech Mono',monospace", fontSize:13, outline:'none', width:'100%' },
  // Trophy card
  trophyCard: (unlocked) => ({ padding:16, background:'#0d0d12', border: unlocked ? '1px solid #ffb800' : '1px solid #1e1e2e', borderRadius:5, clipPath:'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%)', transition:'border-color .15s', boxShadow: unlocked ? '0 0 8px rgba(255,184,0,0.15)' : 'none' }),
  // Modal
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(4px)' },
  modal: { background:'#0a0a0e', border:'1px solid #39ff14', borderRadius:8, padding:28, maxWidth:440, width:'100%', clipPath:'polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,0 100%)', boxShadow:'0 0 20px #39ff1433,0 0 60px rgba(57,255,20,0.06)', animation:'modalIn .25s ease' },
  modalTitle: { fontFamily:"'Orbitron',monospace", fontSize:14, fontWeight:900, letterSpacing:2, color:'#f0f0ff', textShadow:'0 0 8px rgba(240,240,255,0.4)', marginBottom:6 },
  modalSub: { fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:'#9090b0', marginBottom:20, lineHeight:1.7 },
}

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={S.sl}>
      {children}
      <span style={{ flex:1, height:1, background:'#1e1e2e' }} />
    </div>
  )
}

function ProgressBar({ pct }) {
  return (
    <div style={{ margin:'16px 0 20px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
        <span style={{ fontFamily:"'Orbitron',monospace", fontSize:9, letterSpacing:2, color:'#3a3a5a' }}>PROGRESO HOY</span>
        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:'#39ff14', textShadow:'0 0 6px #39ff14' }}>{pct}%</span>
      </div>
      <div style={{ background:'#1a1a28', height:4, borderRadius:0, position:'relative', overflow:'visible' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:'#39ff14', boxShadow:'0 0 8px #39ff14,0 0 20px #39ff1488', transition:'width .6s cubic-bezier(.4,0,.2,1)', position:'relative' }}>
          {pct > 0 && <div style={{ position:'absolute', right:-1, top:-3, width:10, height:10, background:'#39ff14', borderRadius:'50%', boxShadow:'0 0 8px #39ff14,0 0 16px #39ff1488' }} />}
        </div>
      </div>
    </div>
  )
}

function WeekMini({ log, hid }) {
  const dots = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(TODAY); d.setDate(d.getDate() - i)
    const ds = d.toISOString().split('T')[0]
    const st = getStatus(log, hid, ds)
    const col = st==='done' ? '#39ff14' : st==='fail' ? '#ff3a3a' : st==='rest' ? '#8a6fff' : st==='skip' ? '#ffb800' : '#1a1a28'
    const glow = st==='done' ? '0 0 4px #39ff14' : 'none'
    const isToday = ds === TODAY_STR
    dots.push(<div key={i} style={{ width:10, height:10, borderRadius:2, background:col, boxShadow: isToday ? '0 0 0 1.5px #f0f0ff' : glow, flexShrink:0 }} />)
  }
  return <div style={{ display:'flex', gap:3 }}>{dots}</div>
}

function TypeBadge({ h, log }) {
  const wp = weeklyProgress(log, h)
  const avD = h.type === 'avoid' ? avoidDaysSince(log, h.id) : null
  const styles = {
    daily: { color:'#3a3a5a', border:'1px solid #1e1e2e', background:'transparent' },
    weekly: { color:'#00e5ff', border:'1px solid #00e5ff', background:'#00151a' },
    avoid: { color:'#ffb800', border:'1px solid #ffb800', background:'#1a1000' },
  }
  const labels = {
    daily: 'DIARIO',
    weekly: wp ? `${wp.done}/${h.freq}sem` : `0/${h.freq}sem`,
    avoid: `${avD}d sin fallo`,
  }
  return (
    <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, padding:'2px 6px', borderRadius:2, flexShrink:0, ...styles[h.type] }}>
      {labels[h.type]}
    </span>
  )
}

function Toast({ msg }) {
  return (
    <div style={{ position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)', background:'#141420', border:'1px solid #39ff14', color:'#f0f0ff', textShadow:'0 0 6px rgba(240,240,255,0.5)', padding:'10px 22px', borderRadius:3, fontFamily:"'Share Tech Mono',monospace", fontSize:12, zIndex:500, pointerEvents:'none', boxShadow:'0 0 8px #39ff1444', clipPath:'polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,0 100%)', whiteSpace:'nowrap' }}>
      {msg}
    </div>
  )
}

// ─── MODAL COMPONENTS ─────────────────────────────────────────────────────────
function IntentionModal({ energy, onSetEnergy, onConfirm, onTravelMode }) {
  const opts = [
    { key:'high', icon:'⚡', label:'ALTA' },
    { key:'normal', icon:'🎯', label:'NORMAL' },
    { key:'low', icon:'🌫️', label:'BAJA' },
  ]
  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onConfirm()}>
      <div style={S.modal}>
        <div style={S.modalTitle}>// INICIALIZACIÓN DEL DÍA</div>
        <div style={S.modalSub}>
          {DAYS_ES[TODAY.getDay()]} {TODAY.getDate()} {MONTHS_ES[TODAY.getMonth()]} · Calibra tu energía antes de comenzar la órbita
        </div>
        <SectionLabel>NIVEL DE ENERGÍA</SectionLabel>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
          {opts.map(o => (
            <div key={o.key} onClick={() => onSetEnergy(o.key)} style={{ padding:14, background: energy===o.key ? '#1a4a0a' : '#0d0d12', border: `1px solid ${energy===o.key ? '#39ff14' : '#1e1e2e'}`, borderRadius:5, cursor:'pointer', textAlign:'center', transition:'all .15s', boxShadow: energy===o.key ? '0 0 8px #39ff1433' : 'none' }}>
              <div style={{ fontSize:22, marginBottom:6 }}>{o.icon}</div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, letterSpacing:2, color: energy===o.key ? '#f0f0ff' : '#3a3a5a', textShadow: energy===o.key ? '0 0 6px rgba(240,240,255,0.4)' : 'none' }}>{o.label}</div>
            </div>
          ))}
          <div onClick={onTravelMode} style={{ padding:14, background:'#0d0d12', border:'1px solid #1e1e2e', borderRadius:5, cursor:'pointer', textAlign:'center', transition:'all .15s' }}>
            <div style={{ fontSize:22, marginBottom:6 }}>✈️</div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, letterSpacing:2, color:'#3a3a5a' }}>VIAJE</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button style={{ ...S.btnNeon, flex:1 }} onClick={onConfirm}>ACTIVAR ÓRBITA</button>
        </div>
      </div>
    </div>
  )
}

function NightReviewModal({ log, habits, onSet, onClose }) {
  const pending = habits.filter(h => h.active && getStatus(log, h.id, TODAY_STR) === 'pending')
  if (pending.length === 0) { onClose(); return null }
  const { done, total } = getTodayStats(log, habits)
  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.modalTitle}>// REVISIÓN NOCTURNA</div>
        <div style={S.modalSub}>{done}/{total} completados · Cierra el día antes de desconectarte</div>
        <SectionLabel>PENDIENTES SIN REGISTRAR</SectionLabel>
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
          {pending.map(h => (
            <div key={h.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#0d0d12', border:'1px solid #1e1e2e', borderRadius:5 }}>
              <span style={{ fontSize:16 }}>{h.emoji}</span>
              <span style={{ flex:1, fontSize:13, color:'#f0f0ff' }}>{h.name}</span>
              {[['done','✓','#39ff14','#1a4a0a'],['rest','◎','#8a6fff','#0d0a1a'],['fail','✕','#ff3a3a','#1a0505']].map(([st,sym,col,bg]) => (
                <button key={st} onClick={() => onSet(h.id, st)} style={{ background:bg, border:`1px solid ${col}`, color:col, padding:'6px 10px', borderRadius:3, cursor:'pointer', fontFamily:"'Share Tech Mono',monospace", fontSize:12, fontWeight:700 }}>{sym}</button>
              ))}
            </div>
          ))}
        </div>
        <button style={{ ...S.btnNeon, width:'100%' }} onClick={onClose}>CERRAR DÍA</button>
      </div>
    </div>
  )
}

function TravelModal({ onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modal, borderColor:'#ffb800', boxShadow:'0 0 20px rgba(255,184,0,0.2)' }}>
        <div style={{ ...S.modalTitle, color:'#ffb800' }}>// MODO VIAJE</div>
        <div style={S.modalSub}>Pausa total sin penalizar rachas · Los hábitos del día se marcan como "skip" · Tu historial registra una pausa, no un fallo</div>
        <input style={{ ...S.input, marginBottom:16 }} placeholder="Motivo (opcional): conferencia, vacaciones..." value={reason} onChange={e => setReason(e.target.value)} />
        <div style={{ display:'flex', gap:8 }}>
          <button style={{ ...S.btnNeon, flex:1, borderColor:'#ffb800', color:'#ffb800', background:'#1a1000' }} onClick={() => onConfirm(reason)}>ACTIVAR MODO VIAJE</button>
          <button style={S.btnGhost} onClick={onClose}>CANCELAR</button>
        </div>
      </div>
    </div>
  )
}

function AddHabitModal({ onConfirm, onClose }) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('⚡')
  const [type, setType] = useState('daily')
  const [freq, setFreq] = useState(3)

  const typeDesc = { daily:'→ Se espera cada día. La racha se rompe si fallas. Descanso no penaliza.', weekly:'→ Flexible en cuándo, fijo en cuánto. La racha no cae si alcanzas tu objetivo semanal.', avoid:'→ Cuenta días desde la última vez que ocurrió lo indeseable. Un fallo reinicia el contador.' }
  const typeColors = { daily:'#39ff14', weekly:'#00e5ff', avoid:'#ffb800' }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalTitle}>// NUEVO HÁBITO</div>
        <div style={S.modalSub}>El tipo de seguimiento cambia cómo se calculan tus rachas</div>
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <input style={{ ...S.input, width:52, flex:'none', textAlign:'center', fontSize:18 }} value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={2} />
          <input style={S.input} placeholder="Nombre del hábito..." value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && name.trim() && onConfirm({ name, emoji, type, freq })} autoFocus />
        </div>
        <SectionLabel>TIPO DE HÁBITO</SectionLabel>
        <div style={{ display:'flex', gap:6, marginBottom:12 }}>
          {['daily','weekly','avoid'].map(t => (
            <button key={t} onClick={() => setType(t)} style={{ flex:1, padding:'8px 0', borderRadius:3, border:`1px solid ${type===t ? typeColors[t] : '#1e1e2e'}`, background: type===t ? typeColors[t]+'22' : 'transparent', color: type===t ? typeColors[t] : '#3a3a5a', fontFamily:"'Orbitron',monospace", fontSize:8, letterSpacing:2, cursor:'pointer', transition:'all .15s' }}>
              {t === 'daily' ? 'DIARIO' : t === 'weekly' ? 'X/SEM' : 'EVITAR'}
            </button>
          ))}
        </div>
        {type === 'weekly' && (
          <div style={{ marginBottom:12 }}>
            <SectionLabel>VECES POR SEMANA</SectionLabel>
            <div style={{ display:'flex', gap:4 }}>
              {[1,2,3,4,5,6,7].map(n => (
                <button key={n} onClick={() => setFreq(n)} style={{ flex:1, padding:'8px 0', borderRadius:3, border:`1px solid ${freq===n ? '#00e5ff' : '#1e1e2e'}`, background: freq===n ? '#00151a' : 'transparent', color: freq===n ? '#00e5ff' : '#3a3a5a', fontFamily:"'Orbitron',monospace", fontSize:10, cursor:'pointer', transition:'all .15s' }}>{n}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ padding:10, background:'#0d0d12', borderRadius:5, fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:'#9090b0', lineHeight:1.7, marginBottom:16 }}>
          {typeDesc[type]}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button style={{ ...S.btnNeon, flex:1 }} onClick={() => name.trim() && onConfirm({ name, emoji, type, freq })}>AÑADIR HÁBITO</button>
          <button style={S.btnGhost} onClick={onClose}>CANCELAR</button>
        </div>
      </div>
    </div>
  )
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
function MaestrosTab({ state, onToggle, onShowAdd, onShowTravel, onShowNight }) {
  const { log, habits, travelMode, energyToday } = state
  const active = habits.filter(h => h.active)
  const { done, total, pct } = getTodayStats(log, habits)
  const c30 = compliance30(log, habits)
  const bestStreak = Math.max(0, ...active.map(h => currentStreak(log, h.id)))
  const eColors = { high:'#39ff14', normal:'#00e5ff', low:'#ffb800' }
  const eLabels = { high:'ENERGÍA ALTA', normal:'ENERGÍA NORMAL', low:'ENERGÍA BAJA' }

  return (
    <div>
      <SectionLabel>OBJETIVOS · {DAYS_ES[TODAY.getDay()].toUpperCase()}</SectionLabel>
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        <div style={{ padding:'5px 12px', borderRadius:3, border:`1px solid ${eColors[energyToday]}`, color:eColors[energyToday], fontFamily:"'Orbitron',monospace", fontSize:8, letterSpacing:2, background:eColors[energyToday]+'22' }}>
          {eLabels[energyToday]}
        </div>
        {!travelMode && <button style={{ ...S.btnGhost, padding:'5px 12px', fontSize:8 }} onClick={onShowTravel}>✈️ MODO VIAJE</button>}
        {NOW_H >= 20 && <button style={{ ...S.btnGhost, padding:'5px 12px', fontSize:8, borderColor:'#8a6fff', color:'#8a6fff' }} onClick={onShowNight}>🌙 REVISIÓN NOCTURNA</button>}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:20 }}>
        {active.map(h => {
          const status = getStatus(log, h.id, TODAY_STR)
          const streak = currentStreak(log, h.id)
          const sym = { done:'✓', fail:'✕', rest:'◎', skip:'↷' }[status] || ''
          const isLow = energyToday === 'low' && h.type === 'weekly'
          return (
            <div key={h.id} style={{ ...S.hRow(status), opacity: isLow ? 0.5 : 1 }} onClick={() => onToggle(h.id)}>
              <div style={S.check(status)}>{sym}</div>
              <span style={{ fontSize:17, flexShrink:0 }}>{h.emoji}</span>
              <span style={S.habitName(status)}>{h.name}</span>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <TypeBadge h={h} log={log} />
                  {streak > 0 && <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color: status==='done' ? '#39ff14' : '#3a3a5a' }}>{streak}d</span>}
                </div>
                <WeekMini log={log} hid={h.id} />
              </div>
            </div>
          )
        })}
      </div>

      <button style={{ width:'100%', background:'none', border:'1px dashed #2a2a3e', borderRadius:5, padding:12, color:'#3a3a5a', fontFamily:"'Orbitron',monospace", fontSize:9, letterSpacing:2, cursor:'pointer', transition:'all .15s' }}
        onMouseOver={e => { e.currentTarget.style.borderColor='#39ff14'; e.currentTarget.style.color='#39ff14' }}
        onMouseOut={e => { e.currentTarget.style.borderColor='#2a2a3e'; e.currentTarget.style.color='#3a3a5a' }}
        onClick={onShowAdd}>
        + AÑADIR HÁBITO
      </button>

      <div style={{ marginTop:20, padding:16, background:'#0d0d12', border:'1px solid #1e1e2e', borderRadius:5 }}>
        <SectionLabel>RESUMEN</SectionLabel>
        <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
          {[
            [pct+'%', 'HOY', '#f0f0ff'],
            [c30+'%', '30 DÍAS', '#f0f0ff'],
            [bestStreak+'d', 'MEJOR RACHA', '#f0f0ff'],
          ].map(([val, lbl, col]) => (
            <div key={lbl}>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:22, fontWeight:900, color:col, textShadow:'0 0 8px rgba(240,240,255,0.4)', lineHeight:1 }}>{val}</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:'#3a3a5a', marginTop:4 }}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function OrbitaTab({ state, onToggleCell, onSelectHabit }) {
  const { log, habits, selectedHabit } = state
  const active = habits.filter(h => h.active)
  const sel = active.find(h => h.id === selectedHabit) || active[0]
  if (!sel) return <div style={{ color:'#3a3a5a', textAlign:'center', padding:40, fontFamily:"'Share Tech Mono',monospace" }}>Sin hábitos activos</div>

  const days = build365(log, sel.id)
  const firstPad = days[0].dow
  const cols = []; let col = []
  for (let i = 0; i < firstPad; i++) col.push(null)
  days.forEach(d => { col.push(d); if (col.length === 7) { cols.push(col); col = [] } })
  if (col.length) cols.push(col)

  const cellColor = { done:'#39ff14', fail:'#ff3a3a', rest:'#8a6fff', skip:'#ffb800', pending:'#141420', inactive:'#0a0a0a' }
  const cellGlow = { done:'0 0 4px #39ff14', rest:'none', fail:'none', skip:'none', pending:'none', inactive:'none' }

  const doneCount = days.filter(d => d.status === 'done').length
  const streak = currentStreak(log, sel.id)
  const mStr = maxStreak(log, sel.id)

  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  let lastM = -1

  return (
    <div>
      <SectionLabel>SELECCIONAR HÁBITO</SectionLabel>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
        {active.map(h => (
          <button key={h.id} onClick={() => onSelectHabit(h.id)} style={{ padding:'5px 12px', borderRadius:3, border:`1px solid ${h.id===sel.id ? '#39ff14' : '#1e1e2e'}`, background: h.id===sel.id ? '#1a4a0a' : 'transparent', color: h.id===sel.id ? '#f0f0ff' : '#3a3a5a', fontFamily:"'Share Tech Mono',monospace", fontSize:11, cursor:'pointer', transition:'all .15s', textShadow: h.id===sel.id ? '0 0 6px rgba(240,240,255,0.4)' : 'none', boxShadow: h.id===sel.id ? '0 0 6px #39ff1433' : 'none' }}>
            {h.emoji} {h.name}
          </button>
        ))}
      </div>

      <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:12 }}>
        {[['#39ff14','Logrado','0 0 4px #39ff14'],['#8a6fff','Descanso','none'],['#ff3a3a','Fallido','none'],['#ffb800','Skip/viaje','none'],['#141420','Pendiente','none']].map(([col,lbl,glow]) => (
          <div key={lbl} style={{ display:'flex', alignItems:'center', gap:5, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:'#3a3a5a' }}>
            <div style={{ width:10, height:10, borderRadius:2, background:col, boxShadow:glow, border: col==='#141420' ? '1px solid #1e1e2e' : 'none', flexShrink:0 }} />
            {lbl}
          </div>
        ))}
      </div>

      <div style={{ overflowX:'auto', paddingBottom:8, marginBottom:16 }}>
        <div style={{ display:'flex', gap:3, marginBottom:5, minWidth:'fit-content' }}>
          {cols.map((c, ci) => {
            const fr = c.find(x => x)
            if (fr && fr.month !== lastM) { lastM = fr.month; return <span key={ci} style={{ width:15, fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:'#3a3a5a', flexShrink:0 }}>{months[fr.month]}</span> }
            return <span key={ci} style={{ width:15, flexShrink:0, display:'inline-block' }} />
          })}
        </div>
        <div style={{ display:'flex', gap:3, minWidth:'fit-content' }}>
          {cols.map((c, ci) => (
            <div key={ci} style={{ display:'flex', flexDirection:'column', gap:3 }}>
              {c.map((d, di) => {
                if (!d) return <div key={di} style={{ width:12, height:12 }} />
                const col = cellColor[d.status] || '#141420'
                const glow = cellGlow[d.status] || 'none'
                return (
                  <div key={d.date} onClick={() => onToggleCell(sel.id, d.date)} title={`${d.date} · ${d.status}`} style={{ width:12, height:12, borderRadius:2, background:col, boxShadow: d.isToday ? '0 0 0 1.5px #f0f0ff' : glow, cursor:'pointer', transition:'transform .1s', flexShrink:0 }}
                    onMouseOver={e => e.currentTarget.style.transform='scale(1.4)'}
                    onMouseOut={e => e.currentTarget.style.transform='scale(1)'} />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
        {[[doneCount,'LOGRADOS 365D'],[streak+'d','RACHA ACTUAL'],[mStr+'d','RACHA MÁXIMA']].map(([v,l]) => (
          <div key={l} style={S.statCard}><div style={S.statVal}>{v}</div><div style={S.statLabel}>{l}</div></div>
        ))}
      </div>

      <button style={S.btnGhost} onClick={() => {
        const b = new Blob([JSON.stringify({ habits: state.habits, log }, null, 2)], { type:'application/json' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'habitOrbit-backup.json'; a.click()
      }}>EXPORTAR JSON</button>
    </div>
  )
}

function TroteosTab({ state, onAddTrophy }) {
  const { habits, log, trophies } = state
  const active = habits.filter(h => h.active)
  const bestStreak = Math.max(0, ...active.map(h => currentStreak(log, h.id)))
  const [form, setForm] = useState({ emoji:'🏆', name:'', req:30, reward:'' })

  return (
    <div>
      <SectionLabel>HITOS AUTOMÁTICOS</SectionLabel>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, marginBottom:20 }}>
        {trophies.map(t => {
          const unlocked = bestStreak >= t.req
          const pct = Math.min(100, Math.round(bestStreak / t.req * 100))
          return (
            <div key={t.id} style={S.trophyCard(unlocked)}>
              <div style={{ fontSize:22, marginBottom:8 }}>{t.emoji}</div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, fontWeight:700, letterSpacing:1, color:'#f0f0ff', textShadow: unlocked ? '0 0 6px rgba(240,240,255,0.4)' : 'none', marginBottom:4 }}>{t.name}</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:'#3a3a5a', lineHeight:1.5, marginBottom:8 }}>{t.desc}</div>
              {unlocked
                ? <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:'#ffb800' }}>✓ {t.reward}</div>
                : <div>
                    <div style={{ background:'#1a1a28', height:2, borderRadius:0, marginBottom:4 }}>
                      <div style={{ width:`${pct}%`, height:'100%', background:'#39ff14', boxShadow:'0 0 4px #39ff14', transition:'width .6s ease' }} />
                    </div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:'#39ff14' }}>{bestStreak}/{t.req}d · {pct}%</div>
                  </div>
              }
            </div>
          )
        })}
      </div>

      <SectionLabel>CREAR HITO PERSONALIZADO</SectionLabel>
      <div style={{ background:'#0d0d12', border:'1px solid #1e1e2e', borderRadius:5, padding:16, animation:'slideIn .2s ease' }}>
        <div style={{ display:'flex', gap:8, marginBottom:10 }}>
          <input style={{ ...S.input, width:52, flex:'none', textAlign:'center', fontSize:18 }} value={form.emoji} onChange={e => setForm(f=>({...f,emoji:e.target.value}))} maxLength={2} />
          <input style={S.input} placeholder="Nombre del hito..." value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} />
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <input style={{ ...S.input, width:100, flex:'none' }} type="number" placeholder="Días" min="1" value={form.req} onChange={e => setForm(f=>({...f,req:parseInt(e.target.value)||30}))} />
          <input style={S.input} placeholder="Recompensa al desbloquearlo..." value={form.reward} onChange={e => setForm(f=>({...f,reward:e.target.value}))} />
          <button style={{ ...S.btnNeon, flexShrink:0 }} onClick={() => { if(form.name.trim()) { onAddTrophy(form); setForm({emoji:'🏆',name:'',req:30,reward:''}) } }}>CREAR</button>
        </div>
      </div>
    </div>
  )
}

function StatsTab({ state }) {
  const { log, habits } = state
  const active = habits.filter(h => h.active)
  const c30 = compliance30(log, habits)
  const totalDone = Object.values(log).reduce((a, d) => a + Object.values(d).filter(v => v === 'done').length, 0)
  const bestCur = Math.max(0, ...active.map(h => currentStreak(log, h.id)))
  const bestMax = Math.max(0, ...active.map(h => maxStreak(log, h.id)))
  const dowPct = dayOfWeekCompliance(log, habits)

  return (
    <div>
      <SectionLabel>GLOBAL</SectionLabel>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:20 }}>
        {[[c30+'%','CUMPL. 30D'],[totalDone,'TOTAL LOGRADOS'],[bestCur+'d','RACHA ACTUAL'],[bestMax+'d','RACHA MÁXIMA'],[active.length,'HÁBITOS ACTIVOS'],[(state.trophies||[]).filter(t=>bestCur>=t.req).length,'TROFEOS']].map(([v,l]) => (
          <div key={l} style={S.statCard}><div style={S.statVal}>{v}</div><div style={S.statLabel}>{l}</div></div>
        ))}
      </div>

      <SectionLabel>PATRÓN SEMANAL</SectionLabel>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:20 }}>
        {DOW_LABELS.map((l, i) => {
          const p = dowPct[i]
          const col = p >= 70 ? '#39ff14' : p >= 40 ? '#00e5ff' : '#ff3a3a'
          const glow = p >= 70 ? '0 0 6px #39ff14' : 'none'
          return (
            <div key={l} style={{ padding:'10px 4px', background:'#0d0d12', border:'1px solid #1e1e2e', borderRadius:5, textAlign:'center' }}>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:8, letterSpacing:1, color:'#3a3a5a', marginBottom:6 }}>{l}</div>
              <div style={{ height:40, display:'flex', alignItems:'flex-end' }}>
                <div style={{ width:'100%', height:`${Math.max(4, p*0.4)}px`, background:col, boxShadow:glow, borderRadius:'2px 2px 0 0', transition:'height .6s ease' }} />
              </div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:col, textShadow:glow, marginTop:4 }}>{p}%</div>
            </div>
          )
        })}
      </div>

      <SectionLabel>POR HÁBITO</SectionLabel>
      <div style={{ background:'#0d0d12', border:'1px solid #1e1e2e', borderRadius:5, overflow:'hidden' }}>
        {active.map((h, i) => {
          const streak = currentStreak(log, h.id)
          const mStr = maxStreak(log, h.id)
          const c = habitCompliance30(log, h.id)
          return (
            <div key={h.id} style={{ padding:'12px 14px', borderBottom: i < active.length-1 ? '1px solid #1e1e2e' : 'none' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
                  <span style={{ fontSize:15 }}>{h.emoji}</span>
                  <span style={{ color:'#f0f0ff' }}>{h.name}</span>
                </div>
                <div style={{ display:'flex', gap:14, fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:'#3a3a5a' }}>
                  <span>Racha <b style={{color:'#f0f0ff'}}>{streak}d</b></span>
                  <span>Máx <b style={{color:'#f0f0ff'}}>{mStr}d</b></span>
                  <b style={{color:'#39ff14',textShadow:'0 0 4px #39ff14'}}>{c}%</b>
                </div>
              </div>
              <div style={{ background:'#1a1a28', height:2, borderRadius:0 }}>
                <div style={{ width:`${c}%`, height:'100%', background:'#39ff14', boxShadow:'0 0 4px #39ff14', transition:'width .6s ease' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ConfigTab({ state, onToggleActive, onDeactivateTravel, onShowTravel, onExport, onReset }) {
  return (
    <div>
      <SectionLabel>GESTIÓN DE HÁBITOS</SectionLabel>
      <div style={{ background:'#0d0d12', border:'1px solid #1e1e2e', borderRadius:5, overflow:'hidden', marginBottom:20 }}>
        {state.habits.map((h, i) => (
          <div key={h.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderBottom: i < state.habits.length-1 ? '1px solid #1e1e2e' : 'none' }}>
            <span style={{ fontSize:16 }}>{h.emoji}</span>
            <span style={{ flex:1, fontSize:13, color: h.active ? '#f0f0ff' : '#3a3a5a' }}>{h.name}</span>
            <TypeBadge h={h} log={state.log} />
            <button onClick={() => onToggleActive(h.id)} style={{ ...S.btnGhost, fontSize:8, padding:'5px 10px', ...(!h.active ? {borderColor:'#39ff14',color:'#39ff14'} : {}) }}>
              {h.active ? 'ARCHIVAR' : 'REACTIVAR'}
            </button>
          </div>
        ))}
      </div>

      <SectionLabel>MODO VIAJE</SectionLabel>
      <div style={{ padding:16, background:'#0d0d12', border:'1px solid #1e1e2e', borderRadius:5, marginBottom:20 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:'#9090b0', marginBottom:12, lineHeight:1.7 }}>
          Pausa total sin penalizar rachas. Los hábitos del día se marcan como "skip". Tu historial lo registra como pausa, no como fallo.
        </div>
        {state.travelMode
          ? <button style={S.btnGhost} onClick={onDeactivateTravel}>DESACTIVAR MODO VIAJE</button>
          : <button style={S.btnNeon} onClick={onShowTravel}>ACTIVAR MODO VIAJE</button>}
      </div>

      <SectionLabel>DATOS</SectionLabel>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button style={S.btnGhost} onClick={onExport}>EXPORTAR BACKUP JSON</button>
        <button style={{ ...S.btnGhost, borderColor:'#ff3a3a', color:'#ff3a3a' }} onClick={onReset}>RESETEAR APP</button>
      </div>
    </div>
  )
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState(() => {
    const loaded = loadState()
    const base = loaded || initState()
    return seedDemo(base)
  })
  const [toast, setToast] = useState(null)
  const [modal, setModal] = useState(null) // 'intention'|'night'|'travel'|'addhabit'

  // Persist
  useEffect(() => { localStorage.setItem('ho_v3', JSON.stringify(state)) }, [state])

  // Boot modals
  useEffect(() => {
    if (NOW_H >= 6 && NOW_H < 13 && state.intentionDate !== TODAY_STR) {
      setTimeout(() => setModal('intention'), 800)
    } else if (NOW_H >= 20 && state.nightReviewDate !== TODAY_STR) {
      setTimeout(() => setModal('night'), 1200)
    }
  }, [])

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }, [])

  const update = useCallback((fn) => setState(prev => {
    const next = { ...prev }
    fn(next)
    return next
  }), [])

  const toggleHabit = useCallback((hid) => {
    update(s => {
      if (!s.log[TODAY_STR]) s.log = { ...s.log, [TODAY_STR]: {} }
      const cur = getStatus(s.log, hid, TODAY_STR)
      s.log = { ...s.log, [TODAY_STR]: { ...s.log[TODAY_STR], [hid]: nextStatus(cur) } }
    })
    const cur = getStatus(state.log, hid, TODAY_STR)
    const labels = { done:'// LOGRADO ✓', fail:'// FALLIDO', rest:'// DESCANSO ◎', skip:'// SKIP ↷', pending:'// PENDIENTE' }
    showToast(labels[nextStatus(cur)])
  }, [state.log, update, showToast])

  const toggleCell = useCallback((hid, ds) => {
    update(s => {
      if (!s.log[ds]) s.log = { ...s.log, [ds]: {} }
      const cur = getStatus(s.log, hid, ds)
      s.log = { ...s.log, [ds]: { ...s.log[ds], [hid]: nextStatus(cur) } }
    })
  }, [update])

  const tabs = ['maestros','orbita','trofeos','stats','config']
  const tabLabels = ['MAESTROS','ÓRBITA','TROFEOS','DATOS','CONFIG']

  const { done, total, pct } = getTodayStats(state.log, state.habits)
  const c30 = compliance30(state.log, state.habits)

  let badgeStyle, badgeLabel
  if (c30 >= 80) { badgeStyle = { background:'#1a4a0a', borderColor:'#39ff14', color:'#f0f0ff', textShadow:'0 0 8px rgba(240,240,255,0.5)' }; badgeLabel = 'ÓRBITA ESTABLE' }
  else if (c30 >= 40) { badgeStyle = { background:'#1a1000', borderColor:'#ffb800', color:'#f0f0ff', textShadow:'0 0 6px rgba(240,240,255,0.4)' }; badgeLabel = 'EN TRAYECTORIA' }
  else { badgeStyle = { background:'#1a0505', borderColor:'#ff3a3a', color:'#f0f0ff', textShadow:'0 0 6px rgba(240,240,255,0.4)' }; badgeLabel = 'RETOMAR IMPULSO' }

  return (
    <div style={S.app}>
      {/* HEADER */}
      <div style={S.header}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, paddingBottom:20 }}>
          <div>
            <div style={S.logo}>HABIT<span style={{ color:'#f0f0ff', textShadow:'0 0 8px rgba(240,240,255,0.6),0 0 20px rgba(200,200,255,0.3)' }}>ORBIT</span> <span style={{ color:'#3a3a5a', fontSize:10, letterSpacing:1, fontWeight:400 }}>365</span></div>
            <div style={S.headerDate}>{DAYS_ES[TODAY.getDay()].toUpperCase()} {TODAY.getDate()} {MONTHS_ES[TODAY.getMonth()].toUpperCase()} {TODAY.getFullYear()}</div>
          </div>
          <div style={{ ...S.badge({}), ...badgeStyle }}>
            <div style={{ width:5, height:5, borderRadius:'50%', background:'currentColor', animation:'pulse 1.5s infinite' }} />
            <span>{badgeLabel}</span>
          </div>
        </div>
      </div>

      {/* TRAVEL BANNER */}
      {state.travelMode && (
        <div style={{ background:'#1a1000', border:'1px solid #ffb800', borderRadius:5, padding:'10px 16px', margin:'14px 0', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:'#ffb800' }}>
          <span>✈️ MODO VIAJE ACTIVO · {state.travelReason || 'Pausa total'} · Rachas protegidas</span>
          <button style={{ ...S.btnGhost, padding:'5px 10px', fontSize:8 }} onClick={() => { update(s => { s.travelMode=false; s.travelReason=''; s.habits.filter(h=>h.active).forEach(h=>{ if(getStatus(s.log,h.id,TODAY_STR)==='skip'){if(!s.log[TODAY_STR])s.log[TODAY_STR]={};s.log[TODAY_STR][h.id]='pending'} }) }); showToast('// MODO VIAJE DESACTIVADO') }}>DESACTIVAR</button>
        </div>
      )}

      {/* NAV */}
      <div style={S.nav}>
        {tabs.map((t, i) => (
          <button key={t} style={S.navBtn(state.currentTab === t)} onClick={() => update(s => { s.currentTab = t })}>
            {tabLabels[i]}
          </button>
        ))}
      </div>

      <ProgressBar pct={pct} />

      {/* TAB CONTENT */}
      <div key={state.currentTab} className="fade-up">
        {state.currentTab === 'maestros' && <MaestrosTab state={state} onToggle={toggleHabit} onShowAdd={() => setModal('addhabit')} onShowTravel={() => setModal('travel')} onShowNight={() => setModal('night')} />}
        {state.currentTab === 'orbita' && <OrbitaTab state={state} onToggleCell={toggleCell} onSelectHabit={id => update(s => { s.selectedHabit = id })} />}
        {state.currentTab === 'trofeos' && <TroteosTab state={state} onAddTrophy={form => { update(s => { s.trophies = [...s.trophies, { id:'t'+Date.now(), name:form.name.toUpperCase(), emoji:form.emoji, req:form.req, reward:form.reward||'Sin definir', desc:`${form.req} días consecutivos` }] }); showToast('// HITO CREADO') }} />}
        {state.currentTab === 'stats' && <StatsTab state={state} />}
        {state.currentTab === 'config' && <ConfigTab state={state}
          onToggleActive={hid => update(s => { const h=s.habits.find(x=>x.id===hid); if(h)h.active=!h.active })}
          onDeactivateTravel={() => { update(s => { s.travelMode=false; s.travelReason='' }); showToast('// MODO VIAJE DESACTIVADO') }}
          onShowTravel={() => setModal('travel')}
          onExport={() => { const b=new Blob([JSON.stringify({habits:state.habits,log:state.log},null,2)],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='habitOrbit-backup.json';a.click(); showToast('// DATOS EXPORTADOS') }}
          onReset={() => { if(window.confirm('¿Resetear toda la app?')){localStorage.removeItem('ho_v3');setState(initState());showToast('// SISTEMA RESETEADO')} }}
        />}
      </div>

      {/* TOAST */}
      {toast && <Toast msg={toast} />}

      {/* MODALS */}
      {modal === 'intention' && (
        <IntentionModal
          energy={state.energyToday}
          onSetEnergy={e => update(s => { s.energyToday = e })}
          onConfirm={() => { update(s => { s.intentionDate = TODAY_STR }); setModal(null); showToast('// ÓRBITA ACTIVADA') }}
          onTravelMode={() => setModal('travel')}
        />
      )}
      {modal === 'night' && (
        <NightReviewModal
          log={state.log} habits={state.habits}
          onSet={(hid, st) => { update(s => { if(!s.log[TODAY_STR])s.log[TODAY_STR]={}; s.log[TODAY_STR][hid]=st }); showToast(`// ${st.toUpperCase()}`) }}
          onClose={() => { update(s => { s.nightReviewDate = TODAY_STR }); setModal(null); showToast('// DÍA CERRADO · DESCANSA') }}
        />
      )}
      {modal === 'travel' && (
        <TravelModal
          onConfirm={reason => {
            update(s => { s.travelMode=true; s.travelReason=reason; s.habits.filter(h=>h.active).forEach(h=>{ if(getStatus(s.log,h.id,TODAY_STR)==='pending'){if(!s.log[TODAY_STR])s.log[TODAY_STR]={};s.log[TODAY_STR][h.id]='skip'} }) })
            setModal(null); showToast('// MODO VIAJE ACTIVADO · RACHAS PROTEGIDAS')
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'addhabit' && (
        <AddHabitModal
          onConfirm={({ name, emoji, type, freq }) => {
            update(s => { s.habits = [...s.habits, { id:'h'+Date.now(), name, emoji, type, freq, active:true }] })
            setModal(null); showToast('// HÁBITO AÑADIDO')
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
