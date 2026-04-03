import { useState, useEffect, useMemo, useCallback } from 'react'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TODAY     = new Date()
const TODAY_STR = TODAY.toISOString().split('T')[0]
const NOW_H     = TODAY.getHours()
const DAYS_ES   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const DOW_LABELS= ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM']
const CYCLE     = ['pending','done','fail','rest','skip']
const nextStatus= cur => CYCLE[(CYCLE.indexOf(cur)+1)%CYCLE.length]
const STATUS_COLORS = {done:'var(--neon)',fail:'var(--danger)',rest:'var(--rest)',skip:'var(--warn)',pending:'var(--surface3)',inactive:'#0a0a0a'}

// Best-guess emoji for known habit names
const EMOJI_MAP = {'Pulaar':'🗣️','Darija':'🌙','Leer':'📖','Crear Apps':'💻','AI ARCHITECT':'🤖','Estudio Biblico':'📖','Master IA':'🧠','Suno':'🎵'}

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

// ─── LEGACY BACKUP IMPORTER ───────────────────────────────────────────────────
// Translates HabitOrbit classic format → ho_v3 schema
function importLegacyBackup(raw) {
  const habits = (raw.habits||[]).map(h=>({
    id:     h.id,
    name:   h.name,
    emoji:  EMOJI_MAP[h.name]||'⚡',
    type:   h.frequency===7?'daily':'weekly',
    freq:   h.frequency||5,
    active: !h.isArchived,
  }))
  const log = {}
  ;(raw.habits||[]).forEach(h=>{
    if(!h.history)return
    Object.entries(h.history).forEach(([date,val])=>{
      if(!log[date])log[date]={}
      log[date][h.id]=val==='completed'?'done':'fail'
    })
  })
  // Merge milestones into trophies
  const trophies=[...DEFAULT_TROPHIES]
  ;(raw.habits||[]).forEach(h=>{
    (h.milestones||[]).forEach(m=>{
      if(!trophies.find(t=>t.id===m.id))
        trophies.push({id:m.id,name:m.label.toUpperCase(),desc:`${m.dayIndex} logros en ${h.name}`,req:m.dayIndex,emoji:m.emoji||'🏆',reward:m.reward||''})
    })
  })
  // Daily tasks history
  const tasksHistory={}
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
  if(Object.keys(state.log).length>10)return state
  const log={...state.log},d=new Date(TODAY)
  for(let i=1;i<80;i++){
    d.setDate(d.getDate()-1);const ds=d.toISOString().split('T')[0]
    if(!log[ds])log[ds]={}
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
    if(st==='done'||st==='rest'||st==='skip')s++
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
    if(st==='done'||st==='rest'||st==='skip'){cur++;max=Math.max(max,cur)}else if(st==='fail')cur=0
    d.setDate(d.getDate()-1)
  }
  return max
}
function weeklyProgress(log,hid,freq){
  const mon=new Date(TODAY);mon.setDate(mon.getDate()-((mon.getDay()+6)%7))
  let done=0
  for(let i=0;i<7;i++){const d=new Date(mon);d.setDate(mon.getDate()+i);if(d>TODAY)break;if(getStatus(log,hid,d.toISOString().split('T')[0])==='done')done++}
  return{done,goal:freq}
}
function avoidDaysSince(log,hid){
  let days=0;const d=new Date(TODAY)
  for(let i=0;i<500;i++){const ds=d.toISOString().split('T')[0],st=getStatus(log,hid,ds);if(st==='fail')return days;if(st!=='pending')days++;d.setDate(d.getDate()-1)}
  return days
}
function compliance30(log,habits){
  let hits=0,total=0;const d=new Date(TODAY)
  for(let i=0;i<30;i++){const ds=d.toISOString().split('T')[0];habits.filter(h=>h.active).forEach(h=>{const s=getStatus(log,h.id,ds);if(s!=='pending'){total++;if(s==='done')hits++}});d.setDate(d.getDate()-1)}
  return total?Math.round(hits/total*100):0
}
function habitCompliance30(log,hid){
  let done=0,total=0;const d=new Date(TODAY)
  for(let i=0;i<30;i++){const ds=d.toISOString().split('T')[0],s=getStatus(log,hid,ds);if(s!=='pending'){total++;if(s==='done')done++};d.setDate(d.getDate()-1)}
  return total?Math.round(done/total*100):0
}
function dayOfWeekCompliance(log,habits){
  const counts=Array(7).fill(0),totals=Array(7).fill(0);const d=new Date(TODAY)
  for(let i=0;i<60;i++){const ds=d.toISOString().split('T')[0],dow=(d.getDay()+6)%7;habits.filter(h=>h.active).forEach(h=>{const s=getStatus(log,h.id,ds);if(s!=='pending'){totals[dow]++;if(s==='done')counts[dow]++}});d.setDate(d.getDate()-1)}
  return counts.map((c,i)=>totals[i]?Math.round(c/totals[i]*100):0)
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const SS={
  input:{background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:'var(--r-sm)',padding:'10px 14px',color:'var(--text)',fontFamily:"'Share Tech Mono',monospace",fontSize:13,outline:'none',width:'100%'},
  btnNeon:{background:'var(--neon-dim)',border:'1px solid var(--neon)',color:'var(--neon)',padding:'10px 18px',borderRadius:'var(--r-sm)',cursor:'pointer',fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:2,fontWeight:700,whiteSpace:'nowrap'},
  btnGhost:{background:'none',border:'1px solid var(--border2)',color:'var(--text2)',padding:'10px 18px',borderRadius:'var(--r-sm)',cursor:'pointer',fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:1,whiteSpace:'nowrap'},
  statCard:{padding:14,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',clipPath:'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)'},
  statVal:{fontFamily:"'Orbitron',monospace",fontSize:26,fontWeight:900,color:'var(--neon)',textShadow:'var(--neon-glow)',lineHeight:1},
  statLbl:{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--text3)',marginTop:5,letterSpacing:0.5},
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
let _tt=null
function useToast(){
  const [msg,setMsg]=useState(''),[ vis,setVis]=useState(false)
  const show=useCallback(m=>{setMsg(m);setVis(true);clearTimeout(_tt);_tt=setTimeout(()=>setVis(false),2200)},[])
  return{msg,vis,show}
}

// ─── SECTION LABEL ────────────────────────────────────────────────────────────
function SL({children,style={}}){
  return<div style={{fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:3,color:'var(--text3)',marginBottom:14,textTransform:'uppercase',display:'flex',alignItems:'center',gap:10,...style}}>{children}<span style={{flex:1,height:1,background:'var(--border)'}}/></div>
}

// ─── WEEK MINI ────────────────────────────────────────────────────────────────
function WeekMini({log,hid}){
  return<div style={{display:'flex',gap:3}}>{Array.from({length:7},(_,i)=>{const d=new Date(TODAY);d.setDate(d.getDate()-(6-i));const ds=d.toISOString().split('T')[0],s=getStatus(log,hid,ds),isToday=ds===TODAY_STR;return<div key={i} style={{width:10,height:10,borderRadius:2,flexShrink:0,background:STATUS_COLORS[s]||'var(--surface3)',boxShadow:s==='done'?'0 0 3px var(--neon)':'none',outline:isToday?'1.5px solid var(--text)':'none'}}/>})}</div>
}

// ─── MODAL WRAPPER ────────────────────────────────────────────────────────────
function ModalWrap({children,onClose}){
  return<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(4px)'}} onClick={e=>{if(e.target===e.currentTarget&&onClose)onClose()}}><div style={{background:'var(--bg2)',border:'1px solid var(--neon)',borderRadius:'var(--r)',padding:28,maxWidth:420,width:'100%',clipPath:'polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,0 100%)',boxShadow:'var(--neon-glow),0 0 60px rgba(57,255,20,0.08)',animation:'modalIn .25s ease'}}>{children}</div></div>
}
function MTitle({c}){return<div style={{fontFamily:"'Orbitron',monospace",fontSize:14,fontWeight:900,letterSpacing:2,color:'var(--neon)',textShadow:'var(--neon-glow)',marginBottom:6}}>{c}</div>}
function MSub({c}){return<div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text2)',marginBottom:20,lineHeight:1.6}}>{c}</div>}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const [S,setS]=useState(()=>{const l=loadState()||initState();if(!l.tasksHistory)l.tasksHistory={};return seedDemo(l)})
  const [tab,setTab]=useState('maestros')
  const [modal,setModal]=useState(null)
  const {msg:tMsg,vis:tVis,show:showToast}=useToast()

  useEffect(()=>{saveState(S)},[S])
  useEffect(()=>{
    if(NOW_H>=6&&NOW_H<13&&S.intentionDate!==TODAY_STR)setTimeout(()=>setModal('intention'),800)
    else if(NOW_H>=20&&S.nightReviewDate!==TODAY_STR){const p=S.habits.filter(h=>h.active&&getStatus(S.log,h.id,TODAY_STR)==='pending');if(p.length>0)setTimeout(()=>setModal('night'),1200)}
  },[])

  function setLog(hid,ds,st){setS(p=>({...p,log:{...p.log,[ds]:{...(p.log[ds]||{}),[hid]:st}}}))}
  function toggleHabit(hid){
    if(S.travelMode&&getStatus(S.log,hid,TODAY_STR)==='skip')return
    const next=nextStatus(getStatus(S.log,hid,TODAY_STR))
    setLog(hid,TODAY_STR,next)
    showToast({done:'// LOGRADO ✓',fail:'// FALLIDO',rest:'// DESCANSO ◎',skip:'// SKIP ↷',pending:'// PENDIENTE'}[next])
  }
  function activateTravel(reason){
    setS(p=>{const log={...p.log,[TODAY_STR]:{...(p.log[TODAY_STR]||{})}};p.habits.filter(h=>h.active).forEach(h=>{if((log[TODAY_STR][h.id]||'pending')==='pending')log[TODAY_STR][h.id]='skip'});return{...p,log,travelMode:true,travelReason:reason||'Pausa total'}})
    showToast('// MODO VIAJE ACTIVADO');setModal(null)
  }
  function deactivateTravel(){
    setS(p=>{const log={...p.log,[TODAY_STR]:{...(p.log[TODAY_STR]||{})}};p.habits.filter(h=>h.active).forEach(h=>{if(log[TODAY_STR][h.id]==='skip')log[TODAY_STR][h.id]='pending'});return{...p,log,travelMode:false,travelReason:''}})
    showToast('// MODO VIAJE DESACTIVADO')
  }

  function handleImport(e){
    const file=e.target.files[0];if(!file)return
    const r=new FileReader()
    r.onload=ev=>{
      try{
        const raw=JSON.parse(ev.target.result)
        const isLegacy=raw.habits?.[0]?.history!==undefined&&!raw.log
        if(isLegacy){
          const {habits,log,trophies,tasksHistory}=importLegacyBackup(raw)
          setS(p=>({...p,habits,log,trophies,tasksHistory,selectedHabit:habits[0]?.id||'h1'}))
          showToast(`// BACKUP IMPORTADO · ${habits.filter(h=>h.active).length} hábitos activos`)
        }else{
          setS(p=>({...p,habits:raw.habits||p.habits,log:raw.log||p.log,tasksHistory:raw.tasksHistory||p.tasksHistory||{}}))
          showToast('// DATOS IMPORTADOS')
        }
      }catch{showToast('// ERROR: JSON INVÁLIDO')}
    }
    r.readAsText(file);e.target.value=''
  }

  const activeHabits=useMemo(()=>S.habits.filter(h=>h.active),[S.habits])
  const todayDone=useMemo(()=>activeHabits.filter(h=>getStatus(S.log,h.id,TODAY_STR)==='done').length,[S.log,activeHabits])
  const todayTotal=activeHabits.length
  const todayPct=todayTotal?Math.round(todayDone/todayTotal*100):0
  const c30=useMemo(()=>compliance30(S.log,S.habits),[S.log,S.habits])
  const bestStreak=useMemo(()=>Math.max(0,...activeHabits.map(h=>currentStreak(S.log,h.id))),[S.log,activeHabits])
  const orbitStatus=c30>=80?'stable':c30>=40?'track':'alert'
  const orbitCfg={stable:{lbl:'ÓRBITA ESTABLE',col:'var(--neon)'},track:{lbl:'EN TRAYECTORIA',col:'var(--warn)'},alert:{lbl:'RETOMAR IMPULSO',col:'var(--danger)'}}
  const TABS=['maestros','tareas','orbita','trofeos','stats','config']

  return(
    <div style={{position:'relative',zIndex:1,maxWidth:740,margin:'0 auto',padding:'0 16px 60px'}}>

      {/* HEADER */}
      <div style={{padding:'28px 0 20px',borderBottom:'1px solid var(--border2)',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
        <div>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:22,fontWeight:900,letterSpacing:2,color:'var(--neon)',textShadow:'var(--neon-glow)',lineHeight:1}}>
            HABIT<span style={{color:'var(--text)'}}>ORBIT</span><span style={{fontSize:10,letterSpacing:1,color:'var(--text3)',fontWeight:400}}> 365</span>
          </div>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text2)',marginTop:4,letterSpacing:1}}>
            {DAYS_ES[TODAY.getDay()]} {TODAY.getDate()} {MONTHS_ES[TODAY.getMonth()]} {TODAY.getFullYear()}
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:3,border:`1px solid ${orbitCfg[orbitStatus].col}`,background:orbitCfg[orbitStatus].col+'18',fontFamily:"'Orbitron',monospace",fontSize:9,fontWeight:700,letterSpacing:2,color:orbitCfg[orbitStatus].col,boxShadow:orbitStatus==='stable'?'var(--neon-glow-sm)':'none',clipPath:'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)'}}>
          <span style={{width:5,height:5,borderRadius:'50%',background:'currentColor',animation:'npulse 1.5s infinite'}}/>
          {orbitCfg[orbitStatus].lbl}
        </div>
      </div>

      {/* TRAVEL BANNER */}
      {S.travelMode&&<div style={{background:'var(--warn-dim)',border:'1px solid var(--warn)',borderRadius:'var(--r-sm)',padding:'10px 16px',margin:'14px 0',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:'var(--warn)'}}>
        <span>✈️ MODO VIAJE · {S.travelReason} · Rachas protegidas</span>
        <button style={{...SS.btnGhost,fontSize:8,padding:'5px 10px'}} onClick={deactivateTravel}>DESACTIVAR</button>
      </div>}

      {/* NAV */}
      <nav style={{display:'flex',borderBottom:'1px solid var(--border2)',overflowX:'auto'}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{background:'none',border:'none',padding:'14px 12px',color:tab===t?'var(--neon)':'var(--text3)',fontFamily:"'Orbitron',monospace",fontSize:8,fontWeight:700,letterSpacing:2,cursor:'pointer',whiteSpace:'nowrap',position:'relative',textShadow:tab===t?'var(--neon-glow-sm)':'none'}}>
            {t.toUpperCase()}
            {tab===t&&<span style={{position:'absolute',bottom:0,left:0,right:0,height:2,background:'var(--neon)',boxShadow:'var(--neon-glow-sm)'}}/>}
          </button>
        ))}
      </nav>

      {/* PROGRESS */}
      <div style={{margin:'16px 0 20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
          <span style={{fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:2,color:'var(--text2)'}}>PROGRESO HOY</span>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:'var(--neon)'}}>{todayDone}/{todayTotal}</span>
        </div>
        <div style={{background:'var(--surface3)',height:4,position:'relative'}}>
          <div style={{height:'100%',background:'var(--neon)',boxShadow:'var(--neon-glow)',width:todayPct+'%',transition:'width .6s cubic-bezier(.4,0,.2,1)',position:'relative'}}>
            {todayPct>0&&<span style={{position:'absolute',right:-5,top:-3,width:10,height:10,background:'var(--neon)',borderRadius:'50%',boxShadow:'var(--neon-glow)'}}/>}
          </div>
        </div>
      </div>

      {/* TABS */}
      <div key={tab} style={{animation:'fadeUp .2s ease forwards'}}>
        {tab==='maestros'&&<TabMaestros S={S} setS={setS} setModal={setModal} showToast={showToast} toggleHabit={toggleHabit} bestStreak={bestStreak} c30={c30} todayPct={todayPct}/>}
        {tab==='tareas'  &&<TabTareas   S={S} setS={setS} showToast={showToast}/>}
        {tab==='orbita'  &&<TabOrbita   S={S} setS={setS} showToast={showToast}/>}
        {tab==='trofeos' &&<TabTrofeos  S={S} setS={setS} showToast={showToast} bestStreak={bestStreak}/>}
        {tab==='stats'   &&<TabStats    S={S} c30={c30}/>}
        {tab==='config'  &&<TabConfig   S={S} setS={setS} showToast={showToast} activateTravel={activateTravel} deactivateTravel={deactivateTravel} setModal={setModal} handleImport={handleImport}/>}
      </div>

      {/* MODALS */}
      {modal==='intention'&&<ModalIntention energy={S.energyToday} onEnergy={e=>setS(p=>({...p,energyToday:e}))} onConfirm={()=>{setS(p=>({...p,intentionDate:TODAY_STR}));setModal(null);showToast('// ÓRBITA ACTIVADA')}} onTravel={()=>setModal('travel')}/>}
      {modal==='night'    &&<ModalNight pending={S.habits.filter(h=>h.active&&getStatus(S.log,h.id,TODAY_STR)==='pending')} onSet={(hid,st)=>setS(p=>({...p,log:{...p.log,[TODAY_STR]:{...(p.log[TODAY_STR]||{}),[hid]:st}}}))} onClose={()=>{setS(p=>({...p,nightReviewDate:TODAY_STR}));setModal(null);showToast('// DÍA CERRADO · DESCANSA')}}/>}
      {modal==='travel'   &&<ModalTravel onConfirm={activateTravel} onClose={()=>setModal(null)}/>}
      {modal==='addHabit' &&<ModalAddHabit onAdd={h=>{setS(p=>({...p,habits:[...p.habits,h]}));showToast('// HÁBITO AÑADIDO');setModal(null)}} onClose={()=>setModal(null)}/>}

      {/* TOAST */}
      <div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'var(--surface3)',border:'1px solid var(--neon)',color:'var(--neon)',padding:'10px 22px',borderRadius:3,fontFamily:"'Share Tech Mono',monospace",fontSize:12,zIndex:500,pointerEvents:'none',opacity:tVis?1:0,transition:'opacity .2s',boxShadow:'var(--neon-glow-sm)',clipPath:'polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,0 100%)',whiteSpace:'nowrap'}}>{tMsg}</div>
    </div>
  )
}

// ─── TAB MAESTROS ─────────────────────────────────────────────────────────────
function TabMaestros({S,setS,setModal,showToast,toggleHabit,bestStreak,c30,todayPct}){
  const activeHabits=S.habits.filter(h=>h.active)
  const lowEnergy=S.energyToday==='low'
  const eColors={high:'var(--neon)',normal:'var(--cyan)',low:'var(--warn)'}
  const eLabels={high:'ENERGÍA ALTA',normal:'ENERGÍA NORMAL',low:'ENERGÍA BAJA'}
  const ec=eColors[S.energyToday]
  return(
    <div>
      <SL style={{marginTop:4}}>OBJETIVOS · {DAYS_ES[TODAY.getDay()].toUpperCase()}</SL>
      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{padding:'5px 12px',borderRadius:3,border:`1px solid ${ec}`,color:ec,background:ec+'22',fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:2}}>{eLabels[S.energyToday]}</div>
        {!S.travelMode&&<button style={{...SS.btnGhost,fontSize:8,padding:'5px 12px'}} onClick={()=>setModal('travel')}>✈️ MODO VIAJE</button>}
        {NOW_H>=20&&<button style={{...SS.btnGhost,fontSize:8,padding:'5px 12px',borderColor:'var(--rest)',color:'var(--rest)'}} onClick={()=>setModal('night')}>🌙 REVISIÓN</button>}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:20}}>
        {activeHabits.map(h=>{
          const status=getStatus(S.log,h.id,TODAY_STR),streak=currentStreak(S.log,h.id)
          const wp=h.type==='weekly'?weeklyProgress(S.log,h.id,h.freq):null
          const avoidD=h.type==='avoid'?avoidDaysSince(S.log,h.id):null
          const dim=lowEnergy&&h.type==='weekly'
          const rb=status==='done'?'var(--neon)':status==='fail'?'var(--danger)':status==='rest'?'var(--rest)':'var(--border)'
          const bg=status==='done'?'rgba(57,255,20,0.04)':status==='fail'?'var(--danger-dim)':status==='rest'?'var(--rest-dim)':'var(--surface)'
          const lb=status==='done'?'var(--neon)':status==='fail'?'var(--danger)':status==='rest'?'var(--rest)':'var(--border2)'
          const chkBg={done:'var(--neon)',fail:'var(--danger)',rest:'var(--rest)'}[status]||'transparent'
          const chkC=(status==='done'||status==='fail'||status==='rest')?'#050507':'transparent'
          const chkS={done:'✓',fail:'✕',rest:'◎',skip:'↷',pending:''}[status]||''
          const tbC=h.type==='weekly'?'var(--cyan)':h.type==='avoid'?'var(--warn)':'var(--text3)'
          const tbL=h.type==='weekly'?`${wp?.done}/${h.freq}sem`:h.type==='avoid'?`${avoidD}d`:'DIARIO'
          return(
            <div key={h.id} onClick={()=>toggleHabit(h.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'13px 14px',background:bg,border:`1px solid ${rb}`,borderRadius:'var(--r-sm)',cursor:'pointer',position:'relative',overflow:'hidden',opacity:dim?0.55:1,clipPath:'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%)',transition:'border-color .15s',boxShadow:status==='done'?'inset 0 0 20px rgba(57,255,20,0.03)':'none'}}>
              <span style={{position:'absolute',left:0,top:0,bottom:0,width:2,background:lb,boxShadow:status==='done'?'var(--neon-glow-sm)':'none'}}/>
              <div style={{width:22,height:22,border:`1.5px solid ${rb}`,borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:11,fontWeight:700,background:chkBg,color:chkC,fontFamily:"'Share Tech Mono',monospace",boxShadow:status==='done'?'var(--neon-glow-sm)':'none'}}>{chkS}</div>
              <span style={{fontSize:17,flexShrink:0}}>{h.emoji}</span>
              <span style={{flex:1,fontSize:13,color:status==='done'?'#ffffff':status==='fail'?'var(--text2)':'var(--text)',textDecoration:status==='fail'?'line-through':'none',textShadow:status==='done'?'0 0 8px rgba(255,255,255,0.4)':'none'}}>{h.name}</span>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,padding:'2px 6px',borderRadius:2,border:`1px solid ${tbC}`,color:tbC,background:tbC+'22'}}>{tbL}</span>
                  {streak>0&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:status==='done'?'var(--neon)':'var(--text3)',textShadow:status==='done'?'var(--neon-glow-sm)':'none'}}>{streak}d</span>}
                </div>
                <WeekMini log={S.log} hid={h.id}/>
              </div>
            </div>
          )
        })}
      </div>
      <button style={{width:'100%',background:'none',border:'1px dashed var(--border2)',borderRadius:'var(--r-sm)',padding:12,color:'var(--text3)',fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:2,cursor:'pointer',textAlign:'center'}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--neon)';e.currentTarget.style.color='var(--neon)'}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border2)';e.currentTarget.style.color='var(--text3)'}}
        onClick={()=>setModal('addHabit')}>+ AÑADIR HÁBITO</button>
      <div style={{marginTop:20,padding:16,background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:'var(--r-sm)'}}>
        <SL style={{marginBottom:12}}>RESUMEN</SL>
        <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
          {[{val:todayPct+'%',lbl:'HOY',col:'var(--neon)'},{val:c30+'%',lbl:'30 DÍAS',col:'var(--text)'},{val:bestStreak+'d',lbl:'RACHA',col:'var(--cyan)'}].map(({val,lbl,col})=>(
            <div key={lbl}><div style={{fontFamily:"'Orbitron',monospace",fontSize:24,fontWeight:900,color:col,textShadow:col==='var(--neon)'?'var(--neon-glow)':'none',lineHeight:1}}>{val}</div><div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--text3)',marginTop:2}}>{lbl}</div></div>
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
  function updateTask(id,field,value){
    const tasks=todayEntry.tasks.map(t=>t.id===id?{...t,[field]:value}:t)
    const filled=tasks.filter(t=>t.text.trim()),allDone=filled.length>0&&filled.every(t=>t.completed)
    mutateTodayTasks(tasks,allDone?'checked':todayEntry.status==='checked'?'pending':todayEntry.status)
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

  const histDates=Object.keys(S.tasksHistory||{}).filter(d=>d!==TODAY_STR).sort((a,b)=>b.localeCompare(a)).slice(0,30)
  const statusCol={checked:'var(--neon)',failed:'var(--danger)',pending:'var(--warn)',checked:'var(--neon)'}
  const statusLbl={checked:'COMPLETADO',failed:'FALLIDO',pending:'PENDIENTE'}

  return(
    <div>
      <SL style={{marginTop:4}}>MAESTROS DEL DÍA · {DAYS_ES[TODAY.getDay()].toUpperCase()}</SL>
      {/* TODAY */}
      <div style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:'var(--r)',padding:16,marginBottom:16,clipPath:'polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text2)'}}>{TODAY_STR}</span>
          <span style={{fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:2,color:statusCol[todayEntry.status]||'var(--text3)',border:`1px solid ${statusCol[todayEntry.status]||'var(--border2)'}`,padding:'3px 8px',borderRadius:2}}>
            {statusLbl[todayEntry.status]||'PENDIENTE'}
          </span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
          {todayEntry.tasks.map((t,i)=>(
            <div key={t.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'var(--surface2)',border:`1px solid ${t.completed&&t.text?'var(--neon)':'var(--border)'}`,borderRadius:'var(--r-sm)',transition:'border-color .15s'}}>
              <span style={{fontFamily:"'Orbitron',monospace",fontSize:8,color:'var(--text3)',minWidth:14}}>{i+1}</span>
              <div onClick={()=>t.text&&toggleTask(t.id)} style={{width:18,height:18,border:`1.5px solid ${t.completed&&t.text?'var(--neon)':'var(--border2)'}`,borderRadius:2,display:'flex',alignItems:'center',justifyContent:'center',cursor:t.text?'pointer':'default',background:t.completed&&t.text?'var(--neon)':'transparent',flexShrink:0,fontSize:10,color:'#050507',fontWeight:700,boxShadow:t.completed&&t.text?'var(--neon-glow-sm)':'none'}}>
                {t.completed&&t.text&&'✓'}
              </div>
              <input value={t.text} onChange={e=>updateTask(t.id,'text',e.target.value)} placeholder={`Objetivo ${i+1}...`}
                style={{...SS.input,background:'transparent',border:'none',padding:0,fontSize:13,color:t.completed?'var(--text3)':'var(--text)',textDecoration:t.completed&&t.text?'line-through':'none'}}/>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button style={{...SS.btnNeon,flex:1}} onClick={()=>closeDay('checked')}>✓ CERRAR DÍA</button>
          <button style={{...SS.btnGhost,borderColor:'var(--danger)',color:'var(--danger)'}} onClick={()=>closeDay('failed')}>✕ FALLIDO</button>
        </div>
      </div>

      {/* HISTORY */}
      {histDates.length>0&&<>
        <SL>HISTORIAL</SL>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {histDates.map(date=>{
            const entry=S.tasksHistory[date]
            const filled=entry.tasks.filter(t=>t.text.trim()),done=filled.filter(t=>t.completed).length
            const col=statusCol[entry.status]||'var(--text3)'
            const open=viewDate===date
            return(
              <div key={date} onClick={()=>setViewDate(open?null:date)}
                style={{padding:'10px 14px',background:'var(--surface)',border:`1px solid ${open?'var(--neon)':'var(--border)'}`,borderRadius:'var(--r-sm)',cursor:'pointer',clipPath:'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)',transition:'border-color .15s'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:'var(--text2)'}}>{date}</span>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text3)'}}>{done}/{filled.length}</span>
                    <span style={{fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:1,color:col,border:`1px solid ${col}`,padding:'2px 6px',borderRadius:2}}>{statusLbl[entry.status]||entry.status?.toUpperCase()||'—'}</span>
                  </div>
                </div>
                {open&&<div style={{marginTop:10,display:'flex',flexDirection:'column',gap:4,animation:'slideIn .15s ease'}}>
                  {filled.map(t=>(
                    <div key={t.id} style={{display:'flex',alignItems:'center',gap:8,fontFamily:"'Share Tech Mono',monospace",fontSize:12}}>
                      <span style={{color:t.completed?'var(--neon)':'var(--danger)',fontSize:10,minWidth:12}}>{t.completed?'✓':'✕'}</span>
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
function TabOrbita({S,setS,showToast}){
  const activeHabits=S.habits.filter(h=>h.active)
  const selId=activeHabits.find(h=>h.id===S.selectedHabit)?S.selectedHabit:activeHabits[0]?.id
  const sel=activeHabits.find(h=>h.id===selId)
  function toggleCell(hid,ds){setS(p=>({...p,log:{...p.log,[ds]:{...(p.log[ds]||{}),[hid]:nextStatus(getStatus(p.log,hid,ds))}}}))}
  function exportJSON(){const b=new Blob([JSON.stringify({habits:S.habits,log:S.log,tasksHistory:S.tasksHistory||{}},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='habitOrbit-backup.json';a.click();showToast('// DATOS EXPORTADOS')}
  if(!sel)return<div style={{color:'var(--text3)',textAlign:'center',padding:40,fontFamily:"'Share Tech Mono',monospace"}}>Sin hábitos activos</div>
  const start=new Date(TODAY);start.setDate(start.getDate()-364)
  const days=Array.from({length:365},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);const ds=d.toISOString().split('T')[0];return{date:ds,status:getStatus(S.log,sel.id,ds),dow:d.getDay(),month:d.getMonth(),isToday:ds===TODAY_STR}})
  let pRun=0;const processed=days.map(d=>{if(d.status==='pending'){pRun++;if(pRun>=5)return{...d,status:'inactive'}}else pRun=0;return d})
  const firstPad=processed[0].dow;const cols=[];let col=[];for(let i=0;i<firstPad;i++)col.push(null)
  processed.forEach(d=>{col.push(d);if(col.length===7){cols.push(col);col=[]}});if(col.length)cols.push(col)
  const doneCount=processed.filter(d=>d.status==='done').length,streak=currentStreak(S.log,sel.id),mStr=maxStreak(S.log,sel.id)
  return(
    <div>
      <SL style={{marginTop:4}}>SELECCIONAR HÁBITO</SL>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:16}}>
        {activeHabits.map(h=><button key={h.id} onClick={()=>setS(p=>({...p,selectedHabit:h.id}))} style={{padding:'5px 12px',borderRadius:3,cursor:'pointer',fontSize:11,fontFamily:"'Share Tech Mono',monospace",border:`1px solid ${h.id===selId?'var(--neon)':'var(--border2)'}`,color:h.id===selId?'var(--neon)':'var(--text3)',background:h.id===selId?'var(--neon-dim)':'none',boxShadow:h.id===selId?'var(--neon-glow-sm)':'none'}}>{h.emoji} {h.name}</button>)}
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:12,marginBottom:10}}>
        {[{col:'var(--neon)',lbl:'Logrado',glow:true},{col:'var(--rest)',lbl:'Descanso'},{col:'var(--danger)',lbl:'Fallido'},{col:'var(--warn)',lbl:'Skip'},{col:'var(--surface2)',lbl:'Pendiente',border:'1px solid var(--border)'}].map(({col,lbl,glow,border})=>(
          <div key={lbl} style={{display:'flex',alignItems:'center',gap:5,fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--text3)'}}><div style={{width:10,height:10,borderRadius:2,background:col,boxShadow:glow?'0 0 4px var(--neon)':'none',border:border||'none'}}/>{lbl}</div>
        ))}
      </div>
      <div style={{overflowX:'auto',paddingBottom:8,marginBottom:16}}>
        <div style={{display:'flex',gap:3,marginBottom:5}}>
          {(()=>{let lM=-1;return cols.map((c,ci)=>{const fr=c.find(x=>x);if(fr&&fr.month!==lM){lM=fr.month;return<span key={ci} style={{width:15,fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text3)'}}>{MONTHS_ES[fr.month]}</span>}return<span key={ci} style={{width:15,display:'inline-block'}}/>})})()}
        </div>
        <div style={{display:'flex',gap:3}}>
          {cols.map((c,ci)=>(
            <div key={ci} style={{display:'flex',flexDirection:'column',gap:3}}>
              {c.map((d,di)=>{
                if(!d)return<div key={di} style={{width:12,height:12}}/>
                const bg=STATUS_COLORS[d.status]||'var(--surface3)'
                return<div key={di} onClick={()=>toggleCell(sel.id,d.date)} title={`${d.date} · ${d.status}`}
                  style={{width:12,height:12,borderRadius:2,cursor:'pointer',background:bg,boxShadow:d.status==='done'?'0 0 4px var(--neon)':'none',border:d.status==='pending'?'1px solid var(--border)':'none',outline:d.isToday?'1.5px solid var(--text)':'none',transition:'transform .1s'}}
                  onMouseEnter={e=>e.currentTarget.style.transform='scale(1.4)'}
                  onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}/>
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
        {[{val:doneCount,lbl:'LOGRADOS 365D'},{val:streak+'d',lbl:'RACHA ACTUAL'},{val:mStr+'d',lbl:'RACHA MÁXIMA'}].map(({val,lbl})=><div key={lbl} style={SS.statCard}><div style={SS.statVal}>{val}</div><div style={SS.statLbl}>{lbl}</div></div>)}
      </div>
      <button style={SS.btnGhost} onClick={exportJSON}>EXPORTAR JSON</button>
    </div>
  )
}

// ─── TAB TROFEOS ──────────────────────────────────────────────────────────────
function TabTrofeos({S,setS,showToast,bestStreak}){
  const [form,setForm]=useState({emoji:'🏆',name:'',req:'',reward:''})
  function addTrophy(){if(!form.name.trim()){showToast('// ESCRIBE UN NOMBRE');return};setS(p=>({...p,trophies:[...(p.trophies||[]),{id:'t'+Date.now(),name:form.name.toUpperCase(),emoji:form.emoji,req:parseInt(form.req)||30,reward:form.reward||'Sin definir',desc:`${form.req||30} días consecutivos`}]}));showToast('// HITO CREADO');setForm({emoji:'🏆',name:'',req:'',reward:''})}
  const trophies=S.trophies||DEFAULT_TROPHIES
  return(
    <div>
      <SL style={{marginTop:4}}>HITOS AUTOMÁTICOS</SL>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10,marginBottom:20}}>
        {trophies.map(t=>{const unlocked=bestStreak>=t.req,pct=Math.min(100,Math.round(bestStreak/t.req*100));return(
          <div key={t.id} style={{padding:16,borderRadius:'var(--r-sm)',border:`1px solid ${unlocked?'var(--warn)':'var(--border)'}`,background:unlocked?'var(--warn-dim)':'var(--surface)',boxShadow:unlocked?'0 0 8px #ffb80022':'none',clipPath:'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%)'}}>
            <div style={{fontSize:22,marginBottom:8}}>{t.emoji}</div>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:10,fontWeight:700,letterSpacing:1,color:'var(--text)',marginBottom:4}}>{t.name}</div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--text3)',lineHeight:1.5,marginBottom:8}}>{t.desc}</div>
            {unlocked?<div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--warn)'}}>✓ {t.reward}</div>:<><div style={{background:'var(--surface3)',height:2,marginBottom:4}}><div style={{width:pct+'%',height:'100%',background:'var(--neon)',boxShadow:'0 0 4px var(--neon)'}}/></div><div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--neon)'}}>{bestStreak}/{t.req}d · {pct}%</div></>}
          </div>
        )})}
      </div>
      <SL>CREAR HITO</SL>
      <div style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:'var(--r)',padding:16}}>
        <div style={{display:'flex',gap:8,marginBottom:10}}>
          <input style={{...SS.input,width:52,flex:'none',textAlign:'center',fontSize:18}} value={form.emoji} maxLength={2} onChange={e=>setForm(p=>({...p,emoji:e.target.value}))}/>
          <input style={SS.input} placeholder="Nombre del hito..." value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
        </div>
        <div style={{display:'flex',gap:8}}>
          <input style={{...SS.input,width:110,flex:'none'}} type="number" placeholder="Días req." value={form.req} onChange={e=>setForm(p=>({...p,req:e.target.value}))}/>
          <input style={SS.input} placeholder="Recompensa..." value={form.reward} onChange={e=>setForm(p=>({...p,reward:e.target.value}))}/>
          <button style={SS.btnNeon} onClick={addTrophy}>CREAR</button>
        </div>
      </div>
    </div>
  )
}

// ─── TAB STATS ────────────────────────────────────────────────────────────────
function TabStats({S,c30}){
  const activeHabits=S.habits.filter(h=>h.active)
  const totalDone=Object.values(S.log).reduce((a,d)=>a+Object.values(d).filter(v=>v==='done').length,0)
  const bestCur=Math.max(0,...activeHabits.map(h=>currentStreak(S.log,h.id)))
  const bestMax=Math.max(0,...activeHabits.map(h=>maxStreak(S.log,h.id)))
  const dowPct=useMemo(()=>dayOfWeekCompliance(S.log,S.habits),[S.log,S.habits])
  const taskHistory=Object.values(S.tasksHistory||{})
  const taskChecked=taskHistory.filter(d=>d.status==='checked').length
  return(
    <div>
      <SL style={{marginTop:4}}>GLOBAL</SL>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:20}}>
        {[{val:c30+'%',lbl:'CUMPL. 30D'},{val:totalDone,lbl:'LOGRADOS'},{val:bestCur+'d',lbl:'RACHA ACTUAL'},{val:bestMax+'d',lbl:'RACHA MÁXIMA'},{val:activeHabits.length,lbl:'HÁBITOS'},{val:taskHistory.length>0?Math.round(taskChecked/taskHistory.length*100)+'%':'—',lbl:'DÍAS COMPLETOS'}].map(({val,lbl})=><div key={lbl} style={SS.statCard}><div style={SS.statVal}>{val}</div><div style={SS.statLbl}>{lbl}</div></div>)}
      </div>
      <SL>PATRÓN SEMANAL</SL>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4,marginBottom:20}}>
        {DOW_LABELS.map((l,i)=>{const p=dowPct[i],col=p>=70?'var(--neon)':p>=40?'var(--cyan)':'var(--danger)';return(
          <div key={l} style={{padding:'10px 4px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',textAlign:'center'}}>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:1,color:'var(--text3)',marginBottom:6}}>{l}</div>
            <div style={{height:40,display:'flex',alignItems:'flex-end'}}><div style={{width:'100%',height:Math.max(4,p*0.4),background:col,boxShadow:p>=70?`0 0 6px ${col}`:'none',borderRadius:'2px 2px 0 0',transition:'height .6s ease'}}/></div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:col,marginTop:4}}>{p}%</div>
          </div>
        )})}
      </div>
      <SL>POR HÁBITO</SL>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',overflow:'hidden'}}>
        {activeHabits.map((h,i)=>{const streak=currentStreak(S.log,h.id),mStr=maxStreak(S.log,h.id),c=habitCompliance30(S.log,h.id);return(
          <div key={h.id} style={{padding:'12px 14px',borderBottom:i<activeHabits.length-1?'1px solid var(--border)':'none'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:7}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}><span style={{fontSize:15}}>{h.emoji}</span><span style={{fontSize:13,color:'var(--text)'}}>{h.name}</span></div>
              <div style={{display:'flex',gap:14,fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text3)'}}>
                <span>Racha <b style={{color:'var(--text)'}}>{streak}d</b></span><span>Máx <b style={{color:'var(--text)'}}>{mStr}d</b></span><span style={{color:'var(--neon)'}}><b>{c}%</b></span>
              </div>
            </div>
            <div style={{background:'var(--surface3)',height:2}}><div style={{width:c+'%',height:'100%',background:'var(--neon)',boxShadow:'0 0 4px var(--neon)',transition:'width .6s ease'}}/></div>
          </div>
        )})}
      </div>
    </div>
  )
}

// ─── TAB CONFIG ───────────────────────────────────────────────────────────────
function TabConfig({S,setS,showToast,activateTravel,deactivateTravel,setModal,handleImport}){
  function toggleActive(hid){setS(p=>({...p,habits:p.habits.map(h=>h.id===hid?{...h,active:!h.active}:h)}))}
  function resetAll(){if(!window.confirm('¿Resetear toda la app?'))return;localStorage.removeItem('ho_v3');window.location.reload()}
  function exportJSON(){const b=new Blob([JSON.stringify({habits:S.habits,log:S.log,tasksHistory:S.tasksHistory||{}},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='habitOrbit-backup.json';a.click();showToast('// DATOS EXPORTADOS')}
  return(
    <div>
      <SL style={{marginTop:4}}>HÁBITOS</SL>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',overflow:'hidden',marginBottom:20}}>
        {S.habits.map((h,i)=>{const tbC=h.type==='weekly'?'var(--cyan)':h.type==='avoid'?'var(--warn)':'var(--text3)';return(
          <div key={h.id} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderBottom:i<S.habits.length-1?'1px solid var(--border)':'none'}}>
            <span style={{fontSize:16}}>{h.emoji}</span>
            <span style={{flex:1,fontSize:13,color:h.active?'var(--text)':'var(--text3)'}}>{h.name}</span>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,padding:'2px 6px',borderRadius:2,border:`1px solid ${tbC}`,color:tbC}}>{h.type==='weekly'?h.freq+'x/sem':h.type.toUpperCase()}</span>
            <button style={{...SS.btnGhost,fontSize:8,padding:'5px 10px',...(!h.active?{borderColor:'var(--neon)',color:'var(--neon)'}:{})}} onClick={()=>toggleActive(h.id)}>{h.active?'ARCHIVAR':'REACTIVAR'}</button>
          </div>
        )})}
      </div>
      <SL>MODO VIAJE</SL>
      <div style={{padding:16,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',marginBottom:20}}>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:'var(--text2)',marginBottom:12,lineHeight:1.7}}>Pausa total sin penalizar rachas. Todos los hábitos se marcan como "skip".</div>
        {S.travelMode?<button style={SS.btnGhost} onClick={deactivateTravel}>DESACTIVAR MODO VIAJE</button>:<button style={SS.btnNeon} onClick={()=>setModal('travel')}>ACTIVAR MODO VIAJE</button>}
      </div>
      <SL>DATOS</SL>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:10}}>
        <button style={SS.btnGhost} onClick={exportJSON}>EXPORTAR JSON</button>
        <label style={{...SS.btnGhost,cursor:'pointer'}}>IMPORTAR BACKUP<input type="file" accept=".json" style={{display:'none'}} onChange={handleImport}/></label>
        <button style={{...SS.btnGhost,borderColor:'var(--danger)',color:'var(--danger)'}} onClick={resetAll}>RESETEAR APP</button>
      </div>
      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text3)',lineHeight:1.7}}>
        → Detecta automáticamente el formato antiguo (HabitOrbit classic) y lo traduce sin perder datos ni historial de tareas.
      </div>
    </div>
  )
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function ModalIntention({energy,onEnergy,onConfirm,onTravel}){
  const opts=[{key:'high',icon:'⚡',label:'ALTA'},{key:'normal',icon:'🎯',label:'NORMAL'},{key:'low',icon:'🌫️',label:'BAJA'},{key:'travel',icon:'✈️',label:'VIAJE'}]
  return<ModalWrap><MTitle c="// INICIALIZACIÓN"/><MSub c="Sistema activo · Calibra tu energía antes de comenzar"/>
    <SL style={{marginBottom:12}}>NIVEL DE ENERGÍA HOY</SL>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:20}}>
      {opts.map(({key,icon,label})=><div key={key} onClick={()=>key==='travel'?onTravel():onEnergy(key)} style={{padding:14,background:energy===key?'var(--neon-dim)':'var(--surface)',border:`1px solid ${energy===key?'var(--neon)':'var(--border2)'}`,borderRadius:'var(--r-sm)',cursor:'pointer',textAlign:'center',boxShadow:energy===key?'var(--neon-glow-sm)':'none',transition:'all .15s'}}>
        <div style={{fontSize:22,marginBottom:6}}>{icon}</div>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:2,color:energy===key?'var(--neon)':'var(--text2)'}}>{label}</div>
      </div>)}
    </div>
    <button style={{...SS.btnNeon,width:'100%'}} onClick={onConfirm}>ACTIVAR ÓRBITA</button>
  </ModalWrap>
}

function ModalNight({pending,onSet,onClose}){
  const [local,setLocal]=useState(pending.map(h=>h.id))
  if(local.length===0){onClose();return null}
  function set(hid,st){onSet(hid,st);setLocal(p=>p.filter(id=>id!==hid))}
  return<ModalWrap><MTitle c="// REVISIÓN NOCTURNA"/><MSub c="Cierra el día — registra los pendientes antes de desconectarte"/>
    <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
      {pending.filter(h=>local.includes(h.id)).map(h=>(
        <div key={h.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)'}}>
          <span style={{fontSize:16}}>{h.emoji}</span><span style={{flex:1,fontSize:13,color:'var(--text)'}}>{h.name}</span>
          <button style={{...SS.btnNeon,padding:'6px 10px',fontSize:8}} onClick={()=>set(h.id,'done')}>✓</button>
          <button style={{...SS.btnGhost,padding:'6px 10px',fontSize:8}} onClick={()=>set(h.id,'rest')}>○</button>
          <button style={{...SS.btnGhost,padding:'6px 10px',fontSize:8,borderColor:'var(--danger)',color:'var(--danger)'}} onClick={()=>set(h.id,'fail')}>✕</button>
        </div>
      ))}
    </div>
    <button style={{...SS.btnNeon,width:'100%'}} onClick={onClose}>CERRAR DÍA</button>
  </ModalWrap>
}

function ModalTravel({onConfirm,onClose}){
  const [reason,setReason]=useState('')
  return<ModalWrap onClose={onClose}><MTitle c="// MODO VIAJE"/><MSub c="Pausa total sin penalizar rachas · Todos los hábitos se marcan como 'skip'"/>
    <input style={{...SS.input,marginBottom:12}} placeholder="Motivo: conferencia, vacaciones..." value={reason} onChange={e=>setReason(e.target.value)}/>
    <div style={{display:'flex',gap:8}}><button style={{...SS.btnNeon,flex:1}} onClick={()=>onConfirm(reason)}>ACTIVAR</button><button style={SS.btnGhost} onClick={onClose}>CANCELAR</button></div>
  </ModalWrap>
}

function ModalAddHabit({onAdd,onClose}){
  const [form,setForm]=useState({name:'',emoji:'⚡',type:'daily',freq:3})
  const tDesc={daily:'→ Se espera cada día. La racha se rompe si fallas.',weekly:'→ Flexible en cuándo, fijo en cuánto. La racha continúa si alcanzas el objetivo semanal.',avoid:'→ Cuenta días desde la última vez que ocurrió algo indeseable.'}
  const tCol={daily:'var(--neon)',weekly:'var(--cyan)',avoid:'var(--warn)'}
  function confirm(){if(!form.name.trim())return;onAdd({id:'h'+Date.now(),name:form.name,emoji:form.emoji||'⚡',type:form.type,freq:form.freq,active:true})}
  return<ModalWrap onClose={onClose}><MTitle c="// NUEVO HÁBITO"/><MSub c="El tipo define cómo se calculan tus rachas"/>
    <div style={{display:'flex',gap:8,marginBottom:12}}>
      <input style={{...SS.input,width:52,flex:'none',textAlign:'center',fontSize:18}} value={form.emoji} maxLength={2} onChange={e=>setForm(p=>({...p,emoji:e.target.value}))}/>
      <input style={SS.input} placeholder="Nombre del hábito..." value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&confirm()} autoFocus/>
    </div>
    <SL style={{marginBottom:10}}>TIPO</SL>
    <div style={{display:'flex',gap:6,marginBottom:12}}>
      {['daily','weekly','avoid'].map(t=><button key={t} onClick={()=>setForm(p=>({...p,type:t}))} style={{flex:1,padding:'8px 4px',borderRadius:3,cursor:'pointer',background:form.type===t?tCol[t]+'22':'none',border:`1px solid ${form.type===t?tCol[t]:'var(--border2)'}`,color:form.type===t?tCol[t]:'var(--text3)',fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:2}}>{t==='daily'?'DIARIO':t==='weekly'?'X/SEMANA':'EVITACIÓN'}</button>)}
    </div>
    {form.type==='weekly'&&<div style={{marginBottom:12}}>
      <SL style={{marginBottom:8}}>VECES POR SEMANA</SL>
      <div style={{display:'flex',gap:5}}>{[1,2,3,4,5,6,7].map(n=><button key={n} onClick={()=>setForm(p=>({...p,freq:n}))} style={{flex:1,padding:8,background:form.freq===n?'var(--neon-dim)':'var(--surface)',border:`1px solid ${form.freq===n?'var(--neon)':'var(--border)'}`,color:form.freq===n?'var(--neon)':'var(--text3)',borderRadius:'var(--r-sm)',cursor:'pointer',fontFamily:"'Orbitron',monospace",fontSize:10}}>{n}</button>)}</div>
    </div>}
    <div style={{padding:'10px 12px',background:'var(--surface)',borderRadius:'var(--r-sm)',fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text2)',lineHeight:1.6,marginBottom:16}}>{tDesc[form.type]}</div>
    <div style={{display:'flex',gap:8}}><button style={{...SS.btnNeon,flex:1}} onClick={confirm}>AÑADIR</button><button style={SS.btnGhost} onClick={onClose}>CANCELAR</button></div>
  </ModalWrap>
}
