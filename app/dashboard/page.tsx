'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────
interface Metrics {
  requests: number
  cacheHits: number
  cacheHitRate: number
  errors: number
  avgLatency_ms: number
  totalCost_usd: number
  avgCostPerReq_usd: number
  winRate: Record<string, number>
  avgLatencyByProvider: Record<string, number>
  costByProvider: Record<string, number>
  byMode: Record<string, number>
  byCategory: Record<string, number>
  byHour: Record<string, number>
  uptimeSince: string
}

interface Stats {
  lastLearnedAt: string | null
  totalDecisions: number
  decayCycles: number
  weightDecayRate: number
  exploreRate: number
  cacheSize: number
  minSamplesRequired: number
  weights: Record<string, Record<string, {
    winRate: number; rawWinRate: number;
    avgConf: number; avgLatency: number; samples: number
  }>>
}

interface Profile {
  name: string; style: string; domain: string
  preferredProvider: string
  providerOverrides: Record<string, string>
  stats: { totalRequests: number; avgLatency: number; byProvider: Record<string, number> }
  recentTopics: string[]
  updatedAt: string
}

const PROV_COLOR: Record<string, string> = {
  gpt: '#10a37f', claude: '#c84b31', ollama: '#7c6af7'
}

// ── Stat Card ─────────────────────────────────────────────────────────
function Stat({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string
}) {
  return (
    <div style={{
      background:'#111113',border:'1px solid rgba(255,255,255,.06)',borderRadius:10,
      padding:'16px 18px'
    }}>
      <div style={{fontSize:10,letterSpacing:'.08em',textTransform:'uppercase',color:'#666460',marginBottom:8}}>{label}</div>
      <div style={{fontFamily:'Syne,sans-serif',fontSize:26,fontWeight:600,color: accent ?? '#e8e6e0'}}>{value}</div>
      {sub && <div style={{fontSize:10,color:'#666460',marginTop:4}}>{sub}</div>}
    </div>
  )
}

// ── Bar ───────────────────────────────────────────────────────────────
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round(value / max * 100) : 0
  return (
    <div style={{height:4,background:'#1e1e24',borderRadius:2,overflow:'hidden',marginTop:5}}>
      <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:2,
        transition:'width .8s cubic-bezier(.4,0,.2,1)'}} />
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div style={{fontSize:10,letterSpacing:'.12em',textTransform:'uppercase',
        color:'#666460',marginBottom:12,fontWeight:500}}>{title}</div>
      {children}
    </section>
  )
}

// ── Main ──────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [online,  setOnline]  = useState<boolean | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const [m, s, p] = await Promise.all([
        fetch('/api/metrics').then(r => r.json()),
        fetch('/api/learn/stats').then(r => r.json()),
        fetch('/api/user/profile').then(r => r.json())
      ])
      setMetrics(m); setStats(s); setProfile(p)
      setOnline(true); setLastRefresh(new Date())
    } catch {
      setOnline(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 15_000)
    return () => clearInterval(id)
  }, [load])

  const base: React.CSSProperties = {
    fontFamily: "'DM Mono', monospace",
    background: '#0a0a0b', color: '#e8e6e0',
    minHeight: '100vh', fontSize: 13
  }

  return (
    <div style={base}>
      {/* Header */}
      <header style={{
        display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'0 28px',height:56,borderBottom:'1px solid rgba(255,255,255,.06)',
        background:'#111113',position:'sticky',top:0,zIndex:100
      }}>
        <span style={{fontFamily:'Syne,sans-serif',fontSize:15,fontWeight:600}}>
          Solar<span style={{color:'#10a37f'}}>AI</span>
          <span style={{color:'#666460',fontWeight:400}}> / Dashboard</span>
        </span>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <span style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'#666460'}}>
            <span style={{
              width:6,height:6,borderRadius:'50%',flexShrink:0,
              background: online === null ? '#666' : online ? '#22c55e' : '#ef4444',
              animation: online ? 'pulse 2.4s infinite' : 'none'
            }} />
            {online === null ? 'connecting…' : online
              ? `connected · ${lastRefresh?.toLocaleTimeString()}`
              : 'backend offline'}
          </span>
          {metrics && (
            <span style={{
              display:'flex',alignItems:'center',gap:6,
              background:'rgba(245,200,66,.08)',border:'1px solid rgba(245,200,66,.2)',
              borderRadius:100,padding:'3px 10px',fontSize:11,color:'#f5c842'
            }}>
              ${metrics.totalCost_usd}
            </span>
          )}
          <button onClick={load} style={{
            background:'#1e1e24',border:'1px solid rgba(255,255,255,.1)',
            color:'#666460',padding:'5px 12px',borderRadius:6,
            cursor:'pointer',fontSize:11,fontFamily:'inherit'
          }}>↺ refresh</button>
          <Link href="/" style={{
            background:'#1e1e24',border:'1px solid rgba(255,255,255,.1)',
            color:'#666460',padding:'5px 12px',borderRadius:6,
            fontSize:11,textDecoration:'none'
          }}>← app</Link>
        </div>
      </header>

      <main style={{padding:28,display:'flex',flexDirection:'column',gap:24}}>

        {!online && online !== null && (
          <div style={{color:'#ef4444',fontSize:13,padding:'40px 0',textAlign:'center'}}>
            Backend offline — start with: <code>npm run dev</code>
          </div>
        )}

        {/* KPIs */}
        {metrics && (
          <Section title="Overview">
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12}}>
              <Stat label="Requests"     value={metrics.requests}          sub="since startup" />
              <Stat label="Cache hit"    value={`${(metrics.cacheHitRate*100).toFixed(1)}%`}
                    sub={`${metrics.cacheHits} hits`}
                    accent={metrics.cacheHitRate > 0.2 ? '#22c55e' : undefined} />
              <Stat label="Avg latency"  value={`${metrics.avgLatency_ms}ms`}
                    accent={metrics.avgLatency_ms < 2000 ? '#22c55e' : metrics.avgLatency_ms < 5000 ? '#f59e0b' : '#ef4444'} />
              <Stat label="Total cost"   value={`$${metrics.totalCost_usd}`}
                    sub={`$${metrics.avgCostPerReq_usd}/req`} />
              <Stat label="Errors"       value={metrics.errors}
                    accent={metrics.errors > 0 ? '#f59e0b' : '#22c55e'} />
              <Stat label="Categories"   value={Object.keys(metrics.byCategory).length}
                    sub={Object.keys(metrics.byCategory).slice(0,3).join(', ')} />
            </div>
          </Section>
        )}

        {/* Providers */}
        {metrics && Object.keys(metrics.winRate).length > 0 && (
          <Section title="Providers">
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
              {(['gpt','claude','ollama'] as const)
                .filter(p => metrics.winRate[p] != null)
                .map(prov => {
                  const color   = PROV_COLOR[prov]
                  const wr      = (metrics.winRate[prov] * 100).toFixed(1)
                  const lat     = metrics.avgLatencyByProvider[prov] ?? 0
                  const cost    = metrics.costByProvider[prov] ?? 0
                  const maxWr   = Math.max(...Object.values(metrics.winRate))
                  return (
                    <div key={prov} style={{
                      background:'#111113',border:'1px solid rgba(255,255,255,.06)',
                      borderRadius:10,padding:18
                    }}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
                        <span style={{fontFamily:'Syne,sans-serif',fontWeight:600,color}}>{prov.toUpperCase()}</span>
                        <span style={{fontSize:10,padding:'2px 8px',borderRadius:100,
                          background:`${color}22`,color}}>{prov === 'gpt' ? 'OpenAI' : prov === 'claude' ? 'Anthropic' : 'Local'}</span>
                      </div>
                      <div style={{marginBottom:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#666460',marginBottom:0}}>
                          <span>win rate</span><span>{wr}%</span>
                        </div>
                        <Bar value={parseFloat(wr)} max={100} color={color} />
                      </div>
                      <div style={{marginBottom:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#666460',marginBottom:0}}>
                          <span>share</span>
                          <span>{Math.round(metrics.winRate[prov] / maxWr * 100)}%</span>
                        </div>
                        <Bar value={metrics.winRate[prov]} max={maxWr} color={color} />
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:14}}>
                        {[['avg latency', `${lat}ms`], ['total cost', `$${cost}`]].map(([l,v]) => (
                          <div key={l} style={{background:'#18181c',borderRadius:6,padding:'8px 10px'}}>
                            <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'.08em',color:'#666460',marginBottom:3}}>{l}</div>
                            <div style={{fontSize:14,fontWeight:500}}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          </Section>
        )}

        {/* Mode + Hourly */}
        {metrics && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:12}}>
            <Section title="Routing modes">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {Object.entries(metrics.byMode).sort((a,b)=>b[1]-a[1]).map(([mode, count]) => {
                  const icons: Record<string,string> = {
                    single:'→',profile:'👤',learned:'🧠',explore:'🎲',
                    'early-exit':'⚡',dual:'⚡',triple:'⚡','cache-hit':'◎'
                  }
                  return (
                    <div key={mode} style={{
                      background:'#111113',border:'1px solid rgba(255,255,255,.06)',
                      borderRadius:8,padding:'12px 14px'
                    }}>
                      <div style={{fontSize:14}}>{icons[mode] ?? '·'}</div>
                      <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'.08em',color:'#666460',marginTop:4}}>{mode}</div>
                      <div style={{fontFamily:'Syne,sans-serif',fontSize:20,fontWeight:600}}>{count}</div>
                    </div>
                  )
                })}
              </div>
            </Section>

            <Section title="Requests / hour">
              <div style={{background:'#111113',border:'1px solid rgba(255,255,255,.06)',borderRadius:10,padding:20}}>
                {Object.keys(metrics.byHour).length === 0
                  ? <div style={{color:'#666460',fontSize:12,padding:'20px 0',textAlign:'center'}}>no hourly data yet</div>
                  : (() => {
                    const hours = Object.keys(metrics.byHour).sort().slice(-24)
                    const vals  = hours.map(h => metrics.byHour[h] ?? 0)
                    const maxV  = Math.max(...vals, 1)
                    return (
                      <>
                        <div style={{fontSize:11,color:'#666460',marginBottom:12}}>
                          last {hours.length}h — {vals.reduce((a,b)=>a+b,0)} total
                        </div>
                        <div style={{display:'flex',alignItems:'flex-end',gap:3,height:60}}>
                          {hours.map((h, i) => (
                            <div key={h} title={`${h.slice(11)}:00 — ${vals[i]} req`}
                              style={{
                                flex:1,minWidth:6,borderRadius:'2px 2px 0 0',
                                background: vals[i] > 0 ? 'rgba(16,163,127,.4)' : '#1e1e24',
                                height: `${Math.max(6, vals[i]/maxV*100)}%`,
                                transition:'height .4s ease',cursor:'default'
                              }}
                            />
                          ))}
                        </div>
                      </>
                    )
                  })()
                }
              </div>
            </Section>
          </div>
        )}

        {/* Learning weights */}
        {stats && (
          <Section title="Learning weights">
            <div style={{background:'#111113',border:'1px solid rgba(255,255,255,.06)',borderRadius:10,overflow:'hidden'}}>
              {!stats.weights || !Object.keys(stats.weights).length
                ? <div style={{color:'#666460',padding:'24px',fontSize:12,textAlign:'center'}}>
                    no learned data yet — need {stats.minSamplesRequired}+ samples per category
                  </div>
                : (
                  <>
                    <table style={{width:'100%',borderCollapse:'collapse'}}>
                      <thead>
                        <tr style={{borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                          {['Category','Provider','Win rate','Raw','Avg conf','Latency','Samples'].map(h => (
                            <th key={h} style={{padding:'6px 12px',textAlign:'left',
                              fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',color:'#666460'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(stats.weights).flatMap(([cat, provs]) =>
                          Object.entries(provs).map(([prov, s]) => (
                            <tr key={`${cat}-${prov}`} style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                              <td style={{padding:'8px 12px'}}>
                                <span style={{background:'#1e1e24',borderRadius:100,padding:'2px 8px',fontSize:10,color:'#666460'}}>{cat}</span>
                              </td>
                              <td style={{padding:'8px 12px',color: PROV_COLOR[prov] ?? '#e8e6e0',fontWeight:500}}>{prov}</td>
                              <td style={{padding:'8px 12px'}}>
                                <div style={{display:'flex',alignItems:'center',gap:8}}>
                                  <div style={{width:Math.round(s.winRate*60),height:3,borderRadius:2,
                                    background: PROV_COLOR[prov] ?? '#888'}} />
                                  {(s.winRate*100).toFixed(1)}%
                                </div>
                              </td>
                              <td style={{padding:'8px 12px',color:'#666460'}}>{(s.rawWinRate*100).toFixed(1)}%</td>
                              <td style={{padding:'8px 12px',color:'#666460'}}>{(s.avgConf*100).toFixed(0)}%</td>
                              <td style={{padding:'8px 12px',color:'#666460'}}>{s.avgLatency}ms</td>
                              <td style={{padding:'8px 12px',color:'#666460'}}>{s.samples}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    <div style={{padding:'8px 12px',fontSize:10,color:'#666460',borderTop:'1px solid rgba(255,255,255,.04)'}}>
                      decay cycles: {stats.decayCycles} · rate: {stats.weightDecayRate} · explore: {(stats.exploreRate*100).toFixed(0)}%
                    </div>
                  </>
                )
              }
            </div>
          </Section>
        )}

        {/* User profile */}
        {profile && (
          <Section title="User profile">
            <div style={{background:'#111113',border:'1px solid rgba(255,255,255,.06)',borderRadius:10,padding:20}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
                {[
                  { label:'Name',     val: profile.name,              sub:'user_profile.json' },
                  { label:'Style',    val: profile.style,             sub:'response style'    },
                  { label:'Domain',   val: profile.domain,            sub:'primary focus'     },
                  { label:'Provider', val: profile.preferredProvider, sub:'global preference' },
                  { label:'Requests', val: profile.stats?.totalRequests ?? 0, sub:'total'    },
                  { label:'Avg latency', val:`${profile.stats?.avgLatency ?? 0}ms`, sub:'personalized' },
                ].map(f => (
                  <div key={f.label} style={{background:'#18181c',borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'.1em',color:'#666460',marginBottom:4}}>{f.label}</div>
                    <div style={{fontSize:14,fontWeight:500}}>{f.val}</div>
                    <div style={{fontSize:10,color:'#666460',marginTop:2}}>{f.sub}</div>
                  </div>
                ))}
              </div>

              {profile.recentTopics?.length > 0 && (
                <div style={{marginTop:16,paddingTop:14,borderTop:'1px solid rgba(255,255,255,.06)'}}>
                  <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'.1em',color:'#666460',marginBottom:8}}>recent topics</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {profile.recentTopics.slice(0,8).map((t,i) => (
                      <span key={i} style={{background:'#1e1e24',borderRadius:4,padding:'3px 8px',fontSize:11,color:'#e8e6e0'}}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;500;600;700&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
      `}</style>
    </div>
  )
}
