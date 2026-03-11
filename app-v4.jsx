const { useState, useEffect, useRef, useMemo, useContext, createContext } = React;
const { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, CartesianGrid, PieChart, Pie, Legend } = Recharts;


// ──────────────────────────────────────────────────────────────────────────────
// v4: ALL REP DATA IS DYNAMIC — stored in Gist, no hardcoded data
// Rep definitions: Gist key "leaderboard-reps-v2"  [{name,start,group,...}]
// Monthly data:    Gist key "leaderboard-data-v1"   {"rep::year::mon": {...}}
// ──────────────────────────────────────────────────────────────────────────────

const BENCHMARKS_DEFAULT = [
  {tier:0,range:"0–<1 mo",units:0,monthly:0,pos:"New, ramping up"},
  {tier:1,range:"1–6 mo",units:2,monthly:100000,pos:"Entry-level"},
  {tier:2,range:"6–12 mo",units:4,monthly:300000,pos:"Intermediate"},
  {tier:5,range:"1.5 yrs",units:6,monthly:450000,pos:"Up & Comer"},
  {tier:6,range:"1.5–2 yrs",units:10,monthly:800000,pos:"OCTA-Level"},
  {tier:7,range:"2+ yrs",units:16,monthly:1500000,pos:"Team Leader"},
];
const BENCHMARKS_STORAGE_KEY = "leaderboard-benchmarks-v1";
const BenchmarksCtx = React.createContext({bm:BENCHMARKS_DEFAULT,saveBm:()=>{}});

// Module-level empty placeholder — real computed array lives in AllRepsCtx
const ALL = [];

// AllRepsCtx provides {allReps, saveReps} to all components
// allReps = rep definitions + computed .mos from data entry storage
const AllRepsCtx = React.createContext({allReps:[], saveReps:async()=>{}});


const POS_GROUPS = [
  {key:"Dept Head",  color:"#f59e0b",rank:0},
  {key:"Team Leader",color:"#22d3ee",rank:1},
  {key:"OCTA",color:"#818cf8",rank:2},
  {key:"Up & Comer",color:"#a78bfa",rank:3},
  {key:"RIT",color:"#9db4c8",rank:4},
];
const DEPT_HEAD_NAMES = ["Max Gualtieri","Dave Salas"];
const DEPT_HEAD_ROLES = {
  "Max Gualtieri": {role:"SBA Director",product:"SBA",color:"#34d399"},
  "Dave Salas":    {role:"CC Processing Director",product:"Credit Card",color:"#f59e0b"},
};
const DEPTHEAD_KEY = "leaderboard-depthead-v1";
const PRODUCT_TYPES = [
  {key:"MCA",   color:"#22d3ee", label:"MCA"},
  {key:"SBA",   color:"#34d399", label:"SBA"},
  {key:"HELOC", color:"#a78bfa", label:"HELOC"},
  {key:"RE",    color:"#f59e0b", label:"Real Estate"},
  {key:"Equip", color:"#fb923c", label:"Equipment"},
  {key:"Term",  color:"#818cf8", label:"Term Loan"},
  {key:"LOC",   color:"#fbbf24", label:"LOC"},
];
const PRODUCTS_KEY = "leaderboard-products-v1";
const DeptHeadsCtx = React.createContext({deptData:{},saveDeptData:()=>{}});
const ProductsCtx  = React.createContext({products:{},saveProducts:()=>{}});
const ALL_MONTHS_12=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEAR_OPTS=["2024","2025","2026","2027"];
const MOS_2025=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; // v4: all months treated as valid
const MOS_2026=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const STATUS_CFG = {
  "Exceeding":       {bg:"#172554",border:"#1d4ed8",text:"#60a5fa",label:"EXCEEDING",urgency:0},
  "Promotion Ready": {bg:"#052e16",border:"#166534",text:"#4ade80",label:"PROMOTE",urgency:0},
  "On Track":        {bg:"#022c22",border:"#065f46",text:"#34d399",label:"ON TRACK",urgency:1},
  "Needs Attention": {bg:"#431407",border:"#9a3412",text:"#fb923c",label:"MEET SOON",urgency:2},
  "Underperforming": {bg:"#3b0a0a",border:"#991b1b",text:"#f87171",label:"ACT NOW",urgency:3},
};
const calcStatus=(totalFunded, numMonths, expMonthly, isMax=false)=>{
  if(!expMonthly) return "On Track";
  const avgMonthly = numMonths > 0 ? totalFunded / numMonths : totalFunded;
  const pct = avgMonthly / expMonthly;
  if(pct >= 1.0)  return isMax ? "Exceeding" : "Promotion Ready";
  if(pct >= 0.75) return "On Track";
  if(pct >= 0.40) return "Needs Attention";
  return "Underperforming";
};
const fmt$ = v => v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:v>0?`$${Math.round(v)}`:"—";

const REPS_STORAGE_KEY = "leaderboard-reps-v2";

// ─── Module-level tier / meeting helpers ─────────────────────────────────────
const TIER_ORDER_ARR = [0,1,2,5,6,7];
const TENURE_MIN = {0:0, 1:30, 2:180, 5:365, 6:547, 7:730};
const MEETING_STORAGE_KEY = "leaderboard-meetings-v1";
const GOALS_STORAGE_KEY   = "leaderboard-goals-v1";
const DATA_STORAGE_KEY    = "leaderboard-data-v1";
const ROSTER_STORAGE_KEY  = "leaderboard-roster-v1";

// ── GitHub Gist Backend ───────────────────────────────────────────────────────
const GIST_ID = "REPLACE_WITH_YOUR_GIST_ID"; // ← Create a new Gist and paste the ID here
const TOKEN_KEY = "rep-tracker-v4-gh-token"; // separate from historical version

// Token is stored in localStorage — never hardcoded
function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t.trim()); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

const storage = (() => {
  let cache = null;

  async function load() {
    if (cache) return cache;
    const token = getToken();
    if (!token) { cache = {}; return cache; }
    try {
      const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
        headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" }
      });
      if (r.status === 401) { clearToken(); cache = {}; return cache; }
      const d = await r.json();
      const content = d.files?.["storage.json"]?.content || "{}";
      cache = JSON.parse(content);
    } catch(e) { console.warn("storage load failed:", e); cache = {}; }
    return cache;
  }

  async function persist() {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`https://api.github.com/gists/${GIST_ID}`, {
        method: "PATCH",
        headers: { Authorization: `token ${token}`, "Content-Type": "application/json", Accept: "application/vnd.github.v3+json" },
        body: JSON.stringify({ files: { "storage.json": { content: JSON.stringify(cache, null, 2) } } })
      });
    } catch(e) { console.warn("storage save failed:", e); }
  }

  return {
    async get(key) {
      const data = await load();
      const value = data[key];
      return value !== undefined ? { key, value } : null;
    },
    async save(key, value) {
      const data = await load();
      data[key] = value;
      await persist();
      return { key, value };
    },
    async delete(key) {
      const data = await load();
      delete data[key];
      await persist();
      return { key, deleted: true };
    },
    async list(prefix = "") {
      const data = await load();
      const keys = Object.keys(data).filter(k => !prefix || k.startsWith(prefix));
      return { keys, prefix };
    },
    isConfigured() { return !!getToken(); },
    configure(token) { setToken(token); cache = null; },
    reset() { clearToken(); cache = null; }
  };
})();
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Pre-seed former reps so they start inactive on first load
// Any rep not listed here is treated as active by default
const ROSTER_DEFAULTS = {
  "Sebastian Devia":   {active:false,endYear:"2026",endMonth:"Jan",note:"Left Jan 2026 — Up & Comer"},
  "Jabril Perryman":   {active:false,endYear:"2026",endMonth:"Feb",note:"Former rep"},
  "Jacob Margolies":   {active:false,endYear:"2026",endMonth:"Feb",note:"Former rep"},
  "Shyann Franklin":   {active:false,endYear:"2026",endMonth:"Feb",note:"Former rep"},
  "Charlize Farahmand":{active:false,endYear:"2026",endMonth:"Feb",note:"Former rep"},
  "Lucianna Julian":   {active:false,endYear:"2026",endMonth:"Feb",note:"Former rep"},
  "Max Gualtieri":     {active:false,endYear:"2025",endMonth:"Oct",note:"Former rep — verify dates"},
  "Dave Salas":        {active:false,endYear:"2026",endMonth:"Feb",note:"Former rep — verify dates"},
  "Carlo Moreno":      {active:false,endYear:"2025",endMonth:"Oct",note:"Former rep — verify dates"},
};
// Context: {roster, saveRoster, isActive}
// roster = { "Rep Name": { active:false, endYear:"2026", endMonth:"Jan", note:"" } }
// Absence from roster = active by default
const RosterCtx = React.createContext({roster:{},saveRoster:()=>{},isActive:()=>true});
// Meeting Mode context — masks all rep names except the selected "focus" rep
const MeetingCtx = React.createContext({meetingMode:false,focusRep:null,maskName:n=>n,toggleMeeting:()=>{},setFocusRep:()=>{}});

const TIER_COLORS = {7:"#22d3ee",6:"#818cf8",5:"#a78bfa",2:"#fbbf24",1:"#fb923c",0:"#9db4c8"};

const calcDaysToNextTier=(r,bm=BENCHMARKS_DEFAULT)=>{
  const tt=calcTenureTier(r,bm);
  const idx=TIER_ORDER_ARR.indexOf(tt.tier);
  if(idx===-1||idx===TIER_ORDER_ARR.length-1) return null;
  const nextTierNum=TIER_ORDER_ARR[idx+1];
  const threshold=TENURE_MIN[nextTierNum];
  const elapsed=Math.floor((new Date()-new Date(r.start))/86400000);
  return threshold-elapsed;
};

// Tenure tier: purely based on elapsed days from start date
const calcTenureTier=(r,bm=BENCHMARKS_DEFAULT)=>{
  const elapsed=Math.floor((new Date()-new Date(r.start))/86400000);
  const sorted=[...TIER_ORDER_ARR].slice().reverse();
  for(const t of sorted){
    if(elapsed>=(TENURE_MIN[t]||0)){
      const b=bm.find(b=>b.tier===t);
      if(b) return b;
    }
  }
  return bm[0]||BENCHMARKS_DEFAULT[0];
};

// Perf tier: based on avg monthly units + funded $ only, no tenure gate
const calcPerfTier=(r,bm=BENCHMARKS_DEFAULT)=>{
  const allMos=r.mos; const numMos=allMos.length||1;
  const avgUnits=allMos.reduce((s,m)=>s+(m.funded||0),0)/numMos;
  const avgFunded=allMos.reduce((s,m)=>s+(m.fundedAmt||0),0)/numMos;
  const sorted=[...bm].sort((a,b)=>b.tier-a.tier);
  for(const b of sorted){
    if(avgUnits>=b.units && avgFunded>=b.monthly) return b;
  }
  return bm[0]||BENCHMARKS_DEFAULT[0];
};

// Next tier date: when tenure clock hits the next threshold
const getNextTierDate=(r,bm=BENCHMARKS_DEFAULT)=>{
  const cur=calcTenureTier(r,bm);
  const idx=TIER_ORDER_ARR.indexOf(cur.tier);
  if(idx===-1||idx===TIER_ORDER_ARR.length-1) return null;
  const nextTierNum=TIER_ORDER_ARR[idx+1];
  const start=new Date(r.start);
  return new Date(start.getTime()+TENURE_MIN[nextTierNum]*86400000).toISOString().slice(0,10);
};

const fmtShortDate=(s)=>{
  if(!s) return null;
  const d=new Date(s+"T12:00:00");
  return d.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"});
};
const gcalUrl=(repName, dateStr)=>{
  // Build Google Calendar "create event" URL
  const d=new Date(dateStr+"T09:00:00");
  const pad=n=>String(n).padStart(2,"0");
  const fmt=dt=>`${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T090000`;
  const end=new Date(d);end.setHours(10);
  const endFmt=`${end.getFullYear()}${pad(end.getMonth()+1)}${pad(end.getDate())}T100000`;
  const title=encodeURIComponent(`Meeting: ${repName}`);
  const details=encodeURIComponent(`Scheduled performance review meeting with ${repName}.`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(d)}/${endFmt}&details=${details}`;
};
const QUICK_DATES=[
  {label:"1 Week",  fn:()=>{const d=new Date();d.setDate(d.getDate()+7);  return d.toISOString().slice(0,10);}},
  {label:"1 Month", fn:()=>{const d=new Date();d.setMonth(d.getMonth()+1); return d.toISOString().slice(0,10);}},
  {label:"3 Months",fn:()=>{const d=new Date();d.setMonth(d.getMonth()+3); return d.toISOString().slice(0,10);}},
  {label:"6 Months",fn:()=>{const d=new Date();d.setMonth(d.getMonth()+6); return d.toISOString().slice(0,10);}},
  {label:"1 Year",  fn:()=>{const d=new Date();d.setFullYear(d.getFullYear()+1);return d.toISOString().slice(0,10);}},
];
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({status, compact}) {
  const cfg = STATUS_CFG[status]||STATUS_CFG["On Track"];
  if(compact) return <span style={{background:cfg.bg,border:`1px solid ${cfg.border}`,borderRadius:3,padding:"2px 8px",color:cfg.text,fontSize:13,letterSpacing:.5,whiteSpace:"nowrap"}}>{cfg.label}</span>;
  return (
    <div style={{background:cfg.bg,border:`1px solid ${cfg.border}`,borderRadius:4,padding:"5px 12px",display:"inline-block"}}>
      <span style={{color:cfg.text,fontSize:14,fontWeight:600,letterSpacing:1}}>{cfg.label}</span>
    </div>
  );
}

function GroupSection({group, reps}) {
  const {meetingMode,focusRep,maskName}=React.useContext(MeetingCtx);
  const {useState}=React;
  const [sortMode,setSortMode]=useState("pts_desc"); // pts_desc | pts_asc | az | za
  const [statusFlt,setStatusFlt]=useState("all");
  const withPts = reps.filter(r=>r.febPts!==null);
  if(!withPts.length) return null;
  const avg = Math.round(withPts.reduce((s,r)=>s+(r.febPts||0),0)/withPts.length);
  const statusFiltered = statusFlt==="all" ? withPts : withPts.filter(r=>r.status===statusFlt);
  const sorted = [...statusFiltered].sort((a,b)=>{
    if(sortMode==="pts_desc") return (b.febPts||0)-(a.febPts||0);
    if(sortMode==="pts_asc")  return (a.febPts||0)-(b.febPts||0);
    if(sortMode==="az")       return a.name.localeCompare(b.name);
    if(sortMode==="za")       return b.name.localeCompare(a.name);
    return 0;
  });
  const chartData = sorted.map(r=>({name:maskName(r.name).replace(/ /g,"\n"),fullName:maskName(r.name),pts:r.febPts||0,above:(r.febPts||0)>=avg}));
  const STATUS_FILTERS=[{v:"all",l:"ALL"},{v:"Exceeding",l:"EXCEEDING"},{v:"Promotion Ready",l:"PROMOTE"},{v:"On Track",l:"ON TRACK"},{v:"Needs Attention",l:"MEET SOON"},{v:"Underperforming",l:"ACT NOW"}];
  const CustomTick = ({x,y,payload})=>{
    const rep = sorted.find(r=>maskName(r.name).replace(/ /g,"\n")===payload.value);
    const cfg = STATUS_CFG[rep?.status]||STATUS_CFG["On Track"];
    return <text x={x} y={y+14} textAnchor="middle" fill={cfg.text} fontSize={11}>{payload.value}</text>;
  };
  return (
    <div style={{marginBottom:32}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
        <div style={{width:3,height:24,background:group.color,borderRadius:2,flexShrink:0}}/>
        <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:group.color,letterSpacing:2}}>{group.key}</span>
        <span style={{color:"#7ec8e3",fontSize:13}}>{sorted.length}/{withPts.length} REP{withPts.length!==1?"S":""}</span>
        <span style={{color:"#a8c4d8",fontSize:13,background:"#0f2438",border:"1px solid #1a3550",borderRadius:3,padding:"2px 8px"}}>AVG {avg} PTS</span>
        <div style={{flex:1}}/>
        {/* Sort controls */}
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          <span style={{color:"#4a7fa8",fontSize:11,letterSpacing:1,marginRight:2}}>SORT:</span>
          {[{v:"pts_desc",l:"PTS ↓"},{v:"pts_asc",l:"PTS ↑"},{v:"az",l:"A→Z"},{v:"za",l:"Z→A"}].map(o=>(
            <button key={o.v} onClick={()=>setSortMode(o.v)} style={{background:sortMode===o.v?`${group.color}22`:"none",border:`1px solid ${sortMode===o.v?group.color:"#1a3550"}`,borderRadius:4,padding:"2px 8px",color:sortMode===o.v?group.color:"#4a7fa8",fontSize:12,cursor:"pointer",fontWeight:sortMode===o.v?700:400}}>{o.l}</button>
          ))}
        </div>
        {/* Status filter */}
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          <span style={{color:"#4a7fa8",fontSize:11,letterSpacing:1,marginRight:2}}>FILTER:</span>
          {STATUS_FILTERS.map(o=>{
            const cfg=STATUS_CFG[o.v]||{text:"#7ec8e3",border:"#1a3550"};
            const active=statusFlt===o.v;
            return <button key={o.v} onClick={()=>setStatusFlt(o.v)} style={{background:active?(o.v==="all"?"#1a3550":cfg.bg):"none",border:`1px solid ${active?(o.v==="all"?"#7ec8e3":cfg.border):"#1a3550"}`,borderRadius:4,padding:"2px 8px",color:active?(o.v==="all"?"#7ec8e3":cfg.text):"#4a7fa8",fontSize:12,cursor:"pointer",fontWeight:active?700:400}}>{o.l}</button>;
          })}
        </div>
      </div>
      {/* Vertical bar chart — full width, on top */}
      <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:6,padding:"12px 12px 8px",marginBottom:8}}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart cursor={false} data={chartData} margin={{top:4,right:80,bottom:28,left:-10}}>
            <CartesianGrid vertical={false} stroke="#0f2438"/>
            <XAxis dataKey="name" tick={<CustomTick/>} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#a8c4d8",fontSize:11}} axisLine={false} tickLine={false}/>
            <Tooltip cursor={false} contentStyle={{background:"#0a1525",border:"1px solid #22d3ee44",fontSize:14,color:"#f1f5f9"}} labelStyle={{color:"#22d3ee",fontWeight:700}} itemStyle={{color:"#f1f5f9"}} formatter={(v,n,p)=>[`${v} pts`,p.payload.fullName]}/>
            <ReferenceLine y={avg} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5} label={{value:`AVG: ${avg}`,position:"insideTopRight",fill:"#ef4444",fontSize:13,fontWeight:700}}/>
            <Bar activeBar={false} dataKey="pts" radius={[3,3,0,0]} maxBarSize={44}>
              {chartData.map((d,i)=><Cell key={i} fill={d.above?group.color:`${group.color}44`}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Table — below */}
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr style={{borderBottom:"1px solid #0a1f35"}}>
          {["REP","FEB PTS","JAN PTS","DEC PTS","TREND","STATUS","DAYS→TIER","REV %","MTG %"].map(h=>(
            <th key={h} style={{padding:"4px 10px",color:"#7ec8e3",fontSize:12,letterSpacing:1.2,textAlign:"left",fontWeight:500,whiteSpace:"nowrap"}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {sorted.map((r,i)=>{
            const trend = r.janPts!==null?(r.febPts>r.janPts?"↑":r.febPts<r.janPts?"↓":"→"):"—";
            const tc = trend==="↑"?"#34d399":trend==="↓"?"#f87171":"#9db4c8";
            const days = r.daysNext==="MAX"?null:parseInt(r.daysNext);
            const dc = days!==null&&days<=30?"#fcd34d":days!==null&&days<=90?"#fb923c":"#a8c4d8";
            return (
              <tr key={r.name} style={{borderBottom:"1px solid #070e1c",background:i%2?"#0d1e32":"#0a1728",opacity:meetingMode&&focusRep&&r.name!==focusRep?.65:1}}>
                <td style={{padding:"8px 10px",color:"#f1f5f9",fontWeight:500,whiteSpace:"nowrap"}}>{maskName(r.name)}</td>
                <td style={{padding:"8px 10px"}}><span style={{color:(r.febPts||0)>=avg?group.color:"#f87171",fontWeight:700,fontSize:18,fontFamily:"'Bebas Neue',sans-serif"}}>{r.febPts??0}</span></td>
                <td style={{padding:"8px 10px",color:"#94a3b8"}}>{r.janPts??"-"}</td>
                <td style={{padding:"8px 10px",color:"#a8c4d8"}}>{r.decPts??"-"}</td>
                <td style={{padding:"8px 10px",color:tc,fontWeight:700,fontSize:20}}>{trend}</td>
                <td style={{padding:"8px 10px"}}><StatusBadge status={r.status} daysNext={r.daysNext} compact/></td>
                <td style={{padding:"8px 10px",color:dc}}>{days!==null?`${days}d`:"MAX"}</td>
                <td style={{padding:"8px 10px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:40,height:4,background:"#1a3d5c",borderRadius:2}}>
                      <div style={{width:`${Math.min(100,r.revProg||0)}%`,height:"100%",background:(r.revProg||0)>=100?"#34d399":(r.revProg||0)>=50?"#fbbf24":"#f87171",borderRadius:2}}/>
                    </div>
                    <span style={{color:(r.revProg||0)>=100?"#34d399":(r.revProg||0)>=50?"#fbbf24":"#f87171",fontSize:13}}>{r.revProg||0}%</span>
                  </div>
                </td>
                <td style={{padding:"8px 10px",color:r.avgMtg>=70?"#34d399":r.avgMtg>=40?"#fbbf24":r.avgMtg>0?"#fb923c":"#a8c4d8",fontSize:13}}>{r.avgMtg||0}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LeaderboardView({onSel, statusFilt="all", setStatusFilt=()=>{}, active=[], period="Feb", setPeriod=()=>{}}) {
  const {meetingMode,focusRep,maskName}=React.useContext(MeetingCtx);
  const {products}=React.useContext(ProductsCtx);
  const [sortCol,setSortCol]=useState({col:"urgency",dir:"desc"});
  const [filt,setFilt]=useState("all");
  const [expandedRep,setExpandedRep]=useState(null);
  const [open25,setOpen25]=useState(false);
  const [meetings,setMeetingsState]=useState({});
  const [editSched,setEditSched]=useState(null);
  const [schedInput,setSchedInput]=useState("");
  const [pendingMeetSched,setPendingMeetSched]=useState(null);
  const [confirmClear,setConfirmClear]=useState(null);
  const [hiddenCols,setHiddenCols]=useState(new Set());
  const [showColMenu,setShowColMenu]=useState(false);
  const [goals,setGoals]=useState({});

  const PTS_KEY={Dec:"decPts",Jan:"janPts",Feb:"febPts"};
  // MOS_2025 and MOS_2026 are global constants

  // --- Persistent meeting storage ---
  const STORAGE_KEY=MEETING_STORAGE_KEY;
  const {useEffect} = React;

  useEffect(()=>{
    (async()=>{
      try{
        const res=await storage.get(STORAGE_KEY);
        if(res) setMeetingsState(JSON.parse(res.value));
      }catch(e){}
      try{
        const rg=await storage.get(GOALS_STORAGE_KEY);
        if(rg) setGoals(JSON.parse(rg.value));
      }catch(e){}
    })();
  },[]);

  const saveMeeting=async(repName, data)=>{
    const next={...meetings,[repName]:data};
    setMeetingsState(next);
    try{ await storage.save(STORAGE_KEY,JSON.stringify(next)); }catch(e){}
  };

  const toggleMet=(repName, rep)=>{
    const existing=meetings[repName]||{};
    if(existing.metDate){
      saveMeeting(repName,{...existing,metDate:null});
    } else {
      const today=new Date().toISOString().slice(0,10);
      const prefill=getNextTierDate(rep)||"";
      const history=[...(existing.history||[]),{type:"met",date:today,recordedAt:new Date().toISOString()}];
      saveMeeting(repName,{...existing,metDate:today,scheduledDate:null,history});
      setPendingMeetSched(repName);
      setSchedInput(prefill);
      setEditSched(repName);
    }
  };

  const saveSchedDate=(repName,dateStr)=>{
    const existing=meetings[repName]||{};
    const prevMet=existing.metDate||existing.prevMetDate||null;
    const history=[...(existing.history||[]),{type:"scheduled",date:dateStr,recordedAt:new Date().toISOString()}];
    saveMeeting(repName,{...existing,scheduledDate:dateStr||null,metDate:null,prevMetDate:prevMet,history});
    setEditSched(null);
  };

  // Dynamically compute status from period funded vs expected monthly target
  // Uses global calcStatus — isMax when rep is at their highest possible tier

  const getPd=(r)=>{
    const isMax=r.daysNext==="MAX";
    if(period==="all") return {
      funded:r.totalFunded, febFunded:r.feb?.fundedAmt||0,
      pts:r.febPts, apps:r.mos.reduce((s,m)=>s+(m.sent||0),0),
      units:r.mos.reduce((s,m)=>s+(m.funded||0),0), mtg:r.avgMtg,
      trend:r.janPts!==null?(r.febPts>r.janPts?"↑":r.febPts<r.janPts?"↓":"→"):"—",
      status:r.status, daysNext:r.daysNext,
    };
    if(period==="2025"){
      const ms=r.mos.filter(m=>MOS_2025.includes(m.month));
      const ptsTotal=r.decPts||0;
      const mtgMs=ms.filter(m=>m.meetingPct>0);
      const totalFunded=ms.reduce((s,m)=>s+(m.fundedAmt||0),0);
      return {
        funded:totalFunded, pts:ptsTotal,
        apps:ms.reduce((s,m)=>s+(m.sent||0),0),
        units:ms.reduce((s,m)=>s+(m.funded||0),0),
        mtg:mtgMs.length?Math.round(mtgMs.reduce((s,m)=>s+m.meetingPct,0)/mtgMs.length):0,
        status:calcStatus(totalFunded, ms.length, r.expMonthly, isMax), daysNext:"—",
      };
    }
    const mo=r.mos.find(m=>m.month===period)||{};
    const moFunded=mo.fundedAmt||0;
    return {
      funded:moFunded, pts:PTS_KEY[period]!=null?r[PTS_KEY[period]]:null,
      apps:mo.sent||0, units:mo.funded||0, mtg:mo.meetingPct||0,
      status:calcStatus(moFunded, 1, r.expMonthly, isMax), daysNext:"—",
    };
  };

  const TIER_ORDER=[0,1,2,5,6,7];
  const {bm} = React.useContext(BenchmarksCtx);
  const nextTierName=(tier)=>{
    const idx=TIER_ORDER.indexOf(tier);
    if(idx===-1||idx===TIER_ORDER.length-1) return "MAX";
    return bm.find(b=>b.tier===TIER_ORDER[idx+1])?.pos||"—";
  };

  // Performance-based position: highest benchmark tier where rep meets BOTH
  // avg monthly units AND avg monthly funded $ thresholds for the selected period.
  const calcPerfPos=(r)=>{
    const pd=getPd(r);
    const numMos = period==="all" ? r.mos.length
      : period==="2025" ? MOS_2025.filter(mo=>r.mos.find(m=>m.month===mo)).length
      : 1;
    const avgUnits  = numMos>0 ? pd.units  / numMos : 0;
    const avgFunded = numMos>0 ? pd.funded / numMos : 0;
    const sorted=[...bm].sort((a,b)=>b.tier-a.tier);
    for(const b of sorted){
      if(avgUnits>=b.units && avgFunded>=b.monthly) return b;
    }
    return bm[0]||BENCHMARKS_DEFAULT[0];
  };

  // Color map for perf pos tiers
  const PERF_COLORS={
    "Team Leader":"#22d3ee",
    "OCTA-Level":"#818cf8",
    "Up & Comer":"#a78bfa",
    "Intermediate":"#fbbf24",
    "Entry-level":"#fb923c",
    "New, ramping up":"#9db4c8",
  };

  const getCols=()=>{
    const tierCols=[
      {key:"tiersCol",  label:"TIERS"},
      {key:"meetingCol",label:"MEETING"},
    ];
    if(period==="all") return [
      {key:"expand",label:""},
      {key:"name",label:"REP"},{key:"start",label:"START DATE"},{key:"position",label:"POSITION"},{key:"perfPos",label:"PERF POSITION"},{key:"status",label:"STATUS"},
      {key:"pts",label:"FEB PTS"},{key:"trend",label:"TREND"},{key:"rev",label:"REV %"},
      {key:"funded",label:"5-MO FUNDED"},{key:"febFunded",label:"FEB FUNDED"},
      ...tierCols,
      {key:"mtg",label:"AVG MTG %"},{key:"contact",label:"CONTACT %"},
    ];
    const isYr=period==="2025";
    return [
      {key:"expand",label:""},
      {key:"name",label:"REP"},{key:"start",label:"START DATE"},{key:"position",label:"POSITION"},{key:"perfPos",label:"PERF POSITION"},{key:"status",label:"STATUS"},
      {key:"pts",label:isYr?"TOTAL PTS":"PTS"},{key:"apps",label:"APPS SENT"},{key:"units",label:"UNITS"},
      {key:"funded",label:isYr?"TOTAL FUNDED":"FUNDED $"},
      ...tierCols,
      {key:"mtg",label:"MTG %"},{key:"contact",label:"CONTACT %"},
    ];
  };

  const handleSort=(col)=>setSortCol(prev=>prev.col===col?{col,dir:prev.dir==="desc"?"asc":"desc"}:{col,dir:"desc"});
  const sortChar=(col)=>sortCol.col===col?(sortCol.dir==="desc"?" ▼":" ▲"):" ↕";

  const filtered=useMemo(()=>{
    let d=filt==="all"?active:active.filter(r=>r.group===filt);
    if(statusFilt!=="all") d=d.filter(r=>getPd(r).status===statusFilt);
    return [...d].sort((a,b)=>{
      const pa=getPd(a),pb=getPd(b);
      const m=sortCol.dir==="asc"?1:-1;
      switch(sortCol.col){
        case "name": return m*a.name.localeCompare(b.name);
        case "start": return m*(new Date(a.start)-new Date(b.start));
        case "position": return m*(a.group||"").localeCompare(b.group||"");
        case "perfPos": return m*(calcPerfPos(b).tier-calcPerfPos(a).tier);
        case "status":{const ua=STATUS_CFG[pa.status]?.urgency??1,ub=STATUS_CFG[pb.status]?.urgency??1;return m*(ub-ua);}
        case "pts": return m*((pb.pts||0)-(pa.pts||0));
        case "trend":{const tv={"↑":1,"→":0,"↓":-1,"—":-2};return m*((tv[pb.trend]||0)-(tv[pa.trend]||0));}
        case "rev": return m*((b.revProg||0)-(a.revProg||0));
        case "funded": return m*((pb.funded||0)-(pa.funded||0));
        case "febFunded": return m*((pb.febFunded||0)-(pa.febFunded||0));
        case "apps": return m*((pb.apps||0)-(pa.apps||0));
        case "units": return m*((pb.units||0)-(pa.units||0));
        case "mtg": return m*((pb.mtg||0)-(pa.mtg||0));
        case "days":{const da=calcDaysToNextTier(a)??9999,db=calcDaysToNextTier(b)??9999;return m*(da-db);}
        case "nextTier": return m*nextTierName(a.tier).localeCompare(nextTierName(b.tier));
        case "contact": return m*((b.raw?.calls?.contactPct||0)-(a.raw?.calls?.contactPct||0));
        case "urgency":
        default: return (STATUS_CFG[getPd(b).status]?.urgency??1)-(STATUS_CFG[getPd(a).status]?.urgency??1);
      }
    });
  },[sortCol,filt,period,statusFilt]);

  const renderCell=(r,col)=>{
    const pd=getPd(r);
    const gc=POS_GROUPS.find(p=>p.key===r.group);
    const tc=gc?gc.color:"#94a3b8";
    switch(col.key){
      case "name": {
        const m=meetings[r.name]||{};
        const today=new Date().toISOString().slice(0,10);
        const isOverdue=m.scheduledDate&&m.scheduledDate<today&&!meetingMode;
        return <td key="name" style={{padding:"9px 10px",whiteSpace:"nowrap",position:"sticky",left:0,zIndex:1,background:"inherit"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            {isOverdue&&<span title="Meeting overdue" style={{color:"#f87171",fontSize:16,lineHeight:1}}>⚠</span>}
            <span style={{color:"#f1f5f9",fontWeight:500}}>{maskName(r.name)}</span>
          </div>
        </td>;
      }
      case "start": return <td key="start" style={{padding:"9px 10px",whiteSpace:"nowrap",color:"#7ec8e3",fontSize:13}}>{r.start}</td>;
      case "position":{
        const gc=POS_GROUPS.find(p=>p.key===r.group);
        const tc=gc?gc.color:"#94a3b8";
        return <td key="pos" style={{padding:"9px 10px",whiteSpace:"nowrap"}}>
          <span style={{background:`${tc}22`,color:tc,padding:"3px 10px",borderRadius:10,fontSize:14,fontWeight:700}}>{r.group}</span>
        </td>;
      }
      case "perfPos":{
        const pp=calcPerfPos(r);
        const pc=PERF_COLORS[pp.pos]||"#9db4c8";
        const gc=POS_GROUPS.find(p=>p.key===r.group);
        const tc=gc?gc.color:"#94a3b8";
        const actualTier=r.tier;
        const perfTier=pp.tier;
        const delta=perfTier-actualTier;
        const deltaLabel=delta>0?`▲ ${delta} tier${delta>1?"s":""} above`:delta<0?`▼ ${Math.abs(delta)} tier${Math.abs(delta)>1?"s":""} below`:`= matches`;
        const deltaColor=delta>0?"#34d399":delta<0?"#f87171":"#fbbf24";
        return <td key="perfPos" style={{padding:"9px 10px",whiteSpace:"nowrap"}}>
          <span style={{background:`${pc}22`,color:pc,padding:"3px 10px",borderRadius:10,fontSize:14,fontWeight:700}}>{pp.pos}</span>
          <div style={{color:deltaColor,fontSize:12,marginTop:3,fontWeight:700}}>{deltaLabel}</div>
        </td>;
      }
      case "status": return <td key="stat" style={{padding:"9px 10px"}}><StatusBadge status={pd.status} compact={period!=="all"}/></td>;
      case "tenureTier":{
        const tt=calcTenureTier(r);
        const c=TIER_COLORS[tt.tier]||"#9db4c8";
        return (
          <td key="tt" style={{padding:"9px 10px",whiteSpace:"nowrap",minWidth:80}}>
            <div style={{color:c,fontFamily:"'Bebas Neue',sans-serif",fontSize:32,letterSpacing:1,lineHeight:1}}>T{tt.tier}</div>
            <div style={{color:"#4a7fa8",fontSize:12,marginTop:2}}>{tt.pos}</div>
          </td>
        );
      }
      case "perfTier":{
        const pt=calcPerfTier(r,bm);
        const c=TIER_COLORS[pt.tier]||"#9db4c8";
        return (
          <td key="pt" style={{padding:"9px 10px",whiteSpace:"nowrap",minWidth:80}}>
            <div style={{color:c,fontFamily:"'Bebas Neue',sans-serif",fontSize:32,letterSpacing:1,lineHeight:1}}>T{pt.tier}</div>
            <div style={{color:"#4a7fa8",fontSize:12,marginTop:2}}>{pt.pos}</div>
          </td>
        );
      }
      case "nextTier":{
        const tt=calcTenureTier(r,bm);
        const idx=TIER_ORDER_ARR.indexOf(tt.tier);
        if(idx===-1||idx===TIER_ORDER_ARR.length-1){
          return <td key="nt" style={{padding:"9px 10px",color:"#4ade80",fontWeight:700,fontSize:15}}>MAX</td>;
        }
        const nextNum=TIER_ORDER_ARR[idx+1];
        const nextBench=bm.find(b=>b.tier===nextNum);
        const c=TIER_COLORS[nextNum]||"#9db4c8";
        return (
          <td key="nt" style={{padding:"9px 10px",whiteSpace:"nowrap",minWidth:80}}>
            <div style={{color:c,fontFamily:"'Bebas Neue',sans-serif",fontSize:32,letterSpacing:1,lineHeight:1}}>T{nextNum}</div>
            <div style={{color:"#4a7fa8",fontSize:12,marginTop:2}}>{nextBench?.pos||"—"}</div>
          </td>
        );
      }
      case "daysToTier":{
        const d=calcDaysToNextTier(r,bm);
        if(d===null) return <td key="dtt" style={{padding:"9px 10px",color:"#4ade80",fontWeight:700}}>MAX</td>;
        const overdue=d<0;
        const urgent=!overdue&&d<=14;
        const warning=!overdue&&d<=30;
        const dc=overdue?"#f87171":urgent?"#fcd34d":warning?"#fb923c":"#a8c4d8";
        return (
          <td key="dtt" style={{padding:"9px 10px",whiteSpace:"nowrap",minWidth:90}}>
            <div style={{color:dc,fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:1}}>{overdue?"-":""}{Math.abs(d)}d</div>
            <div style={{color:"#4a7fa8",fontSize:12,marginTop:1}}>{overdue?"OVERDUE":urgent?"URGENT":warning?"SOON":"to next tier"}</div>
          </td>
        );
      }
      case "daysToMtg":{
        const m=meetings[r.name]||{};
        if(!m.scheduledDate) return <td key="dtm" style={{padding:"9px 10px",color:"#2a4a6a",fontSize:14,fontStyle:"italic"}}>none set</td>;
        const today=new Date(); today.setHours(0,0,0,0);
        const sched=new Date(m.scheduledDate+"T12:00:00");
        const diff=Math.round((sched-today)/86400000);
        const overdue=diff<0;
        const urgent=!overdue&&diff<=3;
        const soon=!overdue&&diff<=7;
        const dc=overdue?"#f87171":urgent?"#fcd34d":soon?"#fb923c":"#22d3ee";
        return (
          <td key="dtm" style={{padding:"9px 10px",whiteSpace:"nowrap",minWidth:90}}>
            <div style={{color:dc,fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:1}}>{overdue?"-":""}{Math.abs(diff)}d</div>
            <div style={{color:"#4a7fa8",fontSize:12,marginTop:1}}>{overdue?"PAST DUE":urgent?"THIS WEEK":soon?"UPCOMING":"scheduled"}</div>
          </td>
        );
      }
      case "meetingInfo":{
        const m=meetings[r.name]||{};
        const hasMet=!!m.metDate;
        const hasSched=!!m.scheduledDate;
        const hasAny=hasMet||hasSched||!!m.prevMetDate;
        const isEditing=editSched===r.name;
        const isConfirming=confirmClear===r.name;
        const fmtDate=(s)=>{if(!s)return"";const d=new Date(s+"T12:00:00");return d.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"});};
        const today=new Date().toISOString().slice(0,10);
        const schedOverdue=hasSched&&m.scheduledDate<today;
        const doClear=(e)=>{e.stopPropagation();saveMeeting(r.name,{});setEditSched(null);setConfirmClear(null);};
        return (
          <td key="mi" style={{padding:"8px 10px",minWidth:180}}>

            {/* Met row + X */}
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
              <button
                onClick={e=>{e.stopPropagation();toggleMet(r.name,r);}}
                style={{background:hasMet?"#052e16":"#0a1f35",border:`1px solid ${hasMet?"#166534":"#1a3550"}`,borderRadius:4,padding:"3px 10px",cursor:"pointer",color:hasMet?"#4ade80":"#4a7fa8",fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}
              >
                {hasMet?"✓ Met":"○ Not met"}
              </button>
              {hasMet&&<span style={{color:"#4a7fa8",fontSize:12,flex:1}}>{fmtDate(m.metDate)}</span>}
              {/* X clear button */}
              {hasAny&&!isConfirming&&(
                <button
                  onClick={e=>{e.stopPropagation();setConfirmClear(r.name);}}
                  style={{background:"#1a0505",border:"1px solid #f87171",borderRadius:3,cursor:"pointer",color:"#f87171",fontSize:13,padding:"1px 6px",lineHeight:1,marginLeft:"auto"}}
                  onMouseEnter={e=>{e.currentTarget.style.color="#f87171";e.currentTarget.style.borderColor="#f87171";}}
                  onMouseLeave={e=>{e.currentTarget.style.color="#4a2020";e.currentTarget.style.borderColor="#3a1515";}}
                  title="Clear all meeting data"
                >✕</button>
              )}
              {/* Inline confirm */}
              {isConfirming&&(
                <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:"auto"}} onClick={e=>e.stopPropagation()}>
                  <span style={{color:"#f87171",fontSize:12,whiteSpace:"nowrap"}}>Clear all?</span>
                  <button onClick={doClear} style={{background:"#3b0a0a",border:"1px solid #991b1b",borderRadius:3,padding:"1px 7px",color:"#f87171",fontSize:12,cursor:"pointer",fontWeight:700}}>Yes</button>
                  <button onClick={e=>{e.stopPropagation();setConfirmClear(null);}} style={{background:"#0a1f35",border:"1px solid #1a3550",borderRadius:3,padding:"1px 7px",color:"#4a7fa8",fontSize:12,cursor:"pointer"}}>No</button>
                </div>
              )}
            </div>

            {/* Schedule row */}
            {isEditing ? (
              <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-start"}} onClick={e=>e.stopPropagation()}>
                <select
                  onChange={e=>{if(e.target.value){const qd=QUICK_DATES.find(q=>q.label===e.target.value);if(qd)setSchedInput(qd.fn());}e.target.value="";}}
                  defaultValue=""
                  style={{background:"#0a1525",border:"1px solid #22d3ee88",borderRadius:3,padding:"2px 4px",color:"#7ec8e3",fontSize:12,cursor:"pointer",width:"100%",outline:"none",colorScheme:"dark"}}
                >
                  <option value="" disabled>Quick select…</option>
                  {QUICK_DATES.map(q=><option key={q.label} value={q.label}>{q.label}</option>)}
                </select>
                <div style={{display:"flex",gap:4,alignItems:"center",width:"100%"}}>
                  <input
                    type="date"
                    value={schedInput}
                    onChange={e=>setSchedInput(e.target.value)}
                    autoFocus
                    style={{background:"#0a1525",border:"1px solid #22d3ee",borderRadius:3,padding:"2px 6px",color:"#e2e8f0",fontSize:13,outline:"none",flex:1,colorScheme:"dark"}}
                  />
                  <button onClick={()=>{saveSchedDate(r.name,schedInput);setPendingMeetSched(null);}} style={{background:"#052e16",border:"1px solid #166534",borderRadius:3,padding:"2px 7px",color:"#4ade80",fontSize:13,cursor:"pointer"}}>✓</button>
                  <button onClick={()=>{setEditSched(null);setPendingMeetSched(null);}} style={{background:"#1a0505",border:"1px solid #7f1d1d",borderRadius:3,padding:"2px 7px",color:"#f87171",fontSize:13,cursor:"pointer"}}>✕</button>
                </div>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {hasSched&&(
                  <a
                    href={gcalUrl(r.name, m.scheduledDate)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Add to Google Calendar"
                    onClick={e=>e.stopPropagation()}
                    style={{display:"flex",alignItems:"center",justifyContent:"center",background:"#0a1f35",border:"1px solid #1e4a6e",borderRadius:3,padding:"3px 5px",color:"#7ec8e3",textDecoration:"none",lineHeight:1,flexShrink:0}}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7ec8e3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  </a>
                )}
                <div onClick={e=>{e.stopPropagation();setEditSched(r.name);setSchedInput(m.scheduledDate||new Date().toISOString().slice(0,10));}} style={{cursor:"pointer"}}>
                  {hasSched?(
                    <span style={{color:schedOverdue?"#f87171":"#22d3ee",fontSize:20,fontWeight:700,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}}>
                      {schedOverdue?"⚠ ":""}{fmtDate(m.scheduledDate)}
                    </span>
                  ):(
                    <span style={{color:"#2a4a6a",fontSize:14,fontStyle:"italic"}}>+ schedule meeting</span>
                  )}
                </div>
              </div>
            )}
          </td>
        );
      }
      case "pts": return <td key="pts" style={{padding:"9px 10px",fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:pd.pts!==null?(pd.pts>=0?"#f1f5f9":"#f87171"):"#2a4a6a"}}>{pd.pts!==null?pd.pts:"—"}</td>;
      case "trend":{const tC=pd.trend==="↑"?"#34d399":pd.trend==="↓"?"#f87171":"#9db4c8";const sym=pd.trend==="↑"?"▲":pd.trend==="↓"?"▼":pd.trend||"—";return <td key="trend" style={{padding:"9px 10px",color:tC,fontWeight:900,fontSize:26,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1,textShadow:`0 0 8px ${tC}88`}}>{sym}</td>;}
      case "rev": return <td key="rev" style={{padding:"9px 10px"}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:48,height:5,background:"#1a3d5c",borderRadius:2}}><div style={{width:`${Math.min(100,r.revProg||0)}%`,height:"100%",background:(r.revProg||0)>=100?"#34d399":(r.revProg||0)>=50?"#fbbf24":"#f87171",borderRadius:2}}/></div><span style={{color:(r.revProg||0)>=100?"#34d399":(r.revProg||0)>=50?"#fbbf24":"#f87171",fontSize:14,minWidth:36}}>{r.revProg||0}%</span></div></td>;
      case "funded": {
        const goal=goals[r.name]?.monthly;
        const pct=goal?Math.min(100,Math.round((pd.funded/goal)*100)):null;
        return <td key="fund" style={{padding:"9px 10px"}}>
          <div style={{color:pd.funded>1e6?"#34d399":pd.funded>200000?"#22d3ee":pd.funded>0?"#a8c4d8":"#2a4a6a"}}>{fmt$(pd.funded)}</div>
          {goal&&<div style={{marginTop:4}}>
            <div style={{height:3,background:"#0a1f35",borderRadius:2,width:60}}><div style={{width:`${pct}%`,height:"100%",background:pct>=100?"#4ade80":pct>=75?"#22d3ee":pct>=50?"#fbbf24":"#f87171",borderRadius:2,transition:"width .3s"}}/></div>
            <div style={{color:pct>=100?"#4ade80":pct>=75?"#22d3ee":"#4a7fa8",fontSize:12,marginTop:1}}>{pct}% of {fmt$(goal)}</div>
          </div>}
        </td>;
      }
      case "febFunded": {
        const goal=goals[r.name]?.monthly;
        const val=pd.febFunded||0;
        const pct=goal?Math.min(100,Math.round((val/goal)*100)):null;
        return <td key="ffund" style={{padding:"9px 10px"}}>
          <div style={{color:val>500000?"#34d399":val>100000?"#22d3ee":val>0?"#818cf8":"#2a4a6a"}}>{fmt$(val)}</div>
          {goal&&<div style={{marginTop:4}}>
            <div style={{height:3,background:"#0a1f35",borderRadius:2,width:60}}><div style={{width:`${pct}%`,height:"100%",background:pct>=100?"#4ade80":pct>=75?"#22d3ee":pct>=50?"#fbbf24":"#f87171",borderRadius:2,transition:"width .3s"}}/></div>
            <div style={{color:pct>=100?"#4ade80":pct>=75?"#22d3ee":"#4a7fa8",fontSize:12,marginTop:1}}>{pct}% of goal</div>
          </div>}
        </td>;
      }
      case "apps": return <td key="apps" style={{padding:"9px 10px",color:pd.apps>0?"#a8c4d8":"#2a4a6a"}}>{pd.apps||"—"}</td>;
      case "units": return <td key="units" style={{padding:"9px 10px",color:pd.units>0?"#22d3ee":"#2a4a6a"}}>{pd.units||"—"}</td>;
      case "mtg": return <td key="mtg" style={{padding:"9px 10px",color:pd.mtg>=70?"#34d399":pd.mtg>=40?"#fbbf24":pd.mtg>0?"#fb923c":"#a8c4d8",fontSize:13}}>{pd.mtg>0?`${pd.mtg}%`:"—"}</td>;
      case "contact": return <td key="con" style={{padding:"9px 10px",color:(r.raw?.calls?.contactPct||0)>=20?"#34d399":(r.raw?.calls?.contactPct||0)>=10?"#fbbf24":(r.raw?.calls?.contactPct||0)>0?"#fb923c":"#a8c4d8",fontSize:13}}>{r.raw?.calls?.dials>0?`${r.raw.calls.contactPct}%`:"—"}</td>;
      case "prevMeeting":{
        const m=meetings[r.name]||{};
        const prev=m.prevMetDate||null;
        const fmtDate=(s)=>{if(!s)return null;const d=new Date(s+"T12:00:00");return d.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"});};
        if(!prev) return <td key="pm" style={{padding:"9px 10px",color:"#2a4a6a",fontSize:14,fontStyle:"italic"}}>none</td>;
        const today=new Date();
        const prevD=new Date(prev+"T12:00:00");
        const daysAgo=Math.round((today-prevD)/86400000);
        return (
          <td key="pm" style={{padding:"9px 10px",whiteSpace:"nowrap"}}>
            <div style={{color:"#7ec8e3",fontSize:16,fontWeight:700}}>{fmtDate(prev)}</div>
            <div style={{color:"#4a7fa8",fontSize:12,marginTop:2}}>{daysAgo}d ago</div>
          </td>
        );
      }
      case "expand":
        return <td key="exp" style={{padding:"4px 6px",width:28}} onClick={e=>e.stopPropagation()}>
          <button
            onClick={e=>{e.stopPropagation();setExpandedRep(prev=>prev===r.name?null:r.name);}}
            style={{background:"none",border:"none",cursor:"pointer",color:expandedRep===r.name?"#22d3ee":"#2a4a6a",fontSize:18,lineHeight:1,padding:"2px 4px",borderRadius:3,transition:"color .15s"}}
            title="Quick preview"
          >{expandedRep===r.name?"▲":"▼"}</button>
        </td>;
      case "tiersCol":{
        const tt=calcTenureTier(r);
        const pt=calcPerfTier(r,bm);
        const tc=TIER_COLORS[tt.tier]||"#9db4c8";
        const pc=TIER_COLORS[pt.tier]||"#9db4c8";
        const idx=TIER_ORDER_ARR.indexOf(tt.tier);
        const isMax=idx===-1||idx===TIER_ORDER_ARR.length-1;
        const nextNum=isMax?null:TIER_ORDER_ARR[idx+1];
        const nc=nextNum!=null?(TIER_COLORS[nextNum]||"#9db4c8"):"#4ade80";
        const d=calcDaysToNextTier(r,bm);
        const overdue=d!==null&&d<0;
        const urgent=!overdue&&d!==null&&d<=14;
        const warn=!overdue&&d!==null&&d<=30;
        const dc=d===null?"#4ade80":overdue?"#f87171":urgent?"#fcd34d":warn?"#fb923c":"#a8c4d8";
        const cell=(label,val,color,sub)=>(
          <div style={{textAlign:"center",minWidth:36}}>
            <div style={{color:"#4a7fa8",fontSize:10,letterSpacing:.8,marginBottom:1}}>{label}</div>
            <div style={{color:color,fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:1,lineHeight:1}}>{val}</div>
            {sub&&<div style={{color:"#4a7fa8",fontSize:10,marginTop:1}}>{sub}</div>}
          </div>
        );
        return (
          <td key="tiers" style={{padding:"6px 10px",whiteSpace:"nowrap",minWidth:150}}>
            {/* Row 1: TEN · PERF */}
            <div style={{display:"flex",alignItems:"flex-end",gap:8,marginBottom:5}}>
              {cell("TEN",`T${tt.tier}`,tc)}
              <div style={{color:"#1a3550",fontSize:14,paddingBottom:2}}>·</div>
              {cell("PERF",`T${pt.tier}`,pc)}
            </div>
            {/* Row 2: NEXT → DAYS */}
            <div style={{display:"flex",alignItems:"flex-end",gap:6,borderTop:"1px solid #0f2030",paddingTop:4}}>
              {isMax
                ? <div style={{color:"#4ade80",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1}}>MAX</div>
                : <>
                    {cell("NEXT",`T${nextNum}`,nc)}
                    <div style={{color:"#1a3550",fontSize:14,paddingBottom:2}}>→</div>
                    {cell("DAYS",d===null?"MAX":overdue?`-${Math.abs(d)}d`:`${d}d`,dc,overdue?"OVERDUE":urgent?"URGENT":warn?"SOON":"to tier")}
                  </>
              }
            </div>
          </td>
        );
      }
      case "meetingCol":{
        const m=meetings[r.name]||{};
        const hasMet=!!m.metDate;
        const hasSched=!!m.scheduledDate;
        const hasAny=hasMet||hasSched||!!m.prevMetDate;
        const isEditing=editSched===r.name;
        const isConfirming=confirmClear===r.name;
        const fmtD=(s)=>{if(!s)return"";const d=new Date(s+"T12:00:00");return d.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"});};
        const today=new Date().toISOString().slice(0,10);
        const schedOverdue=hasSched&&m.scheduledDate<today;
        let diff=null;
        if(hasSched){const t=new Date();t.setHours(0,0,0,0);const s=new Date(m.scheduledDate+"T12:00:00");diff=Math.round((s-t)/86400000);}
        const doClear=(e)=>{e.stopPropagation();saveMeeting(r.name,{});setEditSched(null);setConfirmClear(null);};
        const prev=m.prevMetDate||null;
        const prevDaysAgo=prev?Math.round((new Date()-new Date(prev+"T12:00:00"))/86400000):null;
        return (
          <td key="mtgcol" style={{padding:"6px 10px",minWidth:220}} onClick={e=>e.stopPropagation()}>
            {/* Row 1: Met toggle (left) + Prev meeting (right) */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:5}}>
              <button onClick={e=>{e.stopPropagation();toggleMet(r.name,r);}}
                style={{background:hasMet?"#052e16":"#0a1f35",border:`1px solid ${hasMet?"#166534":"#1a3550"}`,borderRadius:4,padding:"3px 8px",cursor:"pointer",color:hasMet?"#4ade80":"#4a7fa8",fontSize:12,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>
                {hasMet?"✓ Met":"○ Not met"}
              </button>
              {prev
                ? <div style={{textAlign:"right"}}>
                    <div style={{color:"#2a4a6a",fontSize:11,lineHeight:1.2}}>Prev: <span style={{color:"#4a7fa8"}}>{fmtD(prev)}</span></div>
                    <div style={{color:"#1a3040",fontSize:10}}>{prevDaysAgo}d ago</div>
                  </div>
                : <div style={{color:"#1a3040",fontSize:11,fontStyle:"italic"}}>no prev</div>
              }
            </div>
            {/* Row 2: Schedule area */}
            <div style={{borderTop:"1px solid #0f2030",paddingTop:4}}>
              {isEditing?(
                <div onClick={e=>e.stopPropagation()}>
                  <select onChange={e=>{if(e.target.value){const qd=QUICK_DATES.find(q=>q.label===e.target.value);if(qd)setSchedInput(qd.fn());}e.target.value="";}} defaultValue=""
                    style={{background:"#0a1525",border:"1px solid #22d3ee88",borderRadius:3,padding:"2px 4px",color:"#7ec8e3",fontSize:12,cursor:"pointer",width:"100%",outline:"none",colorScheme:"dark",marginBottom:3}}>
                    <option value="" disabled>Quick select…</option>
                    {QUICK_DATES.map(q=><option key={q.label} value={q.label}>{q.label}</option>)}
                  </select>
                  <div style={{display:"flex",gap:3}}>
                    <input type="date" value={schedInput} onChange={e=>setSchedInput(e.target.value)} autoFocus
                      style={{background:"#0a1525",border:"1px solid #22d3ee",borderRadius:3,padding:"2px 5px",color:"#e2e8f0",fontSize:12,outline:"none",flex:1,colorScheme:"dark"}}/>
                    <button onClick={()=>{saveSchedDate(r.name,schedInput);setPendingMeetSched(null);}} style={{background:"#052e16",border:"1px solid #166534",borderRadius:3,padding:"2px 6px",color:"#4ade80",fontSize:12,cursor:"pointer"}}>✓</button>
                    <button onClick={()=>{setEditSched(null);setPendingMeetSched(null);}} style={{background:"#1a0505",border:"1px solid #7f1d1d",borderRadius:3,padding:"2px 6px",color:"#f87171",fontSize:12,cursor:"pointer"}}>✕</button>
                  </div>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  {/* Calendar icon (only when scheduled) */}
                  {hasSched&&<a href={gcalUrl(r.name,m.scheduledDate)} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                    style={{display:"flex",alignItems:"center",background:"#0a1f35",border:"1px solid #1e4a6e",borderRadius:3,padding:"2px 4px",color:"#7ec8e3",textDecoration:"none",flexShrink:0}}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7ec8e3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </a>}
                  {/* Date / schedule link */}
                  <div onClick={e=>{e.stopPropagation();setEditSched(r.name);setSchedInput(m.scheduledDate||today);}} style={{cursor:"pointer",flex:1}}>
                    {hasSched?(
                      <span style={{color:schedOverdue?"#f87171":"#22d3ee",fontSize:15,fontWeight:700,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:.5}}>
                        {schedOverdue?"⚠ ":""}{fmtD(m.scheduledDate)}
                      </span>
                    ):(
                      <span style={{color:"#2a4a6a",fontSize:12,fontStyle:"italic"}}>+ schedule</span>
                    )}
                  </div>
                  {/* Days countdown */}
                  {diff!==null&&(
                    <span style={{color:diff<0?"#f87171":diff<=3?"#fcd34d":"#4a7fa8",fontSize:11,whiteSpace:"nowrap"}}>
                      {diff<0?`${Math.abs(diff)}d past`:diff===0?"today":`${diff}d`}
                    </span>
                  )}
                  {/* Clear X */}
                  {hasAny&&!isConfirming&&(
                    <button onClick={e=>{e.stopPropagation();setConfirmClear(r.name);}}
                      style={{background:"none",border:"none",cursor:"pointer",color:"#2a1515",fontSize:13,padding:"0 2px",lineHeight:1,flexShrink:0}} title="Clear">✕</button>
                  )}
                  {isConfirming&&(
                    <div style={{display:"flex",gap:3,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
                      <span style={{color:"#f87171",fontSize:10}}>Clear?</span>
                      <button onClick={doClear} style={{background:"#3b0a0a",border:"1px solid #991b1b",borderRadius:3,padding:"1px 5px",color:"#f87171",fontSize:11,cursor:"pointer"}}>Y</button>
                      <button onClick={e=>{e.stopPropagation();setConfirmClear(null);}} style={{background:"#0a1f35",border:"1px solid #1a3550",borderRadius:3,padding:"1px 5px",color:"#4a7fa8",fontSize:11,cursor:"pointer"}}>N</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </td>
        );
      }
      default: return <td key={col.key} style={{padding:"9px 10px",color:"#2a4a6a"}}>—</td>;
    }
  };

  const MOS25_OPTS=[{id:"Oct",label:"October"},{id:"Nov",label:"November"},{id:"Dec",label:"December"}];
  const FLAT_TABS=[{id:"2025",label:"2025 YTD",c:"#a78bfa"},{id:"all",label:"ALL TIME",c:"#22d3ee"}];
  const periodLabel=period==="all"?"ALL TIME":period==="2025"?"2025 YTD":MOS25_OPTS.find(m=>m.id===period)?.label||period;
  const is25Mo=MOS25_OPTS.some(m=>m.id===period);
  const cols=getCols();

  const tabBtn=(active,color,onClick,children)=>(
    <button onClick={onClick} style={{background:active?`${color}22`:"#0a1525",border:`1px solid ${active?color:"#1a3550"}`,borderRadius:4,padding:"5px 14px",color:active?color:"#4a7fa8",fontSize:16,letterSpacing:.8,cursor:"pointer",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap",fontWeight:active?700:400}}>{children}</button>
  );

  return (
    <div onClick={()=>{if(open25)setOpen25(false);}}>
      {/* Period selector */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        {/* 2025 months dropdown */}
        <div style={{position:"relative"}}>
          {tabBtn(is25Mo,"#a78bfa",e=>{e.stopPropagation();setOpen25(!open25);},<span>2025 {is25Mo?`· ${periodLabel}`:""} {open25?"▲":"▼"}</span>)}
          {open25&&<div style={{position:"absolute",top:"calc(100% + 4px)",left:0,background:"#0d1e32",border:"1px solid #1e3a5f",borderRadius:6,zIndex:99,minWidth:140,boxShadow:"0 4px 16px rgba(0,0,0,.5)"}}>
            {MOS25_OPTS.map(m=><div key={m.id} onClick={e=>{e.stopPropagation();setPeriod(m.id);setOpen25(false);}} style={{padding:"8px 14px",color:period===m.id?"#a78bfa":"#a8c4d8",background:period===m.id?"#0a1f35":"transparent",cursor:"pointer",fontSize:16,letterSpacing:.8,fontFamily:"'DM Mono',monospace"}}>{m.label}</div>)}
          </div>}
        </div>
        {/* Flat tabs: 2025 YTD, All Time */}
        <div style={{width:1,height:20,background:"#1a3550",margin:"0 4px"}}/>
        {FLAT_TABS.map(t=>tabBtn(period===t.id,t.c,()=>{setPeriod(t.id);setOpen25(false);},t.label))}
        {/* Active status filter pill */}
        {statusFilt!=="all"&&(
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,background:"#0d1e32",border:"1px solid #1e3a5f",borderRadius:20,padding:"4px 10px"}}>
            <span style={{color:"#7ec8e3",fontSize:14,letterSpacing:1}}>FILTER:</span>
            <span style={{color:STATUS_CFG[statusFilt]?.text||"#22d3ee",fontSize:14,fontWeight:700,letterSpacing:.5}}>{STATUS_CFG[statusFilt]?.label||statusFilt}</span>
            <button onClick={()=>setStatusFilt("all")} style={{background:"none",border:"none",color:"#4a7fa8",cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#4a7fa8"}>✕</button>
          </div>
        )}
      </div>
      {/* Group filter + product filter + column customizer */}
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        {["all",...POS_GROUPS.map(g=>g.key)].map(k=>{
          const gc=POS_GROUPS.find(g=>g.key===k);
          const on=filt===k;
          return <button key={k} onClick={e=>{e.stopPropagation();setFilt(k);}} style={{background:on?(gc?.color||"#22d3ee")+"22":"#0f2438",border:`1px solid ${on?(gc?.color||"#22d3ee"):"#1a3550"}`,color:on?(gc?.color||"#22d3ee"):"#a8c4d8",borderRadius:4,padding:"4px 12px",fontSize:16,letterSpacing:.5,cursor:"pointer"}}>{k==="all"?"ALL":k.toUpperCase()}</button>;
        })}
        <div style={{marginLeft:"auto",position:"relative"}}>
          <button onClick={()=>setShowColMenu(p=>!p)} title="Customize columns" style={{background:showColMenu?"#22d3ee22":"#0a1f35",border:`1px solid ${showColMenu?"#22d3ee":"#1a3550"}`,borderRadius:4,padding:"4px 10px",color:showColMenu?"#22d3ee":"#4a7fa8",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",gap:5}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            COLUMNS {hiddenCols.size>0&&<span style={{background:"#22d3ee",color:"#06111f",borderRadius:8,padding:"0 5px",fontSize:13,fontWeight:700}}>{hiddenCols.size}</span>}
          </button>
          {showColMenu&&(
            <div style={{position:"absolute",right:0,top:"calc(100% + 4px)",background:"#0d1e32",border:"1px solid #1e3a5f",borderRadius:6,zIndex:99,minWidth:200,boxShadow:"0 4px 16px rgba(0,0,0,.5)",padding:"8px 0"}} onClick={e=>e.stopPropagation()}>
              <div style={{padding:"4px 12px 8px",color:"#4a7fa8",fontSize:13,letterSpacing:1,borderBottom:"1px solid #1a3550",marginBottom:4}}>TOGGLE COLUMNS</div>
              {cols.map(c=>{
                if(c.key==="name") return null;
                const hidden=hiddenCols.has(c.key);
                return (
                  <div key={c.key} onClick={()=>setHiddenCols(prev=>{const n=new Set(prev);hidden?n.delete(c.key):n.add(c.key);return n;})} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",cursor:"pointer",background:hidden?"transparent":"#0a1f3511"}} onMouseEnter={e=>e.currentTarget.style.background="#0f2438"} onMouseLeave={e=>e.currentTarget.style.background=hidden?"transparent":"#0a1f3511"}>
                    <div style={{width:14,height:14,border:`1px solid ${hidden?"#1a3550":"#22d3ee"}`,borderRadius:3,background:hidden?"transparent":"#22d3ee22",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {!hidden&&<span style={{color:"#22d3ee",fontSize:13,lineHeight:1}}>✓</span>}
                    </div>
                    <span style={{color:hidden?"#4a7fa8":"#e2e8f0",fontSize:15}}>{c.label}</span>
                  </div>
                );
              })}
              {hiddenCols.size>0&&<div onClick={()=>setHiddenCols(new Set())} style={{margin:"8px 12px 4px",padding:"5px",background:"#0a1f35",border:"1px solid #1a3550",borderRadius:4,color:"#7ec8e3",fontSize:14,cursor:"pointer",textAlign:"center"}}>Reset all</div>}
            </div>
          )}
        </div>
      </div>
      {/* Table */}
      <div style={{overflowX:"auto"}} onClick={()=>showColMenu&&setShowColMenu(false)}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:800}}>
          <thead>
            <tr style={{borderBottom:"2px solid #1a3550",background:"#06111f"}}>
              {cols.filter(c=>!hiddenCols.has(c.key)).map(col=>(
                <th key={col.key} onClick={()=>handleSort(col.key)} style={{padding:"9px 10px",color:sortCol.col===col.key?"#22d3ee":"#7ec8e3",fontSize:14,letterSpacing:1,fontWeight:700,textAlign:"left",whiteSpace:"nowrap",cursor:"pointer",userSelect:"none",...(col.key==="name"?{position:"sticky",left:0,zIndex:3,background:"#06111f"}:{})}}>
                  {col.label}<span style={{color:sortCol.col===col.key?"#22d3ee":"#4a7fa8",fontSize:sortCol.col===col.key?11:9}}>{sortChar(col.key)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r,i)=>{
              const isFocus=!meetingMode||!focusRep||r.name===focusRep;
              const isExpanded=expandedRep===r.name;
              const rowBg=i%2?"#0d1e32":"#0a1728";
              const gc=POS_GROUPS.find(p=>p.key===r.group);
              const gc2=gc?gc.color:"#22d3ee";
              // Quick preview stats
              const allMos=r.mos||[];
              const totSent=allMos.reduce((s,m)=>s+(m.sent||0),0);
              const totRec=allMos.reduce((s,m)=>s+(m.received||0),0);
              const totApp=allMos.reduce((s,m)=>s+(m.approved||0),0);
              const totFund=allMos.reduce((s,m)=>s+(m.funded||0),0);
              const totAmt=allMos.reduce((s,m)=>s+(m.fundedAmt||0),0);
              const n=allMos.length||1;
              const convRec=totSent?Math.round((totRec/totSent)*100):0;
              const convApp=totRec?Math.round((totApp/totRec)*100):0;
              const convFund=totApp?Math.round((totFund/totApp)*100):0;
              const convClose=totSent?Math.round((totFund/totSent)*100):0;
              return (
              <React.Fragment key={r.name}>
              <tr style={{borderBottom:isExpanded?"none":"1px solid #070e1c",background:rowBg,cursor:isFocus?"pointer":"default",opacity:meetingMode&&focusRep&&r.name!==focusRep?.65:1}} onClick={()=>isFocus&&onSel(r.name)}>
                {cols.filter(c=>!hiddenCols.has(c.key)).map(col=>renderCell(r,col))}
              </tr>
              {isExpanded&&(
                <tr style={{background:rowBg,borderBottom:"1px solid #070e1c"}}>
                  <td colSpan={cols.filter(c=>!hiddenCols.has(c.key)).length} style={{padding:"0 12px 14px 40px"}}>
                    <div style={{background:"#060d18",border:`1px solid ${gc2}33`,borderRadius:6,padding:"12px 16px",display:"flex",gap:24,flexWrap:"wrap",alignItems:"flex-start"}}>
                      {/* Conversion Funnel */}
                      <div>
                        <div style={{color:"#4a7fa8",fontSize:11,letterSpacing:1.5,fontWeight:700,marginBottom:8}}>CONVERSION FUNNEL — ALL TIME</div>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          {[
                            {l:"SENT",v:totSent,c:"#7ec8e3"},
                            {l:"→ RECV",v:totRec,c:"#a8c4d8",pct:convRec},
                            {l:"→ APPR",v:totApp,c:"#fbbf24",pct:convApp},
                            {l:"→ FUND",v:totFund,c:gc2,pct:convFund},
                          ].map(({l,v,c,pct})=>(
                            <div key={l} style={{textAlign:"center",background:"#0a1525",border:"1px solid #0f2438",borderRadius:4,padding:"6px 10px",minWidth:60}}>
                              <div style={{color:c,fontFamily:"'Bebas Neue',sans-serif",fontSize:22,lineHeight:1}}>{v}</div>
                              <div style={{color:"#4a7fa8",fontSize:10,letterSpacing:.8,marginTop:2}}>{l}</div>
                              {pct!=null&&<div style={{color:pct>=50?"#34d399":pct>=25?"#fbbf24":"#f87171",fontSize:11,fontWeight:700}}>{pct}%</div>}
                            </div>
                          ))}
                          <div style={{textAlign:"center",background:"#0a1525",border:"1px solid #0f2438",borderRadius:4,padding:"6px 10px",minWidth:60}}>
                            <div style={{color:"#4ade80",fontFamily:"'Bebas Neue',sans-serif",fontSize:22,lineHeight:1}}>{convClose}%</div>
                            <div style={{color:"#4a7fa8",fontSize:10,letterSpacing:.8,marginTop:2}}>CLOSE %</div>
                          </div>
                        </div>
                      </div>
                      {/* Totals */}
                      <div>
                        <div style={{color:"#4a7fa8",fontSize:11,letterSpacing:1.5,fontWeight:700,marginBottom:8}}>TOTALS</div>
                        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                          {[
                            {l:"UNITS",v:totFund,c:gc2},
                            {l:"FUNDED",v:fmt$(totAmt),c:"#22d3ee"},
                            {l:"APPS SENT",v:totSent,c:"#7ec8e3"},
                          ].map(({l,v,c})=>(
                            <div key={l} style={{textAlign:"center",background:"#0a1525",border:"1px solid #0f2438",borderRadius:4,padding:"6px 10px",minWidth:60}}>
                              <div style={{color:c,fontFamily:"'Bebas Neue',sans-serif",fontSize:22,lineHeight:1}}>{v}</div>
                              <div style={{color:"#4a7fa8",fontSize:10,letterSpacing:.8,marginTop:2}}>{l}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Monthly Avgs */}
                      <div>
                        <div style={{color:"#4a7fa8",fontSize:11,letterSpacing:1.5,fontWeight:700,marginBottom:8}}>AVG / MONTH ({n} mo)</div>
                        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                          {[
                            {l:"UNITS",v:(totFund/n).toFixed(1),c:gc2},
                            {l:"FUNDED",v:fmt$(Math.round(totAmt/n)),c:"#22d3ee"},
                            {l:"APPS",v:(totSent/n).toFixed(1),c:"#7ec8e3"},
                          ].map(({l,v,c})=>(
                            <div key={l} style={{textAlign:"center",background:"#0a1525",border:"1px solid #0f2438",borderRadius:4,padding:"6px 10px",minWidth:60}}>
                              <div style={{color:c,fontFamily:"'Bebas Neue',sans-serif",fontSize:22,lineHeight:1}}>{v}</div>
                              <div style={{color:"#4a7fa8",fontSize:10,letterSpacing:.8,marginTop:2}}>{l}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Per-month breakdown */}
                      <div style={{flex:1,minWidth:260}}>
                        <div style={{color:"#4a7fa8",fontSize:11,letterSpacing:1.5,fontWeight:700,marginBottom:8}}>MONTHLY BREAKDOWN</div>
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {[...allMos].reverse().map(m=>{
                            const yr="2025";
                            return (
                              <div key={m.month+yr} style={{background:"#0a1525",border:"1px solid #0f2438",borderRadius:4,padding:"5px 8px",minWidth:80}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                                  <span style={{color:"#f1f5f9",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:.5}}>{m.month}</span>
                                  <span style={{color:yr==="2025"?"#a78bfa":"#22d3ee",fontSize:10,fontWeight:700}}>{yr}</span>
                                </div>
                                <div style={{color:gc2,fontSize:13,fontWeight:700}}>{m.funded||0} units</div>
                                <div style={{color:"#22d3ee",fontSize:12}}>{fmt$(m.fundedAmt||0)}</div>
                                <div style={{color:"#4a7fa8",fontSize:11}}>{m.sent||0}→{m.received||0}→{m.approved||0}→{m.funded||0}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <button onClick={e=>{e.stopPropagation();onSel(r.name);}} style={{alignSelf:"center",background:"#0a1f35",border:`1px solid ${gc2}`,borderRadius:4,padding:"6px 14px",color:gc2,fontSize:13,cursor:"pointer",whiteSpace:"nowrap",fontWeight:700}}>Full Profile →</button>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BenchmarksView() {
  const {bm, saveBm} = React.useContext(BenchmarksCtx);
  const {useState} = React;
  const [editRow, setEditRow] = useState(null); // tier number being edited
  const [editVals, setEditVals] = useState({});
  const [saveMsg, setSaveMsg] = useState("");

  const startEdit=(b)=>{
    setEditRow(b.tier);
    setEditVals({units:b.units,monthly:b.monthly});
  };
  const cancelEdit=()=>{setEditRow(null);setEditVals({});};
  const commitEdit=async()=>{
    const next=bm.map(b=>b.tier===editRow
      ? {...b, units:Number(editVals.units)||0, monthly:Number(String(editVals.monthly).replace(/\D/g,""))||0}
      : b
    );
    await saveBm(next);
    setEditRow(null);
    setEditVals({});
    setSaveMsg("Saved — all tiers updated across the program");
    setTimeout(()=>setSaveMsg(""),3000);
  };
  const resetDefaults=async()=>{
    await saveBm(BENCHMARKS_DEFAULT);
    setSaveMsg("Reset to defaults");
    setTimeout(()=>setSaveMsg(""),3000);
  };

  const fmt$v=v=>v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:v>0?`$${Math.round(v)}`:"—";

  const isCustom=JSON.stringify(bm)!==JSON.stringify(BENCHMARKS_DEFAULT);

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:6,padding:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:"#22d3ee",letterSpacing:2}}>BENCHMARK TABLE</div>
            <div style={{color:"#4a7fa8",fontSize:12,marginTop:2}}>Click any row to edit thresholds · changes apply instantly across all views</div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {saveMsg&&<span style={{color:"#4ade80",fontSize:13,letterSpacing:.5}}>{saveMsg}</span>}
            {isCustom&&<button onClick={resetDefaults} style={{background:"#1a0505",border:"1px solid #f87171",borderRadius:4,padding:"3px 8px",color:"#f87171",fontSize:12,cursor:"pointer",letterSpacing:.5}}>RESET DEFAULTS</button>}
            {isCustom&&<span style={{background:"#fbbf2422",border:"1px solid #fbbf24",borderRadius:3,padding:"2px 6px",color:"#fbbf24",fontSize:12,letterSpacing:.5}}>CUSTOM</span>}
          </div>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{borderBottom:"1px solid #0a1f35"}}>
            {["TIER","TENURE","EXP UNITS/MO","EXP $/MO","TITLE",""].map(h=>(
              <th key={h} style={{padding:"4px 8px",color:"#7ec8e3",fontSize:12,letterSpacing:1.2,textAlign:"left",fontWeight:500}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {[...bm].reverse().map((b,i)=>{
              const gc=POS_GROUPS.find(p=>p.key===b.pos||p.key.startsWith(b.pos.split(" ")[0]));
              const c=gc?gc.color:"#94a3b8";
              const isEditing=editRow===b.tier;
              return (
                <tr key={b.tier} style={{borderBottom:"1px solid #070e1c",background:isEditing?`${c}11`:i%2?"#0d1e32":"#0a1728"}}>
                  <td style={{padding:"6px 8px",color:c,fontFamily:"'Bebas Neue',sans-serif",fontSize:22}}>{b.tier}</td>
                  <td style={{padding:"6px 8px",color:"#94a3b8",fontSize:13}}>{b.range}</td>
                  <td style={{padding:"6px 8px"}}>
                    {isEditing
                      ? <input type="number" value={editVals.units} onChange={e=>setEditVals(p=>({...p,units:e.target.value}))} style={{width:50,background:"#06111f",border:`1px solid ${c}`,borderRadius:3,padding:"2px 4px",color:"#e2e8f0",fontSize:14,outline:"none"}}/>
                      : <span style={{color:"#9db4c8"}}>{b.units||"—"}</span>
                    }
                  </td>
                  <td style={{padding:"6px 8px"}}>
                    {isEditing
                      ? <input type="text" value={editVals.monthly} onChange={e=>setEditVals(p=>({...p,monthly:e.target.value}))} placeholder="500000" style={{width:80,background:"#06111f",border:`1px solid ${c}`,borderRadius:3,padding:"2px 4px",color:"#e2e8f0",fontSize:14,outline:"none"}}/>
                      : <span style={{color:b.monthly>0?"#34d399":"#a8c4d8"}}>{b.monthly>0?fmt$v(b.monthly):"—"}</span>
                    }
                  </td>
                  <td style={{padding:"6px 8px"}}><span style={{background:`${c}22`,color:c,padding:"2px 8px",borderRadius:10,fontSize:12}}>{b.pos}</span></td>
                  <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>
                    {isEditing
                      ? <>
                          <button onClick={commitEdit} style={{background:"#052e16",border:"1px solid #166534",borderRadius:3,padding:"2px 7px",color:"#4ade80",fontSize:13,cursor:"pointer",marginRight:4}}>✓</button>
                          <button onClick={cancelEdit} style={{background:"#1a0505",border:"1px solid #7f1d1d",borderRadius:3,padding:"2px 7px",color:"#f87171",fontSize:13,cursor:"pointer"}}>✕</button>
                        </>
                      : b.tier>0
                        ? <button onClick={()=>startEdit(b)} style={{background:"none",border:"1px solid #1a3550",borderRadius:3,padding:"2px 7px",color:"#4a7fa8",fontSize:12,cursor:"pointer",letterSpacing:.5}} onMouseEnter={e=>e.currentTarget.style.borderColor="#22d3ee"} onMouseLeave={e=>e.currentTarget.style.borderColor="#1a3550"}>EDIT</button>
                        : null
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{marginTop:12,color:"#4a7fa8",fontSize:12,lineHeight:1.7,borderTop:"1px solid #0a1f35",paddingTop:10}}>
          Editing units/month or $/month thresholds updates Perf Tier, Next Tier, and Days→Tier columns across the leaderboard, rep detail pages, and meeting panels immediately. Tier 0 (New/Ramping) is the floor and cannot be edited.
        </div>
        <div style={{marginTop:10,borderTop:"1px solid #0a1f35",paddingTop:10}}>
          <div style={{color:"#7ec8e3",fontSize:12,letterSpacing:2,marginBottom:8}}>POINTS FORMULA</div>
          {[
            {pts:"+1",label:"Early Bird (before 7:15 AM)",c:"#34d399"},
            {pts:"−1",label:"Late Start (after 7:45 AM)",c:"#f87171"},
            {pts:"+1",label:"Late Night (after 7:00 PM)",c:"#34d399"},
            {pts:"−2",label:"Day w/o App or Funding",c:"#f87171"},
            {pts:"+2",label:"Each App Submitted",c:"#34d399"},
            {pts:"+5",label:"Funded Deal < $50K",c:"#34d399"},
            {pts:"+8",label:"Funded Deal ≥ $50K",c:"#22d3ee"},
          ].map(p=>(
            <div key={p.pts+p.label} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:"1px solid #070e1c"}}>
              <span style={{color:"#94a3b8",fontSize:13}}>{p.label}</span>
              <span style={{color:p.c,fontWeight:700,fontSize:15,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}}>{p.pts}</span>
            </div>
          ))}
          <div style={{color:"#a8c4d8",fontSize:12,marginTop:8}}>⚠ Attendance thresholds (7:15/7:45) differ from tracked data (7:30/8:45). Points are approximate until aligned.</div>
        </div>
      </div>
      <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:6,padding:16}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:"#22d3ee",letterSpacing:2,marginBottom:12}}>OPEN ITEMS</div>
        {[
          {c:"#fb923c",t:"Attendance Threshold Mismatch",d:"Points formula uses 7:15/7:45 AM; tracked data uses 7:30/8:45 AM. Needs alignment before points auto-compute."},
          {c:"#fb923c",t:"Apps Sent Attribution",d:"Discrepancy between SF Combined Reps and CSV source. One source of truth needed."},
          {c:"#fb923c",t:"Shared Deal Credit",d:"Currently full credit to each rep on shared deals. Split logic TBD."},
          {c:"#a78bfa",t:"More 2025 Data",d:"Upload additional 2025 months to extend the dataset."},
          {c:"#7ec8e3",t:"Points Auto-Compute",d:"Formula defined. Blocked by attendance threshold mismatch and day-level app data."},
        ].map((item,i)=>(
          <div key={i} style={{padding:"10px 12px",marginBottom:8,borderLeft:`3px solid ${item.c}`,background:"#0a1525",borderRadius:"0 4px 4px 0"}}>
            <div style={{color:"#f1f5f9",fontWeight:500,fontSize:14,marginBottom:3}}>{item.t}</div>
            <div style={{color:"#a8c4d8",fontSize:13}}>{item.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatBox({label,onExpand,children}) {
  return (
    <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:6,padding:16,display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{color:"#7ec8e3",fontSize:16,letterSpacing:1.5,fontWeight:800,textTransform:"uppercase"}}>{label}</div>
        {onExpand&&<button onClick={onExpand} title="Expand" style={{background:"#0a1f35",border:"1px solid #1a3550",borderRadius:4,padding:"2px 8px",color:"#4a7fa8",fontSize:16,cursor:"pointer",lineHeight:1.2}}>⤢</button>}
      </div>
      {children}
    </div>
  );
}

function MetricRow({label,value,color="#f1f5f9",sub,noLine}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"6px 0",borderBottom:noLine?"none":"1px solid #06101c"}}>
      <span style={{color:"#94b8cc",fontSize:17,fontWeight:600}}>{label}</span>
      <div style={{textAlign:"right"}}>
        <span style={{color,fontFamily:"'Bebas Neue',sans-serif",fontSize:30,letterSpacing:1}}>{value}</span>
        {sub&&<div style={{color:"#4a7fa8",fontSize:15,marginTop:2}}>{sub}</div>}
      </div>
    </div>
  );
}

function SectionDiv({l,c="#a78bfa",sub}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,margin:"10px 0 5px",borderTop:"1px solid #0a1f35",paddingTop:7}}>
      <span style={{color:c,fontSize:16,fontWeight:800,letterSpacing:1.5}}>{l}</span>
      {sub&&<span style={{color:"#4a7fa8",fontSize:15}}>{sub}</span>}
    </div>
  );
}

function DrillSectionHeader({t,c="#7ec8e3"}) {
  return <div style={{color:c,fontSize:16,fontWeight:800,letterSpacing:1.5,padding:"12px 0 8px",borderBottom:"1px solid #1a3550",marginBottom:10,textTransform:"uppercase"}}>{t}</div>;
}

function MiniBar({data,dataKey,color,refVal,fmtFn,height=80,groupColor}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{left:0,right:8,top:4,bottom:0}}>
        <CartesianGrid vertical={false} stroke="#0a1f35"/>
        <XAxis dataKey="month" tick={{fill:"#7ec8e3",fontSize:13}} axisLine={false} tickLine={false}/>
        <YAxis hide/>
        <Tooltip contentStyle={{background:"#0a1525",border:"1px solid #22d3ee44",fontSize:15,color:"#e2e8f0"}} labelStyle={{color:"#7ec8e3",fontWeight:700}} itemStyle={{color:"#e2e8f0"}} formatter={v=>[fmtFn?fmtFn(v):v,dataKey]}/>
        {refVal!=null&&<ReferenceLine y={refVal} stroke="#ef4444" strokeDasharray="3 2" strokeWidth={1}/>}
        <Line type="monotone" dataKey={dataKey} stroke={groupColor||color} strokeWidth={2} dot={{fill:groupColor||color,r:3,strokeWidth:0}} activeDot={{r:5,fill:groupColor||color}} connectNulls/>
      </LineChart>
    </ResponsiveContainer>
  );
}

function ConvBlock({label, mos, c, pct, convC}) {
  const s=mos.reduce((a,m)=>a+(m.sent||0),0);
  const r=mos.reduce((a,m)=>a+(m.received||0),0);
  const ap=mos.reduce((a,m)=>a+(m.approved||0),0);
  const f=mos.reduce((a,m)=>a+(m.funded||0),0);
  return (
    <div style={{background:"#0a1525",border:`1px solid ${c}33`,borderRadius:6,padding:14,marginBottom:10}}>
      <div style={{color:c,fontSize:15,fontWeight:800,letterSpacing:1.5,marginBottom:10}}>{label}</div>
      {[["Submission Rate",r,s,"Received ÷ Sent"],["Approval Rate",ap,r,"Approved ÷ Received"],["Close Rate",f,ap,"Funded ÷ Approved"],["Overall Rate",f,s,"Funded ÷ Sent"]].map(([lbl,n,d,sub])=>(
        <div key={lbl} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #06101c"}}>
          <div>
            <div style={{color:"#94b8cc",fontSize:15,fontWeight:600}}>{lbl}</div>
            <div style={{color:"#4a7fa8",fontSize:13}}>{sub}</div>
          </div>
          <span style={{color:convC(n,d),fontFamily:"'Bebas Neue',sans-serif",fontSize:28}}>{pct(n,d)}</span>
        </div>
      ))}
    </div>
  );
}

function YtdCard({label, mos, c, valueKey, fmt}) {
  const tot = mos.reduce((s,m)=>s+(m[valueKey]||0),0);
  const avg = mos.length ? tot/mos.length : 0;
  return (
    <div style={{background:"#0a1525",border:`1px solid ${c}33`,borderRadius:6,padding:14}}>
      <div style={{color:c,fontSize:15,fontWeight:800,letterSpacing:1.5,marginBottom:8}}>{label}</div>
      <div style={{color:c,fontFamily:"'Bebas Neue',sans-serif",fontSize:36,lineHeight:1}}>{fmt ? fmt(tot) : tot}</div>
      <div style={{color:"#4a7fa8",fontSize:14,marginTop:5}}>avg {fmt ? fmt(avg) : avg.toFixed(1)} / mo</div>
    </div>
  );
}

function MonthTable({rep, groupColor, columns}) {
  // columns: array of {key, label, fmt, colorFn}
  // uses global MOS_2025
  const reversed = [...rep.mos].reverse(); // most recent first
  return (
    <div style={{overflowX:"auto",marginBottom:20}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}>
        <thead>
          <tr style={{background:"#06111f"}}>
            <th style={{padding:"8px 12px",color:"#7ec8e3",fontSize:14,fontWeight:800,textAlign:"left",letterSpacing:1}}>MONTH</th>
            <th style={{padding:"8px 12px",color:"#7ec8e3",fontSize:14,fontWeight:800,textAlign:"left",letterSpacing:1}}>YEAR</th>
            {columns.map(c=>(
              <th key={c.key} style={{padding:"8px 12px",color:"#7ec8e3",fontSize:14,fontWeight:800,textAlign:"right",letterSpacing:1}}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reversed.map((m,i)=>{
            const yr = "2025";
            const isCurrentMonth = m.month === "Dec";
            return (
              <tr key={m.month} style={{background:isCurrentMonth?`${groupColor}11`:i%2?"#0d1e32":"#0a1728",borderBottom:"1px solid #07111f",borderLeft:isCurrentMonth?`2px solid ${groupColor}`:"2px solid transparent"}}>
                <td style={{padding:"9px 12px",color:isCurrentMonth?groupColor:"#f1f5f9",fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:1}}>{m.month}</td>
                <td style={{padding:"9px 12px"}}>
                  <span style={{background:yr==="2025"?"#a78bfa22":"#22d3ee22",color:yr==="2025"?"#a78bfa":"#22d3ee",padding:"3px 10px",borderRadius:10,fontSize:14,fontWeight:700}}>{yr}</span>
                </td>
                {columns.map(c=>{
                  const val = typeof c.get === "function" ? c.get(m,rep) : (m[c.key]||0);
                  const color = c.colorFn ? c.colorFn(val,m,rep) : "#f1f5f9";
                  const display = c.fmt ? c.fmt(val) : (val||"—");
                  return <td key={c.key} style={{padding:"9px 12px",color:color,textAlign:"right",fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:.5}}>{display}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DrillDown({title, rep, boxKey, groupColor, onClose}) {
  const {maskName}=React.useContext(MeetingCtx);
  // uses global MOS_2025
  const mos25 = rep.mos.filter(m=>MOS_2025.includes(m.month));
  const febMos = rep.feb ? [rep.feb] : [{}];
  const ptsData = [{month:"Dec",pts:rep.decPts},{month:"Jan",pts:rep.janPts},{month:"Feb",pts:rep.febPts}].filter(d=>d.pts!=null);
  const avgPts = ptsData.length ? Math.round(ptsData.reduce((s,d)=>s+d.pts,0)/ptsData.length) : 0;
  const calls = (rep.raw && rep.raw.calls) ? rep.raw.calls : {dials:0,contacts:0,contactPct:0};
  const pct = (n,d) => d>0 ? Math.round((n/d)*100)+"%" : "—";
  const convC = (n,d) => { if(!d) return "#4a7fa8"; const r=n/d; return r>=0.7?"#34d399":r>=0.4?"#fbbf24":"#f87171"; };
  const avgAmtAll = rep.mos.length ? rep.mos.reduce((s,m)=>s+(m.fundedAmt||0),0)/rep.mos.length : 0;
  const avgUnitsAll = rep.mos.length ? rep.mos.reduce((s,m)=>s+(m.funded||0),0)/rep.mos.length : 0;

  const renderUnits = () => {
    const data = rep.mos.map(m=>({month:m.month, units:m.funded||0}));
    return (
      <div>
        <DrillSectionHeader t="Month by Month — Most Recent First"/>
        <MonthTable rep={rep} groupColor={groupColor} columns={[
          {key:"funded", label:"UNITS", colorFn:(v)=>v>0?groupColor:"#4a7fa8"},
          {key:"funded", label:"VS AVG", get:(m)=>(m.funded||0)-avgUnitsAll, fmt:(v)=>(v>=0?"+":"")+v.toFixed(1), colorFn:(v)=>v>=0?"#34d399":"#f87171"},
        ]}/>
        <DrillSectionHeader t="YTD Summary"/>
        <div style={{marginBottom:20}}>
          <YtdCard label="2025 YTD (Oct–Dec)" mos={mos25} c="#a78bfa" valueKey="funded"/>
        </div>
        <DrillSectionHeader t="All Months Chart"/>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{left:0,right:16,top:4,bottom:0}}>
            <CartesianGrid vertical={false} stroke="#0a1f35"/>
            <XAxis dataKey="month" tick={{fill:"#a8c4d8",fontSize:14}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#a8c4d8",fontSize:13}} axisLine={false} tickLine={false} width={24}/>
            <Tooltip contentStyle={{background:"#0a1525",border:"1px solid #22d3ee44",fontSize:15,color:"#e2e8f0"}} labelStyle={{color:"#7ec8e3",fontWeight:700}} itemStyle={{color:"#e2e8f0"}}/>
            <ReferenceLine y={avgUnitsAll} stroke="#ef4444" strokeDasharray="3 2" strokeWidth={1}/>
            <Line type="monotone" dataKey="units" stroke={groupColor} strokeWidth={2.5} dot={{fill:groupColor,r:4,strokeWidth:0}} activeDot={{r:6}} connectNulls/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderFunded = () => {
    return (
      <div>
        <DrillSectionHeader t="Month by Month — Most Recent First"/>
        <MonthTable rep={rep} groupColor={groupColor} columns={[
          {key:"fundedAmt", label:"FUNDED $", fmt:fmt$, colorFn:(v)=>v>0?"#34d399":"#4a7fa8"},
          {key:"fundedAmt", label:"VS AVG", get:(m)=>(m.fundedAmt||0)-avgAmtAll, fmt:(v)=>fmt$((v>=0?v:-v), v>=0), colorFn:(v)=>v>=0?"#34d399":"#f87171"},
        ]}/>
        <DrillSectionHeader t="YTD Summary"/>
        <div style={{marginBottom:20}}>
          <YtdCard label="2025 YTD (Oct–Dec)" mos={mos25} c="#a78bfa" valueKey="fundedAmt" fmt={fmt$}/>
        </div>
        <DrillSectionHeader t="All Months Chart"/>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={rep.mos} margin={{left:0,right:16,top:4,bottom:0}}>
            <CartesianGrid vertical={false} stroke="#0a1f35"/>
            <XAxis dataKey="month" tick={{fill:"#a8c4d8",fontSize:14}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#a8c4d8",fontSize:13}} axisLine={false} tickLine={false} tickFormatter={v=>fmt$(v)} width={48}/>
            <Tooltip contentStyle={{background:"#0a1525",border:"1px solid #22d3ee44",fontSize:15,color:"#e2e8f0"}} labelStyle={{color:"#7ec8e3",fontWeight:700}} itemStyle={{color:"#e2e8f0"}} formatter={v=>[fmt$(v),"Funded"]}/>
            <ReferenceLine y={avgAmtAll} stroke="#ef4444" strokeDasharray="3 2" strokeWidth={1}/>
            <Line type="monotone" dataKey="fundedAmt" stroke={groupColor} strokeWidth={2.5} dot={{fill:groupColor,r:4,strokeWidth:0}} activeDot={{r:6}} connectNulls/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderApps = () => {
    const chart = rep.mos.map(m=>({month:m.month,sent:m.sent||0,received:m.received||0,approved:m.approved||0}));
    return (
      <div>
        <DrillSectionHeader t="Month by Month — Most Recent First"/>
        <MonthTable rep={rep} groupColor={groupColor} columns={[
          {key:"sent",     label:"SENT",     colorFn:()=>"#94b8cc"},
          {key:"received", label:"RECEIVED", colorFn:()=>"#a78bfa"},
          {key:"approved", label:"APPROVED", colorFn:()=>"#fbbf24"},
        ]}/>
        <DrillSectionHeader t="YTD Summary"/>
        <div style={{marginBottom:20}}>
          {[{label:"2025 YTD (Oct–Dec)",mos:mos25,c:"#a78bfa"}].map(({label,mos,c})=>{
            const s=mos.reduce((a,m)=>a+(m.sent||0),0),r=mos.reduce((a,m)=>a+(m.received||0),0),ap=mos.reduce((a,m)=>a+(m.approved||0),0);
            return (
              <div key={label} style={{background:"#0a1525",border:`1px solid ${c}33`,borderRadius:6,padding:14}}>
                <div style={{color:c,fontSize:15,fontWeight:800,letterSpacing:1.5,marginBottom:10}}>{label}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  {[["Sent",s,"#94b8cc"],["Received",r,"#a78bfa"],["Approved",ap,"#fbbf24"]].map(([lbl,v,col])=>(
                    <div key={lbl}>
                      <div style={{color:"#4a7fa8",fontSize:13,marginBottom:2}}>{lbl}</div>
                      <div style={{color:col,fontFamily:"'Bebas Neue',sans-serif",fontSize:32}}>{v||"—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <DrillSectionHeader t="All Months Chart"/>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chart} margin={{left:0,right:16,top:4,bottom:0}}>
            <CartesianGrid vertical={false} stroke="#0a1f35"/>
            <XAxis dataKey="month" tick={{fill:"#a8c4d8",fontSize:14}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#a8c4d8",fontSize:13}} axisLine={false} tickLine={false} width={24}/>
            <Tooltip contentStyle={{background:"#0a1525",border:"1px solid #22d3ee44",fontSize:15,color:"#e2e8f0"}} labelStyle={{color:"#7ec8e3",fontWeight:700}} itemStyle={{color:"#e2e8f0"}}/>
            <Line type="monotone" dataKey="sent"     stroke="#22d3ee" strokeWidth={2} dot={{fill:"#22d3ee",r:3,strokeWidth:0}} activeDot={{r:5}} name="Sent" connectNulls/>
            <Line type="monotone" dataKey="received" stroke="#a78bfa" strokeWidth={2} dot={{fill:"#a78bfa",r:3,strokeWidth:0}} activeDot={{r:5}} name="Received" connectNulls/>
            <Line type="monotone" dataKey="approved" stroke="#fbbf24" strokeWidth={2} dot={{fill:"#fbbf24",r:3,strokeWidth:0}} activeDot={{r:5}} name="Approved" connectNulls/>
          </LineChart>
        </ResponsiveContainer>
        <div style={{display:"flex",gap:16,marginTop:8,fontSize:14}}>
          {[["#22d3ee","Sent"],["#a78bfa","Received"],["#fbbf24","Approved"]].map(([c,l])=>(
            <span key={l} style={{color:c}}>■ {l}</span>
          ))}
        </div>
      </div>
    );
  };

  const renderConversion = () => {
    const closeColorFn = (m) => {
      const cl = m.approved>0 ? Math.round((m.funded/m.approved)*100) : null;
      return cl===null?"#4a7fa8":cl>=70?"#34d399":cl>=40?"#fbbf24":"#f87171";
    };
    return (
      <div>
        <DrillSectionHeader t="Month by Month — Most Recent First"/>
        <MonthTable rep={rep} groupColor={groupColor} columns={[
          {key:"close", label:"CLOSE RATE", get:(m)=>m.approved>0?Math.round((m.funded/m.approved)*100):null, fmt:(v)=>v!==null?v+"%":"—", colorFn:(v)=>v===null?"#4a7fa8":v>=70?"#34d399":v>=40?"#fbbf24":"#f87171"},
          {key:"overall", label:"OVERALL", get:(m)=>m.sent>0?Math.round((m.funded/m.sent)*100):null, fmt:(v)=>v!==null?v+"%":"—", colorFn:(v)=>v===null?"#4a7fa8":v>=20?"#34d399":v>=10?"#fbbf24":"#f87171"},
        ]}/>
        <DrillSectionHeader t="YTD Conversion Rates"/>
        <div style={{marginBottom:12}}>
          <ConvBlock label="2025 YTD (Oct–Dec)" mos={mos25} c="#a78bfa" pct={pct} convC={convC}/>
        </div>
      </div>
    );
  };

  const renderCalls = () => (
    <div>
      <DrillSectionHeader t="Call Activity"/>
      <div style={{background:"#0a1525",border:"1px solid #1a3550",borderRadius:6,padding:16,marginBottom:12}}>
        <div style={{color:"#7ec8e3",fontSize:14,fontWeight:800,letterSpacing:1.5,marginBottom:12}}>OCT – DEC 2025</div>
        {calls.dials > 0 ? (
          <div>
            {[["Dials",String(calls.dials.toLocaleString()),"#f1f5f9"],["Contacts",String(calls.contacts),"#22d3ee"],["Contact Rate",calls.contactPct+"%",calls.contactPct>=20?"#34d399":calls.contactPct>=10?"#fbbf24":"#f87171"]].map(([l,v,c])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #06101c"}}>
                <span style={{color:"#94b8cc",fontSize:16,fontWeight:600}}>{l}</span>
                <span style={{color:c,fontFamily:"'Bebas Neue',sans-serif",fontSize:32}}>{v}</span>
              </div>
            ))}
            <div style={{marginTop:14,height:8,background:"#0f2438",borderRadius:4}}>
              <div style={{width:Math.min(100,calls.contactPct*3)+"%",height:"100%",background:calls.contactPct>=20?"#34d399":calls.contactPct>=10?"#fbbf24":"#f87171",borderRadius:4}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",color:"#4a7fa8",fontSize:13,marginTop:5}}>
              <span>0%</span><span>10% urgent</span><span>20% strong</span><span>30%+ elite</span>
            </div>
          </div>
        ) : <div style={{color:"#4a7fa8",fontSize:15}}>No call data</div>}
      </div>
      <div style={{background:"#0a1525",border:"1px solid #1a3550",borderRadius:6,padding:12}}>
        <div style={{color:"#4a7fa8",fontSize:14,fontStyle:"italic"}}>
          ⚠ Call activity shown covers the full 2025 period. Provide date-level call log to enable month-over-month comparison.
        </div>
      </div>
    </div>
  );

  const renderPoints = () => {
    const total = ptsData.reduce((s,d)=>s+d.pts,0);
    return (
      <div>
        <DrillSectionHeader t="Month by Month — Most Recent First"/>
        <div style={{overflowX:"auto",marginBottom:20}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:"#06111f"}}>
              {["Month","Year","Points","vs Avg"].map(h=><th key={h} style={{padding:"8px 12px",color:"#7ec8e3",fontSize:14,fontWeight:800,textAlign:h==="Points"||h==="vs Avg"?"right":"left",letterSpacing:1}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {[...ptsData].reverse().map((d,i)=>{
                const yr = "2025";
                const diff = d.pts - avgPts;
                return (
                  <tr key={d.month} style={{background:i%2?"#0d1e32":"#0a1728",borderBottom:"1px solid #07111f"}}>
                    <td style={{padding:"9px 12px",color:"#f1f5f9",fontFamily:"'Bebas Neue',sans-serif",fontSize:20}}>{d.month}</td>
                    <td style={{padding:"9px 12px"}}><span style={{background:yr==="2025"?"#a78bfa22":"#22d3ee22",color:yr==="2025"?"#a78bfa":"#22d3ee",padding:"3px 10px",borderRadius:10,fontSize:14,fontWeight:700}}>{yr}</span></td>
                    <td style={{padding:"9px 12px",color:"#22d3ee",fontFamily:"'Bebas Neue',sans-serif",fontSize:26,textAlign:"right"}}>{d.pts}</td>
                    <td style={{padding:"9px 12px",color:diff>=0?"#34d399":"#f87171",fontSize:15,textAlign:"right"}}>{diff>=0?"+":""}{diff}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DrillSectionHeader t="Points Summary"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:20}}>
          {[["Avg (Dec–Feb)",avgPts,"#22d3ee"],["Total (3 mo)",total,"#34d399"],["Feb Points",rep.febPts||0,(rep.febPts||0)>=avgPts?"#34d399":"#f87171"]].map(([l,v,c])=>(
            <div key={String(l)} style={{background:"#0a1525",borderRadius:6,padding:14,border:`1px solid ${c}33`}}>
              <div style={{color:"#4a7fa8",fontSize:13,marginBottom:5}}>{l}</div>
              <div style={{color:c,fontFamily:"'Bebas Neue',sans-serif",fontSize:38}}>{v}</div>
            </div>
          ))}
        </div>
        <DrillSectionHeader t="Points Chart"/>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={ptsData} margin={{left:0,right:16,top:4,bottom:0}}>
            <CartesianGrid vertical={false} stroke="#0a1f35"/>
            <XAxis dataKey="month" tick={{fill:"#a8c4d8",fontSize:14}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#a8c4d8",fontSize:13}} axisLine={false} tickLine={false} width={28}/>
            <Tooltip contentStyle={{background:"#0a1525",border:"1px solid #22d3ee44",fontSize:15,color:"#e2e8f0"}} labelStyle={{color:"#7ec8e3",fontWeight:700}} itemStyle={{color:"#e2e8f0"}}/>
            <ReferenceLine y={avgPts} stroke="#ef4444" strokeDasharray="3 2" strokeWidth={1}/>
            <Line type="monotone" dataKey="pts" stroke="#22d3ee" strokeWidth={2.5} dot={{fill:"#22d3ee",r:4,strokeWidth:0}} activeDot={{r:6}} connectNulls/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderContent = () => {
    if(boxKey==="units")      return renderUnits();
    if(boxKey==="funded")     return renderFunded();
    if(boxKey==="apps")       return renderApps();
    if(boxKey==="conversion") return renderConversion();
    if(boxKey==="calls")      return renderCalls();
    if(boxKey==="points")     return renderPoints();
    return null;
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(4,10,20,.97)",zIndex:200,overflowY:"auto",padding:"24px 28px"}}>
      <div style={{maxWidth:960,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
          <button onClick={onClose} style={{background:"#0f2438",border:"1px solid #1a3550",borderRadius:4,padding:"6px 16px",color:"#7ec8e3",fontSize:15,fontWeight:700,cursor:"pointer",letterSpacing:1}}>← BACK</button>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:groupColor,letterSpacing:2}}>{maskName(rep.name)}</div>
          <div style={{color:"#7ec8e3",fontSize:15,fontWeight:700,letterSpacing:2}}>/ {title.toUpperCase()}</div>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}


function IdentityCards({rep, groupColor}) {
  // MOS_2025 is global
  // MOS_2025 is global
  const mos25=rep.mos.filter(m=>MOS_2025.includes(m.month));
  const ytd25Amt=mos25.reduce((s,m)=>s+(m.fundedAmt||0),0);
  const ytd25Units=mos25.reduce((s,m)=>s+(m.funded||0),0);
  const decAmt=rep.mos.find(m=>m.month==="Dec")?.fundedAmt||0;
  const decUnits=rep.mos.find(m=>m.month==="Dec")?.funded||0;
  const tierC=(t)=>t>=6?"#34d399":t>=3?"#fbbf24":"#f87171";
  const calcTierGc=POS_GROUPS.find(p=>p.key===rep.expPos);
  const calcTierC=calcTierGc?.color||"#a78bfa";
  const divider=<div style={{width:"100%",height:1,background:"#0a1f35",margin:"10px 0"}}/>;
  const lbl=(txt,c="#7ec8e3")=><div style={{color:c,fontSize:15,letterSpacing:1.5,fontWeight:800,textTransform:"uppercase",marginBottom:5}}>{txt}</div>;
  const bigV=(txt,c)=><div style={{color:c,fontFamily:"'Bebas Neue',sans-serif",fontSize:32,letterSpacing:1.5,lineHeight:1}}>{txt}</div>;
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
      <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:6,padding:"12px 14px"}}>
        {lbl("Position")}{bigV(rep.group,groupColor)}
        <div style={{color:"#4a7fa8",fontSize:16,marginTop:2,marginBottom:12}}>{rep.title}</div>
        {divider}{lbl("Calculated Position","#a78bfa")}
        <div style={{color:calcTierC,fontSize:16,fontWeight:700,marginTop:1}}>{rep.expPos}</div>
        <div style={{color:"#4a7fa8",fontSize:15,marginTop:2}}>based on performance data</div>
      </div>
      <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:6,padding:"12px 14px"}}>
        {lbl("Tier by Tenure")}{bigV(rep.expTier,"#818cf8")}
        <div style={{color:"#4a7fa8",fontSize:16,marginTop:2,marginBottom:12}}>expected by start date</div>
        {divider}{lbl("Calculated Tier","#fbbf24")}
        {bigV(rep.tier,tierC(rep.tier))}
        <div style={{color:"#4a7fa8",fontSize:15,marginTop:2}}>based on benchmark metrics</div>
      </div>
      <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:6,padding:"12px 14px"}}>
        {lbl("2025 YTD","#a78bfa")}<div style={{color:"#4a7fa8",fontSize:15,marginBottom:8}}>Oct · Nov · Dec</div>
        {lbl("Funded $")}{bigV(fmt$(ytd25Amt),ytd25Amt>500000?"#34d399":ytd25Amt>0?"#22d3ee":"#4a7fa8")}
        {divider}{lbl("Units")}{bigV(ytd25Units,ytd25Units>15?"#34d399":ytd25Units>5?"#22d3ee":"#4a7fa8")}
      </div>
      <div style={{background:"#0d1e32",border:`1px solid ${groupColor}55`,borderRadius:6,padding:"12px 14px"}}>
        {lbl("Dec 2025",groupColor)}<div style={{color:"#4a7fa8",fontSize:15,marginBottom:8}}>Last month on record</div>
        {lbl("Funded $")}{bigV(fmt$(decAmt),decAmt>=rep.expMonthly?"#34d399":decAmt>0?"#fbbf24":"#f87171")}
        {divider}{lbl("Units")}{bigV(decUnits,decUnits>=4?"#34d399":decUnits>0?"#fbbf24":"#f87171")}
      </div>
    </div>
  );
}

function useMeetings() {
  const {useState, useEffect} = React;
  const [meetings, setMeetingsState] = useState({});
  useEffect(()=>{
    (async()=>{
      try{ const res=await storage.get(MEETING_STORAGE_KEY); if(res) setMeetingsState(JSON.parse(res.value)); }catch(e){}
    })();
  },[]);
  const saveMeeting=async(repName,data)=>{
    const next={...meetings,[repName]:data};
    setMeetingsState(next);
    try{ await storage.save(MEETING_STORAGE_KEY,JSON.stringify(next)); }catch(e){}
  };
  const addHistory=async(repName,entry)=>{
    const existing=meetings[repName]||{};
    const history=[...(existing.history||[]),{...entry,recordedAt:new Date().toISOString()}];
    await saveMeeting(repName,{...existing,history});
  };
  const saveNote=async(repName,notes)=>{
    const existing=meetings[repName]||{};
    await saveMeeting(repName,{...existing,notes});
  };
  return {meetings, saveMeeting, addHistory, saveNote};
}

function useGoals() {
  const {useState,useEffect} = React;
  const [goals,setGoals]=useState({});
  useEffect(()=>{
    (async()=>{
      try{ const r=await storage.get(GOALS_STORAGE_KEY); if(r) setGoals(JSON.parse(r.value)); }catch(e){}
    })();
  },[]);
  const saveGoal=async(repName,g)=>{
    const next={...goals,[repName]:g};
    setGoals(next);
    try{ await storage.save(GOALS_STORAGE_KEY,JSON.stringify(next)); }catch(e){}
  };
  return {goals,saveGoal};
}

function RepMeetingPanel({rep, groupColor}) {
  const {useState} = React;
  const {meetings, saveMeeting, saveNote} = useMeetings();
  const {bm} = React.useContext(BenchmarksCtx);
  const [editSched, setEditSched] = useState(false);
  const [schedInput, setSchedInput] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [notesVal, setNotesVal] = useState(null); // null = not editing
  const [notesText, setNotesText] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const m = meetings[rep.name]||{};
  const hasMet = !!m.metDate;
  const hasSched = !!m.scheduledDate;
  const hasAny = hasMet||hasSched||!!m.prevMetDate;
  const today = new Date().toISOString().slice(0,10);
  const schedOverdue = hasSched && m.scheduledDate < today;

  const ct = calcTenureTier(rep,bm);
  const pt = calcPerfTier(rep,bm);
  const daysToTier = calcDaysToNextTier(rep,bm);
  const nextTierDate = getNextTierDate(rep,bm);
  const ttIdx = TIER_ORDER_ARR.indexOf(ct.tier);
  const nextTierNum = ttIdx!==-1&&ttIdx<TIER_ORDER_ARR.length-1 ? TIER_ORDER_ARR[ttIdx+1] : null;
  const nextBench = nextTierNum!=null ? bm.find(b=>b.tier===nextTierNum) : null;

  const daysToMtg = hasSched ? Math.round((new Date(m.scheduledDate+"T12:00:00")-new Date(today+"T12:00:00"))/86400000) : null;

  const toggleMet=()=>{
    if(hasMet){
      saveMeeting(rep.name,{...m,metDate:null});
    } else {
      const history=[...(m.history||[]),{type:"met",date:today,recordedAt:new Date().toISOString()}];
      saveMeeting(rep.name,{...m,metDate:today,scheduledDate:null,prevMetDate:m.metDate||m.prevMetDate||null,history});
      setSchedInput(new Date().toISOString().slice(0,10));
      setEditSched(true);
    }
  };

  const saveDate=(dateStr)=>{
    const prevMet=m.metDate||m.prevMetDate||null;
    const history=[...(m.history||[]),{type:"scheduled",date:dateStr,recordedAt:new Date().toISOString()}];
    saveMeeting(rep.name,{...m,scheduledDate:dateStr||null,metDate:null,prevMetDate:prevMet,history});
    setEditSched(false);
  };

  const doClear=()=>{ saveMeeting(rep.name,{}); setEditSched(false); setConfirmClear(false); };

  const openNotes=()=>{ setNotesText(m.notes||""); setNotesVal(true); };
  const saveNotes=()=>{ saveNote(rep.name, notesText); setNotesVal(null); };

  const ttC=TIER_COLORS[ct.tier]||"#9db4c8";
  const ptC=TIER_COLORS[pt.tier]||"#9db4c8";
  const nextC=nextTierNum!=null?(TIER_COLORS[nextTierNum]||"#9db4c8"):"#4ade80";

  const daysC=(d)=>{
    if(d===null) return "#4ade80";
    if(d<0) return "#f87171";
    if(d<=14) return "#fcd34d";
    if(d<=30) return "#fb923c";
    return "#a8c4d8";
  };
  const mtgC=(d)=>{
    if(d===null) return "#2a4a6a";
    if(d<0) return "#f87171";
    if(d<=3) return "#fcd34d";
    if(d<=7) return "#fb923c";
    return "#22d3ee";
  };

  const history=(m.history||[]).slice().reverse();

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8,minWidth:460,maxWidth:560}}>

      {/* Tier row: 4 boxes */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
        <div style={{background:"#0d1e32",border:`1px solid ${ttC}33`,borderRadius:6,padding:"10px 14px"}}>
          <div style={{color:"#4a7fa8",fontSize:16,fontWeight:800,letterSpacing:1.5,marginBottom:6,whiteSpace:"nowrap"}}>TENURE TIER</div>
          <div style={{color:ttC,fontFamily:"'Bebas Neue',sans-serif",fontSize:32,lineHeight:1}}>T{ct.tier}</div>
          <div style={{color:"#4a7fa8",fontSize:14,marginTop:3}}>{ct.pos}</div>
        </div>
        <div style={{background:"#0d1e32",border:`1px solid ${ptC}33`,borderRadius:6,padding:"10px 14px"}}>
          <div style={{color:"#4a7fa8",fontSize:16,fontWeight:800,letterSpacing:1.5,marginBottom:6,whiteSpace:"nowrap"}}>PERF TIER</div>
          <div style={{color:ptC,fontFamily:"'Bebas Neue',sans-serif",fontSize:32,lineHeight:1}}>T{pt.tier}</div>
          <div style={{color:"#4a7fa8",fontSize:14,marginTop:3}}>{pt.pos}</div>
        </div>
        <div style={{background:"#0d1e32",border:`1px solid ${nextC}33`,borderRadius:6,padding:"10px 14px"}}>
          <div style={{color:"#4a7fa8",fontSize:16,fontWeight:800,letterSpacing:1.5,marginBottom:6,whiteSpace:"nowrap"}}>NEXT TIER</div>
          {nextBench ? <>
            <div style={{color:nextC,fontFamily:"'Bebas Neue',sans-serif",fontSize:32,lineHeight:1}}>T{nextTierNum}</div>
            <div style={{color:"#4a7fa8",fontSize:14,marginTop:3}}>{nextBench.pos}</div>
          </> : <div style={{color:"#4ade80",fontWeight:700,fontSize:18,marginTop:6}}>MAX</div>}
        </div>
        <div style={{background:"#0d1e32",border:`1px solid ${daysC(daysToTier)}33`,borderRadius:6,padding:"10px 14px"}}>
          <div style={{color:"#4a7fa8",fontSize:16,fontWeight:800,letterSpacing:1.5,marginBottom:6,whiteSpace:"nowrap"}}>DAYS <span style={{fontSize:20}}>&#8594;</span> TIER</div>
          {daysToTier===null
            ? <div style={{color:"#4ade80",fontWeight:700,fontSize:18,marginTop:6}}>MAX</div>
            : <>
              <div style={{color:daysC(daysToTier),fontFamily:"'Bebas Neue',sans-serif",fontSize:32,lineHeight:1}}>{daysToTier<0?"-":""}{Math.abs(daysToTier)}d</div>
              <div style={{color:"#4a7fa8",fontSize:14,marginTop:3}}>{daysToTier<0?"OVERDUE":daysToTier<=14?"URGENT":daysToTier<=30?"SOON":"to next tier"}</div>
            </>
          }
        </div>
      </div>

      {/* Meeting row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div style={{background:"#0d1e32",border:`1px solid ${mtgC(daysToMtg)}33`,borderRadius:6,padding:"10px 14px"}}>
          <div style={{color:"#4a7fa8",fontSize:16,fontWeight:800,letterSpacing:1.5,marginBottom:6,whiteSpace:"nowrap"}}>DAYS <span style={{fontSize:20}}>&#8594;</span> MEETING</div>
          {daysToMtg===null
            ? <div style={{color:"#2a4a6a",fontSize:16,fontStyle:"italic",marginTop:5}}>none scheduled</div>
            : <>
              <div style={{color:mtgC(daysToMtg),fontFamily:"'Bebas Neue',sans-serif",fontSize:32,lineHeight:1}}>{daysToMtg<0?"-":""}{Math.abs(daysToMtg)}d</div>
              <div style={{color:"#4a7fa8",fontSize:14,marginTop:3}}>{daysToMtg<0?"PAST DUE":daysToMtg<=3?"THIS WEEK":daysToMtg<=7?"UPCOMING":"scheduled"}</div>
            </>
          }
        </div>
        <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:6,padding:"10px 12px"}}>
          <div style={{color:"#4a7fa8",fontSize:16,fontWeight:800,letterSpacing:1.5,marginBottom:6}}>PREV MEETING</div>
          {m.prevMetDate
            ? <>
              <div style={{color:"#7ec8e3",fontSize:24,fontWeight:700}}>{fmtShortDate(m.prevMetDate)}</div>
              <div style={{color:"#4a7fa8",fontSize:14,marginTop:3}}>{Math.round((new Date()-new Date(m.prevMetDate+"T12:00:00"))/86400000)}d ago</div>
            </>
            : <div style={{color:"#2a4a6a",fontSize:16,fontStyle:"italic",marginTop:5}}>no history</div>
          }
        </div>
      </div>

      {/* Meeting Info control row */}
      <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:6,padding:"10px 12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <button onClick={toggleMet} style={{background:hasMet?"#052e16":"#0a1f35",border:`1px solid ${hasMet?"#166534":"#1a3550"}`,borderRadius:4,padding:"4px 14px",cursor:"pointer",color:hasMet?"#4ade80":"#4a7fa8",fontSize:16,fontWeight:700,whiteSpace:"nowrap"}}>
            {hasMet?"✓ Met":"○ Not met"}
          </button>
          {hasMet&&<span style={{color:"#4a7fa8",fontSize:13}}>{fmtShortDate(m.metDate)}</span>}

          {hasSched&&!editSched&&(
            <a href={gcalUrl(rep.name, m.scheduledDate)} target="_blank" rel="noopener noreferrer" title="Add to Google Calendar" onClick={e=>e.stopPropagation()} style={{display:"flex",alignItems:"center",justifyContent:"center",background:"#0a1f35",border:"1px solid #1e4a6e",borderRadius:4,padding:"4px 7px",color:"#7ec8e3",textDecoration:"none",lineHeight:1,flexShrink:0}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7ec8e3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </a>
          )}

          {editSched ? (
            <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-start"}} onClick={e=>e.stopPropagation()}>
              <select onChange={e=>{if(e.target.value){const qd=QUICK_DATES.find(q=>q.label===e.target.value);if(qd)setSchedInput(qd.fn());}e.target.value="";}} defaultValue="" style={{background:"#0a1525",border:"1px solid #22d3ee88",borderRadius:3,padding:"3px 6px",color:"#7ec8e3",fontSize:13,cursor:"pointer",width:"100%",outline:"none",colorScheme:"dark"}}>
                <option value="" disabled>Quick select…</option>
                {QUICK_DATES.map(q=><option key={q.label} value={q.label}>{q.label}</option>)}
              </select>
              <div style={{display:"flex",gap:4,alignItems:"center",width:"100%"}}>
                <input type="date" value={schedInput} onChange={e=>setSchedInput(e.target.value)} autoFocus style={{background:"#0a1525",border:"1px solid #22d3ee",borderRadius:3,padding:"3px 8px",color:"#e2e8f0",fontSize:14,outline:"none",colorScheme:"dark",flex:1}}/>
                <button onClick={()=>saveDate(schedInput)} style={{background:"#052e16",border:"1px solid #166534",borderRadius:3,padding:"3px 9px",color:"#4ade80",fontSize:14,cursor:"pointer"}}>✓</button>
                <button onClick={()=>setEditSched(false)} style={{background:"#1a0505",border:"1px solid #7f1d1d",borderRadius:3,padding:"3px 9px",color:"#f87171",fontSize:14,cursor:"pointer"}}>✕</button>
              </div>
            </div>
          ) : (
            <div onClick={()=>{setSchedInput(m.scheduledDate||new Date().toISOString().slice(0,10));setEditSched(true);}} style={{cursor:"pointer"}}>
              {hasSched
                ? <span style={{color:schedOverdue?"#f87171":"#22d3ee",fontSize:22,fontWeight:700,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}}>{schedOverdue?"⚠ ":""}{fmtShortDate(m.scheduledDate)}</span>
                : <span style={{color:"#2a4a6a",fontSize:16,fontStyle:"italic"}}>+ schedule meeting</span>
              }
            </div>
          )}

          {hasAny&&!editSched&&(
            confirmClear
              ? <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:"auto"}}>
                  <span style={{color:"#f87171",fontSize:13,whiteSpace:"nowrap"}}>Clear all?</span>
                  <button onClick={doClear} style={{background:"#3b0a0a",border:"1px solid #991b1b",borderRadius:3,padding:"2px 8px",color:"#f87171",fontSize:13,cursor:"pointer",fontWeight:700}}>Yes</button>
                  <button onClick={()=>setConfirmClear(false)} style={{background:"#0a1f35",border:"1px solid #1a3550",borderRadius:3,padding:"2px 8px",color:"#4a7fa8",fontSize:13,cursor:"pointer"}}>No</button>
                </div>
              : <button onClick={()=>setConfirmClear(true)} style={{background:"#1a0505",border:"1px solid #f87171",borderRadius:3,cursor:"pointer",color:"#f87171",fontSize:13,padding:"2px 7px",marginLeft:"auto"}} onMouseEnter={e=>{e.currentTarget.style.color="#f87171";e.currentTarget.style.borderColor="#f87171";}} onMouseLeave={e=>{e.currentTarget.style.color="#4a2020";e.currentTarget.style.borderColor="#3a1515";}}>✕</button>
          )}
        </div>
      </div>

      {/* Notes */}
      <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:6,padding:"10px 12px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{color:"#4a7fa8",fontSize:16,fontWeight:800,letterSpacing:1.5}}>NOTES</div>
          {notesVal===null&&<button onClick={openNotes} style={{background:"#0a1f35",border:"1px solid #1e3a5f",borderRadius:3,padding:"2px 8px",color:"#7ec8e3",fontSize:13,cursor:"pointer",letterSpacing:.5}}>{m.notes?"EDIT":"+ ADD"}</button>}
        </div>
        {notesVal!==null ? (
          <div>
            <textarea
              value={notesText}
              onChange={e=>setNotesText(e.target.value)}
              autoFocus
              placeholder="Add notes about this rep, last conversation, action items..."
              style={{width:"100%",minHeight:80,background:"#06111f",border:"1px solid #22d3ee66",borderRadius:4,padding:"8px",color:"#e2e8f0",fontSize:15,resize:"vertical",outline:"none",fontFamily:"'DM Mono',monospace",lineHeight:1.6}}
            />
            <div style={{display:"flex",gap:6,marginTop:6}}>
              <button onClick={saveNotes} style={{background:"#052e16",border:"1px solid #166534",borderRadius:3,padding:"4px 12px",color:"#4ade80",fontSize:14,cursor:"pointer"}}>Save</button>
              <button onClick={()=>setNotesVal(null)} style={{background:"#0a1f35",border:"1px solid #1a3550",borderRadius:3,padding:"4px 12px",color:"#4a7fa8",fontSize:14,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        ) : m.notes ? (
          <div style={{color:"#a8c4d8",fontSize:15,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{m.notes}</div>
        ) : (
          <div style={{color:"#2a4a6a",fontSize:15,fontStyle:"italic"}}>No notes yet</div>
        )}
      </div>

      {/* Meeting History Log */}
      {history.length>0&&(
        <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:6,padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{color:"#4a7fa8",fontSize:16,fontWeight:800,letterSpacing:1.5}}>MEETING HISTORY</div>
            <button onClick={()=>setShowHistory(p=>!p)} style={{background:"none",border:"none",color:"#4a7fa8",fontSize:14,cursor:"pointer",letterSpacing:.5}}>{showHistory?"HIDE":"SHOW"} {history.length}</button>
          </div>
          {showHistory&&(
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {history.map((h,i)=>{
                const isMet=h.type==="met";
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",background:"#06111f",borderRadius:4,borderLeft:`2px solid ${isMet?"#4ade80":"#22d3ee"}`}}>
                    <span style={{fontSize:13,color:isMet?"#4ade80":"#22d3ee",fontWeight:700,letterSpacing:.5,whiteSpace:"nowrap"}}>{isMet?"✓ MET":"📅 SCHED"}</span>
                    <span style={{color:"#e2e8f0",fontSize:15,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:.5}}>{fmtShortDate(h.date)}</span>
                    <span style={{color:"#2a4a6a",fontSize:13,marginLeft:"auto"}}>{new Date(h.recordedAt).toLocaleDateString()}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function RepDetail({rep,onBack}) {
  const [drill,setDrill]=useState(null);
  const [printMode,setPrintMode]=useState(false);
  const [editGoal,setEditGoal]=useState(false);
  const [goalInput,setGoalInput]=useState("");
  const [period,setPeriod]=useState("Dec");
  const [open25,setOpen25]=useState(false);
  const {goals,saveGoal}=useGoals();
  const {meetingMode,maskName}=React.useContext(MeetingCtx);
  const {bm}=React.useContext(BenchmarksCtx);
  const repGoal=goals[rep.name]||{};

  const gc=POS_GROUPS.find(p=>p.key===rep.group);
  const groupColor=gc?.color||"#22d3ee";

  // Period setup
  const MOS25_OPTS=[{id:"Oct",label:"October"},{id:"Nov",label:"November"},{id:"Dec",label:"December"}];
  const is25Mo=MOS25_OPTS.some(m=>m.id===period);
  const periodLabel=period==="all"?"ALL TIME":period==="2025"?"2025 YTD (Oct–Dec)":MOS25_OPTS.find(m=>m.id===period)?.label||period;

  const selMos=period==="all"?rep.mos:
    period==="2025"?rep.mos.filter(m=>MOS_2025.includes(m.month)):
    rep.mos.filter(m=>m.month===period);

  // Period aggregates
  const selUnits=selMos.reduce((s,m)=>s+(m.funded||0),0);
  const selAmt=selMos.reduce((s,m)=>s+(m.fundedAmt||0),0);
  const selSent=selMos.reduce((s,m)=>s+(m.sent||0),0);
  const selRec=selMos.reduce((s,m)=>s+(m.received||0),0);
  const selApp=selMos.reduce((s,m)=>s+(m.approved||0),0);
  const nMos=Math.max(1,selMos.length);
  const avgUnitsPerMo=selUnits/nMos;
  const avgAmtPerMo=selAmt/nMos;

  // Benchmark for this rep's tier
  // Use current tenure tier for benchmark — expTier is 0 for RITs and has no thresholds
  const repBm=bm.find(b=>b.tier===rep.tier&&(b.units||b.monthly))||bm.find(b=>b.tier===rep.expTier&&(b.units||b.monthly))||null;

  const totFunded=rep.mos.reduce((s,m)=>s+(m.funded||0),0);
  const totAmt=rep.mos.reduce((s,m)=>s+(m.fundedAmt||0),0);
  const avgAmt=rep.mos.length?Math.round(totAmt/rep.mos.length):0;

  const pct=(n,d)=>d>0?Math.round((n/d)*100)+"%":"—";
  const convC=(n,d)=>{if(!d)return"#4a7fa8";const r=n/d;return r>=0.7?"#34d399":r>=0.4?"#fbbf24":"#f87171";};

  const ptsData=[{month:"Dec",pts:rep.decPts}].filter(d=>d.pts!==null);
  const avgPts=ptsData.length?Math.round(ptsData.reduce((s,d)=>s+d.pts,0)/ptsData.length):0;
  const calls=rep.raw?.calls||{dials:0,contacts:0,contactPct:0};
  const periodStatus=calcStatus(selAmt, nMos, rep.expMonthly, rep.daysNext==="MAX");

  const tabBtn=(active,color,onClick,children)=>(
    <button onClick={onClick} style={{background:active?`${color}22`:"#0a1525",border:`1px solid ${active?color:"#1a3550"}`,borderRadius:4,padding:"4px 12px",color:active?color:"#4a7fa8",fontSize:14,letterSpacing:.5,cursor:"pointer",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap",fontWeight:active?700:400}}>{children}</button>
  );

  const BmBar=({label,value,target,fmt=v=>v,color})=>{
    if(!target||target<=0) return null;
    const p=Math.min(100,Math.round((value/target)*100));
    const bc=p>=100?"#34d399":p>=75?"#22d3ee":p>=50?"#fbbf24":"#f87171";
    return (
      <div style={{marginTop:8,padding:"8px 10px",background:"#060e1a",borderRadius:4,border:"1px solid #0f2438"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{color:"#4a7fa8",fontSize:12,letterSpacing:.8}}>{label}</span>
          <span style={{color:bc,fontSize:12,fontWeight:700}}>{fmt(value)} / {fmt(target)} <span style={{color:"#4a7fa8"}}>target</span></span>
        </div>
        <div style={{height:6,background:"#0a1f35",borderRadius:3}}>
          <div style={{width:`${p}%`,height:"100%",background:bc,borderRadius:3,transition:"width .3s"}}/>
        </div>
        <div style={{color:bc,fontSize:12,marginTop:3}}>{p}% of benchmark goal</div>
      </div>
    );
  };

  return (
    <div onClick={()=>{if(open25)setOpen25(false);}}>
      {drill && <DrillDown title={drill.title} rep={rep} boxKey={drill.key} groupColor={groupColor} onClose={()=>setDrill(null)}/>}
      {printMode && <PrintView rep={rep} groupColor={groupColor} goal={repGoal} onClose={()=>setPrintMode(false)}/>}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <button onClick={onBack} style={{background:"#0f2438",border:"1px solid #1a3550",borderRadius:4,padding:"5px 14px",color:"#7ec8e3",fontSize:15,letterSpacing:1,cursor:"pointer"}}>← BACK</button>
        <button onClick={()=>setPrintMode(true)} style={{background:"#0a1f35",border:"1px solid #1e3a5f",borderRadius:4,padding:"5px 14px",color:"#4a7fa8",fontSize:15,letterSpacing:1,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          PRINT
        </button>
      </div>

      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",gap:20,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:200}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:36,color:groupColor,letterSpacing:2,marginBottom:6}}>{maskName(rep.name)}</div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{color:"#7ec8e3",fontSize:13}}>{rep.start}</div>
            <StatusBadge status={periodStatus}/>
          </div>
        </div>
        <RepMeetingPanel rep={rep} groupColor={groupColor}/>
      </div>

      {/* Period selector */}
      <div style={{background:"#0a1525",border:"1px solid #1a3550",borderRadius:6,padding:"10px 14px",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{color:"#4a7fa8",fontSize:12,letterSpacing:1,marginRight:4}}>PERIOD:</span>
          <div style={{position:"relative"}}>
            {tabBtn(is25Mo,"#a78bfa",e=>{e.stopPropagation();setOpen25(!open25);},`2025${is25Mo?` · ${periodLabel}`:" ▾"}`)}
            {open25&&<div style={{position:"absolute",top:"calc(100% + 4px)",left:0,background:"#0d1e32",border:"1px solid #1e3a5f",borderRadius:6,zIndex:99,minWidth:140,boxShadow:"0 4px 16px rgba(0,0,0,.5)"}}>
              {MOS25_OPTS.map(m=><div key={m.id} onClick={e=>{e.stopPropagation();setPeriod(m.id);setOpen25(false);}} style={{padding:"8px 14px",color:period===m.id?"#a78bfa":"#a8c4d8",background:period===m.id?"#0a1f35":"transparent",cursor:"pointer",fontSize:14,fontFamily:"'DM Mono',monospace"}}>{m.label}</div>)}
            </div>}
          </div>
          <div style={{width:1,height:18,background:"#1a3550"}}/>
          {[{id:"2025",l:"2025 YTD",c:"#a78bfa"},{id:"all",l:"ALL TIME",c:"#7ec8e3"}].map(t=>tabBtn(period===t.id,t.c,()=>{setPeriod(t.id);setOpen25(false);},t.l))}
          <span style={{color:"#22d3ee",fontWeight:700,fontSize:13,marginLeft:8}}>{periodLabel}</span>
        </div>
      </div>

      <IdentityCards rep={rep} groupColor={groupColor}/>

      {/* Stat boxes */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>

        {/* UNITS */}
        <StatBox label={`Units — ${periodLabel}`} onExpand={()=>setDrill({key:"units",title:"Units"})}>
          <div style={{marginBottom:6}}>
            <MiniBar data={rep.mos.map(m=>({month:m.month,units:m.funded||0}))} dataKey="units" color={groupColor} groupColor={groupColor} refVal={totFunded/Math.max(1,rep.mos.length)} height={75}/>
          </div>
          <MetricRow label="Total Units" value={selUnits} color={selUnits>0?groupColor:"#f87171"}/>
          {nMos>1&&<MetricRow label="Avg / Month" value={avgUnitsPerMo.toFixed(1)} color="#a8c4d8"/>}
          {repBm&&repBm.units>0&&<BmBar label={nMos===1?"UNITS vs BENCHMARK":"AVG/MO vs BENCHMARK"} value={nMos===1?selUnits:avgUnitsPerMo} target={repBm.units} fmt={v=>Number.isInteger(v)?v:v.toFixed(1)} color={groupColor}/>}
        </StatBox>

        {/* FUNDED $ */}
        <StatBox label={`Funded $ — ${periodLabel}`} onExpand={()=>setDrill({key:"funded",title:"Funded $"})}>
          <div style={{marginBottom:6}}>
            <MiniBar data={rep.mos} dataKey="fundedAmt" color={groupColor} groupColor={groupColor} refVal={avgAmt} fmtFn={fmt$} height={75}/>
          </div>
          <MetricRow label="Total Funded" value={fmt$(selAmt)} color={selAmt>0?"#22d3ee":"#f87171"}/>
          {nMos>1&&<MetricRow label="Avg / Month" value={fmt$(Math.round(avgAmtPerMo))} color="#a8c4d8"/>}
          {/* Goal */}
          {(()=>{
            const g=repGoal.monthly||rep.expMonthly||0;
            const v=nMos===1?selAmt:Math.round(avgAmtPerMo);
            const p=g?Math.min(100,Math.round((v/g)*100)):null;
            const saveG=()=>{saveGoal(rep.name,{...repGoal,monthly:parseInt(goalInput.replace(/\D/g,""))||0});setEditGoal(false);};
            return g||editGoal?(
              <div style={{marginTop:8,padding:"8px 10px",background:"#060e1a",borderRadius:4,border:"1px solid #0f2438"}}>
                {editGoal?(
                  <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:4}}>
                    <span style={{color:"#4a7fa8",fontSize:13}}>$</span>
                    <input type="text" value={goalInput} onChange={e=>setGoalInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveG()} autoFocus placeholder="monthly goal" style={{background:"#06111f",border:"1px solid #22d3ee66",borderRadius:3,padding:"2px 6px",color:"#e2e8f0",fontSize:14,outline:"none",width:90}}/>
                    <button onClick={saveG} style={{background:"#052e16",border:"1px solid #166534",borderRadius:3,padding:"2px 7px",color:"#4ade80",fontSize:13,cursor:"pointer"}}>✓</button>
                    <button onClick={()=>setEditGoal(false)} style={{background:"none",border:"none",color:"#4a7fa8",fontSize:13,cursor:"pointer"}}>✕</button>
                  </div>
                ):(
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <span style={{color:"#4a7fa8",fontSize:13}}>GOAL: {fmt$(g)}/mo</span>
                    <button onClick={()=>{setGoalInput(String(g));setEditGoal(true);}} style={{background:"none",border:"none",color:"#2a4a6a",fontSize:12,cursor:"pointer",padding:0}}>edit</button>
                  </div>
                )}
                {p!==null&&<div>
                  <div style={{height:5,background:"#0a1f35",borderRadius:3,marginBottom:3}}><div style={{width:`${p}%`,height:"100%",background:p>=100?"#4ade80":p>=75?"#22d3ee":p>=50?"#fbbf24":"#f87171",borderRadius:3,transition:"width .3s"}}/></div>
                  <div style={{color:p>=100?"#4ade80":p>=75?"#22d3ee":"#4a7fa8",fontSize:13}}>{p}% of monthly goal</div>
                </div>}
              </div>
            ):(
              <div style={{marginTop:4}}><button onClick={()=>{setGoalInput("");setEditGoal(true);}} style={{background:"none",border:"1px dashed #1a3550",borderRadius:3,padding:"2px 8px",color:"#2a4a6a",fontSize:13,cursor:"pointer"}}>+ set goal</button></div>
            );
          })()}
          {repBm&&repBm.monthly>0&&<BmBar label={nMos===1?"FUNDED vs BENCHMARK":"AVG/MO vs BENCHMARK"} value={nMos===1?selAmt:Math.round(avgAmtPerMo)} target={repBm.monthly} fmt={fmt$} color={groupColor}/>}
        </StatBox>

        {/* APPS */}
        <StatBox label={`Apps — ${periodLabel}`} onExpand={()=>setDrill({key:"apps",title:"Apps"})}>
          <MetricRow label="Sent" value={selSent} color="#f1f5f9"/>
          <MetricRow label="Received" value={selRec} color="#a8c4d8"/>
          <MetricRow label="Approved" value={selApp} color="#fbbf24"/>
          {selSent>0&&<>
            <div style={{marginTop:8,padding:"6px 8px",background:"#060e1a",borderRadius:4,border:"1px solid #0f2438"}}>
              <MetricRow label="Submit Rate" value={pct(selRec,selSent)} color={convC(selRec,selSent)} noLine/>
              <MetricRow label="Approval Rate" value={pct(selApp,selRec)} color={convC(selApp,selRec)} noLine/>
              <MetricRow label="Close Rate" value={pct(selUnits,selSent)} color={convC(selUnits,selSent)} noLine/>
            </div>
          </>}
        </StatBox>

        {/* CONVERSION */}
        <StatBox label={`Conversion — ${periodLabel}`} onExpand={()=>setDrill({key:"conversion",title:"Conversion Rates"})}>
          <MetricRow label="Submission" value={pct(selRec,selSent)} color={convC(selRec,selSent)} sub="Received ÷ Sent"/>
          <MetricRow label="Approval" value={pct(selApp,selRec)} color={convC(selApp,selRec)} sub="Approved ÷ Received"/>
          <MetricRow label="Close Rate" value={pct(selUnits,selApp)} color={convC(selUnits,selApp)} sub="Funded ÷ Approved"/>
          <MetricRow label="Overall" value={pct(selUnits,selSent)} color={convC(selUnits,selSent)} sub="Funded ÷ Sent" noLine/>
        </StatBox>

        {/* CALL LOG */}
        <StatBox label="Call Log (2025)" onExpand={()=>setDrill({key:"calls",title:"Call Log"})}>
          {calls.dials>0 ? <>
            <MetricRow label="Dials" value={calls.dials.toLocaleString()} color="#f1f5f9"/>
            <MetricRow label="Contacts" value={calls.contacts} color="#22d3ee"/>
            <MetricRow label="Contact Rate" value={`${calls.contactPct}%`}
              color={calls.contactPct>=20?"#34d399":calls.contactPct>=10?"#fbbf24":"#f87171"}
              sub={calls.contactPct>=20?"Above target":calls.contactPct>=10?"Below average":"Urgent — under 10%"}/>
            <div style={{marginTop:10}}>
              <div style={{height:6,background:"#0a1f35",borderRadius:3}}>
                <div style={{width:`${Math.min(100,calls.contactPct*3)}%`,height:"100%",background:calls.contactPct>=20?"#34d399":calls.contactPct>=10?"#fbbf24":"#f87171",borderRadius:3}}/>
              </div>
              <div style={{color:"#4a7fa8",fontSize:13,marginTop:4}}>30%+ elite · 20%+ strong · &lt;10% urgent</div>
            </div>
          </> : <div style={{color:"#4a7fa8",fontSize:15,marginTop:8}}>No call data available</div>}
        </StatBox>

        {/* MONTHLY POINTS */}
        <StatBox label="Monthly Points" onExpand={()=>setDrill({key:"points",title:"Monthly Points"})}>
          {ptsData.length>0 ? <>
            <MiniBar data={ptsData} dataKey="pts" color="#22d3ee" groupColor="#22d3ee" refVal={avgPts} height={90}/>
            <MetricRow label="Avg (Dec–Feb)" value={avgPts} color="#22d3ee" sub={`${ptsData.length} months with data`}/>
            <MetricRow label="Feb Points" value={rep.febPts??0} color={rep.febPts>=avgPts?"#34d399":"#f87171"} noLine/>
          </> : <div style={{color:"#4a7fa8",fontSize:15,marginTop:8}}>No points data available</div>}
        </StatBox>

      </div>

      {/* Product Mix */}
      {(()=>{
        const {products}=React.useContext(ProductsCtx);
        const moYear=(mo)=>"2025";
        const repProds={};
        PRODUCT_TYPES.forEach(pt=>{repProds[pt.key]={units:0,amount:0};});
        rep.mos.forEach(m=>{
          const key=`${rep.name}::${moYear(m.month)}::${m.month}`;
          const d=products[key]||{};
          PRODUCT_TYPES.forEach(pt=>{
            repProds[pt.key].units+=(d[pt.key]?.units||0);
            repProds[pt.key].amount+=(d[pt.key]?.amount||0);
          });
        });
        const hasAny=PRODUCT_TYPES.some(pt=>repProds[pt.key].amount>0||repProds[pt.key].units>0);
        const totalAmt=PRODUCT_TYPES.reduce((s,pt)=>s+repProds[pt.key].amount,0);
        const totalUnits=PRODUCT_TYPES.reduce((s,pt)=>s+repProds[pt.key].units,0);
        if(!hasAny) return (
          <div style={{background:"#0d1e32",border:"1px dashed #1a3550",borderRadius:6,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
            <span style={{color:"#4a7fa8",fontSize:22}}>📦</span>
            <div>
              <div style={{color:"#4a7fa8",fontSize:14,fontWeight:700,letterSpacing:1}}>NO PRODUCT MIX DATA</div>
              <div style={{color:"#2a4a6a",fontSize:13,marginTop:2}}>Go to <strong style={{color:"#22d3ee"}}>Data Entry</strong> → select this rep & a month → expand <strong style={{color:"#22d3ee"}}>Product Breakdown</strong></div>
            </div>
          </div>
        );
        const pieData=PRODUCT_TYPES.map(pt=>({name:pt.label,value:repProds[pt.key].amount,color:pt.color,units:repProds[pt.key].units})).filter(d=>d.value>0);
        return (
          <div style={{background:"#0d1e32",border:`1px solid ${groupColor}33`,borderRadius:6,padding:14,marginBottom:16}}>
            <div style={{color:"#7ec8e3",fontSize:12,letterSpacing:2,fontWeight:700,marginBottom:12}}>PRODUCT MIX — ALL TIME</div>
            <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>
              <div style={{flex:"0 0 160px"}}>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart><Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={62} paddingAngle={2} innerRadius={28}>
                    {pieData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Pie>
                  <Tooltip contentStyle={{background:"#0a1525",border:"1px solid #22d3ee44",fontSize:13}} formatter={(v,n,p)=>[`${fmt$(v)} · ${p.payload.units} deals`,n]}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:5,minWidth:180}}>
                {pieData.map(pt=>{
                  const pct=totalAmt>0?Math.round(pt.value/totalAmt*100):0;
                  return (
                    <div key={pt.name} style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:8,height:8,background:pt.color,borderRadius:"50%",flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                          <span style={{color:pt.color,fontSize:13,fontWeight:700}}>{pt.name}</span>
                          <span style={{color:"#f1f5f9",fontSize:13}}>{fmt$(pt.value)}</span>
                        </div>
                        <div style={{height:3,background:"#0a1f35",borderRadius:2}}>
                          <div style={{width:`${pct}%`,height:"100%",background:pt.color,borderRadius:2}}/>
                        </div>
                        <div style={{color:"#4a7fa8",fontSize:14,marginTop:2}}>{pt.units} deal{pt.units!==1?"s":""} · {pct}%</div>
                      </div>
                    </div>
                  );
                })}
                <div style={{borderTop:"1px solid #1a3550",paddingTop:6,marginTop:2,display:"flex",justifyContent:"space-between"}}>
                  <span style={{color:"#4a7fa8",fontSize:12}}>TOTAL: {totalUnits} deals</span>
                  <span style={{color:"#f1f5f9",fontSize:12,fontWeight:700}}>{fmt$(totalAmt)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Month-by-Month */}
      <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:6,padding:14}}>
        <div style={{color:"#7ec8e3",fontSize:12,letterSpacing:2,fontWeight:700,marginBottom:10}}>MONTH-BY-MONTH</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
            <thead><tr style={{borderBottom:"1px solid #0a1f35",background:"#06111f"}}>
              {["MONTH","APPS SENT","RECEIVED","APPROVED","UNITS","FUNDED $","CLOSE RATE","MTG %","POINTS"].map(h=>(
                <th key={h} style={{padding:"6px 10px",color:"#7ec8e3",fontSize:14,letterSpacing:1,textAlign:"left",fontWeight:800,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rep.mos.map((m,i)=>{
                const pts=m.month==="Feb"?rep.febPts:m.month==="Jan"?rep.janPts:m.month==="Dec"?rep.decPts:null;
                const mClose=m.approved>0?Math.round((m.funded/m.approved)*100):null;
                const mCloseC=mClose===null?"#4a7fa8":mClose>=70?"#34d399":mClose>=40?"#fbbf24":"#f87171";
                return (
                  <tr key={m.month} style={{borderBottom:"1px solid #070e1c",background:i%2?"#0d1e32":"#0a1728"}}>
                    <td style={{padding:"7px 10px",color:m.month==="Feb"?groupColor:"#f1f5f9",fontFamily:"'Bebas Neue',sans-serif",fontSize:17,letterSpacing:1}}>{m.month}</td>
                    <td style={{padding:"7px 10px",color:"#94a3b8"}}>{m.sent||"—"}</td>
                    <td style={{padding:"7px 10px",color:"#a8c4d8"}}>{m.received||"—"}</td>
                    <td style={{padding:"7px 10px",color:"#fbbf24"}}>{m.approved||"—"}</td>
                    <td style={{padding:"7px 10px",color:m.funded>0?"#22d3ee":"#4a7fa8"}}>{m.funded||"—"}</td>
                    <td style={{padding:"7px 10px",color:m.fundedAmt>0?"#34d399":"#4a7fa8"}}>{m.fundedAmt>0?fmt$(m.fundedAmt):"—"}</td>
                    <td style={{padding:"7px 10px",color:mCloseC,fontWeight:mClose>=70?700:400}}>{mClose!==null?`${mClose}%`:"—"}</td>
                    <td style={{padding:"7px 10px",color:m.meetingPct>=70?"#34d399":m.meetingPct>=40?"#fbbf24":m.meetingPct>0?"#fb923c":"#4a7fa8"}}>{m.meetingPct!=null?`${m.meetingPct}%`:"—"}</td>
                    <td style={{padding:"7px 10px",fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:pts!==null?(pts>=avgPts?"#22d3ee":"#f87171"):"#4a7fa8"}}>{pts!==null?pts:"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}



function TeamComparisonView({onSel, active=[]}) {
  const {useState,useMemo} = React;
  const {meetingMode,focusRep,maskName}=React.useContext(MeetingCtx);
  const MOS_ALL=["Oct","Nov","Dec","Jan","Feb"];
  const [selMonth,setSelMonth]=useState("Dec");
  const [sortCol,setSortCol]=useState({col:"fundedAmt",dir:"desc"});
  const [filt,setFilt]=useState("all");

  const rows=useMemo(()=>{
    let d=filt==="all"?active:active.filter(r=>r.group===filt);
    return [...d].map(r=>{
      const mo=r.mos.find(m=>m.month===selMonth)||{};
      return {
        ...r,
        sent:mo.sent||0, received:mo.received||0,
        approved:mo.approved||0, units:mo.funded||0,
        fundedAmt:mo.fundedAmt||0, meetingPct:mo.meetingPct||0,
        appPct:mo.sent>0?Math.round((mo.approved/mo.sent)*100):0,
        closePct:mo.sent>0?Math.round((mo.funded/mo.sent)*100):0,
      };
    }).sort((a,b)=>{
      const m=sortCol.dir==="asc"?1:-1;
      return m*((b[sortCol.col]||0)-(a[sortCol.col]||0));
    });
  },[selMonth,sortCol,filt]);

  const totals=useMemo(()=>({
    sent:rows.reduce((s,r)=>s+r.sent,0),
    received:rows.reduce((s,r)=>s+r.received,0),
    approved:rows.reduce((s,r)=>s+r.approved,0),
    units:rows.reduce((s,r)=>s+r.units,0),
    fundedAmt:rows.reduce((s,r)=>s+r.fundedAmt,0),
  }),[rows]);

  const hdStyle={padding:"9px 10px",color:"#7ec8e3",fontSize:12,letterSpacing:1.2,fontWeight:700,textAlign:"left",whiteSpace:"nowrap",cursor:"pointer",userSelect:"none"};
  const sort=(col)=>setSortCol(p=>p.col===col?{col,dir:p.dir==="desc"?"asc":"desc"}:{col,dir:"desc"});
  const sc=(col)=>sortCol.col===col?(sortCol.dir==="desc"?" ▼":" ▲"):" ↕";

  const MONTHS_2025=["Oct","Nov","Dec"];

  return (
    <div>
      {/* Month selector */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <span style={{color:"#4a7fa8",fontSize:13,letterSpacing:1}}>MONTH:</span>
        {[...MONTHS_2025].map(mo=>{
          const is26=false;
          const active=selMonth===mo;
          const c=is26?"#22d3ee":"#a78bfa";
          return (
            <button key={mo} onClick={()=>setSelMonth(mo)}
              style={{background:active?`${c}22`:"#0a1525",border:`1px solid ${active?c:"#1a3550"}`,borderRadius:4,padding:"5px 14px",color:active?c:"#4a7fa8",fontSize:16,letterSpacing:.8,cursor:"pointer",fontFamily:"'DM Mono',monospace",fontWeight:active?700:400}}>
              {mo} '{is26?"26":"25"}
            </button>
          );
        })}
        <div style={{width:1,height:20,background:"#1a3550",margin:"0 4px"}}/>
        {["all",...POS_GROUPS.map(g=>g.key)].map(k=>{
          const gc=POS_GROUPS.find(g=>g.key===k);
          const on=filt===k;
          return <button key={k} onClick={()=>setFilt(k)} style={{background:on?(gc?.color||"#22d3ee")+"22":"#0f2438",border:`1px solid ${on?(gc?.color||"#22d3ee"):"#1a3550"}`,color:on?(gc?.color||"#22d3ee"):"#a8c4d8",borderRadius:4,padding:"4px 12px",fontSize:16,letterSpacing:.5,cursor:"pointer"}}>{k==="all"?"ALL":k.toUpperCase()}</button>;
        })}
      </div>

      {/* Summary totals */}
      <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap"}}>
        {[["SENT",totals.sent,"#94b8cc"],["RECEIVED",totals.received,"#a78bfa"],["APPROVED",totals.approved,"#fbbf24"],["UNITS FUNDED",totals.units,"#34d399"],["TOTAL FUNDED $",fmt$(totals.fundedAmt),"#22d3ee"]].map(([l,v,c])=>(
          <div key={l} style={{background:"#0d1e32",border:`1px solid ${c}33`,borderRadius:6,padding:"10px 16px",textAlign:"center",minWidth:90}}>
            <div style={{color:c,fontFamily:"'Bebas Neue',sans-serif",fontSize:26,lineHeight:1}}>{v}</div>
            <div style={{color:"#4a7fa8",fontSize:14,letterSpacing:1.2,marginTop:3}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
          <thead>
            <tr style={{borderBottom:"2px solid #1a3550",background:"#06111f"}}>
              <th style={hdStyle}>REP</th>
              <th style={hdStyle}>GROUP</th>
              {[
                ["sent","SENT"],["received","RECEIVED"],["approved","APPROVED"],
                ["units","UNITS"],["fundedAmt","FUNDED $"],
                ["appPct","APPROVE %"],["closePct","CLOSE %"],["meetingPct","MTG %"],
              ].map(([col,lbl])=>(
                <th key={col} onClick={()=>sort(col)} style={{...hdStyle,color:sortCol.col===col?"#22d3ee":"#7ec8e3"}}>
                  {lbl}<span style={{color:sortCol.col===col?"#22d3ee":"#4a7fa8",fontSize:12}}>{sc(col)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=>{
              const gc=POS_GROUPS.find(p=>p.key===r.group);
              const gc2=gc?.color||"#22d3ee";
              return (
                <tr key={r.name} style={{borderBottom:"1px solid #070e1c",background:i%2?"#0d1e32":"#0a1728",cursor:meetingMode&&focusRep&&r.name!==focusRep?"default":"pointer",opacity:meetingMode&&focusRep&&r.name!==focusRep?.65:1}} onClick={()=>(!meetingMode||!focusRep||r.name===focusRep)&&onSel(r.name)}>
                  <td style={{padding:"9px 10px",color:"#f1f5f9",fontWeight:500,position:"sticky",left:0,zIndex:1,background:"inherit",whiteSpace:"nowrap"}}>{maskName(r.name)}</td>
                  <td style={{padding:"9px 10px"}}><span style={{background:`${gc2}22`,color:gc2,padding:"2px 8px",borderRadius:10,fontSize:12,whiteSpace:"nowrap"}}>{r.group||"—"}</span></td>
                  <td style={{padding:"9px 10px",color:"#94b8cc",fontSize:15}}>{r.sent||"—"}</td>
                  <td style={{padding:"9px 10px",color:"#a78bfa",fontSize:15}}>{r.received||"—"}</td>
                  <td style={{padding:"9px 10px",color:"#fbbf24",fontSize:15}}>{r.approved||"—"}</td>
                  <td style={{padding:"9px 10px",color:r.units>0?"#34d399":"#2a4a6a",fontFamily:"'Bebas Neue',sans-serif",fontSize:24}}>{r.units||"—"}</td>
                  <td style={{padding:"9px 10px",color:r.fundedAmt>0?"#22d3ee":"#2a4a6a",fontWeight:600}}>{r.fundedAmt>0?fmt$(r.fundedAmt):"—"}</td>
                  <td style={{padding:"9px 10px",color:r.appPct>=70?"#34d399":r.appPct>=40?"#fbbf24":r.appPct>0?"#fb923c":"#2a4a6a",fontSize:14}}>{r.sent>0?`${r.appPct}%`:"—"}</td>
                  <td style={{padding:"9px 10px",color:r.closePct>=30?"#34d399":r.closePct>=15?"#fbbf24":r.closePct>0?"#fb923c":"#2a4a6a",fontSize:14}}>{r.sent>0?`${r.closePct}%`:"—"}</td>
                  <td style={{padding:"9px 10px",color:r.meetingPct>=70?"#34d399":r.meetingPct>=40?"#fbbf24":r.meetingPct>0?"#fb923c":"#2a4a6a",fontSize:14}}>{r.meetingPct>0?`${r.meetingPct}%`:"—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── PrintView ────────────────────────────────────────────────────────────────
function PrintView({rep, groupColor, goal, onClose}) {
  const {maskName}=React.useContext(MeetingCtx);
  const gc=POS_GROUPS.find(p=>p.key===rep.group);
  const ct=calcTenureTier(rep);
  const pt=calcPerfTier(rep);
  const fmt$v=v=>v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:v>0?`$${Math.round(v)}`:"—";
  const totFunded=rep.mos.reduce((s,m)=>s+(m.fundedAmt||0),0);
  const totUnits=rep.mos.reduce((s,m)=>s+(m.funded||0),0);
  const totSent=rep.mos.reduce((s,m)=>s+(m.sent||0),0);
  const g=goal?.monthly||rep.expMonthly||0;
  const febAmt=rep.feb?.fundedAmt||0;
  const goalPct=g?Math.min(100,Math.round((febAmt/g)*100)):null;

  return (
    <div style={{position:"fixed",inset:0,zIndex:999,background:"rgba(4,9,18,0.95)",display:"flex",alignItems:"center",justifyContent:"center",overflowY:"auto",padding:"20px"}}>
      <div style={{background:"#080f1a",border:`2px solid ${groupColor}`,borderRadius:10,width:"100%",maxWidth:720,padding:"28px 32px",fontFamily:"'DM Mono','Courier New',monospace",color:"#f1f5f9"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:40,color:groupColor,letterSpacing:3,lineHeight:1}}>{maskName(rep.name)}</div>
            <div style={{color:"#4a7fa8",fontSize:14,marginTop:4,letterSpacing:1}}>{rep.group} · Started {rep.start} · {rep.status}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>window.print()} style={{background:`${groupColor}22`,border:`1px solid ${groupColor}`,borderRadius:4,padding:"6px 14px",color:groupColor,fontSize:15,cursor:"pointer",letterSpacing:1}}>🖨 PRINT</button>
            <button onClick={onClose} style={{background:"#1a0505",border:"1px solid #f87171",borderRadius:4,padding:"6px 14px",color:"#f87171",fontSize:15,cursor:"pointer"}}>✕ CLOSE</button>
          </div>
        </div>

        {/* Tier + status row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
          {[
            {l:"TENURE TIER",v:`T${ct.tier}`,s:ct.pos,c:TIER_COLORS[ct.tier]||"#9db4c8"},
            {l:"PERF TIER",  v:`T${pt.tier}`,s:pt.pos,c:TIER_COLORS[pt.tier]||"#9db4c8"},
            {l:"5-MO UNITS", v:totUnits, s:"all time",c:"#22d3ee"},
            {l:"5-MO FUNDED",v:fmt$v(totFunded),s:"all time",c:"#34d399"},
          ].map(({l,v,s,c})=>(
            <div key={l} style={{background:"#0d1e32",border:`1px solid ${c}33`,borderRadius:6,padding:"10px 12px",textAlign:"center"}}>
              <div style={{color:"#4a7fa8",fontSize:12,letterSpacing:1.2,marginBottom:4}}>{l}</div>
              <div style={{color:c,fontFamily:"'Bebas Neue',sans-serif",fontSize:28,lineHeight:1}}>{v}</div>
              <div style={{color:"#4a7fa8",fontSize:12,marginTop:3}}>{s}</div>
            </div>
          ))}
        </div>

        {/* Goal bar */}
        {g>0&&<div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:6,padding:"10px 14px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{color:"#4a7fa8",fontSize:13,letterSpacing:1}}>FEB GOAL PROGRESS</div>
            <div style={{color:"#4a7fa8",fontSize:13}}>{fmt$v(febAmt)} / {fmt$v(g)}</div>
          </div>
          <div style={{height:8,background:"#0a1f35",borderRadius:4,marginBottom:4}}>
            <div style={{width:`${goalPct}%`,height:"100%",background:goalPct>=100?"#4ade80":goalPct>=75?"#22d3ee":goalPct>=50?"#fbbf24":"#f87171",borderRadius:4,transition:"width .3s"}}/>
          </div>
          <div style={{color:goalPct>=100?"#4ade80":goalPct>=75?"#22d3ee":"#f87171",fontSize:14,fontWeight:700}}>{goalPct}% of monthly goal</div>
        </div>}

        {/* Monthly breakdown table */}
        <div style={{marginBottom:14}}>
          <div style={{color:groupColor,fontSize:16,fontWeight:800,letterSpacing:1.5,marginBottom:10,borderBottom:`1px solid ${groupColor}33`,paddingBottom:6}}>MONTHLY BREAKDOWN</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:15}}>
            <thead><tr style={{borderBottom:"1px solid #1a3550"}}>
              {["MONTH","SENT","RECEIVED","APPROVED","UNITS","FUNDED $","APPROVE %","CLOSE %","MTG %"].map(h=>(
                <th key={h} style={{padding:"5px 8px",color:"#4a7fa8",fontSize:12,letterSpacing:1,textAlign:"left",fontWeight:700}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[...rep.mos].reverse().map((m,i)=>{
                const isFeb=m.month==="Feb";
                const appP=m.sent>0?Math.round((m.approved/m.sent)*100):0;
                const closeP=m.sent>0?Math.round((m.funded/m.sent)*100):0;
                return (
                  <tr key={m.month} style={{borderBottom:"1px solid #070e1c",background:isFeb?`${groupColor}0d`:"transparent"}}>
                    <td style={{padding:"5px 8px",color:isFeb?groupColor:"#a8c4d8",fontWeight:isFeb?700:400,fontSize:14}}>{m.month} '25{isFeb&&<span style={{fontSize:14,marginLeft:4,color:groupColor}}>●</span>}</td>
                    <td style={{padding:"5px 8px",color:"#94b8cc"}}>{m.sent||"—"}</td>
                    <td style={{padding:"5px 8px",color:"#a78bfa"}}>{m.received||"—"}</td>
                    <td style={{padding:"5px 8px",color:"#fbbf24"}}>{m.approved||"—"}</td>
                    <td style={{padding:"5px 8px",color:m.funded>0?"#34d399":"#4a7fa8",fontFamily:"'Bebas Neue',sans-serif",fontSize:20}}>{m.funded||"—"}</td>
                    <td style={{padding:"5px 8px",color:m.fundedAmt>0?"#22d3ee":"#4a7fa8"}}>{m.fundedAmt>0?fmt$v(m.fundedAmt):"—"}</td>
                    <td style={{padding:"5px 8px",color:appP>=70?"#34d399":appP>=40?"#fbbf24":appP>0?"#fb923c":"#4a7fa8"}}>{m.sent>0?`${appP}%`:"—"}</td>
                    <td style={{padding:"5px 8px",color:closeP>=30?"#34d399":closeP>=15?"#fbbf24":closeP>0?"#fb923c":"#4a7fa8"}}>{m.sent>0?`${closeP}%`:"—"}</td>
                    <td style={{padding:"5px 8px",color:m.meetingPct>=70?"#34d399":m.meetingPct>=40?"#fbbf24":m.meetingPct>0?"#fb923c":"#4a7fa8"}}>{m.meetingPct>0?`${m.meetingPct}%`:"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{color:"#2a4a6a",fontSize:12,textAlign:"right",marginTop:10}}>Generated {new Date().toLocaleDateString()} · REP PERFORMANCE TRACKER — HISTORICAL DATA</div>
      </div>
    </div>
  );
}

// ─── RepCompareView ───────────────────────────────────────────────────────────
function RepCompareView() {
  const {useState,useMemo} = React;
  const {bm} = React.useContext(BenchmarksCtx);
  const {meetingMode,maskName}=React.useContext(MeetingCtx);
  const [selected,setSelected]=useState([]);
  const [searches,setSearches]=useState(["","",""]);
  const [period,setPeriod]=useState("Dec");
  const [open25,setOpen25]=useState(false);

  // MOS_2025 is global
  const MOS25_OPTS=[{id:"Oct",label:"October"},{id:"Nov",label:"November"},{id:"Dec",label:"December"}];

  const fmt$v=v=>v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:v>0?`$${Math.round(v)}`:"—";

  const calcStatusForPeriod=(funded,numMos,expMonthly,isMax=false)=>calcStatus(funded,numMos,expMonthly,isMax);

  // Compute period-filtered stats for a rep
  const getStats=(r)=>{
    let mos;
    if(period==="all")       mos=r.mos;
    else if(period==="2025") mos=r.mos.filter(m=>MOS_2025.includes(m.month));
    else                     mos=r.mos.filter(m=>m.month===period);

    const sent    =mos.reduce((s,m)=>s+(m.sent||0),0);
    const received=mos.reduce((s,m)=>s+(m.received||0),0);
    const approved=mos.reduce((s,m)=>s+(m.approved||0),0);
    const units   =mos.reduce((s,m)=>s+(m.funded||0),0);
    const funded  =mos.reduce((s,m)=>s+(m.fundedAmt||0),0);
    const numMos  =mos.length||1;
    const avgFunded=Math.round(funded/numMos);
    const mtgMos  =mos.filter(m=>m.meetingPct>0);
    const avgMtg  =mtgMos.length?Math.round(mtgMos.reduce((s,m)=>s+m.meetingPct,0)/mtgMos.length):0;
    const subPct  =sent>0?Math.round((received/sent)*100):0;
    const appPct  =received>0?Math.round((approved/received)*100):0;
    const closePct=approved>0?Math.round((units/approved)*100):0;
    const overallPct=sent>0?Math.round((units/sent)*100):0;
    // Points — map single months or sum for ranges
    const PTS_MAP={Oct:null,Nov:null,Dec:"decPts",Jan:"janPts",Feb:"febPts"};
    const pts=MOS25_OPTS.filter(m=>mos.find(mo=>mo.month===m.id)).reduce((s,m)=>{
      const k=PTS_MAP[m.id]; return k&&r[k]!=null?s+(r[k]||0):s;
    },0)||null;
    // Period-accurate status (not r.status which is all-time)
    const status=calcStatusForPeriod(funded,numMos,r.expMonthly);

    return {sent,received,approved,units,funded,avgFunded,avgMtg,subPct,appPct,closePct,overallPct,pts,numMos,status};
  };

  const periodLabel=period==="all"?"ALL TIME":period==="2025"?"2025 YTD":MOS25_OPTS.find(m=>m.id===period)?.label||period;

  const addRep=(name)=>{
    if(selected.includes(name)||selected.length>=3) return;
    setSelected(p=>[...p,name]);
  };
  const removeRep=(name)=>setSelected(p=>p.filter(x=>x!==name));
  const setSearch=(slot,val)=>setSearches(p=>{const n=[...p];n[slot]=val;return n;});
  const {allReps:ALL_CTX}=React.useContext(AllRepsCtx);
  const reps=selected.map(n=>ALL_CTX.find(r=>r.name===n)).filter(Boolean);

  // Build metric definitions using getStats per rep
  const buildMetrics=(r)=>{
    const s=getStats(r);
    const tt=calcTenureTier(r,bm);
    const pt=calcPerfTier(r,bm);
    const gc=POS_GROUPS.find(p=>p.key===r.group);
    return {
      status:   {display:<span style={{color:STATUS_CFG[s.status]?.text||"#22d3ee",fontWeight:700,fontSize:14}}>{s.status}</span>,      val:0},
      position: {display:<span style={{color:gc?.color||"#22d3ee",fontSize:14}}>{r.group}</span>,                                        val:0},
      start:    {display:<span style={{color:"#7ec8e3",fontSize:14}}>{r.start}</span>,                                                   val:0},
      tenureTier:{display:<span style={{color:TIER_COLORS[tt.tier]||"#9db4c8",fontFamily:"'Bebas Neue',sans-serif",fontSize:28}}>T{tt.tier}</span>, val:tt.tier},
      perfTier: {display:<span style={{color:TIER_COLORS[pt.tier]||"#9db4c8",fontFamily:"'Bebas Neue',sans-serif",fontSize:28}}>T{pt.tier}</span>, val:pt.tier},
      pts:      {display:<span style={{color:"#22d3ee",fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1}}>{s.pts??'—'}</span>, val:s.pts??0},
      units:    {display:<span style={{color:"#34d399",fontFamily:"'Bebas Neue',sans-serif",fontSize:32}}>{s.units||'—'}</span>,         val:s.units},
      funded:   {display:<span style={{color:"#22d3ee",fontFamily:"'Bebas Neue',sans-serif",fontSize:26}}>{fmt$v(s.funded)}</span>,      val:s.funded},
      avgFunded:{display:<span style={{color:"#a8c4d8",fontSize:15}}>{fmt$v(s.avgFunded)}<span style={{color:"#4a7fa8",fontSize:12}}>/mo</span></span>, val:s.avgFunded},
      sent:     {display:<span style={{color:"#94b8cc",fontSize:20,fontFamily:"'Bebas Neue',sans-serif"}}>{s.sent||'—'}</span>,          val:s.sent},
      subPct:   {display:<span style={{color:s.subPct>=60?"#34d399":s.subPct>=40?"#fbbf24":"#f87171",fontSize:20,fontFamily:"'Bebas Neue',sans-serif"}}>{s.sent?`${s.subPct}%`:'—'}</span>, val:s.subPct},
      appPct:   {display:<span style={{color:s.appPct>=60?"#34d399":s.appPct>=40?"#fbbf24":"#f87171",fontSize:20,fontFamily:"'Bebas Neue',sans-serif"}}>{s.received?`${s.appPct}%`:'—'}</span>, val:s.appPct},
      closePct: {display:<span style={{color:s.closePct>=40?"#34d399":s.closePct>=20?"#fbbf24":"#f87171",fontSize:20,fontFamily:"'Bebas Neue',sans-serif"}}>{s.approved?`${s.closePct}%`:'—'}</span>, val:s.closePct},
      overallPct:{display:<span style={{color:s.overallPct>=20?"#34d399":s.overallPct>=10?"#fbbf24":"#f87171",fontSize:20,fontFamily:"'Bebas Neue',sans-serif"}}>{s.sent?`${s.overallPct}%`:'—'}</span>, val:s.overallPct},
      avgMtg:   {display:<span style={{color:s.avgMtg>=70?"#34d399":s.avgMtg>=40?"#fbbf24":s.avgMtg>0?"#fb923c":"#4a7fa8",fontSize:20,fontFamily:"'Bebas Neue',sans-serif"}}>{s.avgMtg?`${s.avgMtg}%`:'—'}</span>, val:s.avgMtg},
      contact:  {display:(()=>{const p=r.raw?.calls?.contactPct||0;return <span style={{color:p>=20?"#34d399":p>=10?"#fbbf24":"#f87171",fontSize:20,fontFamily:"'Bebas Neue',sans-serif"}}>{p?`${p}%`:'—'}</span>;})()||null, val:r.raw?.calls?.contactPct||0},
    };
  };

  const ROWS=[
    {key:"status",    label:"STATUS",          isNum:false},
    {key:"position",  label:"POSITION",        isNum:false},
    {key:"start",     label:"START DATE",      isNum:false},
    {key:"tenureTier",label:"TENURE TIER",     isNum:true},
    {key:"perfTier",  label:"PERF TIER",       isNum:true},
    {key:"pts",       label:"POINTS",          isNum:true},
    {key:"units",     label:"UNITS FUNDED",    isNum:true},
    {key:"funded",    label:"FUNDED $",        isNum:true},
    {key:"avgFunded", label:"AVG $/MONTH",     isNum:true},
    {key:"sent",      label:"APPS SENT",       isNum:true},
    {key:"subPct",    label:"SUBMISSION %",    isNum:true},
    {key:"appPct",    label:"APPROVAL %",      isNum:true},
    {key:"closePct",  label:"CLOSE RATE",      isNum:true},
    {key:"overallPct",label:"OVERALL CONV %",  isNum:true},
    {key:"avgMtg",    label:"AVG MEETING %",   isNum:true},
    {key:"contact",   label:"CONTACT RATE",    isNum:true},
  ];

  const allMetrics=useMemo(()=>reps.map(r=>({name:r.name,metrics:buildMetrics(r)})),[reps,period]);

  const getBest=(key)=>{
    if(reps.length<2) return null;
    const vals=allMetrics.map(m=>({name:m.name,val:m.metrics[key]?.val||0}));
    const max=Math.max(...vals.map(v=>v.val));
    if(max===0) return null;
    const winners=vals.filter(v=>v.val===max);
    return winners.length===1?winners[0].name:null; // no ▲ if tied
  };

  const {isActive:isRepActive} = React.useContext(RosterCtx);
  const allNames=ALL_CTX.map(r=>r.name);
  const tabBtn=(active,color,onClick,label)=>(
    <button onClick={onClick} style={{background:active?`${color}22`:"#0a1525",border:`1px solid ${active?color:"#1a3550"}`,borderRadius:4,padding:"5px 12px",color:active?color:"#4a7fa8",fontSize:15,letterSpacing:.8,cursor:"pointer",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap",fontWeight:active?700:400}}>{label}</button>
  );

  return (
    <div onClick={()=>{if(open25)setOpen25(false);}}>
      <div style={{color:"#7ec8e3",fontSize:16,fontWeight:800,letterSpacing:2,marginBottom:4}}>REP COMPARISON</div>
      <div style={{color:"#4a7fa8",fontSize:14,marginBottom:14}}>Select up to 3 reps · choose a time window · compare side-by-side</div>

      {/* Period selector */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <span style={{color:"#4a7fa8",fontSize:13,letterSpacing:1,marginRight:2}}>PERIOD:</span>
        {/* 2025 dropdown */}
        <div style={{position:"relative"}}>
          {tabBtn(MOS_2025.includes(period)||period==="2025","#a78bfa",e=>{e.stopPropagation();setOpen25(p=>!p);},`2025${MOS_2025.includes(period)?` · ${period}`:" ▾"}`)}
          {open25&&(
            <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,background:"#0d1e32",border:"1px solid #1e3a5f",borderRadius:6,zIndex:50,minWidth:130,boxShadow:"0 4px 16px rgba(0,0,0,.5)",padding:"4px 0"}} onClick={e=>e.stopPropagation()}>
              {tabBtn(period==="2025","#a78bfa",()=>{setPeriod("2025");setOpen25(false);},"2025 YTD")}
              {MOS25_OPTS.map(m=>(<div key={m.id}>{tabBtn(period===m.id,"#a78bfa",()=>{setPeriod(m.id);setOpen25(false);},m.label)}</div>))}
            </div>
          )}
        </div>
        {tabBtn(period==="all","#7ec8e3",()=>{setPeriod("all");setOpen25(false);},"ALL TIME")}
        <span style={{color:"#4a7fa8",fontSize:13,marginLeft:4}}>Showing: <span style={{color:"#22d3ee",fontWeight:700}}>{periodLabel}</span></span>
      </div>

      {/* Rep slot pickers */}
      <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        {[0,1,2].map(slot=>{
          const selRep=reps[slot];
          const search=searches[slot]||"";
          const filtered=allNames.filter(n=>n.toLowerCase().includes(search.toLowerCase())&&!selected.includes(n));
          const gc=selRep?POS_GROUPS.find(p=>p.key===selRep.group):null;
          return (
            <div key={slot} style={{flex:1,minWidth:160,background:"#0d1e32",border:`1px solid ${selRep?(gc?.color||"#22d3ee")+"66":"#1a3550"}`,borderRadius:8,padding:"12px"}}>
              {selRep ? (
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{color:gc?.color||"#22d3ee",fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:1}}>{maskName(selRep.name)}</div>
                      {!isRepActive(selRep.name)&&<span style={{fontSize:14,color:"#f87171",border:"1px solid #f8717155",borderRadius:3,padding:"1px 5px",letterSpacing:.5}}>FORMER</span>}
                    </div>
                    <div style={{color:"#4a7fa8",fontSize:13,marginTop:2}}>{selRep.group} · {selRep.start}</div>
                  </div>
                  <button onClick={()=>removeRep(selRep.name)} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:17,padding:0,lineHeight:1}}>✕</button>
                </div>
              ) : (
                <div>
                  <div style={{color:"#4a7fa8",fontSize:13,letterSpacing:1,marginBottom:6}}>REP {slot+1}</div>
                  <input
                    value={search}
                    onChange={e=>setSearch(slot,e.target.value)}
                    placeholder="Search rep..."
                    style={{width:"100%",background:"#06111f",border:"1px solid #1a3550",borderRadius:4,padding:"5px 8px",color:"#e2e8f0",fontSize:14,outline:"none"}}
                  />
                  {search&&filtered.length>0&&(
                    <div style={{background:"#06111f",border:"1px solid #1a3550",borderRadius:4,marginTop:2,maxHeight:120,overflowY:"auto"}}>
                      {filtered.slice(0,8).map(n=>{
                        const isFmr=!isRepActive(n);
                        return (
                          <div key={n} onClick={()=>{addRep(n);setSearch(slot,"");}} style={{padding:"5px 8px",cursor:"pointer",color:isFmr?"#4a7fa8":"#a8c4d8",fontSize:15,display:"flex",alignItems:"center",gap:6}} onMouseEnter={e=>e.currentTarget.style.background="#0f2438"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            {n}
                            {isFmr&&<span style={{fontSize:14,color:"#f87171",border:"1px solid #f8717155",borderRadius:3,padding:"0 4px",letterSpacing:.5}}>FORMER</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Comparison table */}
      {reps.length>=2 ? (
        <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:8,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#06111f",borderBottom:"2px solid #1a3550"}}>
                <th style={{padding:"10px 14px",color:"#4a7fa8",fontSize:13,letterSpacing:1.2,textAlign:"left",width:150}}>
                  METRIC <span style={{color:"#2a4a6a",fontSize:14}}>· {periodLabel}</span>
                </th>
                {reps.map(r=>{
                  const gc=POS_GROUPS.find(p=>p.key===r.group);
                  return (
                    <th key={r.name} style={{padding:"10px 14px",textAlign:"center",borderLeft:"1px solid #0a1f35"}}>
                      <div style={{color:gc?.color||"#22d3ee",fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:1.5}}>{maskName(r.name)}</div>
                      <div style={{color:"#4a7fa8",fontSize:12,marginTop:2}}>{r.group}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row,ri)=>{
                const bestName=row.isNum?getBest(row.key):null;
                const isSectionBreak=["tenureTier","units","sent","avgMtg"].includes(row.key);
                return (
                  <tr key={row.key} style={{borderBottom:"1px solid #070e1c",background:isSectionBreak?"#060f1c":ri%2?"#0d1e32":"#0a1728",borderTop:isSectionBreak?"2px solid #1a3550":undefined}}>
                    <td style={{padding:"9px 14px",color:isSectionBreak?"#7ec8e3":"#4a7fa8",fontSize:13,letterSpacing:1,fontWeight:700}}>{row.label}</td>
                    {allMetrics.map(({name,metrics})=>{
                      const isBest=bestName===name;
                      return (
                        <td key={name} style={{padding:"9px 14px",textAlign:"center",background:isBest?"#091f12":undefined,borderLeft:"1px solid #0a1f35"}}>
                          {metrics[row.key]?.display}
                          {isBest&&<div style={{color:"#4ade80",fontSize:14,letterSpacing:1,marginTop:2}}>▲ BEST</div>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{color:"#2a4a6a",fontSize:15,fontStyle:"italic",textAlign:"center",padding:"40px 0"}}>Add at least 2 reps to see comparison</div>
      )}
    </div>
  );
}

// ─── DataEntryView ────────────────────────────────────────────────────────────
// ─── Product Breakdown Entry (used inside DataEntryView) ─────────────────────
function ProductBreakdownEntry({selRep,selYear,selMonth}) {
  const {useState,useMemo}=React;
  const {products,saveProducts}=React.useContext(ProductsCtx);
  const [open,setOpen]=useState(false);
  const [form,setForm]=useState({});
  const [saved,setSaved]=useState(false);

  const makeKey=(name,yr,mo)=>`${name}::${yr}::${mo}`;
  const key=selRep&&selYear&&selMonth?makeKey(selRep,selYear,selMonth):null;
  const existing=key?products[key]||{}:{};

  // Init form from existing when key changes
  React.useEffect(()=>{
    if(key){const f={};PRODUCT_TYPES.forEach(pt=>{f[`${pt.key}_units`]=existing[pt.key]?.units||"";f[`${pt.key}_amt`]=existing[pt.key]?.amount||"";});setForm(f);}
  },[key]);

  const fmt$=(v)=>v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:v>0?`$${Math.round(v)}`:"—";
  const totalUnits=PRODUCT_TYPES.reduce((s,pt)=>s+(parseInt(form[`${pt.key}_units`])||0),0);
  const totalAmt=PRODUCT_TYPES.reduce((s,pt)=>s+(parseFloat(String(form[`${pt.key}_amt`]).replace(/[$,]/g,""))||0),0);

  const handleSave=async()=>{
    if(!key)return;
    const breakdown={};
    PRODUCT_TYPES.forEach(pt=>{
      const u=parseInt(form[`${pt.key}_units`])||0;
      const a=parseFloat(String(form[`${pt.key}_amt`]).replace(/[$,]/g,""))||0;
      if(u>0||a>0)breakdown[pt.key]={units:u,amount:a};
    });
    await saveProducts({...products,[key]:breakdown});
    setSaved(true);setTimeout(()=>setSaved(false),1800);
  };

  const hasExisting=Object.keys(existing).length>0;

  return (
    <div style={{marginTop:12,border:"1px solid #1a3550",borderRadius:6,overflow:"hidden"}}>
      <button onClick={()=>setOpen(p=>!p)} style={{width:"100%",background:"#0a1728",border:"none",padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:selRep?"pointer":"not-allowed",opacity:selRep?1:.5}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:"#34d399",fontSize:13,letterSpacing:1.5}}>📦 PRODUCT BREAKDOWN</span>
          {hasExisting&&<span style={{background:"#34d39922",color:"#34d399",fontSize:14,padding:"1px 6px",borderRadius:3,letterSpacing:.5}}>HAS DATA</span>}
          {totalUnits>0&&!open&&<span style={{color:"#4a7fa8",fontSize:13}}>{totalUnits} deals · {fmt$(totalAmt)}</span>}
        </div>
        <span style={{color:"#4a7fa8",fontSize:13}}>{open?"▲":"▼"}</span>
      </button>
      {open&&selRep&&(
        <div style={{background:"#06111f",padding:"12px"}}>
          <div style={{color:"#4a7fa8",fontSize:12,letterSpacing:1,marginBottom:10}}>TAG DEALS BY PRODUCT TYPE — {selRep} · {selMonth} {selYear}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {PRODUCT_TYPES.map(pt=>(
              <div key={pt.key} style={{background:"#0a1728",border:`1px solid ${pt.color}33`,borderRadius:4,padding:"8px 10px"}}>
                <div style={{color:pt.color,fontSize:13,fontWeight:700,marginBottom:6,letterSpacing:.5}}>{pt.label}</div>
                <div style={{display:"flex",gap:6}}>
                  <div style={{flex:1}}>
                    <div style={{color:"#4a7fa8",fontSize:14,marginBottom:2}}>DEALS</div>
                    <input type="number" value={form[`${pt.key}_units`]||""} onChange={e=>setForm(p=>({...p,[`${pt.key}_units`]:e.target.value}))} placeholder="0"
                      style={{width:"100%",background:"#060d18",border:"1px solid #1a3550",borderRadius:3,padding:"3px 6px",color:"#e2e8f0",fontSize:14,outline:"none"}}/>
                  </div>
                  <div style={{flex:2}}>
                    <div style={{color:"#4a7fa8",fontSize:14,marginBottom:2}}>AMOUNT $</div>
                    <input type="number" value={form[`${pt.key}_amt`]||""} onChange={e=>setForm(p=>({...p,[`${pt.key}_amt`]:e.target.value}))} placeholder="0"
                      style={{width:"100%",background:"#060d18",border:"1px solid #1a3550",borderRadius:3,padding:"3px 6px",color:"#e2e8f0",fontSize:14,outline:"none"}}/>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:"#4a7fa8",fontSize:13}}>Total: <span style={{color:"#f1f5f9"}}>{totalUnits} deals</span> · <span style={{color:"#34d399"}}>{totalAmt>0?fmt$(totalAmt):"$0"}</span></div>
            <button onClick={handleSave} style={{background:saved?"#052e16":"#0d2210",border:`1px solid ${saved?"#4ade80":"#34d399"}`,borderRadius:4,padding:"5px 14px",color:saved?"#4ade80":"#34d399",fontSize:14,cursor:"pointer",fontWeight:700,letterSpacing:1}}>
              {saved?"✓ SAVED":"SAVE BREAKDOWN"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DataEntryView() {
  const {useState,useEffect,useRef,useMemo} = React;

  // ── Year / Month config ─────────────────────────────────────────────────────
  const ALL_MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const YEAR_OPTS=["2024","2025","2026","2027"]; // extend as needed
  // Year colors for visual differentiation
  const YEAR_COLORS={"2024":"#a78bfa","2025":"#818cf8","2026":"#22d3ee","2027":"#34d399"};

  const FIELDS=[
    {key:"sent",      label:"Apps Sent",    type:"number"},
    {key:"received",  label:"Received",     type:"number"},
    {key:"approved",  label:"Approved",     type:"number"},
    {key:"funded",    label:"Units Funded", type:"number"},
    {key:"fundedAmt", label:"Funded $",     type:"number"},
    {key:"meetingPct",label:"Meeting %",    type:"number"},
    {key:"pts",       label:"Points",       type:"number"},
  ];

  // Header aliases for CSV import — case-insensitive
  const HEADER_MAP={
    "rep name":"rep","rep":"rep","name":"rep","rep/name":"rep",
    "month":"month","close month":"month","funding month":"month",
    "year":"year","fiscal year":"year","yr":"year",
    "apps sent":"sent","sent":"sent","submissions":"sent","submitted":"sent","apps submitted":"sent",
    "received":"received","apps received":"received","apps rec":"received","received apps":"received",
    "approved":"approved","apps approved":"approved","apps app":"approved","approved apps":"approved",
    "units":"funded","units funded":"funded","funded units":"funded","deals":"funded","deal":"funded","funded deals":"funded",
    "funded amount":"fundedAmt","funded $":"fundedAmt","amount funded":"fundedAmt",
    "revenue":"fundedAmt","funding amount":"fundedAmt","funded amt":"fundedAmt","total funded":"fundedAmt",
    "meeting %":"meetingPct","meeting pct":"meetingPct","mtg %":"meetingPct","mtg pct":"meetingPct","meeting":"meetingPct","attendance %":"meetingPct",
  };

  // Storage key format: "rep::YYYY::Mon" — year-aware, no collisions
  const makeKey=(rep,year,month)=>`${rep}::${year}::${month}`;

  const [selRep,setSelRep]=useState("");
  const [selYear,setSelYear]=useState("2025");
  const [selMonth,setSelMonth]=useState("Mar");
  const [form,setForm]=useState({});
  const [saved,setSaved]=useState(false);
  const [pending,setPending]=useState({});
  const [search,setSearch]=useState("");
  const [editKey,setEditKey]=useState(null);
  const [lastUndo,setLastUndo]=useState(null);
  const [filterYear,setFilterYear]=useState("all"); // for staged entries panel
  // CSV state
  const [csvPreview,setCsvPreview]=useState(null);
  const [csvImporting,setCsvImporting]=useState(false);
  const [csvMsg,setCsvMsg]=useState("");
  const fileRef=useRef();

  useEffect(()=>{
    (async()=>{
      try{
        const r=await storage.get(DATA_STORAGE_KEY);
        if(r){
          const loaded=JSON.parse(r.value);
          // Migrate old keys (rep::month) to new format (rep::year::month) assuming 2025/2026
          const migrated={};
          const OLD_2025=["Oct","Nov","Dec"];
          Object.entries(loaded).forEach(([k,v])=>{
            if(k.split("::").length===2){
              // old format — guess year from month
              const [rep,mo]=k.split("::");
              const yr=OLD_2025.includes(mo)?"2025":"2026";
              const newKey=makeKey(rep,v.year||yr,mo);
              migrated[newKey]={...v,year:v.year||yr};
            } else {
              migrated[k]=v;
            }
          });
          setPending(migrated);
        }
      }catch(e){}
    })();
  },[]);

  const savePending=async(next)=>{
    setPending(next);
    try{ await storage.save(DATA_STORAGE_KEY,JSON.stringify(next)); }catch(e){}
  };

  const handleSave=async()=>{
    if(!selRep||!selYear||!selMonth) return;
    const key=makeKey(selRep,selYear,selMonth);
    const prev=pending[key]||null;
    const next={...pending,[key]:{rep:selRep,year:selYear,month:selMonth,...form,savedAt:new Date().toISOString()}};
    setLastUndo({key,entry:prev});
    await savePending(next);
    setSaved(true);
    setTimeout(()=>setSaved(false),2500);
    setForm({});
    setSelRep(""); setSearch("");
    setEditKey(null);
  };

  const startEdit=(key,entry)=>{
    setEditKey(key);
    setSelRep(entry.rep);
    setSearch(entry.rep);
    setSelYear(entry.year||"2025");
    setSelMonth(entry.month);
    setForm(Object.fromEntries(FIELDS.map(f=>[f.key,entry[f.key]??entry[f.key]===0?0:""])));
  };
  const cancelEdit=()=>{setEditKey(null);setSelRep("");setSearch("");setForm({});};

  const deleteEntry=async(key)=>{
    const entry=pending[key];
    setLastUndo({key,entry});
    const {[key]:_,...rest}=pending;
    await savePending(rest);
  };

  const undoLast=async()=>{
    if(!lastUndo) return;
    const {key,entry}=lastUndo;
    const next=entry ? {...pending,[key]:entry} : (()=>{const {[key]:_,...r}=pending;return r;})();
    await savePending(next);
    setLastUndo(null);
  };

  // ── CSV Parser (year-aware) ─────────────────────────────────────────────────
  const parseCSV=(text)=>{
    const lines=text.trim().split(/\r?\n/);
    if(lines.length<2) return {error:"File appears empty"};
    const rawHeaders=lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,"").toLowerCase());
    const colMap={};
    rawHeaders.forEach((h,i)=>{
      const mapped=HEADER_MAP[h];
      if(mapped && !(mapped in colMap)) colMap[mapped]=i;
    });
    if(!("rep" in colMap)) return {error:"Could not find Rep Name column. Expected: 'Rep Name', 'Rep', or 'Name'"};
    if(!("month" in colMap)) return {error:"Could not find Month column. Expected: 'Month'"};

    const hasYearCol="year" in colMap;
    const detectedCols=Object.keys(colMap).filter(k=>k!=="rep"&&k!=="month"&&k!=="year");

    const rows=[];
    const errors=[];
    for(let i=1;i<lines.length;i++){
      const line=lines[i].trim();
      if(!line) continue;
      const cells=line.match(/("(?:[^"]|"")*"|[^,]*)/g)||[];
      const clean=cells.map(c=>c.trim().replace(/^"|"$/g,"").replace(/""/g,'"'));

      const repName=clean[colMap.rep]?.trim();
      let monthRaw=clean[colMap.month]?.trim();
      if(!repName||!monthRaw){errors.push(`Row ${i+1}: missing rep or month`);continue;}

      // Detect year embedded in month cell: "Jan 2025", "Jan-2025", "2025-01", "01/2025"
      let yearFromCell=null;
      const yearMatch=monthRaw.match(/\b(20\d{2})\b/);
      if(yearMatch){ yearFromCell=yearMatch[1]; monthRaw=monthRaw.replace(yearMatch[0],"").replace(/[-/,\s]+/g,""); }

      // Normalize month abbreviation
      const moRaw=monthRaw.trim().slice(0,3);
      const validMo=ALL_MONTHS.find(m=>m.toLowerCase()===moRaw.toLowerCase());
      if(!validMo){errors.push(`Row ${i+1}: unrecognized month "${monthRaw}"`);continue;}

      // Resolve year: column > embedded in cell > fallback to selYear
      let yr=null;
      if(hasYearCol){ const yc=clean[colMap.year]?.trim(); if(/^20\d{2}$/.test(yc)) yr=yc; }
      if(!yr&&yearFromCell) yr=yearFromCell;
      if(!yr) yr=selYear; // fall back to currently selected year in form

      // Match rep name to roster
      const {allReps:ALL_DE}=React.useContext(AllRepsCtx);
      const matched=ALL_DE.find(r=>r.name.toLowerCase()===repName.toLowerCase());
      if(!matched){errors.push(`Row ${i+1}: rep "${repName}" not in roster (check spelling)`);continue;}

      const entry={rep:matched.name,year:yr,month:validMo};
      detectedCols.forEach(col=>{
        const raw=clean[colMap[col]]?.replace(/[$,%\s]/g,"");
        const val=parseFloat(raw);
        if(!isNaN(val)) entry[col]=val;
      });
      rows.push(entry);
    }

    // Group preview by year for summary
    const yearCounts={};
    rows.forEach(r=>{yearCounts[r.year]=(yearCounts[r.year]||0)+1;});
    return {cols:detectedCols,rows,errors,yearCounts,hasYearCol};
  };

  const handleFileUpload=(e)=>{
    const file=e.target.files[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=(ev)=>{
      const result=parseCSV(ev.target.result);
      if(result.error){setCsvMsg(result.error);return;}
      setCsvPreview(result);
      setCsvMsg("");
    };
    reader.readAsText(file);
    e.target.value="";
  };

  const commitCSV=async()=>{
    if(!csvPreview) return;
    setCsvImporting(true);
    const next={...pending};
    csvPreview.rows.forEach(entry=>{
      const key=makeKey(entry.rep,entry.year,entry.month);
      next[key]={...entry,savedAt:new Date().toISOString()};
    });
    await savePending(next);
    setCsvPreview(null);
    setCsvImporting(false);
    const summary=Object.entries(csvPreview.yearCounts).map(([y,n])=>`${n} rows in ${y}`).join(", ");
    setCsvMsg(`✓ Imported ${csvPreview.rows.length} entries — ${summary}`);
    setTimeout(()=>setCsvMsg(""),5000);
  };

  const {allReps:ALL_DE2}=React.useContext(AllRepsCtx);
  const filteredReps=ALL_DE2.map(r=>r.name).filter(n=>n.toLowerCase().includes(search.toLowerCase()));
  const fmt$v=v=>v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:v>0?`$${Number(v).toLocaleString()}`:"—";

  // Group staged entries by year for display
  const groupedPending=useMemo(()=>{
    const groups={};
    Object.entries(pending).forEach(([key,e])=>{
      const yr=e.year||"Unknown";
      if(!groups[yr]) groups[yr]=[];
      groups[yr].push([key,e]);
    });
    // Sort within each year by month order
    Object.values(groups).forEach(arr=>arr.sort((a,b)=>ALL_MONTHS.indexOf(a[1].month)-ALL_MONTHS.indexOf(b[1].month)));
    return groups;
  },[pending]);

  const visibleYears=filterYear==="all"?Object.keys(groupedPending).sort():[filterYear];
  const totalCount=Object.keys(pending).length;

  const yc=YEAR_COLORS[selYear]||"#22d3ee";

  return (
    <div>
      <div style={{color:"#7ec8e3",fontSize:16,fontWeight:800,letterSpacing:2,marginBottom:4}}>DATA ENTRY</div>
      <div style={{color:"#4a7fa8",fontSize:14,marginBottom:16}}>Stage monthly data here for any year. Entries are saved locally until you update the RAW constant in the JSX source.</div>

      {/* CSV Upload Banner */}
      <div style={{background:"#0a1728",border:"1px solid #1e3a5f",borderRadius:8,padding:"12px 16px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:1}}>
            <div style={{color:"#7ec8e3",fontSize:14,fontWeight:700,letterSpacing:1,marginBottom:4}}>📁 IMPORT FROM SALESFORCE CSV</div>
            <div style={{color:"#4a7fa8",fontSize:13,lineHeight:1.8}}>
              Columns in <span style={{color:"#22d3ee"}}>any order</span> · headers auto-detected in row 1<br/>
              <span style={{color:"#a8c4d8"}}>Year</span> resolution order: <span style={{color:"#7ec8e3"}}>Year column</span> → <span style={{color:"#7ec8e3"}}>embedded in Month cell</span> (e.g. "Jan 2025") → <span style={{color:"#7ec8e3"}}>selected year below</span><br/>
              Required: <span style={{color:"#a8c4d8"}}>Rep Name · Month</span> &nbsp;|&nbsp; Optional: Year · Apps Sent · Received · Approved · Units · Funded Amount · Meeting %
            </div>
            {/* Default year for CSV fallback */}
            <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
              <span style={{color:"#4a7fa8",fontSize:13,letterSpacing:.8}}>FALLBACK YEAR FOR ROWS WITHOUT YEAR:</span>
              {YEAR_OPTS.map(y=>(
                <button key={y} onClick={()=>setSelYear(y)} style={{background:selYear===y?`${YEAR_COLORS[y]}22`:"#0a1525",border:`1px solid ${selYear===y?YEAR_COLORS[y]:"#1a3550"}`,borderRadius:4,padding:"3px 9px",color:selYear===y?YEAR_COLORS[y]:"#4a7fa8",fontSize:14,cursor:"pointer",fontWeight:selYear===y?700:400}}>{y}</button>
              ))}
            </div>
          </div>
          <button onClick={()=>fileRef.current?.click()} style={{background:"#0d2a4a",border:"1px solid #22d3ee",borderRadius:6,padding:"10px 18px",color:"#22d3ee",fontSize:14,cursor:"pointer",fontWeight:700,letterSpacing:1,whiteSpace:"nowrap",alignSelf:"flex-start"}}>
            UPLOAD CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFileUpload} style={{display:"none"}}/>
        </div>
        {csvMsg&&<div style={{color:csvMsg.startsWith("✓")?"#4ade80":"#f87171",fontSize:14,marginTop:8,fontWeight:700}}>{csvMsg}</div>}
      </div>

      {/* CSV Preview */}
      {csvPreview&&(
        <div style={{background:"#0d1e32",border:"2px solid #22d3ee",borderRadius:8,padding:16,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:12,flexWrap:"wrap"}}>
            <div>
              <div style={{color:"#22d3ee",fontWeight:700,fontSize:15,letterSpacing:1}}>CSV PREVIEW — {csvPreview.rows.length} ROWS PARSED</div>
              <div style={{color:"#4a7fa8",fontSize:13,marginTop:3}}>
                Years detected: {Object.entries(csvPreview.yearCounts).map(([y,n])=><span key={y} style={{color:YEAR_COLORS[y]||"#a8c4d8",marginRight:8,fontWeight:700}}>{y}: {n} rows</span>)}
              </div>
              <div style={{color:"#4a7fa8",fontSize:13,marginTop:2}}>
                Columns mapped: <span style={{color:"#a8c4d8"}}>{["year ("+(!csvPreview.hasYearCol?"from cell/fallback":"col")+")"].concat(csvPreview.cols).join(", ")||"none"}</span>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setCsvPreview(null)} style={{background:"#1a0505",border:"1px solid #7f1d1d",borderRadius:5,padding:"5px 12px",color:"#f87171",fontSize:14,cursor:"pointer"}}>CANCEL</button>
              <button onClick={commitCSV} disabled={csvImporting||csvPreview.rows.length===0} style={{background:"#052e16",border:"1px solid #166534",borderRadius:5,padding:"5px 14px",color:"#4ade80",fontSize:14,cursor:"pointer",fontWeight:700}}>
                {csvImporting?"IMPORTING…":`CONFIRM IMPORT (${csvPreview.rows.length})`}
              </button>
            </div>
          </div>
          {csvPreview.errors.length>0&&(
            <div style={{background:"#1a0a0a",border:"1px solid #7f1d1d",borderRadius:5,padding:"8px 10px",marginBottom:10}}>
              <div style={{color:"#f87171",fontSize:13,fontWeight:700,marginBottom:4}}>⚠ {csvPreview.errors.length} ROW{csvPreview.errors.length>1?"S":""} SKIPPED:</div>
              {csvPreview.errors.map((e,i)=><div key={i} style={{color:"#fca5a5",fontSize:13,marginBottom:1}}>{e}</div>)}
            </div>
          )}
          <div style={{maxHeight:200,overflowY:"auto",border:"1px solid #0a1f35",borderRadius:5}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"#06111f",position:"sticky",top:0}}>
                  {["REP","YEAR","MONTH",...csvPreview.cols.map(c=>FIELDS.find(f=>f.key===c)?.label||c.toUpperCase())].map(h=>(
                    <th key={h} style={{padding:"5px 8px",color:"#4a7fa8",letterSpacing:.8,textAlign:"left",fontWeight:500}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvPreview.rows.slice(0,50).map((row,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #070e1c",background:i%2?"#0d1e32":"#0a1728"}}>
                    <td style={{padding:"4px 8px",color:"#22d3ee"}}>{row.rep}</td>
                    <td style={{padding:"4px 8px",color:YEAR_COLORS[row.year]||"#a8c4d8",fontWeight:700}}>{row.year}</td>
                    <td style={{padding:"4px 8px",color:"#7ec8e3"}}>{row.month}</td>
                    {csvPreview.cols.map(col=>(
                      <td key={col} style={{padding:"4px 8px",color:"#a8c4d8"}}>
                        {col==="fundedAmt"&&row[col]!=null?fmt$v(row[col]):row[col]!=null?row[col]:"—"}{col==="meetingPct"&&row[col]!=null?"%":""}
                      </td>
                    ))}
                  </tr>
                ))}
                {csvPreview.rows.length>50&&<tr><td colSpan={3+csvPreview.cols.length} style={{padding:"5px 8px",color:"#4a7fa8",fontSize:13}}>…and {csvPreview.rows.length-50} more rows</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24}}>
        {/* Manual entry form */}
        <div style={{background:"#0d1e32",border:`1px solid ${editKey?"#fbbf24":yc+"44"}`,borderRadius:8,padding:"16px"}}>
          <div style={{color:editKey?"#fbbf24":"#7ec8e3",fontSize:15,fontWeight:800,letterSpacing:1.5,marginBottom:14}}>
            {editKey?"✏ EDITING ENTRY":"NEW ENTRY"}
          </div>

          {/* Rep */}
          <div style={{marginBottom:10}}>
            <div style={{color:"#4a7fa8",fontSize:13,letterSpacing:1,marginBottom:4}}>REP</div>
            <input value={search} onChange={e=>{setSearch(e.target.value);setSelRep("");}} placeholder="Search rep..." style={{width:"100%",background:"#06111f",border:"1px solid #1a3550",borderRadius:4,padding:"5px 8px",color:"#e2e8f0",fontSize:15,outline:"none",marginBottom:4}}/>
            {search&&!selRep&&(
              <div style={{background:"#06111f",border:"1px solid #1a3550",borderRadius:4,maxHeight:120,overflowY:"auto"}}>
                {filteredReps.slice(0,8).map(n=>(
                  <div key={n} onClick={()=>{setSelRep(n);setSearch(n);}} style={{padding:"5px 8px",cursor:"pointer",color:"#a8c4d8",fontSize:15}} onMouseEnter={e=>e.currentTarget.style.background="#0f2438"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{n}</div>
                ))}
              </div>
            )}
            {selRep&&<div style={{color:"#22d3ee",fontSize:14,fontWeight:700}}>✓ {selRep}</div>}
          </div>

          {/* Year selector */}
          <div style={{marginBottom:10}}>
            <div style={{color:"#4a7fa8",fontSize:13,letterSpacing:1,marginBottom:6}}>YEAR</div>
            <div style={{display:"flex",gap:6}}>
              {YEAR_OPTS.map(y=>{
                const ycolor=YEAR_COLORS[y]||"#22d3ee";
                return (
                  <button key={y} onClick={()=>setSelYear(y)} style={{background:selYear===y?`${ycolor}22`:"#0a1525",border:`1px solid ${selYear===y?ycolor:"#1a3550"}`,borderRadius:4,padding:"5px 14px",color:selYear===y?ycolor:"#4a7fa8",fontSize:15,cursor:"pointer",fontWeight:selYear===y?700:400,letterSpacing:.5}}>{y}</button>
                );
              })}
            </div>
          </div>

          {/* Month grid — all 12 months */}
          <div style={{marginBottom:12}}>
            <div style={{color:"#4a7fa8",fontSize:13,letterSpacing:1,marginBottom:6}}>MONTH</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:4}}>
              {ALL_MONTHS.map(mo=>{
                const hasEntry=!!pending[makeKey(selRep||"",selYear,mo)];
                const isActive=selMonth===mo;
                return (
                  <button key={mo} onClick={()=>setSelMonth(mo)} style={{
                    background:isActive?`${yc}22`:"#0a1525",
                    border:`1px solid ${isActive?yc:hasEntry&&selRep?"#166534":"#1a3550"}`,
                    borderRadius:4,padding:"5px 2px",
                    color:isActive?yc:hasEntry&&selRep?"#4ade80":"#4a7fa8",
                    fontSize:14,cursor:"pointer",position:"relative",textAlign:"center"
                  }}>
                    {mo}
                    {hasEntry&&selRep&&!isActive&&<div style={{width:4,height:4,background:"#4ade80",borderRadius:"50%",position:"absolute",top:2,right:2}}/>}
                  </button>
                );
              })}
            </div>
            <div style={{color:yc,fontSize:13,fontWeight:700,marginTop:6,letterSpacing:.5}}>
              {selYear} · {selMonth} {selRep&&pending[makeKey(selRep,selYear,selMonth)]?" · ⚠ existing entry — will overwrite":""}
            </div>
          </div>

          {/* Fields */}
          {FIELDS.map(f=>(
            <div key={f.key} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <label style={{color:"#4a7fa8",fontSize:14,width:110,flexShrink:0}}>{f.label}</label>
              <input
                type={f.type}
                value={form[f.key]??""}
                onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}
                placeholder="0"
                style={{flex:1,background:"#06111f",border:"1px solid #1a3550",borderRadius:4,padding:"4px 8px",color:"#e2e8f0",fontSize:15,outline:"none"}}
              />
            </div>
          ))}

          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button
              onClick={handleSave}
              disabled={!selRep||!selYear||!selMonth}
              style={{flex:1,background:selRep?"#052e16":"#0a1f35",border:`1px solid ${selRep?editKey?"#ca8a04":yc+"88":"#1a3550"}`,borderRadius:6,padding:"8px",color:selRep?editKey?"#fbbf24":yc:"#2a4a6a",fontSize:16,cursor:selRep?"pointer":"default",fontWeight:700,letterSpacing:1}}
            >{saved?`✓ ${editKey?"UPDATED":"SAVED"}!`:editKey?"SAVE EDIT":"SAVE ENTRY"}</button>
            {editKey&&<button onClick={cancelEdit} style={{background:"#1a0505",border:"1px solid #7f1d1d",borderRadius:6,padding:"8px 12px",color:"#f87171",fontSize:15,cursor:"pointer"}}>CANCEL</button>}
          </div>

          {/* Product Breakdown (collapsible) */}
          <ProductBreakdownEntry selRep={selRep} selYear={selYear} selMonth={selMonth}/>
        </div>

        {/* Staged entries */}
        <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:8,padding:"16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{color:"#7ec8e3",fontSize:15,fontWeight:800,letterSpacing:1.5}}>STAGED ({totalCount})</div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {lastUndo&&(
                <button onClick={undoLast} style={{background:"#0f2438",border:"1px solid #fbbf24",borderRadius:4,padding:"3px 9px",color:"#fbbf24",fontSize:13,cursor:"pointer"}}>↩ UNDO</button>
              )}
            </div>
          </div>
          {/* Year filter for staged panel */}
          {Object.keys(groupedPending).length>1&&(
            <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
              <button onClick={()=>setFilterYear("all")} style={{background:filterYear==="all"?"#1a3550":"#0a1525",border:"1px solid #1a3550",borderRadius:3,padding:"2px 8px",color:filterYear==="all"?"#e2e8f0":"#4a7fa8",fontSize:13,cursor:"pointer"}}>ALL</button>
              {Object.keys(groupedPending).sort().map(y=>(
                <button key={y} onClick={()=>setFilterYear(y)} style={{background:filterYear===y?`${YEAR_COLORS[y]||"#22d3ee"}22`:"#0a1525",border:`1px solid ${filterYear===y?YEAR_COLORS[y]||"#22d3ee":"#1a3550"}`,borderRadius:3,padding:"2px 8px",color:filterYear===y?YEAR_COLORS[y]||"#22d3ee":"#4a7fa8",fontSize:13,cursor:"pointer",fontWeight:700}}>{y} ({groupedPending[y].length})</button>
              ))}
            </div>
          )}
          {totalCount===0
            ? <div style={{color:"#2a4a6a",fontSize:15,fontStyle:"italic"}}>No staged entries yet</div>
            : <div style={{display:"flex",flexDirection:"column",gap:10,maxHeight:480,overflowY:"auto"}}>
                {visibleYears.map(yr=>(
                  <div key={yr}>
                    <div style={{color:YEAR_COLORS[yr]||"#22d3ee",fontSize:13,fontWeight:700,letterSpacing:1.5,marginBottom:6,paddingBottom:4,borderBottom:`1px solid ${YEAR_COLORS[yr]||"#22d3ee"}33`}}>{yr} · {groupedPending[yr].length} ENTRIES</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {groupedPending[yr].map(([key,e])=>{
                        const isEditing=editKey===key;
                        return (
                          <div key={key} style={{background:isEditing?"#1a1200":"#06111f",border:`1px solid ${isEditing?"#fbbf24":"#1a3550"}`,borderRadius:5,padding:"8px 10px"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                              <div>
                                <span style={{color:"#22d3ee",fontSize:14,fontWeight:700}}>{e.rep}</span>
                                <span style={{color:"#4a7fa8",fontSize:13,marginLeft:6}}>{e.month} {e.year}</span>
                              </div>
                              <div style={{display:"flex",gap:4}}>
                                <button onClick={()=>isEditing?cancelEdit():startEdit(key,e)} style={{background:"none",border:"1px solid #1a3550",borderRadius:3,padding:"1px 6px",color:isEditing?"#fbbf24":"#7ec8e3",fontSize:12,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#22d3ee"} onMouseLeave={e=>e.currentTarget.style.borderColor="#1a3550"}>{isEditing?"EDITING":"EDIT"}</button>
                                <button onClick={()=>deleteEntry(key)} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:14}}>✕</button>
                              </div>
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1px 10px"}}>
                              {FIELDS.filter(f=>e[f.key]!=null&&e[f.key]!=="").map(f=>(
                                <div key={f.key} style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                                  <span style={{color:"#4a7fa8"}}>{f.label}:</span>
                                  <span style={{color:"#e2e8f0"}}>{f.key==="fundedAmt"?fmt$v(Number(e[f.key])):e[f.key]}{f.key==="meetingPct"?"%":""}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
          }
          {totalCount>0&&(
            <div style={{marginTop:12,padding:"10px",background:"#06111f",border:"1px dashed #1a3550",borderRadius:6,color:"#4a7fa8",fontSize:13,lineHeight:1.7}}>
              ⚠ To apply: update the <span style={{color:"#22d3ee"}}>RAW</span> constant and <span style={{color:"#22d3ee"}}>CURRENT_MONTH</span> in the JSX source.
            </div>
          )}
        </div>
      </div>

      {/* CSV Header Mapping Reference */}
      <div style={{background:"#0a1728",border:"1px solid #1e3a5f",borderRadius:8,padding:"20px",marginTop:4}}>
        <div style={{color:"#e2e8f0",fontSize:16,fontWeight:700,letterSpacing:1.5,marginBottom:6}}>📋 CSV COLUMN MAPPING REFERENCE</div>
        <div style={{color:"#7ec8e3",fontSize:14,marginBottom:16}}>Row 1 of your CSV must contain headers. Any of the aliases below will be recognized — columns can be in any order.</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#06111f",borderBottom:"2px solid #22d3ee44"}}>
                {["CSV HEADER — accepted aliases","MAPS TO","NOTES"].map(h=>(
                  <th key={h} style={{padding:"10px 14px",color:"#22d3ee",fontSize:13,letterSpacing:1.4,textAlign:"left",fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                {
                  aliases:["Rep Name","Rep","Name","Rep/Name"],
                  field:"Rep",
                  note:"Case-insensitive · matched against roster"
                },
                {
                  aliases:["Month","Close Month","Funding Month"],
                  field:"Month",
                  note:'Full name ("January"), abbreviation ("Jan"), or number ("01") · also accepts embedded year e.g. "Jan 2025"'
                },
                {
                  aliases:["Year","Fiscal Year","Yr"],
                  field:"Year",
                  note:"Dedicated column — highest priority · overrides embedded year and fallback picker"
                },
                {
                  aliases:["Apps Sent","Sent","Submissions","Submitted","Apps Submitted"],
                  field:"Apps Sent",
                  note:""
                },
                {
                  aliases:["Received","Apps Received","Apps Rec","Received Apps"],
                  field:"Received",
                  note:""
                },
                {
                  aliases:["Approved","Apps Approved","Apps App","Approved Apps"],
                  field:"Approved",
                  note:""
                },
                {
                  aliases:["Units","Units Funded","Funded Units","Deals","Deal","Funded Deals"],
                  field:"Units Funded",
                  note:""
                },
                {
                  aliases:["Funded Amount","Funded $","Amount Funded","Revenue","Funding Amount","Funded Amt","Total Funded"],
                  field:"Funded $",
                  note:"$ signs and commas stripped automatically"
                },
                {
                  aliases:["Meeting %","Meeting Pct","MTG %","MTG Pct","Meeting","Attendance %"],
                  field:"Meeting %",
                  note:"% sign stripped automatically"
                },
              ].map((row,i)=>(
                <tr key={row.field} style={{borderBottom:"1px solid #0f2438",background:i%2===0?"#0d1e32":"#0a1728"}}>
                  <td style={{padding:"11px 14px",verticalAlign:"middle"}}>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {row.aliases.map(a=>(
                        <span key={a} style={{background:"#071422",border:"1px solid #22d3ee55",borderRadius:4,padding:"3px 9px",color:"#22d3ee",fontFamily:"'DM Mono',monospace",fontSize:14,whiteSpace:"nowrap"}}>{a}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{padding:"11px 14px",verticalAlign:"middle",whiteSpace:"nowrap"}}>
                    <span style={{color:"#f1f5f9",fontWeight:700,fontSize:15}}>{row.field}</span>
                  </td>
                  <td style={{padding:"11px 14px",verticalAlign:"middle",color:"#94b8cc",fontSize:14,lineHeight:1.6}}>{row.note||<span style={{color:"#2a4a6a"}}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{marginTop:12,padding:"10px 14px",background:"#06111f",border:"1px solid #1e3a5f",borderRadius:6,fontSize:14,lineHeight:1.8}}>
          <span style={{color:"#fbbf24",fontWeight:700}}>Year resolution order: </span>
          <span style={{color:"#22d3ee"}}>① Year column</span>
          <span style={{color:"#4a7fa8"}}> → </span>
          <span style={{color:"#22d3ee"}}>② Embedded in Month cell</span>
          <span style={{color:"#7ec8e3"}}> (e.g. "Jan 2025")</span>
          <span style={{color:"#4a7fa8"}}> → </span>
          <span style={{color:"#22d3ee"}}>③ Fallback Year picker</span>
          <span style={{color:"#7ec8e3"}}> in upload banner above. If your SF export has no year info, set the fallback picker before uploading.</span>
        </div>
      </div>
    </div>
  );
}

// ─── RosterView ───────────────────────────────────────────────────────────────
function RepRow({rep, isFmr, roster, editName, editVals, setEditVals, startEdit, cancelEdit, commitEdit, reactivate, quickDeactivate}) {
  const isEditing=editName===rep.name;
  const entry=roster[rep.name]||{};
  const totalFunded=rep.mos.reduce((s,m)=>s+(m.fundedAmt||0),0);
  const effectiveGroup=entry.group||rep.group;
  const gc=POS_GROUPS.find(p=>p.key===effectiveGroup);
  const gc_c=gc?.color||"#9db4c8";
  const fmt$v=v=>v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:v>0?`$${Math.round(v)}`:"—";
  return (
    <div style={{background:isEditing?"#0f1e10":isFmr?"#0a0f1a":"#0d1e32",border:`1px solid ${isEditing?"#4ade80":isFmr?"#1a2540":"#1a3550"}`,borderRadius:6,padding:"10px 14px",marginBottom:6}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
            <span style={{color:isFmr?"#4a7fa8":gc_c,fontFamily:"'Bebas Neue',sans-serif",fontSize:32,letterSpacing:.8}}>{rep.name}</span>
            <span style={{background:gc_c+"22",color:gc_c,fontSize:12,padding:"1px 6px",borderRadius:10,letterSpacing:.5}}>{effectiveGroup}</span>
            {isFmr&&entry.endMonth&&<span style={{color:"#f87171",fontSize:12,letterSpacing:.5}}>LEFT {entry.endMonth} {entry.endYear}</span>}
          </div>
          <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
            <span style={{color:"#4a7fa8",fontSize:13}}>Start: <span style={{color:"#a8c4d8"}}>{rep.start}</span></span>
            <span style={{color:"#4a7fa8",fontSize:13}}>Total Funded: <span style={{color:"#34d399"}}>{fmt$v(totalFunded)}</span></span>
            <span style={{color:"#4a7fa8",fontSize:13}}>Months: <span style={{color:"#a8c4d8"}}>{rep.mos.length}</span></span>
            {entry.note&&<span style={{color:"#fbbf24",fontSize:13}}>Note: {entry.note}</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          {!isEditing&&(
            isFmr
              ? <button onClick={()=>reactivate(rep.name)} style={{background:"#052e16",border:"1px solid #166534",borderRadius:4,padding:"4px 10px",color:"#4ade80",fontSize:13,cursor:"pointer",letterSpacing:.5}}>REACTIVATE</button>
              : <button onClick={()=>quickDeactivate(rep)} style={{background:"#1a0505",border:"1px solid #7f1d1d",borderRadius:4,padding:"4px 10px",color:"#f87171",fontSize:13,cursor:"pointer",letterSpacing:.5}}>MARK INACTIVE</button>
          )}
          <button onClick={()=>isEditing?cancelEdit():startEdit(rep)} style={{background:"none",border:"1px solid #1a3550",borderRadius:4,padding:"4px 10px",color:isEditing?"#fbbf24":"#7ec8e3",fontSize:13,cursor:"pointer",letterSpacing:.5}} onMouseEnter={e=>e.currentTarget.style.borderColor="#22d3ee"} onMouseLeave={e=>e.currentTarget.style.borderColor="#1a3550"}>{isEditing?"CANCEL":"EDIT"}</button>
        </div>
      </div>
      {isEditing&&(
        <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid #1a3550"}}>
          <div style={{display:"grid",gridTemplateColumns:"auto auto auto 1fr auto",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <div>
              <div style={{color:"#4a7fa8",fontSize:12,letterSpacing:1,marginBottom:4}}>STATUS</div>
              <div style={{display:"flex",gap:4}}>
                {[{v:true,l:"ACTIVE",c:"#4ade80"},{v:false,l:"INACTIVE",c:"#f87171"}].map(o=>(
                  <button key={String(o.v)} onClick={()=>setEditVals(p=>({...p,active:o.v}))} style={{background:editVals.active===o.v?`${o.c}22`:"#06111f",border:`1px solid ${editVals.active===o.v?o.c:"#1a3550"}`,borderRadius:4,padding:"4px 10px",color:editVals.active===o.v?o.c:"#4a7fa8",fontSize:13,cursor:"pointer",fontWeight:editVals.active===o.v?700:400}}>{o.l}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{color:"#4a7fa8",fontSize:12,letterSpacing:1,marginBottom:4}}>POSITION</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {POS_GROUPS.map(g=>(
                  <button key={g.key} onClick={()=>setEditVals(p=>({...p,group:g.key}))} style={{background:editVals.group===g.key?`${g.color}22`:"#06111f",border:`1px solid ${editVals.group===g.key?g.color:"#1a3550"}`,borderRadius:4,padding:"4px 8px",color:editVals.group===g.key?g.color:"#4a7fa8",fontSize:12,cursor:"pointer",fontWeight:editVals.group===g.key?700:400,letterSpacing:.3}}>{g.key}</button>
                ))}
              </div>
            </div>
            {!editVals.active&&(
              <div>
                <div style={{color:"#4a7fa8",fontSize:12,letterSpacing:1,marginBottom:4}}>DEPARTURE</div>
                <div style={{display:"flex",gap:4}}>
                  <select value={editVals.endMonth} onChange={e=>setEditVals(p=>({...p,endMonth:e.target.value}))} style={{background:"#06111f",border:"1px solid #1a3550",borderRadius:4,padding:"4px 6px",color:"#e2e8f0",fontSize:14,outline:"none"}}>
                    {ALL_MONTHS_12.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={editVals.endYear} onChange={e=>setEditVals(p=>({...p,endYear:e.target.value}))} style={{background:"#06111f",border:"1px solid #1a3550",borderRadius:4,padding:"4px 6px",color:"#e2e8f0",fontSize:14,outline:"none"}}>
                    {YEAR_OPTS.map(y=><option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div>
              <div style={{color:"#4a7fa8",fontSize:12,letterSpacing:1,marginBottom:4}}>NOTE (optional)</div>
              <input value={editVals.note||""} onChange={e=>setEditVals(p=>({...p,note:e.target.value}))} placeholder="e.g. Resigned, Performance termination..." style={{width:"100%",background:"#06111f",border:"1px solid #1a3550",borderRadius:4,padding:"4px 8px",color:"#e2e8f0",fontSize:14,outline:"none"}}/>
            </div>
            <div style={{paddingTop:14}}>
              <button onClick={commitEdit} style={{background:"#052e16",border:"1px solid #166534",borderRadius:4,padding:"5px 14px",color:"#4ade80",fontSize:14,cursor:"pointer",fontWeight:700,letterSpacing:.5}}>SAVE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RosterView() {
  const {useState} = React;
  const {allReps:ALL_RV,saveReps}=React.useContext(AllRepsCtx);
  const ALL_MONTHS_12=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const YEAR_OPTS=["2024","2025","2026","2027"];
  const GRP_OPTS=["Team Leader","OCTA","Up & Comer","RIT","Dept Head"];
  const TIER_OPTS=[0,1,2,5,6,7];

  const [search,setSearch]=useState("");
  const [sortDir,setSortDir]=useState("az");
  const [editIdx,setEditIdx]=useState(null); // index in ALL_RV, or "new"
  const [editVals,setEditVals]=useState({});
  const [saveMsg,setSaveMsg]=useState("");
  const [showFormer,setShowFormer]=useState(true);
  const [confirmDel,setConfirmDel]=useState(null);

  const active=ALL_RV.filter(r=>r.active!==false);
  const former=ALL_RV.filter(r=>r.active===false);
  const fmt$v=v=>v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:v>0?`$${Math.round(v)}`:"—";

  const filtered=(list)=>{
    const f=search?list.filter(r=>r.name.toLowerCase().includes(search.toLowerCase())):list;
    return [...f].sort((a,b)=>sortDir==="az"?a.name.localeCompare(b.name):b.name.localeCompare(a.name));
  };

  const BLANK_REP={name:"",start:"",group:"RIT",expPos:"RIT",tier:0,expTier:0,expMonthly:100000,daysNext:"4",active:true,note:""};

  const startAdd=()=>{setEditIdx("new");setEditVals({...BLANK_REP});};
  const startEdit=(rep,idx)=>{setEditIdx(idx);setEditVals({...rep});};
  const cancelEdit=()=>{setEditIdx(null);setEditVals({});};

  const commitEdit=async()=>{
    if(!editVals.name?.trim()){setSaveMsg("⚠ Name is required");setTimeout(()=>setSaveMsg(""),3000);return;}
    let next;
    if(editIdx==="new"){
      // Check for duplicate name
      if(ALL_RV.find(r=>r.name.toLowerCase()===editVals.name.trim().toLowerCase())){
        setSaveMsg("⚠ Rep with this name already exists");setTimeout(()=>setSaveMsg(""),3000);return;
      }
      next=[...ALL_RV,{...editVals,name:editVals.name.trim(),expMonthly:Number(editVals.expMonthly)||0,tier:Number(editVals.tier)||0,expTier:Number(editVals.expTier)||0}];
    } else {
      next=ALL_RV.map((r,i)=>i===editIdx?{...editVals,name:editVals.name.trim(),expMonthly:Number(editVals.expMonthly)||0,tier:Number(editVals.tier)||0,expTier:Number(editVals.expTier)||0}:r);
    }
    await saveReps(next);
    setEditIdx(null);setEditVals({});
    setSaveMsg(editIdx==="new"?`✓ ${editVals.name.trim()} added`:`✓ ${editVals.name.trim()} updated`);
    setTimeout(()=>setSaveMsg(""),3000);
  };

  const quickToggle=async(rep,idx)=>{
    const next=ALL_RV.map((r,i)=>i===idx?{...r,active:!r.active}:r);
    await saveReps(next);
    setSaveMsg(`✓ ${rep.name} ${rep.active!==false?"deactivated":"reactivated"}`);
    setTimeout(()=>setSaveMsg(""),3000);
  };

  const deleteRep=async(idx)=>{
    const next=ALL_RV.filter((_,i)=>i!==idx);
    await saveReps(next);
    setConfirmDel(null);
    setSaveMsg("✓ Rep removed");
    setTimeout(()=>setSaveMsg(""),3000);
  };

  const inp=(key,label,type="text",opts=null)=>(
    <div key={key} style={{display:"flex",flexDirection:"column",gap:3}}>
      <span style={{color:"#4a7fa8",fontSize:12,letterSpacing:1}}>{label}</span>
      {opts?(
        <select value={editVals[key]||""} onChange={e=>setEditVals(v=>({...v,[key]:e.target.value}))}
          style={{background:"#06111f",border:"1px solid #1a3550",borderRadius:4,color:"#e2e8f0",padding:"5px 8px",fontSize:14}}>
          {opts.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      ):(
        <input type={type} value={editVals[key]||""} onChange={e=>setEditVals(v=>({...v,[key]:e.target.value}))}
          style={{background:"#06111f",border:"1px solid #1a3550",borderRadius:4,color:"#e2e8f0",padding:"5px 8px",fontSize:14,outline:"none"}}/>
      )}
    </div>
  );

  const RepCard=({rep,idx})=>{
    const gc=POS_GROUPS.find(p=>p.key===rep.group);
    const gc2=gc?.color||"#22d3ee";
    const isEditing=editIdx===idx;
    return (
      <div style={{background:"#0d1e32",border:`1px solid ${isEditing?gc2+"88":"#1a3550"}`,borderRadius:6,padding:"12px 14px",marginBottom:8}}>
        {isEditing?(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
              {inp("name","FULL NAME")}
              {inp("start","START DATE","text")}
              {inp("group","GROUP","text",GRP_OPTS)}
              {inp("expPos","EXPECTED POSITION")}
              {inp("tier","CURRENT TIER","text",TIER_OPTS.map(String))}
              {inp("expTier","TENURE TIER","text",TIER_OPTS.map(String))}
              {inp("expMonthly","MONTHLY TARGET $","number")}
              {inp("daysNext","DAYS TO NEXT TIER")}
              {inp("note","NOTE")}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <label style={{display:"flex",alignItems:"center",gap:5,color:"#7ec8e3",fontSize:13,cursor:"pointer"}}>
                <input type="checkbox" checked={editVals.active!==false} onChange={e=>setEditVals(v=>({...v,active:e.target.checked}))}/>
                Active
              </label>
              <button onClick={commitEdit} style={{background:"#052e16",border:"1px solid #166534",borderRadius:4,padding:"4px 14px",color:"#4ade80",fontSize:13,cursor:"pointer"}}>✓ Save</button>
              <button onClick={cancelEdit} style={{background:"none",border:"1px solid #1a3550",borderRadius:4,padding:"4px 14px",color:"#4a7fa8",fontSize:13,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{width:4,height:36,background:gc2,borderRadius:2,flexShrink:0}}/>
            <div style={{flex:1,minWidth:140}}>
              <div style={{color:gc2,fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:1,lineHeight:1.2}}>{rep.name}</div>
              <div style={{color:"#4a7fa8",fontSize:13}}>{rep.group} · Start: {rep.start} · Tier {rep.tier} · {fmt$v(rep.expMonthly)}/mo target</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>startEdit(rep,idx)} style={{background:"#0a1f35",border:"1px solid #1e3a5f",borderRadius:4,padding:"4px 12px",color:"#7ec8e3",fontSize:12,cursor:"pointer"}}>Edit</button>
              <button onClick={()=>quickToggle(rep,idx)} style={{background:rep.active!==false?"#2d1b00":"#052e16",border:`1px solid ${rep.active!==false?"#9a3412":"#166534"}`,borderRadius:4,padding:"4px 10px",color:rep.active!==false?"#fb923c":"#4ade80",fontSize:12,cursor:"pointer"}}>
                {rep.active!==false?"Deactivate":"Reactivate"}
              </button>
              {confirmDel===idx?(
                <span style={{display:"flex",gap:4,alignItems:"center"}}>
                  <span style={{color:"#f87171",fontSize:12}}>Delete?</span>
                  <button onClick={()=>deleteRep(idx)} style={{background:"#3b0a0a",border:"1px solid #991b1b",borderRadius:4,padding:"3px 10px",color:"#f87171",fontSize:12,cursor:"pointer"}}>Yes</button>
                  <button onClick={()=>setConfirmDel(null)} style={{background:"none",border:"1px solid #1a3550",borderRadius:4,padding:"3px 10px",color:"#4a7fa8",fontSize:12,cursor:"pointer"}}>No</button>
                </span>
              ):(
                <button onClick={()=>setConfirmDel(idx)} style={{background:"none",border:"1px solid #3b0a0a",borderRadius:4,padding:"4px 10px",color:"#f87171",fontSize:12,cursor:"pointer"}}>✕</button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{color:"#7ec8e3",fontSize:16,fontWeight:800,letterSpacing:2,marginBottom:4}}>ROSTER MANAGEMENT</div>
      <div style={{color:"#4a7fa8",fontSize:14,marginBottom:16}}>Add reps here first — then enter their monthly data in Data Entry. All rep data is stored in your Gist.</div>

      {/* Summary bar */}
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        {[{l:"ACTIVE",v:active.length,c:"#34d399"},{l:"FORMER",v:former.length,c:"#f87171"},{l:"TOTAL",v:ALL_RV.length,c:"#22d3ee"}].map(s=>(
          <div key={s.l} style={{background:"#0d1e32",border:`1px solid ${s.c}44`,borderRadius:6,padding:"6px 14px",textAlign:"center"}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:s.c,letterSpacing:1,lineHeight:1}}>{s.v}</div>
            <div style={{color:"#4a7fa8",fontSize:12,letterSpacing:1}}>{s.l}</div>
          </div>
        ))}
        <button onClick={startAdd} style={{background:"#052e16",border:"1px solid #166534",borderRadius:6,padding:"8px 18px",color:"#4ade80",fontSize:15,letterSpacing:1,cursor:"pointer",fontWeight:700}}>+ ADD REP</button>
        {saveMsg&&<div style={{color:saveMsg.startsWith("⚠")?"#f87171":"#4ade80",fontSize:14,fontWeight:700}}>{saveMsg}</div>}
      </div>

      {/* Add new rep form */}
      {editIdx==="new"&&(
        <div style={{background:"#0d1e32",border:"1px solid #22d3ee55",borderRadius:6,padding:"14px",marginBottom:16}}>
          <div style={{color:"#22d3ee",fontSize:14,fontWeight:800,letterSpacing:1.5,marginBottom:10}}>NEW REP</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
            {inp("name","FULL NAME")}
            {inp("start","START DATE (MM/DD/YYYY)")}
            {inp("group","GROUP","text",GRP_OPTS)}
            {inp("expPos","TARGET POSITION")}
            {inp("tier","CURRENT TIER","text",TIER_OPTS.map(String))}
            {inp("expTier","TENURE TIER","text",TIER_OPTS.map(String))}
            {inp("expMonthly","MONTHLY TARGET $","number")}
            {inp("daysNext","DAYS TO NEXT TIER")}
            {inp("note","NOTE")}
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={commitEdit} style={{background:"#052e16",border:"1px solid #166534",borderRadius:4,padding:"6px 18px",color:"#4ade80",fontSize:14,cursor:"pointer",fontWeight:700}}>✓ Add Rep</button>
            <button onClick={cancelEdit} style={{background:"none",border:"1px solid #1a3550",borderRadius:4,padding:"6px 14px",color:"#4a7fa8",fontSize:14,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search + Sort */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search reps..." style={{width:"100%",maxWidth:260,background:"#06111f",border:"1px solid #1a3550",borderRadius:5,padding:"6px 10px",color:"#e2e8f0",fontSize:15,outline:"none"}}/>
        <button onClick={()=>setSortDir(d=>d==="az"?"za":"az")} style={{background:"#0a1525",border:"1px solid #1a3550",borderRadius:4,padding:"5px 12px",color:"#7ec8e3",fontSize:13,cursor:"pointer"}}>Sort: {sortDir==="az"?"A→Z":"Z→A"}</button>
        <button onClick={()=>setShowFormer(f=>!f)} style={{background:"#0a1525",border:"1px solid #1a3550",borderRadius:4,padding:"5px 12px",color:"#7ec8e3",fontSize:13,cursor:"pointer"}}>{showFormer?"Hide":"Show"} Former</button>
      </div>

      {ALL_RV.length===0&&(
        <div style={{textAlign:"center",padding:"60px 20px",color:"#2a4a6a"}}>
          <div style={{fontSize:44,marginBottom:16}}>👥</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:2,marginBottom:8}}>NO REPS YET</div>
          <div style={{fontSize:15}}>Click <strong style={{color:"#4ade80"}}>+ ADD REP</strong> above to get started.</div>
        </div>
      )}

      {/* Active reps */}
      {filtered(active).map(rep=>{
        const idx=ALL_RV.findIndex(r=>r.name===rep.name);
        return <RepCard key={rep.name} rep={rep} idx={idx}/>;
      })}

      {/* Former reps */}
      {showFormer&&former.length>0&&(
        <div>
          <div style={{color:"#f87171",fontSize:13,letterSpacing:1.5,fontWeight:700,margin:"16px 0 8px"}}>FORMER REPS ({former.length})</div>
          {filtered(former).map(rep=>{
            const idx=ALL_RV.findIndex(r=>r.name===rep.name);
            return <RepCard key={rep.name} rep={rep} idx={idx}/>;
          })}
        </div>
      )}
    </div>
  );
}

// ─── DeptHeadView ─────────────────────────────────────────────────────────────
function DeptHeadView() {
  const {useState,useMemo}=React;
  const {deptData,saveDeptData}=React.useContext(DeptHeadsCtx);
  const {meetingMode,maskName}=React.useContext(MeetingCtx);
  const MOS_ORDER=["Oct","Nov","Dec","Jan","Feb"];
  const YEAR_OPTS=["2024","2025","2026","2027"];
  const YEAR_COLORS={"2024":"#a78bfa","2025":"#818cf8","2026":"#22d3ee","2027":"#34d399"};
  const fmt$=(v)=>v>=1e6?`$${(v/1e6).toFixed(2)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:v>0?`$${Math.round(v)}`:"—";
  const makeKey=(name,year,month)=>`${name}::${year}::${month}`;
  const moYear=(mo)=>"2025";

  const {allReps:ALL_DH}=React.useContext(AllRepsCtx);
  const maxRep=ALL_DH.find(r=>r.name==="Max Gualtieri");
  const daveRep=ALL_DH.find(r=>r.name==="Dave Salas");

  // ── Max SBA Panel ──────────────────────────────────────────────────────────
  const [maxY,setMaxY]=useState("2025");
  const [maxM,setMaxM]=useState("Dec");
  const [maxForm,setMaxForm]=useState({pipeline:"",pipelineAmt:""});
  const [maxSaved,setMaxSaved]=useState(false);

  const maxMonthly=useMemo(()=>{
    if(!maxRep)return[];
    return MOS_ORDER.map(mo=>{
      const src=maxRep.mos.find(m=>m.month===mo)||{};
      const yr=moYear(mo);
      const custom=deptData[makeKey("Max Gualtieri",yr,mo)]||{};
      const approvalRate=src.received>0?Math.round((src.approved/src.received)*100):0;
      const avgDeal=src.funded>0?Math.round(src.fundedAmt/src.funded):0;
      return{month:mo,year:yr,funded:src.funded||0,fundedAmt:src.fundedAmt||0,approved:src.approved||0,received:src.received||0,approvalRate,avgDeal,pipeline:custom.pipeline||0,pipelineAmt:custom.pipelineAmt||0};
    });
  },[maxRep,deptData]);

  const maxTotals=useMemo(()=>({
    funded:maxMonthly.reduce((s,m)=>s+m.funded,0),
    fundedAmt:maxMonthly.reduce((s,m)=>s+m.fundedAmt,0),
    pipeline:maxMonthly.reduce((s,m)=>s+m.pipeline,0),
    pipelineAmt:maxMonthly.reduce((s,m)=>s+m.pipelineAmt,0),
    avgApproval:Math.round(maxMonthly.reduce((s,m)=>s+m.approvalRate,0)/Math.max(1,maxMonthly.filter(m=>m.received>0).length)),
    avgDeal:Math.round(maxMonthly.filter(m=>m.funded>0).reduce((s,m)=>s+m.avgDeal,0)/Math.max(1,maxMonthly.filter(m=>m.funded>0).length)),
  }),[maxMonthly]);

  const saveMax=async()=>{
    const key=makeKey("Max Gualtieri",maxY,maxM);
    const next={...deptData,[key]:{pipeline:parseInt(maxForm.pipeline)||0,pipelineAmt:parseFloat(String(maxForm.pipelineAmt).replace(/[$,]/g,""))||0}};
    await saveDeptData(next);
    setMaxSaved(true);setTimeout(()=>setMaxSaved(false),1800);
    setMaxForm({pipeline:"",pipelineAmt:""});
  };

  // ── Dave CC Panel ──────────────────────────────────────────────────────────
  const [daveY,setDaveY]=useState("2025");
  const [daveM,setDaveM]=useState("Dec");
  const [daveForm,setDaveForm]=useState({merchants:"",volume:"",avgTicket:"",residuals:""});
  const [daveSaved,setDaveSaved]=useState(false);

  const daveMonthly=useMemo(()=>MOS_ORDER.map(mo=>{
    const yr=moYear(mo);
    const d=deptData[makeKey("Dave Salas",yr,mo)]||{};
    return{month:mo,year:yr,merchants:d.merchants||0,volume:d.volume||0,avgTicket:d.avgTicket||0,residuals:d.residuals||0};
  }),[deptData]);

  const daveTotals=useMemo(()=>({
    merchants:daveMonthly.reduce((s,m)=>s+m.merchants,0),
    volume:daveMonthly.reduce((s,m)=>s+m.volume,0),
    residuals:daveMonthly.reduce((s,m)=>s+m.residuals,0),
    avgTicket:Math.round(daveMonthly.filter(m=>m.avgTicket>0).reduce((s,m)=>s+m.avgTicket,0)/Math.max(1,daveMonthly.filter(m=>m.avgTicket>0).length)),
  }),[daveMonthly]);

  const saveDave=async()=>{
    const key=makeKey("Dave Salas",daveY,daveM);
    const next={...deptData,[key]:{
      merchants:parseInt(daveForm.merchants)||0,
      volume:parseFloat(String(daveForm.volume).replace(/[$,]/g,""))||0,
      avgTicket:parseFloat(String(daveForm.avgTicket).replace(/[$,]/g,""))||0,
      residuals:parseFloat(String(daveForm.residuals).replace(/[$,]/g,""))||0,
    }};
    await saveDeptData(next);
    setDaveSaved(true);setTimeout(()=>setDaveSaved(false),1800);
    setDaveForm({merchants:"",volume:"",avgTicket:"",residuals:""});
  };

  const KPI=({label,value,color,sub})=>(
    <div style={{background:"#0d1e32",border:`1px solid ${color}33`,borderRadius:8,padding:"12px 16px",textAlign:"center",minWidth:110}}>
      <div style={{color:"#4a7fa8",fontSize:12,letterSpacing:1.2,marginBottom:4}}>{label}</div>
      <div style={{color,fontFamily:"'Bebas Neue',sans-serif",fontSize:30,lineHeight:1}}>{value}</div>
      {sub&&<div style={{color:"#4a7fa8",fontSize:12,marginTop:3}}>{sub}</div>}
    </div>
  );

  const panelStyle={flex:1,minWidth:300,background:"#060d18",border:"1px solid #1a3550",borderRadius:10,padding:"20px 24px"};
  const thStyle={padding:"7px 10px",color:"#7ec8e3",fontSize:12,letterSpacing:1,fontWeight:700,textAlign:"left",whiteSpace:"nowrap",borderBottom:"1px solid #0f2438"};
  const tdStyle=(c="#a8c4d8")=>({padding:"7px 10px",color:c,fontSize:14,whiteSpace:"nowrap",borderBottom:"1px solid #070e1c"});

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <div style={{width:4,height:28,background:"#f59e0b",borderRadius:2}}/>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:"#f59e0b",letterSpacing:2}}>DEPARTMENT HEADS</div>
        <div style={{color:"#7ec8e3",fontSize:14,background:"#0d1e32",border:"1px solid #1a3550",borderRadius:4,padding:"3px 10px"}}>Separate Reporting — Excluded from Rep Rankings</div>
      </div>
      <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>

        {/* ── MAX SBA PANEL ─────────────────────────────────── */}
        <div style={panelStyle}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <div style={{background:"#34d39922",border:"1px solid #34d39955",borderRadius:20,padding:"3px 12px"}}>
              <span style={{color:"#34d399",fontFamily:"'Bebas Neue',sans-serif",fontSize:17,letterSpacing:1.5}}>SBA</span>
            </div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:"#34d399",letterSpacing:1.5}}>{meetingMode?maskName("Max Gualtieri"):"Max Gualtieri"}</div>
            <div style={{color:"#4a7fa8",fontSize:13}}>SBA Director · Since {maxRep?.start}</div>
          </div>

          {/* KPIs */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}>
            <KPI label="TOTAL DEALS" value={maxTotals.funded} color="#34d399"/>
            <KPI label="TOTAL FUNDED" value={fmt$(maxTotals.fundedAmt)} color="#22d3ee"/>
            <KPI label="AVG DEAL SIZE" value={fmt$(maxTotals.avgDeal)} color="#a78bfa"/>
            <KPI label="AVG APPROVAL" value={`${maxTotals.avgApproval}%`} color="#fbbf24"/>
            <KPI label="PIPELINE (DEALS)" value={maxTotals.pipeline} color="#fb923c" sub={fmt$(maxTotals.pipelineAmt)}/>
          </div>

          {/* Monthly table */}
          <div style={{overflowX:"auto",marginBottom:20}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>
                {["MONTH","FUNDED","FUNDED $","APPROVED","RECEIVED","APPROVAL %","AVG DEAL","PIPELINE","PIPELINE $"].map(h=><th key={h} style={thStyle}>{h}</th>)}
              </tr></thead>
              <tbody>{maxMonthly.map((m,i)=>(
                <tr key={m.month} style={{background:i%2?"#0d1e32":"#0a1728"}}>
                  <td style={tdStyle("#f1f5f9")}><span style={{fontWeight:700}}>{m.month}</span> <span style={{color:"#4a7fa8",fontSize:12}}>{m.year}</span></td>
                  <td style={tdStyle("#22d3ee")}>{m.funded||"—"}</td>
                  <td style={tdStyle("#34d399")}>{m.fundedAmt>0?fmt$(m.fundedAmt):"—"}</td>
                  <td style={tdStyle()}>{m.approved||"—"}</td>
                  <td style={tdStyle()}>{m.received||"—"}</td>
                  <td style={tdStyle(m.approvalRate>=70?"#34d399":m.approvalRate>=40?"#fbbf24":"#f87171")}>{m.received>0?`${m.approvalRate}%`:"—"}</td>
                  <td style={tdStyle("#a78bfa")}>{m.avgDeal>0?fmt$(m.avgDeal):"—"}</td>
                  <td style={tdStyle("#fb923c")}>{m.pipeline||"—"}</td>
                  <td style={tdStyle("#fb923c")}>{m.pipelineAmt>0?fmt$(m.pipelineAmt):"—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          {/* Pipeline data entry */}
          <div style={{background:"#0a1728",border:"1px solid #1a3550",borderRadius:6,padding:"14px"}}>
            <div style={{color:"#7ec8e3",fontSize:13,letterSpacing:1.5,marginBottom:10}}>ADD PIPELINE DATA</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div>
                <div style={{color:"#4a7fa8",fontSize:12,marginBottom:3}}>YEAR</div>
                <select value={maxY} onChange={e=>setMaxY(e.target.value)} style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:4,color:"#f1f5f9",padding:"5px 8px",fontSize:14,fontFamily:"'DM Mono',monospace"}}>
                  {YEAR_OPTS.map(y=><option key={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <div style={{color:"#4a7fa8",fontSize:12,marginBottom:3}}>MONTH</div>
                <select value={maxM} onChange={e=>setMaxM(e.target.value)} style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:4,color:"#f1f5f9",padding:"5px 8px",fontSize:14,fontFamily:"'DM Mono',monospace"}}>
                  {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              {[{k:"pipeline",lbl:"Pipeline Deals",ph:"e.g. 5"},{k:"pipelineAmt",lbl:"Pipeline $",ph:"e.g. 2500000"}].map(f=>(
                <div key={f.k}>
                  <div style={{color:"#4a7fa8",fontSize:12,marginBottom:3}}>{f.lbl.toUpperCase()}</div>
                  <input value={maxForm[f.k]} onChange={e=>setMaxForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph}
                    style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:4,color:"#f1f5f9",padding:"5px 8px",fontSize:14,fontFamily:"'DM Mono',monospace",width:120}}/>
                </div>
              ))}
              <button onClick={saveMax} style={{background:maxSaved?"#052e16":"#0f2438",border:`1px solid ${maxSaved?"#4ade80":"#34d399"}`,borderRadius:4,padding:"6px 14px",color:maxSaved?"#4ade80":"#34d399",fontSize:14,cursor:"pointer",fontWeight:700,letterSpacing:1}}>
                {maxSaved?"✓ SAVED":"SAVE"}
              </button>
            </div>
          </div>
        </div>

        {/* ── DAVE CC PANEL ──────────────────────────────────── */}
        <div style={panelStyle}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <div style={{background:"#f59e0b22",border:"1px solid #f59e0b55",borderRadius:20,padding:"3px 12px"}}>
              <span style={{color:"#f59e0b",fontFamily:"'Bebas Neue',sans-serif",fontSize:17,letterSpacing:1.5}}>CC</span>
            </div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:"#f59e0b",letterSpacing:1.5}}>{meetingMode?maskName("Dave Salas"):"Dave Salas"}</div>
            <div style={{color:"#4a7fa8",fontSize:13}}>CC Processing Director · Since {daveRep?.start}</div>
          </div>

          {/* KPIs */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}>
            <KPI label="MERCHANTS" value={daveTotals.merchants||"—"} color="#f59e0b"/>
            <KPI label="TOTAL VOLUME" value={daveTotals.volume>0?fmt$(daveTotals.volume):"—"} color="#22d3ee"/>
            <KPI label="AVG TICKET" value={daveTotals.avgTicket>0?fmt$(daveTotals.avgTicket):"—"} color="#a78bfa"/>
            <KPI label="TOTAL RESIDUALS" value={daveTotals.residuals>0?fmt$(daveTotals.residuals):"—"} color="#34d399"/>
          </div>

          {/* Monthly table */}
          <div style={{overflowX:"auto",marginBottom:20}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>
                {["MONTH","MERCHANTS","VOLUME $","AVG TICKET","RESIDUALS $"].map(h=><th key={h} style={thStyle}>{h}</th>)}
              </tr></thead>
              <tbody>{daveMonthly.map((m,i)=>{
                const hasData=m.merchants>0||m.volume>0||m.residuals>0;
                return(
                <tr key={m.month} style={{background:i%2?"#0d1e32":"#0a1728",opacity:hasData?1:.55}}>
                  <td style={tdStyle("#f1f5f9")}><span style={{fontWeight:700}}>{m.month}</span> <span style={{color:"#4a7fa8",fontSize:12}}>{m.year}</span></td>
                  <td style={tdStyle("#f59e0b")}>{m.merchants||"—"}</td>
                  <td style={tdStyle("#22d3ee")}>{m.volume>0?fmt$(m.volume):"—"}</td>
                  <td style={tdStyle("#a78bfa")}>{m.avgTicket>0?fmt$(m.avgTicket):"—"}</td>
                  <td style={tdStyle("#34d399")}>{m.residuals>0?fmt$(m.residuals):"—"}</td>
                </tr>
                );
              })}</tbody>
            </table>
            {daveMonthly.every(m=>m.merchants===0&&m.volume===0)&&(
              <div style={{textAlign:"center",color:"#2a4a6a",fontSize:14,fontStyle:"italic",padding:"16px 0"}}>No CC data yet — use the form below to add monthly entries</div>
            )}
          </div>

          {/* Dave's standard funding data */}
          {daveRep&&(
            <div style={{marginBottom:20}}>
              <div style={{color:"#7ec8e3",fontSize:12,letterSpacing:1.5,marginBottom:8,opacity:.7}}>STANDARD FUNDING ACTIVITY (from main data)</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>
                    {["MONTH","UNITS","FUNDED $","SENT","APPROVED"].map(h=><th key={h} style={thStyle}>{h}</th>)}
                  </tr></thead>
                  <tbody>{MOS_ORDER.map((mo,i)=>{
                    const src=daveRep.mos.find(m=>m.month===mo)||{};
                    return(
                    <tr key={mo} style={{background:i%2?"#0d1e32":"#0a1728"}}>
                      <td style={tdStyle("#f1f5f9")}><span style={{fontWeight:700}}>{mo}</span></td>
                      <td style={tdStyle("#22d3ee")}>{src.funded||"—"}</td>
                      <td style={tdStyle("#34d399")}>{src.fundedAmt>0?fmt$(src.fundedAmt):"—"}</td>
                      <td style={tdStyle()}>{src.sent||"—"}</td>
                      <td style={tdStyle()}>{src.approved||"—"}</td>
                    </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* CC data entry */}
          <div style={{background:"#0a1728",border:"1px solid #1a3550",borderRadius:6,padding:"14px"}}>
            <div style={{color:"#f59e0b",fontSize:13,letterSpacing:1.5,marginBottom:10}}>ADD CC PROCESSING DATA</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div>
                <div style={{color:"#4a7fa8",fontSize:12,marginBottom:3}}>YEAR</div>
                <select value={daveY} onChange={e=>setDaveY(e.target.value)} style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:4,color:"#f1f5f9",padding:"5px 8px",fontSize:14,fontFamily:"'DM Mono',monospace"}}>
                  {YEAR_OPTS.map(y=><option key={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <div style={{color:"#4a7fa8",fontSize:12,marginBottom:3}}>MONTH</div>
                <select value={daveM} onChange={e=>setDaveM(e.target.value)} style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:4,color:"#f1f5f9",padding:"5px 8px",fontSize:14,fontFamily:"'DM Mono',monospace"}}>
                  {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              {[{k:"merchants",lbl:"Merchants",ph:"e.g. 4"},{k:"volume",lbl:"Volume $",ph:"e.g. 85000"},{k:"avgTicket",lbl:"Avg Ticket $",ph:"e.g. 21250"},{k:"residuals",lbl:"Residuals $",ph:"e.g. 2500"}].map(f=>(
                <div key={f.k}>
                  <div style={{color:"#4a7fa8",fontSize:12,marginBottom:3}}>{f.lbl.toUpperCase()}</div>
                  <input value={daveForm[f.k]} onChange={e=>setDaveForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph}
                    style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:4,color:"#f1f5f9",padding:"5px 8px",fontSize:14,fontFamily:"'DM Mono',monospace",width:100}}/>
                </div>
              ))}
              <button onClick={saveDave} style={{background:daveSaved?"#052e16":"#0f2438",border:`1px solid ${daveSaved?"#4ade80":"#f59e0b"}`,borderRadius:4,padding:"6px 14px",color:daveSaved?"#4ade80":"#f59e0b",fontSize:14,cursor:"pointer",fontWeight:700,letterSpacing:1}}>
                {daveSaved?"✓ SAVED":"SAVE"}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── ProductMixView ───────────────────────────────────────────────────────────
function ProductMixView() {
  const {useState,useMemo}=React;
  const {products}=React.useContext(ProductsCtx);
  const {meetingMode,maskName}=React.useContext(MeetingCtx);
  const {isActive}=React.useContext(RosterCtx);

  const _mn=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const CURRENT_MONTH=_mn[new Date().getMonth()];
  const MOS25_OPTS=[{id:"Oct",label:"October"},{id:"Nov",label:"November"},{id:"Dec",label:"December"}];
  const MOS26_OPTS=[{id:"Jan",label:"January"},{id:"Feb",label:"February"},{id:"Mar",label:"March"},{id:"Apr",label:"April"},{id:"May",label:"May"},{id:"Jun",label:"June"},{id:"Jul",label:"July"},{id:"Aug",label:"August"},{id:"Sep",label:"September"}];
  const ALL_MOS_25=["Oct","Nov","Dec"];
  const ALL_MOS_26=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep"];
  const MOS_ALL=[...ALL_MOS_25];
  const moYear=(mo)=>"2025";

  const [period,setPeriod]=useState("Dec");
  const [open25,setOpen25]=useState(false);

  const makeKey=(name,yr,mo)=>`${name}::${yr}::${mo}`;
  const {allReps:ALL_PM}=React.useContext(AllRepsCtx);
  const ACTIVE_REPS=ALL_PM.filter(r=>r.active!==false&&!DEPT_HEAD_NAMES.includes(r.name));

  const is25Mo=MOS25_OPTS.some(m=>m.id===period);
  const is26Mo=MOS26_OPTS.some(m=>m.id===period);
  const periodLabel=period==="all"?"ALL TIME":period==="2025"?"2025 YTD":MOS25_OPTS.find(m=>m.id===period)?.label||period;

  // Determine which months to include based on period
  const activeMos=useMemo(()=>{
    if(period==="all") return MOS_ALL;
    if(period==="2025") return ALL_MOS_25;
    return [period];
  },[period]);

  const tabBtn=(active,color,onClick,children)=>(
    <button onClick={onClick} style={{background:active?`${color}22`:"#0a1525",border:`1px solid ${active?color:"#1a3550"}`,borderRadius:4,padding:"5px 14px",color:active?color:"#4a7fa8",fontSize:15,letterSpacing:.8,cursor:"pointer",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap",fontWeight:active?700:400}}>{children}</button>
  );

  // Build product data for the selected period
  const periodData=useMemo(()=>{
    const repData=ACTIVE_REPS.map(rep=>{
      const byProd={};
      PRODUCT_TYPES.forEach(pt=>{byProd[pt.key]={units:0,amount:0};});
      activeMos.forEach(mo=>{
        const yr=moYear(mo);
        const key=makeKey(rep.name,yr,mo);
        const d=products[key]||{};
        PRODUCT_TYPES.forEach(pt=>{
          byProd[pt.key].units+=(d[pt.key]?.units||0);
          byProd[pt.key].amount+=(d[pt.key]?.amount||0);
        });
      });
      const totalUnits=Object.values(byProd).reduce((s,v)=>s+v.units,0);
      const totalAmount=Object.values(byProd).reduce((s,v)=>s+v.amount,0);
      return{name:rep.name,group:rep.group,byProd,totalUnits,totalAmount};
    }).filter(r=>r.totalUnits>0||r.totalAmount>0);
    return repData;
  },[products,activeMos]);

  // Team-wide totals per product
  const teamTotals=useMemo(()=>{
    const t={};
    PRODUCT_TYPES.forEach(pt=>{t[pt.key]={units:0,amount:0};});
    periodData.forEach(r=>{
      PRODUCT_TYPES.forEach(pt=>{
        t[pt.key].units+=r.byProd[pt.key].units;
        t[pt.key].amount+=r.byProd[pt.key].amount;
      });
    });
    return t;
  },[periodData]);

  const totalAmount=PRODUCT_TYPES.reduce((s,pt)=>s+teamTotals[pt.key].amount,0);
  const totalUnits=PRODUCT_TYPES.reduce((s,pt)=>s+teamTotals[pt.key].units,0);
  const fmt$=(v)=>v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:v>0?`$${Math.round(v)}`:"—";
  const pct=(v,t)=>t>0?`${Math.round(v/t*100)}%`:"—";

  const pieData=PRODUCT_TYPES.map(pt=>({name:pt.label,value:teamTotals[pt.key].amount,color:pt.color,units:teamTotals[pt.key].units})).filter(d=>d.value>0);

  const isEmpty=totalAmount===0&&totalUnits===0;

  return (
    <div onClick={()=>{if(open25)setOpen25(false);}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:4,height:28,background:"#34d399",borderRadius:2}}/>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:"#34d399",letterSpacing:2}}>PRODUCT MIX</div>
          <div style={{color:"#7ec8e3",fontSize:14,background:"#0d1e32",border:"1px solid #1a3550",borderRadius:4,padding:"3px 10px"}}>Tag deals in Data Entry to populate this view</div>
        </div>
      </div>
      {/* Period selector */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {/* 2025 dropdown */}
        <div style={{position:"relative"}}>
          {tabBtn(is25Mo,"#a78bfa",e=>{e.stopPropagation();setOpen25(!open25);},<span>2025 {is25Mo?`· ${periodLabel}`:""} {open25?"▲":"▼"}</span>)}
          {open25&&<div style={{position:"absolute",top:"calc(100% + 4px)",left:0,background:"#0d1e32",border:"1px solid #1e3a5f",borderRadius:6,zIndex:99,minWidth:140,boxShadow:"0 4px 16px rgba(0,0,0,.5)"}}>
            {MOS25_OPTS.map(m=><div key={m.id} onClick={e=>{e.stopPropagation();setPeriod(m.id);setOpen25(false);}} style={{padding:"8px 14px",color:period===m.id?"#a78bfa":"#a8c4d8",background:period===m.id?"#0a1f35":"transparent",cursor:"pointer",fontSize:15,letterSpacing:.8,fontFamily:"'DM Mono',monospace"}}>{m.label}</div>)}
          </div>}
        </div>
        <div style={{width:1,height:20,background:"#1a3550",margin:"0 4px"}}/>
        {[{id:"2025",label:"2025 YTD",c:"#a78bfa"},{id:"all",label:"ALL TIME",c:"#22d3ee"}].map(t=>tabBtn(period===t.id,t.c,()=>{setPeriod(t.id);setOpen25(false);},t.label))}
        <div style={{color:"#4a7fa8",fontSize:14,marginLeft:8}}>{periodLabel}</div>
      </div>

      {isEmpty?(
        <div style={{textAlign:"center",padding:"60px 20px",color:"#2a4a6a"}}>
          <div style={{fontSize:44,marginBottom:16}}>📊</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:2,marginBottom:8}}>NO PRODUCT DATA YET</div>
          <div style={{fontSize:15}}>Go to <strong style={{color:"#22d3ee"}}>DATA ENTRY</strong> → select a rep & month → expand <strong style={{color:"#22d3ee"}}>Product Breakdown</strong> to tag deals by product type</div>
        </div>
      ):(
        <div>
          {/* Team totals + pie */}
          <div style={{display:"flex",gap:16,marginBottom:24,flexWrap:"wrap"}}>
            <div style={{flex:"0 0 300px",background:"#0d1e32",border:"1px solid #1a3550",borderRadius:8,padding:"16px"}}>
              <div style={{color:"#7ec8e3",fontSize:13,letterSpacing:1.5,marginBottom:12}}>TEAM PRODUCT MIX — {periodLabel}</div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart><Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} paddingAngle={2}>
                  {pieData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                </Pie>
                <Tooltip contentStyle={{background:"#0a1525",border:"1px solid #22d3ee44",fontSize:14}} formatter={(v,n,p)=>[`${fmt$(v)} · ${p.payload.units} deals`,n]}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:8,minWidth:220}}>
              {PRODUCT_TYPES.filter(pt=>teamTotals[pt.key].amount>0||teamTotals[pt.key].units>0).map(pt=>(
                <div key={pt.key} style={{background:"#0d1e32",border:`1px solid ${pt.color}33`,borderRadius:6,padding:"10px 14px",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:10,height:10,background:pt.color,borderRadius:"50%",flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{color:pt.color,fontFamily:"'Bebas Neue',sans-serif",fontSize:17,letterSpacing:1}}>{pt.label}</span>
                      <span style={{color:"#f1f5f9",fontWeight:700,fontSize:16}}>{fmt$(teamTotals[pt.key].amount)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
                      <span style={{color:"#4a7fa8",fontSize:12}}>{teamTotals[pt.key].units} deals · {pct(teamTotals[pt.key].amount,totalAmount)} of volume</span>
                      <span style={{color:"#4a7fa8",fontSize:12}}>avg {teamTotals[pt.key].units>0?fmt$(Math.round(teamTotals[pt.key].amount/teamTotals[pt.key].units)):"—"}</span>
                    </div>
                    <div style={{marginTop:5,height:3,background:"#1a3550",borderRadius:2}}>
                      <div style={{width:pct(teamTotals[pt.key].amount,totalAmount),height:"100%",background:pt.color,borderRadius:2,transition:"width .3s"}}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-rep breakdown table */}
          <div style={{background:"#0d1e32",border:"1px solid #1a3550",borderRadius:8,padding:"16px"}}>
            <div style={{color:"#7ec8e3",fontSize:13,letterSpacing:1.5,marginBottom:12}}>PER-REP BREAKDOWN</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
                <thead><tr style={{borderBottom:"2px solid #1a3550"}}>
                  <th style={{padding:"8px 10px",color:"#7ec8e3",fontSize:13,textAlign:"left",whiteSpace:"nowrap"}}>REP</th>
                  {PRODUCT_TYPES.filter(pt=>teamTotals[pt.key].amount>0||teamTotals[pt.key].units>0).map(pt=>(
                    <th key={pt.key} style={{padding:"8px 10px",color:pt.color,fontSize:13,textAlign:"right",whiteSpace:"nowrap"}}>{pt.label}</th>
                  ))}
                  <th style={{padding:"8px 10px",color:"#f1f5f9",fontSize:13,textAlign:"right"}}>TOTAL $</th>
                </tr></thead>
                <tbody>
                  {periodData.sort((a,b)=>b.totalAmount-a.totalAmount).map((r,i)=>{
                    const gc=POS_GROUPS.find(p=>p.key===r.group);
                    return(
                    <tr key={r.name} style={{background:i%2?"#0d1e32":"#0a1728",borderBottom:"1px solid #070e1c"}}>
                      <td style={{padding:"8px 10px",color:gc?.color||"#f1f5f9",fontWeight:500,whiteSpace:"nowrap"}}>{maskName(r.name)}</td>
                      {PRODUCT_TYPES.filter(pt=>teamTotals[pt.key].amount>0||teamTotals[pt.key].units>0).map(pt=>(
                        <td key={pt.key} style={{padding:"8px 10px",textAlign:"right",color:r.byProd[pt.key].amount>0?pt.color:"#2a4a6a",fontSize:14}}>
                          {r.byProd[pt.key].amount>0?fmt$(r.byProd[pt.key].amount):"—"}
                          {r.byProd[pt.key].units>0&&<span style={{color:"#4a7fa8",fontSize:12,marginLeft:4}}>({r.byProd[pt.key].units})</span>}
                        </td>
                      ))}
                      <td style={{padding:"8px 10px",textAlign:"right",color:"#f1f5f9",fontWeight:700}}>{fmt$(r.totalAmount)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TokenSetup({onDone}) {
  const [token, setToken] = React.useState("");
  const [status, setStatus] = React.useState("idle"); // idle | testing | ok | error
  const [err, setErr] = React.useState("");

  async function handleConnect() {
    if (!token.trim()) return;
    setStatus("testing");
    setErr("");
    try {
      const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
        headers: { Authorization: `token ${token.trim()}`, Accept: "application/vnd.github.v3+json" }
      });
      if (r.status === 401) { setStatus("error"); setErr("Invalid token — check it and try again."); return; }
      if (r.status === 404) { setStatus("error"); setErr("Token valid but Gist not found — check the Gist ID."); return; }
      if (!r.ok) { setStatus("error"); setErr(`GitHub error: ${r.status}`); return; }
      storage.configure(token.trim());
      setStatus("ok");
      setTimeout(onDone, 800);
    } catch(e) {
      setStatus("error");
      setErr("Network error — check your connection.");
    }
  }

  return (
    <div style={{minHeight:"100vh",background:"#0f1923",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#1a2535",border:"1px solid #1e3a5f",borderRadius:12,padding:40,width:480,maxWidth:"90vw"}}>
        <div style={{fontSize:26,fontWeight:700,color:"#22d3ee",marginBottom:8,fontFamily:"'Courier New',monospace",letterSpacing:2}}>REP TRACKER</div>
        <div style={{fontSize:16,color:"#64748b",marginBottom:32}}>Connect to GitHub to enable persistent storage</div>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:14,color:"#94a3b8",marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>GitHub Personal Access Token</div>
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleConnect()}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            style={{width:"100%",background:"#0f1923",border:"1px solid #1e3a5f",borderRadius:6,padding:"10px 12px",color:"#e2e8f0",fontSize:16,fontFamily:"monospace",outline:"none"}}
          />
        </div>

        <div style={{fontSize:14,color:"#475569",marginBottom:24,lineHeight:1.6}}>
          Create a token at <span style={{color:"#22d3ee"}}>GitHub → Settings → Developer settings → Personal access tokens</span>.
          Only the <span style={{color:"#fbbf24"}}>gist</span> scope is needed. Set expiration to <span style={{color:"#fbbf24"}}>No expiration</span>.
          Your token is stored only in your browser — never in the code.
        </div>

        <button
          onClick={handleConnect}
          disabled={!token.trim() || status === "testing"}
          style={{width:"100%",background:status==="ok"?"#059669":"#22d3ee",color:"#0f1923",border:"none",borderRadius:6,padding:"11px 0",fontSize:16,fontWeight:700,cursor:"pointer",letterSpacing:1,transition:"background 0.2s"}}
        >
          {status === "testing" ? "CONNECTING..." : status === "ok" ? "✓ CONNECTED" : "CONNECT"}
        </button>

        {status === "error" && (
          <div style={{marginTop:12,color:"#f87171",fontSize:15,textAlign:"center"}}>{err}</div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [tokenReady, setTokenReady] = React.useState(storage.isConfigured());
  if (!tokenReady) return <TokenSetup onDone={() => setTokenReady(true)} />;
  return <AppInner />;
}

function AppInner() {
  const {useState,useEffect,useMemo} = React;


  // ── Benchmarks context ─────────────────────────────────────────────────────
  const [bm,setBm]=useState(BENCHMARKS_DEFAULT);
  useEffect(()=>{
    (async()=>{
      try{
        const r=await storage.get(BENCHMARKS_STORAGE_KEY);
        if(r){
          const saved=JSON.parse(r.value);
          const merged=BENCHMARKS_DEFAULT.map(def=>{const match=saved.find(s=>s.tier===def.tier);return match?{...def,...match}:def;});
          setBm(merged);
        }
      }catch(e){}
    })();
  },[]);
  const saveBm=async(next)=>{setBm(next);try{await storage.save(BENCHMARKS_STORAGE_KEY,JSON.stringify(next));}catch(e){}};

  // ── Reps (v4): loaded from leaderboard-reps-v2 ────────────────────────────
  const [repDefs,setRepDefs]=useState([]); // [{name,start,group,expPos,tier,expTier,expMonthly,daysNext,active,...}]
  const [entryData,setEntryData]=useState({}); // {"name::year::month": {sent,...,pts,...}}
  useEffect(()=>{(async()=>{try{const r=await storage.get(REPS_STORAGE_KEY);if(r)setRepDefs(JSON.parse(r.value));}catch(e){}})();},[]);
  useEffect(()=>{(async()=>{try{const r=await storage.get(DATA_STORAGE_KEY);if(r)setEntryData(JSON.parse(r.value));}catch(e){}})();},[]);
  const saveReps=async(next)=>{setRepDefs(next);try{await storage.save(REPS_STORAGE_KEY,JSON.stringify(next));}catch(e){}};

  // Build dynamic ALL from rep definitions + data entry storage
  const ALL_DYNAMIC=useMemo(()=>{
    const MO_ORD=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return repDefs.map(s=>{
      const mos=Object.entries(entryData)
        .filter(([k])=>k.startsWith(s.name+"::"))
        .map(([k,v])=>({month:v.month||k.split("::")[2],year:v.year||k.split("::")[1],...v}))
        .filter(m=>m.month)
        .sort((a,b)=>(a.year||"2025")!==b.year?(a.year||"2025").localeCompare(b.year||"2025"):MO_ORD.indexOf(a.month)-MO_ORD.indexOf(b.month));
      const mtgMos=mos.filter(m=>m.meetingPct>0);
      const avgMtg=mtgMos.length?Math.round(mtgMos.reduce((a,m)=>a+m.meetingPct,0)/mtgMos.length):0;
      const totalFunded=mos.reduce((a,m)=>a+(m.fundedAmt||0),0);
      const avgMonthly=mos.length?Math.round(totalFunded/mos.length):0;
      const ptsMap={}; mos.forEach(m=>{if(m.pts!=null)ptsMap[m.month]=m.pts;});
      const title=s.tier>=7?"Team Leader":s.tier>=6?"OCTA-Level":s.tier>=5?"Up & Comer":s.tier>=2?"Intermediate":s.tier>=1?"Entry-level":"New, ramping up";
      return {
        ...s, mos, avgMtg, totalFunded, avgMonthly, title,
        unitProg:0, revProg:0,
        raw:{calls:{dials:0,contacts:0,contactPct:0}},
        // Dynamic pts by month — decPts, janPts, febPts, etc.
        ...Object.fromEntries(Object.entries(ptsMap).map(([mo,v])=>[mo.toLowerCase()+"Pts",v])),
      };
    });
  },[repDefs, entryData]);

  // ── Roster context (legacy active toggle — v4 uses active field in repDefs) ─
  const [roster,setRoster]=useState({});
  useEffect(()=>{(async()=>{try{const r=await storage.get(ROSTER_STORAGE_KEY);if(r)setRoster(JSON.parse(r.value));}catch(e){}})();},[]);
  const saveRoster=async(next)=>{setRoster(next);try{await storage.save(ROSTER_STORAGE_KEY,JSON.stringify(next));}catch(e){}};
  const isActive=(name)=>{const d=repDefs.find(r=>r.name===name);return d?d.active!==false:roster[name]?.active!==false;};
  const ACTIVE=useMemo(()=>ALL_DYNAMIC.filter(r=>r.active!==false&&!DEPT_HEAD_NAMES.includes(r.name)),[ALL_DYNAMIC]);
  // ──────────────────────────────────────────────────────────────────────────

  // ── Dept Head custom data ──────────────────────────────────────────────────
  const [deptData,setDeptData]=useState({});
  useEffect(()=>{(async()=>{try{const r=await storage.get(DEPTHEAD_KEY);if(r)setDeptData(JSON.parse(r.value));}catch(e){}})();},[]);
  const saveDeptData=async(next)=>{setDeptData(next);try{await storage.save(DEPTHEAD_KEY,JSON.stringify(next));}catch(e){}};

  // ── Product mix data ───────────────────────────────────────────────────────
  const [products,setProducts]=useState({});
  useEffect(()=>{(async()=>{try{const r=await storage.get(PRODUCTS_KEY);if(r)setProducts(JSON.parse(r.value));}catch(e){}})();},[]);
  const saveProducts=async(next)=>{setProducts(next);try{await storage.save(PRODUCTS_KEY,JSON.stringify(next));}catch(e){}};
  // ──────────────────────────────────────────────────────────────────────────
  const [sel,setSel]=useState(null);
  const [view,setView]=useState("board");
  const [statusFilt,setStatusFilt]=useState("all");
  const [lbPeriod,setLbPeriod]=useState("Dec"); // leaderboard period — shared so header counts match
  const [meetingMode,setMeetingMode]=useState(false);
  const [focusRep,setFocusRep]=useState(null);
  // Stable alphabetical anon map: "Rep 01" … "Rep 35"
  const anonMap=useMemo(()=>{
    const sorted=[...ALL_DYNAMIC].sort((a,b)=>a.name.localeCompare(b.name));
    const m={};
    sorted.forEach((r,i)=>{m[r.name]=`Rep ${String(i+1).padStart(2,"0")}`;});
    return m;
  },[]);
  const maskName=(name)=>meetingMode&&name!==focusRep?(anonMap[name]||name):name;
  const toggleMeeting=()=>{setMeetingMode(m=>{if(m)setFocusRep(null);return !m;});};
  // ──────────────────────────────────────────────────────────────────────────

  const grouped = useMemo(()=>POS_GROUPS.map(g=>({...g,reps:ACTIVE.filter(r=>r.group===g.key)})),[ACTIVE]);
  const teamStats = useMemo(()=>{
    // Compute status for each rep based on the same period the leaderboard is showing
    const getStatus=(r)=>{
      const isMax=r.daysNext==="MAX";
      if(lbPeriod==="all") return calcStatus(r.totalFunded, r.mos.length, r.expMonthly, isMax);
      if(lbPeriod==="2025"){
        const ms=r.mos.filter(m=>MOS_2025.includes(m.month));
        return calcStatus(ms.reduce((s,m)=>s+(m.fundedAmt||0),0), ms.length, r.expMonthly, isMax);
      }
      // single month
      const mo=r.mos.find(m=>m.month===lbPeriod)||{};
      return calcStatus(mo.fundedAmt||0, 1, r.expMonthly, isMax);
    };
    const statuses=ACTIVE.map(r=>getStatus(r));
    return {
      exceed:  statuses.filter(s=>s==="Exceeding").length,
      promote: statuses.filter(s=>s==="Promotion Ready").length,
      ok:      statuses.filter(s=>s==="On Track").length,
      watch:   statuses.filter(s=>s==="Needs Attention").length,
      act:     statuses.filter(s=>s==="Underperforming").length,
      avgFebPts:Math.round(ACTIVE.filter(r=>r.febPts!==null).reduce((s,r)=>s+(r.febPts||0),0)/Math.max(1,ACTIVE.filter(r=>r.febPts!==null).length)),
    };
  },[ALL_DYNAMIC, ACTIVE, lbPeriod]);
  const formerCount=ALL_DYNAMIC.length-ACTIVE.length;
  const detailRep = sel?ALL_DYNAMIC.find(r=>r.name===sel):null;

  const handleStatClick=(statusKey)=>{
    setSel(null);
    setView("board");
    setStatusFilt(sf=>sf===statusKey?"all":statusKey);
  };

  const MAIN_TABS=[["board","LEADERBOARD"],["groups","POINTS GROUPS"],["compare","TEAM COMPARISON"],["repcompare","REP COMPARE"],["depthead","DEPT HEADS"],["products","PRODUCT MIX"],["data","DATA ENTRY"],["roster","ROSTER"]];

  return (
    <AllRepsCtx.Provider value={{allReps:ALL_DYNAMIC, saveReps}}>
    <BenchmarksCtx.Provider value={{bm,saveBm}}>
    <RosterCtx.Provider value={{roster,saveRoster,isActive}}>
    <DeptHeadsCtx.Provider value={{deptData,saveDeptData}}>
    <ProductsCtx.Provider value={{products,saveProducts}}>
    <MeetingCtx.Provider value={{meetingMode,focusRep,maskName,toggleMeeting,setFocusRep}}>
    <div style={{background:"#080f1a",minHeight:"100vh",color:"#f1f5f9",fontFamily:"'DM Mono','Courier New',monospace",fontSize:16}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#050c18}::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:2px}tbody tr:hover td{background:#0f2438!important;cursor:pointer}`}</style>
      {/* Header */}
      <div style={{background:"#060d18",borderBottom:"1px solid #1a3550",padding:"10px 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:"#22d3ee",letterSpacing:3}}>REP PERFORMANCE TRACKER <span style={{color:"#34d399",fontSize:21}}>LIVE</span></div>
            <div style={{color:"#7ec8e3",fontSize:15,letterSpacing:1,marginTop:3}}>
              {new Date().toLocaleString("default",{month:"short",year:"numeric"}).toUpperCase()} · {ACTIVE.length} ACTIVE REPS
              {formerCount>0&&<span style={{color:"#f87171",marginLeft:8}}>· {formerCount} FORMER</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {[
              {l:"EXCEEDING",v:teamStats.exceed,c:"#60a5fa",s:"Exceeding"},
              {l:"PROMOTE",  v:teamStats.promote,c:"#4ade80",s:"Promotion Ready"},
              {l:"ON TRACK", v:teamStats.ok,     c:"#34d399",s:"On Track"},
              {l:"MEET SOON",v:teamStats.watch,  c:"#fb923c",s:"Needs Attention"},
              {l:"ACT NOW",  v:teamStats.act,    c:"#f87171",s:"Underperforming"},
              {l:"AVG FEB PTS",v:teamStats.avgFebPts,c:"#22d3ee",s:null}
            ].map(s=>(
              <div key={s.l} onClick={()=>s.s&&handleStatClick(s.s)} style={{textAlign:"center",cursor:s.s?"pointer":"default",padding:"8px 14px",borderRadius:6,border:`1px solid ${s.s&&statusFilt===s.s?s.c:"#1a3550"}`,background:s.s&&statusFilt===s.s?`${s.c}15`:"#0d1e32",transition:"all .15s",minWidth:70,opacity:s.s&&statusFilt!=="all"&&statusFilt!==s.s?.45:1}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,color:s.c,letterSpacing:1,lineHeight:1}}>{s.v}</div>
                <div style={{color:s.s&&statusFilt===s.s?s.c:"#4a7fa8",fontSize:13,letterSpacing:1.2,marginTop:5}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Nav */}
      {!detailRep&&(
        <div style={{background:"#060d18",borderBottom:"1px solid #1a3550",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",gap:2}}>
            {MAIN_TABS.map(([id,label])=>{
              const isRoster=id==="roster";
              const isDept=id==="depthead";
              const isProd=id==="products";
              const activeColor=isRoster?"#f87171":isDept?"#f59e0b":isProd?"#34d399":"#22d3ee";
              return (
                <button key={id} onClick={()=>setView(id)} style={{background:"none",border:"none",borderBottom:`2px solid ${view===id?activeColor:"transparent"}`,color:view===id?activeColor:"#7ec8e3",padding:"8px 16px",fontSize:16,letterSpacing:1.5,cursor:"pointer",fontFamily:"'DM Mono',monospace",position:"relative"}}>
                  {label}
                  {isRoster&&formerCount>0&&null}
                </button>
              );
            })}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={toggleMeeting} style={{background:meetingMode?"#f59e0b18":"none",border:`1px solid ${meetingMode?"#f59e0b":"#1e3a5f"}`,borderRadius:"4px 4px 0 0",color:meetingMode?"#f59e0b":"#4a7fa8",padding:"7px 14px",fontSize:15,letterSpacing:1.5,cursor:"pointer",fontFamily:"'DM Mono',monospace",margin:"4px 0",display:"flex",alignItems:"center",gap:6,transition:"all .15s"}}>
              <span style={{fontSize:17}}>{meetingMode?"🎯":"○"}</span>
              {meetingMode?"EXIT MEETING":"MEETING MODE"}
            </button>
            <button onClick={()=>setView("bench")} style={{background:view==="bench"?"#22d3ee18":"none",border:`1px solid ${view==="bench"?"#22d3ee":"#1e3a5f"}`,borderRadius:"4px 4px 0 0",color:view==="bench"?"#22d3ee":"#4a7fa8",padding:"7px 16px",fontSize:15,letterSpacing:1.5,cursor:"pointer",fontFamily:"'DM Mono',monospace",margin:"4px 0"}}>⚙ BENCHMARKS</button>
          </div>
        </div>
      )}
      {/* Meeting Mode Banner */}
      {meetingMode&&(
        <div style={{background:"#140a00",borderBottom:"2px solid #f59e0b",padding:"8px 20px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:20}}>🎯</span>
            <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:"#f59e0b",letterSpacing:2}}>MEETING MODE ACTIVE</span>
          </div>
          <div style={{width:1,height:20,background:"#f59e0b44"}}/>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"#a8c4d8",fontSize:14,letterSpacing:1}}>PRESENTING FOR:</span>
            <select
              value={focusRep||""}
              onChange={e=>setFocusRep(e.target.value||null)}
              style={{background:"#1a0e00",border:"1px solid #f59e0b",borderRadius:4,color:focusRep?"#fcd34d":"#6b7280",padding:"4px 10px",fontSize:15,fontFamily:"'DM Mono',monospace",cursor:"pointer",outline:"none"}}
            >
              <option value="">— Select a rep —</option>
              {ACTIVE.sort((a,b)=>a.name.localeCompare(b.name)).map(r=>(
                <option key={r.name} value={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
          {focusRep?(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{color:"#f59e0b",fontWeight:700,fontSize:16}}>{focusRep}</span>
              <span style={{color:"#6b7280",fontSize:14}}>— all other names hidden</span>
            </div>
          ):(
            <span style={{color:"#6b7280",fontSize:14,fontStyle:"italic"}}>Select a rep above — all names are currently hidden</span>
          )}
        </div>
      )}
      <div style={{padding:"16px 20px"}}>
        {detailRep?<RepDetail rep={detailRep} onBack={()=>setSel(null)}/>:
         view==="groups"?<div>{grouped.map(g=><GroupSection key={g.key} group={g} reps={g.reps}/>)}</div>:
         view==="compare"?<TeamComparisonView onSel={setSel} active={ACTIVE}/>:
         view==="repcompare"?<RepCompareView/>:
         view==="depthead"?<DeptHeadView/>:
         view==="products"?<ProductMixView/>:
         view==="data"?<DataEntryView/>:
         view==="roster"?<RosterView/>:
         view==="bench"?<BenchmarksView/>:
         <LeaderboardView onSel={setSel} statusFilt={statusFilt} setStatusFilt={setStatusFilt} active={ACTIVE} period={lbPeriod} setPeriod={setLbPeriod}/>}
      </div>
    </div>
    </MeetingCtx.Provider>
    </ProductsCtx.Provider>
    </DeptHeadsCtx.Provider>
    </RosterCtx.Provider>
    </BenchmarksCtx.Provider>
    </AllRepsCtx.Provider>
  );
}


ReactDOM.createRoot(document.getElementById('root')).render(<App />);
