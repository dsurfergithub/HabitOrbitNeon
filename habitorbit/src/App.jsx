import { useState, useEffect, useMemo, useCallback } from 'react'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TODAY     = new Date()
const TODAY_STR = TODAY.toISOString().split('T')[0]
const NOW_H     = TODAY.getHours()
const DAYS_ES   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const DOW_LABELS= ['L','M','X','J','V','S','D']
const CYCLE     = ['pending','done','fail','rest','skip']
const nextStatus= cur => CYCLE[(CYCLE.indexOf(cur)+1)%CYCLE.length]
const STATUS_COLORS = {done:'var(--neon)',fail:'var(--danger)',rest:'var(--rest)',skip:'var(--warn)',pending:'var(--surface3)',inactive:'#0a0a0a'}
const EMOJI_MAP = {'Pulaar':'🗣️','Darija':'🌙','Leer':'📖','Crear Apps':'💻','AI ARCHITECT':'🤖','Estudio Biblico':'📖','Master IA':'🧠','Suno':'🎵'}

// ─── RESPONSIVE HOOK ─────────────────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth <= 430)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth <= 430)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

const DEFAULT_TROPHIES = [
  {id:'t1',name:'PRIMERA SEMANA',desc:'7 días de racha',req:7,   emoji:'🌱',reward:'Noche libre'},
  {id:'t2',name:'MES DE HIERRO', desc:'30 días consecutivos',req:30,  emoji:'⚙️', reward:'Cena especial'},
  {id:'t3',name:'CENTURIÓN',     desc:'100 días en órbita',req:100,emoji:'🏛️',reward:'Fin de semana'},
  {id:'t4',name:'MEDIO AÑO',     desc:'180 días de disciplina',req:180,emoji:'🔭',reward:'Equipo nuevo'},
]
const DEFAULT_HABITS = [
  {id:'h1',name:'Meditación', emoji:'🧘',type:'daily', freq:1,active:true},
  {id:'h2',name:'Ejercicio',  emoji:'💪',type:'weekly',freq:4,active:true},
  {id:'h3',name:'Lectura',    emoji:'📖',type:'daily', freq:1,active:true},
  {id:'h4',name:'Sin alcohol',emoji:'🚫',type:'avoid', freq:1,active:true},
  {id:'h5',name:'Dormir 8h',  emoji:'🌙',type:'daily', freq:1,active:true},
  {id:'h6',name:'Ducha fría', emoji:'🌊',type:'weekly',freq:3,active:true},
  {id:'h7',name:'Journaling', emoji:'✍️',type:'daily', freq:1,active:true},
]
const emptyTasks = () => Array.from({length:7},(_,i)=>({id:String(i+1),text:'',completed:false}))
const isoDow = d => (d.getDay()+6)%7

// ─── LEGACY IMPORTER ─────────────────────────────────────────────────────────
function importLegacyBackup(raw) {
  const habits = (raw.habits||[]).map(h=>({
    id:h.id, name:h.name, emoji:EMOJI_MAP[h.name]||'⚡',
    type:h.frequency===7?'daily':'weekly', freq:h.frequency||5, active:!h.isArchived,
  }))
  const log = {}
  ;(raw.habits||[]).forEach(h=>{
    if(!h.history) return
    Object.entries(h.history).forEach(([date,val])=>{
      if(!log[date]) log[date]={}
      log[date][h.id] = val==='completed'?'done':'fail'
    })
  })
  const trophies = [...DEFAULT_TROPHIES]
  ;(raw.habits||[]).forEach(h=>{
    ;(h.milestones||[]).forEach(m=>{
      if(!trophies.find(t=>t.id===m.id))
        trophies.push({id:m.id,name:m.label.toUpperCase(),desc:`${m.dayIndex} logros en ${h.name}`,req:m.dayIndex,emoji:m.emoji||'🏆',reward:m.reward||''})
    })
  })
  const tasksHistory = {}
  ;(raw.dailyHistory||[]).forEach(d=>{
    tasksHistory[d.date]={status:d.status,tasks:d.tasks.map(t=>({id:t.id,text:t.text,completed:t.completed}))}
  })
  if(raw.currentDaily){
    const cur=raw.currentDaily
    tasksHistory[cur.date]={status:cur.status||'pending',tasks:(cur.tasks||[]).map(t=>({id:t.id,text:t.text,completed:t.completed}))}
  }
  return {habits,log,trophies,tasksHistory}
}

// ─── STORAGE ──────────────────────────────────────────────────────────────────
function loadState(){try{return JSON.parse(localStorage.getItem('ho_v3'))||null}catch{return null}}
function saveState(s){localStorage.setItem('ho_v3',JSON.stringify(s))}
function initState(){return{habits:DEFAULT_HABITS,log:{},trophies:DEFAULT_TROPHIES,tasksHistory:{},travelMode:false,travelReason:'',selectedHabit:'h1',intentionDate:'',nightReviewDate:'',energyToday:'normal'}}

function seedDemo(state){
  const daysLogged = Object.values(state.log).filter(d=>Object.keys(d).length>0).length
  if(daysLogged > 3) return state
  const log={...state.log},d=new Date(TODAY)
  for(let i=1;i<80;i++){
    d.setDate(d.getDate()-1)
    const ds=d.toISOString().split('T')[0]
    if(!log[ds]) log[ds]={}
    state.habits.forEach(h=>{const r=Math.random();log[ds][h.id]=r>.1?'done':r>.05?'rest':'fail'})
  }
  return{...state,log}
}

// ─── DATA HELPERS ─────────────────────────────────────────────────────────────
function getStatus(log,hid,ds){return(log[ds]||{})[hid]||'pending'}
function currentStreak(log,hid){
  let s=0;const d=new Date(TODAY)
  for(let i=0;i<500;i++){
    const ds=d.toISOString().split('T')[0],st=getStatus(log,hid,ds)
    if(st==='done'||st==='rest'||st==='skip') s++
    else if(st==='pending'&&i===0){d.setDate(d.getDate()-1);continue}
    else break
    d.setDate(d.getDate()-1)
  }
  return s
}
function maxStreak(log,hid){
  let max=0,cur=0;const d=new Date(TODAY)
  for(let i=0;i<365;i++){
    const ds=d.toISOString().split('T')[0],st=getStatus(log,hid,ds)
    if(st==='done'||st==='rest'||st==='skip'){cur++;max=Math.max(max,cur)}
    else if(st==='fail') cur=0
    d.setDate(d.getDate()-1)
  }
  return max
}
function weeklyProgress(log,hid,freq){
  const mon=new Date(TODAY);mon.setDate(mon.getDate()-isoDow(mon))
  let done=0
  for(let i=0;i<7;i++){
    const d=new Date(mon);d.setDate(mon.getDate()+i)
    if(d>TODAY) break
    if(getStatus(log,hid,d.toISOString().split('T')[0])==='done') done++
  }
  return{done,goal:freq}
}
function avoidDaysSince(log,hid){
  let days=0;const d=new Date(TODAY)
  for(let i=0;i<500;i++){
    const ds=d.toISOString().split('T')[0],st=getStatus(log,hid,ds)
    if(st==='fail') return days
    if(st!=='pending') days++
    d.setDate(d.getDate()-1)
  }
  return days
}
function compliance30(log,habits){
  let hits=0,total=0;const d=new Date(TODAY)
  for(let i=0;i<30;i++){
    const ds=d.toISOString().split('T')[0]
    habits.filter(h=>h.active).forEach(h=>{
      const s=getStatus(log,h.id,ds)
      if(s!=='pending'){total++;if(s==='done')hits++}
    })
    d.setDate(d.getDate()-1)
  }
  return total?Math.round(hits/total*100):0
}
function habitCompliance30(log,hid){
  let done=0,total=0;const d=new Date(TODAY)
  for(let i=0;i<30;i++){
    const ds=d.toISOString().split('T')[0],s=getStatus(log,hid,ds)
    if(s!=='pending'){total++;if(s==='done')done++}
    d.setDate(d.getDate()-1)
  }
  return total?Math.round(done/total*100):0
}
function dayOfWeekCompliance(log,habits){
  const counts=Array(7).fill(0),totals=Array(7).fill(0);const d=new Date(TODAY)
  for(let i=0;i<60;i++){
    const ds=d.toISOString().split('T')[0],dow=isoDow(d)
    habits.filter(h=>h.active).forEach(h=>{
      const s=getStatus(log,h.id,ds)
      if(s!=='pending'){totals[dow]++;if(s==='done')counts[dow]++}
    })
    d.setDate(d.getDate()-1)
  }
  return counts.map((c,i)=>totals[i]?Math.round(c/totals[i]*100):0)
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
// Mobile-safe: no clipPath, min 44px touch targets, fluid sizes
const SS={
  input:{
    background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:'var(--r-sm)',
    padding:'10px 14px',color:'var(--text)',fontFamily:"'Share Tech Mono',monospace",
    fontSize:16, // ≥16px prevents iOS auto-zoom
    outline:'none',width:'100%',
    WebkitAppearance:'none',
  },
  btnNeon:{
    background:'var(--neon-dim)',border:'1px solid var(--neon)',color:'var(--neon)',
    padding:'11px 16px',borderRadius:'var(--r-sm)',cursor:'pointer',
    fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:2,fontWeight:700,
    whiteSpace:'nowrap',minHeight:44,display:'flex',alignItems:'center',justifyContent:'center',
    WebkitAppearance:'none',
  },
  btnGhost:{
    background:'none',border:'1px solid var(--border2)',color:'var(--text2)',
    padding:'11px 16px',borderRadius:'var(--r-sm)',cursor:'pointer',
    fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:1,
    whiteSpace:'nowrap',minHeight:44,display:'flex',alignItems:'center',justifyContent:'center',
    WebkitAppearance:'none',
  },
  statCard:{
    padding:12,background:'var(--surface)',border:'1px solid var(--border)',
    borderRadius:'var(--r-sm)',
    // No clipPath on mobile — replaced with border-left accent
  },
  statVal:{
    fontFamily:"'Orbitron',monospace",fontSize:22,fontWeight:900,
    color:'var(--neon)',textShadow:'var(--neon-glow)',lineHeight:1,
  },
  statLbl:{
    fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'var(--text3)',
    marginTop:4,letterSpacing:0.5,
  },
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
let _tt=null
function useToast(){
  const [msg,setMsg]=useState(''),[ vis,setVis]=useState(false)
  const show=useCallback(m=>{setMsg(m);setVis(true);clearTimeout(_tt);_tt=setTimeout(()=>setVis(false),2200)},[])
  return{msg,vis,show}
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function SL({children,style={}}){
  return<div style={{fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:3,color:'var(--text3)',marginBottom:12,textTransform:'uppercase',display:'flex',alignItems:'center',gap:10,...style}}>
    {children}<span style={{flex:1,height:1,background:'var(--border)'}}/>
  </div>
}

function WeekMini({log,hid}){
  return<div style={{display:'flex',gap:2}}>{Array.from({length:7},(_,i)=>{
    const d=new Date(TODAY);d.setDate(d.getDate()-(6-i))
    const ds=d.toISOString().split('T')[0],s=getStatus(log,hid,ds)
    return<div key={i} style={{width:9,height:9,borderRadius:2,flexShrink:0,background:STATUS_COLORS[s]||'var(--surface3)',boxShadow:s==='done'?'0 0 3px var(--neon)':'none',outline:ds===TODAY_STR?'1.5px solid var(--text)':'none'}}/>
  })}</div>
}

function ModalWrap({children,onClose}){
  return<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center',backdropFilter:'blur(4px)'}}
    onClick={e=>{if(e.target===e.currentTarget&&onClose)onClose()}}>
    {/* Bottom sheet on mobile — feels native on iOS */}
    <div style={{background:'var(--bg2)',border:'1px solid var(--neon)',borderRadius:'12px 12px 0 0',padding:'20px 20px 32px',width:'100%',maxWidth:480,boxShadow:'var(--neon-glow),0 0 60px rgba(57,255,20,0.08)',animation:'modalIn .25s ease',maxHeight:'90vh',overflowY:'auto'}}>
      {/* Drag handle */}
      <div style={{width:36,height:4,borderRadius:2,background:'var(--border2)',margin:'0 auto 20px'}}/>
      {children}
    </div>
  </div>
}
function MTitle({c}){return<div style={{fontFamily:"'Orbitron',monospace",fontSize:13,fontWeight:900,letterSpacing:2,color:'var(--neon)',textShadow:'var(--neon-glow)',marginBottom:6}}>{c}</div>}
function MSub({c}){return<div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:'var(--text2)',marginBottom:20,lineHeight:1.6}}>{c}</div>}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const isMobile = useIsMobile()
  const [S,setS]=useState(()=>{
    const l=loadState()||initState()
    if(!l.tasksHistory) l.tasksHistory={}
    return seedDemo(l)
  })
  const [tab,setTab]=useState('maestros')
  const [modal,setModal]=useState(null)
  const {msg:tMsg,vis:tVis,show:showToast}=useToast()

  useEffect(()=>{saveState(S)},[S])
  useEffect(()=>{
    if(NOW_H>=6&&NOW_H<13&&S.intentionDate!==TODAY_STR) setTimeout(()=>setModal('intention'),800)
    else if(NOW_H>=20&&S.nightReviewDate!==TODAY_STR){
      const p=S.habits.filter(h=>h.active&&getStatus(S.log,h.id,TODAY_STR)==='pending')
      if(p.length>0) setTimeout(()=>setModal('night'),1200)
    }
  },[])

  function setLog(hid,ds,st){setS(p=>({...p,log:{...p.log,[ds]:{...(p.log[ds]||{}),[hid]:st}}}))}
  function toggleHabit(hid){
    if(S.travelMode&&getStatus(S.log,hid,TODAY_STR)==='skip') return
    const next=nextStatus(getStatus(S.log,hid,TODAY_STR))
    setLog(hid,TODAY_STR,next)
    showToast({done:'// LOGRADO ✓',fail:'// FALLIDO',rest:'// DESCANSO ◎',skip:'// SKIP ↷',pending:'// PENDIENTE'}[next])
  }
  function activateTravel(reason){
    setS(p=>{
      const log={...p.log,[TODAY_STR]:{...(p.log[TODAY_STR]||{})}}
      p.habits.filter(h=>h.active).forEach(h=>{if((log[TODAY_STR][h.id]||'pending')==='pending')log[TODAY_STR][h.id]='skip'})
      return{...p,log,travelMode:true,travelReason:reason||'Pausa total'}
    })
    showToast('// MODO VIAJE ACTIVADO');setModal(null)
  }
  function deactivateTravel(){
    setS(p=>{
      const log={...p.log,[TODAY_STR]:{...(p.log[TODAY_STR]||{})}}
      p.habits.filter(h=>h.active).forEach(h=>{if(log[TODAY_STR][h.id]==='skip')log[TODAY_STR][h.id]='pending'})
      return{...p,log,travelMode:false,travelReason:''}
    })
    showToast('// MODO VIAJE DESACTIVADO')
  }
  function handleImport(e){
    const file=e.target.files[0];if(!file)return
    const r=new FileReader()
    r.onload=ev=>{
      try{
        const raw=JSON.parse(ev.target.result)
        const isLegacy=Array.isArray(raw.habits)&&raw.habits[0]?.history!==undefined&&!raw.log
        if(isLegacy){
          const {habits,log,trophies,tasksHistory}=importLegacyBackup(raw)
          setS(p=>({...initState(),habits,log,trophies,tasksHistory,selectedHabit:habits.find(h=>h.active)?.id||habits[0]?.id||'h1'}))
          showToast(`// BACKUP IMPORTADO · ${habits.filter(h=>h.active).length} hábitos`)
        }else{
          setS(p=>({...p,habits:raw.habits||p.habits,log:raw.log||p.log,tasksHistory:raw.tasksHistory||p.tasksHistory||{}}))
          showToast('// DATOS IMPORTADOS')
        }
      }catch{showToast('// ERROR: JSON INVÁLIDO')}
    }
    r.readAsText(file);e.target.value=''
  }
  function saveEditedHabit(updated){
    setS(p=>({...p,habits:p.habits.map(h=>h.id===updated.id?updated:h)}))
    showToast('// HÁBITO ACTUALIZADO');setModal(null)
  }
  function deleteHabit(hid){
    setS(p=>{
      const habits=p.habits.filter(h=>h.id!==hid)
      const log={}
      Object.entries(p.log).forEach(([date,entry])=>{
        const {[hid]:_,...rest}=entry
        if(Object.keys(rest).length>0) log[date]=rest
      })
      return{...p,habits,log}
    })
    showToast('// HÁBITO ELIMINADO');setModal(null)
  }

  const activeHabits=useMemo(()=>S.habits.filter(h=>h.active),[S.habits])
  const todayDone=useMemo(()=>activeHabits.filter(h=>getStatus(S.log,h.id,TODAY_STR)==='done').length,[S.log,activeHabits])
  const todayTotal=activeHabits.length
  const todayPct=todayTotal?Math.round(todayDone/todayTotal*100):0
  const c30=useMemo(()=>compliance30(S.log,S.habits),[S.log,S.habits])
  const bestStreak=useMemo(()=>Math.max(0,...activeHabits.map(h=>currentStreak(S.log,h.id))),[S.log,activeHabits])
  const orbitStatus=c30>=80?'stable':c30>=40?'track':'alert'
  const orbitCfg={stable:{lbl:'ESTABLE',col:'var(--neon)'},track:{lbl:'TRAYECTORIA',col:'var(--warn)'},alert:{lbl:'¡IMPULSO!',col:'var(--danger)'}}
  const TABS=['maestros','tareas','orbita','trofeos','stats','config']

  const modalType = typeof modal==='string'?modal:modal?.type
  const modalPayload = modal?.payload

  return(
    <div style={{position:'relative',zIndex:1,maxWidth:640,margin:'0 auto',padding:`0 12px 80px`}}>

      {/* HEADER — compact on mobile */}
      <div style={{padding:'16px 0 14px',borderBottom:'1px solid var(--border2)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
        <div>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:isMobile?16:20,fontWeight:900,letterSpacing:2,color:'var(--neon)',textShadow:'var(--neon-glow)',lineHeight:1}}>
            HABIT<span style={{color:'var(--text)'}}>ORBIT</span>
          </div>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--text2)',marginTop:3,letterSpacing:0.5}}>
            {DAYS_ES[TODAY.getDay()].slice(0,3)} {TODAY.getDate()} {MONTHS_ES[TODAY.getMonth()]} · {String(NOW_H).padStart(2,'0')}:{String(TODAY.getMinutes()).padStart(2,'0')}
          </div>
        </div>
        {/* Orbit badge — compact on mobile */}
        <div style={{display:'flex',alignItems:'center',gap:5,padding:'6px 10px',borderRadius:4,border:`1px solid ${orbitCfg[orbitStatus].col}`,background:orbitCfg[orbitStatus].col+'18',fontFamily:"'Orbitron',monospace",fontSize:8,fontWeight:700,letterSpacing:1.5,color:orbitCfg[orbitStatus].col,boxShadow:orbitStatus==='stable'?'var(--neon-glow-sm)':'none',flexShrink:0}}>
          <span style={{width:5,height:5,borderRadius:'50%',background:'currentColor',animation:'npulse 1.5s infinite',flexShrink:0}}/>
          {orbitCfg[orbitStatus].lbl}
        </div>
      </div>

      {/* TRAVEL BANNER */}
      {S.travelMode&&<div style={{background:'var(--warn-dim)',border:'1px solid var(--warn)',borderRadius:'var(--r-sm)',padding:'9px 12px',margin:'10px 0',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--warn)'}}>
        <span>✈️ {S.travelReason||'Modo viaje'} · Rachas protegidas</span>
        <button style={{...SS.btnGhost,fontSize:8,padding:'5px 8px',minHeight:32,borderColor:'var(--warn)',color:'var(--warn)'}} onClick={deactivateTravel}>✕</button>
      </div>}

      {/* NAV — scrollable, 6 tabs */}
      <div style={{position:'sticky',top:0,zIndex:10,background:'var(--bg)',paddingTop:2}}>
        <nav style={{display:'flex',borderBottom:'1px solid var(--border2)',overflowX:'auto',WebkitOverflowScrolling:'touch',scrollbarWidth:'none',msOverflowStyle:'none'}}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              background:'none',border:'none',
              padding:isMobile?'12px 10px':'14px 14px',
              color:tab===t?'var(--neon)':'var(--text3)',
              fontFamily:"'Orbitron',monospace",
              fontSize:isMobile?7:8,
              fontWeight:700,letterSpacing:isMobile?1.5:2,
              cursor:'pointer',whiteSpace:'nowrap',position:'relative',
              textShadow:tab===t?'var(--neon-glow-sm)':'none',
              minHeight:44, // iOS minimum touch target
              WebkitAppearance:'none',
            }}>
              {t.toUpperCase()}
              {tab===t&&<span style={{position:'absolute',bottom:0,left:0,right:0,height:2,background:'var(--neon)',boxShadow:'var(--neon-glow-sm)'}}/>}
            </button>
          ))}
        </nav>

        {/* PROGRESS BAR */}
        <div style={{padding:'10px 0 8px'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
            <span style={{fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:2,color:'var(--text2)'}}>PROGRESO HOY</span>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--neon)'}}>{todayDone}/{todayTotal}</span>
          </div>
          <div style={{background:'var(--surface3)',height:3,position:'relative',borderRadius:2}}>
            <div style={{height:'100%',background:'var(--neon)',boxShadow:'var(--neon-glow)',width:todayPct+'%',transition:'width .6s cubic-bezier(.4,0,.2,1)',borderRadius:2,position:'relative'}}>
              {todayPct>0&&<span style={{position:'absolute',right:-4,top:-3,width:9,height:9,background:'var(--neon)',borderRadius:'50%',boxShadow:'var(--neon-glow)'}}/>}
            </div>
          </div>
        </div>
      </div>

      {/* TAB CONTENT */}
      <div key={tab} style={{animation:'fadeUp .2s ease forwards'}}>
        {tab==='maestros'&&<TabMaestros S={S} setModal={setModal} showToast={showToast} toggleHabit={toggleHabit} bestStreak={bestStreak} c30={c30} todayPct={todayPct} isMobile={isMobile}/>}
        {tab==='tareas'  &&<TabTareas   S={S} setS={setS} showToast={showToast}/>}
        {tab==='orbita'  &&<TabOrbita   S={S} setS={setS} showToast={showToast} isMobile={isMobile}/>}
        {tab==='trofeos' &&<TabTrofeos  S={S} setS={setS} showToast={showToast} bestStreak={bestStreak}/>}
        {tab==='stats'   &&<TabStats    S={S} c30={c30} isMobile={isMobile}/>}
        {tab==='config'  &&<TabConfig   S={S} setS={setS} showToast={showToast} activateTravel={activateTravel} deactivateTravel={deactivateTravel} setModal={setModal} handleImport={handleImport}/>}
      </div>

      {/* MODALS */}
      {modalType==='intention' &&<ModalIntention energy={S.energyToday} onEnergy={e=>setS(p=>({...p,energyToday:e}))} onConfirm={()=>{setS(p=>({...p,intentionDate:TODAY_STR}));setModal(null);showToast('// ÓRBITA ACTIVADA')}} onTravel={()=>setModal('travel')}/>}
      {modalType==='night'     &&<ModalNight pending={S.habits.filter(h=>h.active&&getStatus(S.log,h.id,TODAY_STR)==='pending')} onSet={(hid,st)=>setS(p=>({...p,log:{...p.log,[TODAY_STR]:{...(p.log[TODAY_STR]||{}),[hid]:st}}}))} onClose={()=>{setS(p=>({...p,nightReviewDate:TODAY_STR}));setModal(null);showToast('// DÍA CERRADO')}}/>}
      {modalType==='travel'    &&<ModalTravel onConfirm={activateTravel} onClose={()=>setModal(null)}/>}
      {modalType==='addHabit'  &&<ModalEditHabit habit={null} onSave={h=>{setS(p=>({...p,habits:[...p.habits,{...h,id:'h'+Date.now(),active:true}]}));showToast('// HÁBITO AÑADIDO');setModal(null)}} onClose={()=>setModal(null)}/>}
      {modalType==='editHabit' &&<ModalEditHabit habit={modalPayload} onSave={saveEditedHabit} onDelete={deleteHabit} onClose={()=>setModal(null)}/>}

      {/* TOAST — above iOS home indicator */}
      <div style={{position:'fixed',bottom:'calc(24px + env(safe-area-inset-bottom, 0px))',left:'50%',transform:'translateX(-50%)',background:'var(--surface3)',border:'1px solid var(--neon)',color:'var(--neon)',padding:'10px 20px',borderRadius:4,fontFamily:"'Share Tech Mono',monospace",fontSize:12,zIndex:500,pointerEvents:'none',opacity:tVis?1:0,transition:'opacity .2s',boxShadow:'var(--neon-glow-sm)',whiteSpace:'nowrap'}}>
        {tMsg}
      </div>
    </div>
  )
}

// ─── TAB MAESTROS ─────────────────────────────────────────────────────────────
function TabMaestros({S,setModal,showToast,toggleHabit,bestStreak,c30,todayPct,isMobile}){
  const activeHabits=S.habits.filter(h=>h.active)
  const lowEnergy=S.energyToday==='low'
  const eColors={high:'var(--neon)',normal:'var(--cyan)',low:'var(--warn)'}
  const ec=eColors[S.energyToday]

  return(
    <div style={{paddingTop:8}}>
      {/* Quick action bar */}
      <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
        <div style={{padding:'6px 10px',borderRadius:3,border:`1px solid ${ec}`,color:ec,background:ec+'22',fontFamily:"'Orbitron',monospace",fontSize:7,letterSpacing:1.5}}>
          {{high:'⚡ ALTA',normal:'🎯 NORMAL',low:'🌫️ BAJA'}[S.energyToday]}
        </div>
        {!S.travelMode&&<button style={{...SS.btnGhost,fontSize:7,padding:'6px 10px',minHeight:32,letterSpacing:1}} onClick={()=>setModal('travel')}>✈️ VIAJE</button>}
        {NOW_H>=20&&<button style={{...SS.btnGhost,fontSize:7,padding:'6px 10px',minHeight:32,letterSpacing:1,borderColor:'var(--rest)',color:'var(--rest)'}} onClick={()=>setModal('night')}>🌙 REVISIÓN</button>}
      </div>

      {/* Habit list */}
      <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
        {activeHabits.map(h=>{
          const status=getStatus(S.log,h.id,TODAY_STR)
          const streak=currentStreak(S.log,h.id)
          const wp=h.type==='weekly'?weeklyProgress(S.log,h.id,h.freq):null
          const avoidD=h.type==='avoid'?avoidDaysSince(S.log,h.id):null
          const dim=lowEnergy&&h.type==='weekly'
          const rb=status==='done'?'var(--neon)':status==='fail'?'var(--danger)':status==='rest'?'var(--rest)':'var(--border)'
          const bg=status==='done'?'rgba(57,255,20,0.04)':status==='fail'?'var(--danger-dim)':status==='rest'?'var(--rest-dim)':'var(--surface)'
          const chkBg={done:'var(--neon)',fail:'var(--danger)',rest:'var(--rest)'}[status]||'transparent'
          const chkC=(status==='done'||status==='fail'||status==='rest')?'#050507':'transparent'
          const chkS={done:'✓',fail:'✕',rest:'◎',skip:'↷',pending:''}[status]||''
          const tbC=h.type==='weekly'?'var(--cyan)':h.type==='avoid'?'var(--warn)':'var(--text3)'
          const tbL=h.type==='weekly'?`${wp?.done}/${h.freq}s`:h.type==='avoid'?`${avoidD}d`:'D'

          return(
            <div key={h.id}
              onClick={()=>toggleHabit(h.id)}
              style={{display:'flex',alignItems:'center',gap:10,padding:'11px 12px',background:bg,border:`1px solid ${rb}`,borderLeft:`3px solid ${rb}`,borderRadius:'var(--r-sm)',cursor:'pointer',position:'relative',opacity:dim?.55:1,transition:'border-color .15s',minHeight:52,WebkitUserSelect:'none',userSelect:'none'}}>
              {/* Checkbox */}
              <div style={{width:24,height:24,border:`1.5px solid ${rb}`,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:12,fontWeight:700,background:chkBg,color:chkC,fontFamily:"'Share Tech Mono',monospace",boxShadow:status==='done'?'var(--neon-glow-sm)':'none'}}>
                {chkS}
              </div>
              <span style={{fontSize:18,flexShrink:0}}>{h.emoji}</span>
              <span style={{flex:1,fontSize:13,color:status==='done'?'#fff':status==='fail'?'var(--text2)':'var(--text)',textDecoration:status==='fail'?'line-through':'none',fontWeight:status==='done'?500:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {h.name}
              </span>
              {/* Right meta */}
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3,flexShrink:0}}>
                <div style={{display:'flex',alignItems:'center',gap:5}}>
                  <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,padding:'2px 5px',borderRadius:2,border:`1px solid ${tbC}`,color:tbC,background:tbC+'22'}}>{tbL}</span>
                  {streak>0&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:status==='done'?'var(--neon)':'var(--text3)'}}>{streak}d</span>}
                </div>
                <WeekMini log={S.log} hid={h.id}/>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add habit button */}
      <button style={{width:'100%',background:'none',border:'1px dashed var(--border2)',borderRadius:'var(--r-sm)',padding:12,color:'var(--text3)',fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:2,cursor:'pointer',textAlign:'center',minHeight:44}}
        onFocus={e=>{e.currentTarget.style.borderColor='var(--neon)';e.currentTarget.style.color='var(--neon)'}}
        onBlur={e=>{e.currentTarget.style.borderColor='var(--border2)';e.currentTarget.style.color='var(--text3)'}}
        onClick={()=>setModal('addHabit')}>+ AÑADIR HÁBITO</button>

      {/* Summary row */}
      <div style={{marginTop:14,padding:14,background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:'var(--r-sm)'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {[{val:todayPct+'%',lbl:'HOY',col:'var(--neon)'},{val:c30+'%',lbl:'30D',col:'var(--text)'},{val:bestStreak+'d',lbl:'RACHA',col:'var(--cyan)'}].map(({val,lbl,col})=>(
            <div key={lbl} style={{textAlign:'center'}}>
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:20,fontWeight:900,color:col,textShadow:col==='var(--neon)'?'var(--neon-glow)':'none',lineHeight:1}}>{val}</div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'var(--text3)',marginTop:3}}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── TAB TAREAS ───────────────────────────────────────────────────────────────
function TabTareas({S,setS,showToast}){
  const [viewDate,setViewDate]=useState(null)
  const todayEntry=S.tasksHistory[TODAY_STR]||{status:'pending',tasks:emptyTasks()}

  function mutateTodayTasks(tasks,status){
    setS(p=>({...p,tasksHistory:{...p.tasksHistory,[TODAY_STR]:{status:status!==undefined?status:(p.tasksHistory[TODAY_STR]?.status||'pending'),tasks}}}))
  }
  function updateTask(id,value){
    const tasks=todayEntry.tasks.map(t=>t.id===id?{...t,text:value}:t)
    mutateTodayTasks(tasks,undefined)
  }
  function toggleTask(id){
    const tasks=todayEntry.tasks.map(t=>t.id===id?{...t,completed:!t.completed}:t)
    const filled=tasks.filter(t=>t.text.trim()),allDone=filled.length>0&&filled.every(t=>t.completed)
    mutateTodayTasks(tasks,allDone?'checked':'pending')
  }
  function closeDay(outcome){
    setS(p=>({...p,tasksHistory:{...p.tasksHistory,[TODAY_STR]:{...(p.tasksHistory[TODAY_STR]||{status:'pending',tasks:emptyTasks()}),status:outcome}}}))
    showToast(outcome==='checked'?'// DÍA COMPLETADO ✓':'// DÍA REGISTRADO')
  }

  const histDates=Object.keys(S.tasksHistory||{}).filter(d=>d!==TODAY_STR).sort((a,b)=>b.localeCompare(a)).slice(0,20)
  const statusCol={checked:'var(--neon)',failed:'var(--danger)',pending:'var(--warn)'}
  const statusLbl={checked:'COMPLETO',failed:'FALLIDO',pending:'PENDIENTE'}

  return(
    <div style={{paddingTop:8}}>
      <SL>MAESTROS DEL DÍA · {DAYS_ES[TODAY.getDay()].toUpperCase()}</SL>

      <div style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:'var(--r)',padding:14,marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text2)'}}>{TODAY_STR}</span>
          <span style={{fontFamily:"'Orbitron',monospace",fontSize:7,letterSpacing:2,color:statusCol[todayEntry.status]||'var(--text3)',border:`1px solid ${statusCol[todayEntry.status]||'var(--border2)'}`,padding:'3px 7px',borderRadius:2}}>
            {statusLbl[todayEntry.status]||'PENDIENTE'}
          </span>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:12}}>
          {todayEntry.tasks.map((t,i)=>(
            <div key={t.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',background:'var(--surface2)',border:`1px solid ${t.completed&&t.text?'var(--neon)':'var(--border)'}`,borderRadius:'var(--r-sm)',minHeight:44}}>
              <span style={{fontFamily:"'Orbitron',monospace",fontSize:8,color:'var(--text3)',minWidth:12,flexShrink:0}}>{i+1}</span>
              <div onClick={()=>t.text&&toggleTask(t.id)} style={{width:20,height:20,border:`1.5px solid ${t.completed&&t.text?'var(--neon)':'var(--border2)'}`,borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',cursor:t.text?'pointer':'default',background:t.completed&&t.text?'var(--neon)':'transparent',flexShrink:0,fontSize:11,color:'#050507',fontWeight:700,minWidth:20,boxShadow:t.completed&&t.text?'var(--neon-glow-sm)':'none'}}>
                {t.completed&&t.text&&'✓'}
              </div>
              <input
                value={t.text}
                onChange={e=>updateTask(t.id,e.target.value)}
                placeholder={`Objetivo ${i+1}...`}
                style={{...SS.input,background:'transparent',border:'none',padding:0,color:t.completed?'var(--text3)':'var(--text)',textDecoration:t.completed&&t.text?'line-through':'none'}}
              />
            </div>
          ))}
        </div>

        <div style={{display:'flex',gap:8}}>
          <button style={{...SS.btnNeon,flex:1}} onClick={()=>closeDay('checked')}>✓ CERRAR DÍA</button>
          <button style={{...SS.btnGhost,borderColor:'var(--danger)',color:'var(--danger)',padding:'11px 12px'}} onClick={()=>closeDay('failed')}>✕</button>
        </div>
      </div>

      {histDates.length>0&&<>
        <SL>HISTORIAL</SL>
        <div style={{display:'flex',flexDirection:'column',gap:5}}>
          {histDates.map(date=>{
            const entry=S.tasksHistory[date]
            const filled=entry.tasks.filter(t=>t.text.trim()),done=filled.filter(t=>t.completed).length
            const col=statusCol[entry.status]||'var(--text3)',open=viewDate===date
            return(
              <div key={date} onClick={()=>setViewDate(open?null:date)}
                style={{padding:'10px 12px',background:'var(--surface)',border:`1px solid ${open?'var(--neon)':'var(--border)'}`,borderRadius:'var(--r-sm)',cursor:'pointer',minHeight:44,transition:'border-color .15s'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:'var(--text2)'}}>{date}</span>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--text3)'}}>{done}/{filled.length}</span>
                    <span style={{fontFamily:"'Orbitron',monospace",fontSize:7,letterSpacing:1,color:col,border:`1px solid ${col}`,padding:'2px 5px',borderRadius:2}}>{statusLbl[entry.status]||'—'}</span>
                  </div>
                </div>
                {open&&<div style={{marginTop:8,display:'flex',flexDirection:'column',gap:3}}>
                  {filled.map(t=>(
                    <div key={t.id} style={{display:'flex',alignItems:'center',gap:8,fontFamily:"'Share Tech Mono',monospace",fontSize:11}}>
                      <span style={{color:t.completed?'var(--neon)':'var(--danger)',fontSize:10,minWidth:12,flexShrink:0}}>{t.completed?'✓':'✕'}</span>
                      <span style={{color:t.completed?'var(--text2)':'var(--text)',textDecoration:t.completed?'line-through':'none'}}>{t.text}</span>
                    </div>
                  ))}
                </div>}
              </div>
            )
          })}
        </div>
      </>}
    </div>
  )
}

// ─── TAB ÓRBITA ───────────────────────────────────────────────────────────────
function TabOrbita({S,setS,showToast,isMobile}){
  const activeHabits=S.habits.filter(h=>h.active)
  const selId=activeHabits.find(h=>h.id===S.selectedHabit)?S.selectedHabit:activeHabits[0]?.id
  const sel=activeHabits.find(h=>h.id===selId)

  function toggleCell(hid,ds){setS(p=>({...p,log:{...p.log,[ds]:{...(p.log[ds]||{}),[hid]:nextStatus(getStatus(p.log,hid,ds))}}}))}
  function exportJSON(){
    const b=new Blob([JSON.stringify({habits:S.habits,log:S.log,tasksHistory:S.tasksHistory||{}},null,2)],{type:'application/json'})
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='habitOrbit-backup.json';a.click()
    showToast('// DATOS EXPORTADOS')
  }

  if(!sel) return<div style={{color:'var(--text3)',textAlign:'center',padding:40,fontFamily:"'Share Tech Mono',monospace"}}>Sin hábitos activos</div>

  // cell size: smaller on mobile to fit screen without horizontal scroll
  const CELL = isMobile ? 10 : 13
  const GAP  = isMobile ? 2  : 3

  const start=new Date(TODAY);start.setDate(start.getDate()-364)
  const days=Array.from({length:365},(_,i)=>{
    const d=new Date(start);d.setDate(start.getDate()+i)
    const ds=d.toISOString().split('T')[0]
    return{date:ds,status:getStatus(S.log,sel.id,ds),dow:isoDow(d),month:d.getMonth(),isToday:ds===TODAY_STR}
  })
  let pRun=0
  const processed=days.map(d=>{
    if(d.status==='pending'){pRun++;if(pRun>=5)return{...d,status:'inactive'}}else pRun=0
    return d
  })

  const firstPad=isoDow(start)
  const cols=[];let col=[]
  for(let i=0;i<firstPad;i++) col.push(null)
  processed.forEach(d=>{col.push(d);if(col.length===7){cols.push(col);col=[]}})
  if(col.length) cols.push(col)

  let lastM=-1
  const monthLabels=cols.map(c=>{
    const fr=c.find(x=>x)
    if(fr&&fr.month!==lastM){lastM=fr.month;return MONTHS_ES[fr.month]}
    return ''
  })

  const doneCount=processed.filter(d=>d.status==='done').length
  const streak=currentStreak(S.log,sel.id)
  const mStr=maxStreak(S.log,sel.id)

  return(
    <div style={{paddingTop:8}}>
      <SL>HÁBITO</SL>
      {/* Habit pills — wrapping */}
      <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:12}}>
        {activeHabits.map(h=>(
          <button key={h.id} onClick={()=>setS(p=>({...p,selectedHabit:h.id}))} style={{padding:'6px 10px',borderRadius:3,cursor:'pointer',fontSize:11,fontFamily:"'Share Tech Mono',monospace",border:`1px solid ${h.id===selId?'var(--neon)':'var(--border2)'}`,color:h.id===selId?'var(--neon)':'var(--text3)',background:h.id===selId?'var(--neon-dim)':'none',minHeight:36}}>
            {h.emoji} {h.name}
          </button>
        ))}
      </div>

      {/* Legend — compact */}
      <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:8}}>
        {[{col:'var(--neon)',lbl:'OK'},{col:'var(--rest)',lbl:'Des.'},{col:'var(--danger)',lbl:'Fail'},{col:'var(--warn)',lbl:'Skip'},{col:'var(--surface2)',lbl:'—',border:'1px solid var(--border)'}].map(({col,lbl,border})=>(
          <div key={lbl} style={{display:'flex',alignItems:'center',gap:4,fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--text3)'}}>
            <div style={{width:9,height:9,borderRadius:2,background:col,border:border||'none'}}/>
            {lbl}
          </div>
        ))}
      </div>

      {/* Grid — no DOW column on mobile to save space */}
      <div style={{overflowX:'auto',paddingBottom:6,marginBottom:14,WebkitOverflowScrolling:'touch'}}>
        {/* Month labels */}
        <div style={{display:'flex',gap:GAP,marginBottom:4,paddingLeft:isMobile?0:22}}>
          {monthLabels.map((lbl,ci)=>(
            <span key={ci} style={{width:CELL,flexShrink:0,fontFamily:"'Share Tech Mono',monospace",fontSize:7,color:lbl?'var(--text2)':'transparent',lineHeight:'10px'}}>
              {lbl||'.'}
            </span>
          ))}
        </div>

        <div style={{display:'flex',gap:GAP}}>
          {/* DOW labels — only on desktop */}
          {!isMobile&&(
            <div style={{display:'flex',flexDirection:'column',gap:GAP,marginRight:4,paddingTop:0}}>
              {DOW_LABELS.map(l=>(
                <span key={l} style={{height:CELL,display:'flex',alignItems:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:7,color:'var(--text3)',minWidth:14}}>{l}</span>
              ))}
            </div>
          )}
          {/* Week columns */}
          {cols.map((c,ci)=>(
            <div key={ci} style={{display:'flex',flexDirection:'column',gap:GAP}}>
              {c.map((d,di)=>{
                if(!d) return<div key={di} style={{width:CELL,height:CELL}}/>
                const bg=STATUS_COLORS[d.status]||'var(--surface3)'
                return<div key={di}
                  onClick={()=>toggleCell(sel.id,d.date)}
                  title={`${d.date} · ${d.status}`}
                  style={{width:CELL,height:CELL,borderRadius:2,cursor:'pointer',background:bg,boxShadow:d.status==='done'?`0 0 3px var(--neon)`:'none',border:d.status==='pending'?'1px solid var(--border)':'none',outline:d.isToday?'1.5px solid var(--text)':'none',flexShrink:0}}
                />
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Stats — 3 cols */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
        {[{val:doneCount,lbl:'LOGRADOS'},{val:streak+'d',lbl:'RACHA'},{val:mStr+'d',lbl:'MÁXIMA'}].map(({val,lbl})=>(
          <div key={lbl} style={{...SS.statCard,borderLeft:'2px solid var(--neon)'}}>
            <div style={{...SS.statVal,fontSize:isMobile?20:24}}>{val}</div>
            <div style={SS.statLbl}>{lbl}</div>
          </div>
        ))}
      </div>

      <button style={{...SS.btnGhost,width:'100%',justifyContent:'center'}} onClick={exportJSON}>EXPORTAR JSON</button>
    </div>
  )
}

// ─── TAB TROFEOS ──────────────────────────────────────────────────────────────
function TabTrofeos({S,setS,showToast,bestStreak}){
  const [form,setForm]=useState({emoji:'🏆',name:'',req:'',reward:''})
  function addTrophy(){
    if(!form.name.trim()){showToast('// ESCRIBE UN NOMBRE');return}
    setS(p=>({...p,trophies:[...(p.trophies||[]),{id:'t'+Date.now(),name:form.name.toUpperCase(),emoji:form.emoji,req:parseInt(form.req)||30,reward:form.reward||'Sin definir',desc:`${form.req||30} días`}]}))
    showToast('// HITO CREADO');setForm({emoji:'🏆',name:'',req:'',reward:''})
  }
  const trophies=S.trophies||DEFAULT_TROPHIES
  return(
    <div style={{paddingTop:8}}>
      <SL>HITOS</SL>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,marginBottom:16}}>
        {trophies.map(t=>{
          const unlocked=bestStreak>=t.req,pct=Math.min(100,Math.round(bestStreak/t.req*100))
          return(
            <div key={t.id} style={{padding:12,borderRadius:'var(--r-sm)',border:`1px solid ${unlocked?'var(--warn)':'var(--border)'}`,background:unlocked?'var(--warn-dim)':'var(--surface)',boxShadow:unlocked?'0 0 8px #ffb80022':'none'}}>
              <div style={{fontSize:20,marginBottom:6}}>{t.emoji}</div>
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,fontWeight:700,letterSpacing:1,color:'var(--text)',marginBottom:3}}>{t.name}</div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--text3)',lineHeight:1.4,marginBottom:7}}>{t.desc}</div>
              {unlocked
                ?<div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--warn)'}}>✓ {t.reward}</div>
                :<><div style={{background:'var(--surface3)',height:2,marginBottom:4}}><div style={{width:pct+'%',height:'100%',background:'var(--neon)',boxShadow:'0 0 3px var(--neon)'}}/></div><div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--neon)'}}>{bestStreak}/{t.req}d</div></>}
            </div>
          )
        })}
      </div>

      <SL>CREAR HITO</SL>
      <div style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:'var(--r)',padding:14}}>
        <div style={{display:'flex',gap:8,marginBottom:8}}>
          <input style={{...SS.input,width:52,flex:'none',textAlign:'center',fontSize:18}} value={form.emoji} maxLength={2} onChange={e=>setForm(p=>({...p,emoji:e.target.value}))}/>
          <input style={SS.input} placeholder="Nombre del hito..." value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
        </div>
        <div style={{display:'flex',gap:8}}>
          <input style={{...SS.input,width:100,flex:'none'}} type="number" placeholder="Días" value={form.req} onChange={e=>setForm(p=>({...p,req:e.target.value}))}/>
          <input style={SS.input} placeholder="Recompensa..." value={form.reward} onChange={e=>setForm(p=>({...p,reward:e.target.value}))}/>
        </div>
        <button style={{...SS.btnNeon,width:'100%',marginTop:8,justifyContent:'center'}} onClick={addTrophy}>CREAR HITO</button>
      </div>
    </div>
  )
}

// ─── TAB STATS ────────────────────────────────────────────────────────────────
function TabStats({S,c30,isMobile}){
  const activeHabits=S.habits.filter(h=>h.active)
  const totalDone=Object.values(S.log).reduce((a,d)=>a+Object.values(d).filter(v=>v==='done').length,0)
  const bestCur=Math.max(0,...activeHabits.map(h=>currentStreak(S.log,h.id)))
  const bestMax=Math.max(0,...activeHabits.map(h=>maxStreak(S.log,h.id)))
  const dowPct=useMemo(()=>dayOfWeekCompliance(S.log,S.habits),[S.log,S.habits])
  const taskHistory=Object.values(S.tasksHistory||{})
  const taskChecked=taskHistory.filter(d=>d.status==='checked').length

  return(
    <div style={{paddingTop:8}}>
      <SL>GLOBAL</SL>
      {/* 2-col on mobile, 3-col on desktop */}
      <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(3,1fr)',gap:8,marginBottom:16}}>
        {[
          {val:c30+'%',lbl:'CUMPL. 30D'},
          {val:totalDone,lbl:'LOGRADOS'},
          {val:bestCur+'d',lbl:'RACHA ACT.'},
          {val:bestMax+'d',lbl:'RACHA MÁX.'},
          {val:activeHabits.length,lbl:'HÁBITOS'},
          {val:taskHistory.length>0?Math.round(taskChecked/taskHistory.length*100)+'%':'—',lbl:'DÍAS OK'},
        ].map(({val,lbl})=>(
          <div key={lbl} style={{...SS.statCard,borderLeft:'2px solid var(--neon)'}}>
            <div style={{...SS.statVal,fontSize:isMobile?20:24}}>{val}</div>
            <div style={SS.statLbl}>{lbl}</div>
          </div>
        ))}
      </div>

      <SL>PATRÓN SEMANAL</SL>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:isMobile?3:4,marginBottom:16}}>
        {DOW_LABELS.map((l,i)=>{
          const p=dowPct[i],col=p>=70?'var(--neon)':p>=40?'var(--cyan)':'var(--danger)'
          return(
            <div key={l} style={{padding:isMobile?'8px 2px':'10px 4px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',textAlign:'center'}}>
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:7,letterSpacing:0.5,color:'var(--text3)',marginBottom:5}}>{l}</div>
              <div style={{height:32,display:'flex',alignItems:'flex-end'}}>
                <div style={{width:'100%',height:Math.max(3,p*0.32),background:col,boxShadow:p>=70?`0 0 5px ${col}`:'none',borderRadius:'2px 2px 0 0'}}/>
              </div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:col,marginTop:3}}>{p}%</div>
            </div>
          )
        })}
      </div>

      <SL>POR HÁBITO</SL>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',overflow:'hidden'}}>
        {activeHabits.map((h,i)=>{
          const streak=currentStreak(S.log,h.id),mStr=maxStreak(S.log,h.id),c=habitCompliance30(S.log,h.id)
          return(
            <div key={h.id} style={{padding:'10px 12px',borderBottom:i<activeHabits.length-1?'1px solid var(--border)':'none'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <div style={{display:'flex',alignItems:'center',gap:7}}>
                  <span style={{fontSize:14}}>{h.emoji}</span>
                  <span style={{fontSize:12,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:120}}>{h.name}</span>
                </div>
                <div style={{display:'flex',gap:10,fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--text3)',flexShrink:0}}>
                  <span>{streak}d</span>
                  <span style={{color:'var(--neon)',fontWeight:600}}>{c}%</span>
                </div>
              </div>
              <div style={{background:'var(--surface3)',height:2,borderRadius:1}}>
                <div style={{width:c+'%',height:'100%',background:'var(--neon)',boxShadow:'0 0 3px var(--neon)',borderRadius:1}}/>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── TAB CONFIG ───────────────────────────────────────────────────────────────
function TabConfig({S,setS,showToast,activateTravel,deactivateTravel,setModal,handleImport}){
  function exportJSON(){
    const b=new Blob([JSON.stringify({habits:S.habits,log:S.log,tasksHistory:S.tasksHistory||{}},null,2)],{type:'application/json'})
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='habitOrbit-backup.json';a.click()
    showToast('// DATOS EXPORTADOS')
  }
  function resetAll(){
    if(!window.confirm('¿Resetear toda la app?')) return
    localStorage.removeItem('ho_v3');window.location.reload()
  }
  return(
    <div style={{paddingTop:8}}>
      <SL>HÁBITOS</SL>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',overflow:'hidden',marginBottom:16}}>
        {S.habits.map((h,i)=>{
          const tbC=h.type==='weekly'?'var(--cyan)':h.type==='avoid'?'var(--warn)':'var(--text3)'
          return(
            <div key={h.id} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 12px',borderBottom:i<S.habits.length-1?'1px solid var(--border)':'none',background:h.active?'transparent':'rgba(0,0,0,0.3)',minHeight:52}}>
              <span style={{fontSize:18,flexShrink:0}}>{h.emoji}</span>
              <span style={{flex:1,fontSize:13,color:h.active?'var(--text)':'var(--text3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</span>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,padding:'2px 5px',borderRadius:2,border:`1px solid ${tbC}`,color:tbC,flexShrink:0}}>
                {h.type==='weekly'?h.freq+'x':h.type==='avoid'?'EVT':'DIA'}
              </span>
              <button
                style={{...SS.btnGhost,fontSize:7,padding:'6px 10px',minHeight:36,borderColor:'var(--cyan)',color:'var(--cyan)',letterSpacing:1,flexShrink:0}}
                onClick={()=>setModal({type:'editHabit',payload:{...h}})}>
                EDITAR
              </button>
            </div>
          )
        })}
      </div>

      <SL>MODO VIAJE</SL>
      <div style={{padding:14,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',marginBottom:16}}>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text2)',marginBottom:10,lineHeight:1.7}}>
          Pausa total sin penalizar rachas. Todos los hábitos se marcan como "skip".
        </div>
        {S.travelMode
          ?<button style={{...SS.btnGhost,width:'100%',justifyContent:'center'}} onClick={deactivateTravel}>DESACTIVAR MODO VIAJE</button>
          :<button style={{...SS.btnNeon,width:'100%',justifyContent:'center'}} onClick={()=>setModal('travel')}>ACTIVAR MODO VIAJE</button>}
      </div>

      <SL>DATOS</SL>
      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:10}}>
        <button style={{...SS.btnGhost,justifyContent:'center'}} onClick={exportJSON}>EXPORTAR JSON</button>
        <label style={{...SS.btnGhost,cursor:'pointer',justifyContent:'center',textAlign:'center'}}>
          IMPORTAR BACKUP
          <input type="file" accept=".json" style={{display:'none'}} onChange={handleImport}/>
        </label>
        <button style={{...SS.btnGhost,borderColor:'var(--danger)',color:'var(--danger)',justifyContent:'center'}} onClick={resetAll}>RESETEAR APP</button>
      </div>
      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--text3)',lineHeight:1.7}}>
        → Detecta automáticamente el formato antiguo y lo traduce sin perder datos.
      </div>
    </div>
  )
}

// ─── MODAL EDIT/ADD HABIT ─────────────────────────────────────────────────────
function ModalEditHabit({habit,onSave,onDelete,onClose}){
  const isNew=!habit
  const [form,setForm]=useState(habit||{name:'',emoji:'⚡',type:'daily',freq:3,active:true})
  const [confirmDel,setConfirmDel]=useState(false)
  const tDesc={daily:'→ Se espera cada día. Fallo rompe racha.',weekly:'→ Flexible en cuándo, fijo en cuánto.',avoid:'→ Cuenta días sin que ocurra lo indeseable.'}
  const tCol={daily:'var(--neon)',weekly:'var(--cyan)',avoid:'var(--warn)'}
  function confirm(){if(!form.name.trim())return;onSave({...form})}
  return(
    <ModalWrap onClose={onClose}>
      <MTitle c={isNew?'// NUEVO HÁBITO':'// EDITAR HÁBITO'}/>
      <MSub c={isNew?'Elige el tipo de seguimiento':'Modifica nombre, emoji, tipo o frecuencia'}/>
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <input style={{...SS.input,width:52,flex:'none',textAlign:'center',fontSize:18}} value={form.emoji} maxLength={2} onChange={e=>setForm(p=>({...p,emoji:e.target.value}))}/>
        <input style={SS.input} placeholder="Nombre del hábito..." value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&confirm()} autoFocus/>
      </div>
      <SL style={{marginBottom:8}}>TIPO</SL>
      <div style={{display:'flex',gap:6,marginBottom:10}}>
        {['daily','weekly','avoid'].map(t=>(
          <button key={t} onClick={()=>setForm(p=>({...p,type:t}))} style={{flex:1,padding:'10px 4px',borderRadius:3,cursor:'pointer',background:form.type===t?tCol[t]+'22':'none',border:`1px solid ${form.type===t?tCol[t]:'var(--border2)'}`,color:form.type===t?tCol[t]:'var(--text3)',fontFamily:"'Orbitron',monospace",fontSize:7,letterSpacing:1.5,minHeight:40}}>
            {t==='daily'?'DIARIO':t==='weekly'?'X/SEM':'EVITAR'}
          </button>
        ))}
      </div>
      {form.type==='weekly'&&(
        <div style={{marginBottom:10}}>
          <SL style={{marginBottom:8}}>VECES POR SEMANA</SL>
          <div style={{display:'flex',gap:4}}>
            {[1,2,3,4,5,6,7].map(n=>(
              <button key={n} onClick={()=>setForm(p=>({...p,freq:n}))} style={{flex:1,padding:8,background:form.freq===n?'var(--neon-dim)':'var(--surface)',border:`1px solid ${form.freq===n?'var(--neon)':'var(--border)'}`,color:form.freq===n?'var(--neon)':'var(--text3)',borderRadius:'var(--r-sm)',cursor:'pointer',fontFamily:"'Orbitron',monospace",fontSize:10,minHeight:40}}>
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
      {!isNew&&(
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',background:'var(--surface)',borderRadius:'var(--r-sm)',marginBottom:10,border:'1px solid var(--border)'}}>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:'var(--text2)'}}>Estado</span>
          <button onClick={()=>setForm(p=>({...p,active:!p.active}))} style={{...SS.btnGhost,fontSize:8,padding:'6px 10px',minHeight:36,...(form.active?{borderColor:'var(--neon)',color:'var(--neon)'}:{})}}>
            {form.active?'ACTIVO':'ARCHIVADO'}
          </button>
        </div>
      )}
      <div style={{padding:'10px 12px',background:'var(--surface)',borderRadius:'var(--r-sm)',fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text2)',lineHeight:1.5,marginBottom:14}}>
        {tDesc[form.type]}
      </div>
      <div style={{display:'flex',gap:8}}>
        <button style={{...SS.btnNeon,flex:1,justifyContent:'center'}} onClick={confirm}>{isNew?'AÑADIR':'GUARDAR'}</button>
        <button style={{...SS.btnGhost,justifyContent:'center'}} onClick={onClose}>✕</button>
      </div>
      {!isNew&&onDelete&&(
        <div style={{marginTop:14,borderTop:'1px solid var(--border)',paddingTop:14}}>
          {!confirmDel
            ?<button style={{...SS.btnGhost,width:'100%',borderColor:'var(--danger)',color:'var(--danger)',justifyContent:'center'}} onClick={()=>setConfirmDel(true)}>
              ELIMINAR HÁBITO
            </button>
            :<div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--danger)',marginBottom:10,lineHeight:1.5}}>
                ⚠ Elimina el hábito y todo su historial. No se puede deshacer.
              </div>
              <div style={{display:'flex',gap:8}}>
                <button style={{...SS.btnGhost,flex:1,borderColor:'var(--danger)',color:'var(--danger)',justifyContent:'center'}} onClick={()=>onDelete(form.id)}>CONFIRMAR</button>
                <button style={{...SS.btnGhost,justifyContent:'center'}} onClick={()=>setConfirmDel(false)}>NO</button>
              </div>
            </div>}
        </div>
      )}
    </ModalWrap>
  )
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function ModalIntention({energy,onEnergy,onConfirm,onTravel}){
  const opts=[{key:'high',icon:'⚡',label:'ALTA'},{key:'normal',icon:'🎯',label:'NORMAL'},{key:'low',icon:'🌫️',label:'BAJA'},{key:'travel',icon:'✈️',label:'VIAJE'}]
  return<ModalWrap>
    <MTitle c="// INICIALIZACIÓN"/>
    <MSub c="Calibra tu energía antes de comenzar"/>
    <SL style={{marginBottom:10}}>NIVEL DE ENERGÍA HOY</SL>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
      {opts.map(({key,icon,label})=>(
        <div key={key} onClick={()=>key==='travel'?onTravel():onEnergy(key)} style={{padding:14,background:energy===key?'var(--neon-dim)':'var(--surface)',border:`1px solid ${energy===key?'var(--neon)':'var(--border2)'}`,borderRadius:'var(--r-sm)',cursor:'pointer',textAlign:'center',minHeight:80,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',boxShadow:energy===key?'var(--neon-glow-sm)':'none'}}>
          <div style={{fontSize:24,marginBottom:6}}>{icon}</div>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:2,color:energy===key?'var(--neon)':'var(--text2)'}}>{label}</div>
        </div>
      ))}
    </div>
    <button style={{...SS.btnNeon,width:'100%',justifyContent:'center'}} onClick={onConfirm}>ACTIVAR ÓRBITA</button>
  </ModalWrap>
}

function ModalNight({pending,onSet,onClose}){
  const [local,setLocal]=useState(pending.map(h=>h.id))
  if(local.length===0){onClose();return null}
  function set(hid,st){onSet(hid,st);setLocal(p=>p.filter(id=>id!==hid))}
  return<ModalWrap>
    <MTitle c="// REVISIÓN NOCTURNA"/>
    <MSub c="Registra los pendientes antes de cerrar el día"/>
    <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
      {pending.filter(h=>local.includes(h.id)).map(h=>(
        <div key={h.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',minHeight:52}}>
          <span style={{fontSize:18,flexShrink:0}}>{h.emoji}</span>
          <span style={{flex:1,fontSize:13,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</span>
          <button style={{...SS.btnNeon,padding:'7px 10px',fontSize:9,minHeight:38}} onClick={()=>set(h.id,'done')}>✓</button>
          <button style={{...SS.btnGhost,padding:'7px 10px',fontSize:9,minHeight:38}} onClick={()=>set(h.id,'rest')}>○</button>
          <button style={{...SS.btnGhost,padding:'7px 10px',fontSize:9,minHeight:38,borderColor:'var(--danger)',color:'var(--danger)'}} onClick={()=>set(h.id,'fail')}>✕</button>
        </div>
      ))}
    </div>
    <button style={{...SS.btnNeon,width:'100%',justifyContent:'center'}} onClick={onClose}>CERRAR DÍA</button>
  </ModalWrap>
}

function ModalTravel({onConfirm,onClose}){
  const [reason,setReason]=useState('')
  return<ModalWrap onClose={onClose}>
    <MTitle c="// MODO VIAJE"/>
    <MSub c="Pausa total · Rachas protegidas · Hábitos marcados como skip"/>
    <input style={{...SS.input,marginBottom:12}} placeholder="Motivo: conferencia, vacaciones..." value={reason} onChange={e=>setReason(e.target.value)}/>
    <div style={{display:'flex',gap:8}}>
      <button style={{...SS.btnNeon,flex:1,justifyContent:'center'}} onClick={()=>onConfirm(reason)}>ACTIVAR</button>
      <button style={{...SS.btnGhost,justifyContent:'center'}} onClick={onClose}>CANCELAR</button>
    </div>
  </ModalWrap>
}
