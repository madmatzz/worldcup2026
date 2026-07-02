'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import useSWR from 'swr'
import {
  flagUrl,
  type BracketData,
  type BracketMatch,
  type MatchEvent,
  type MatchTeam,
} from '@/lib/teams'
import { detectLocale, getTranslations, teamName, type Locale } from '@/lib/i18n'
import { ChampionCelebration } from './champion-celebration'

const REFRESH_MS = 5_000
const SIZE = 1000
const CX = SIZE / 2
const CY = SIZE / 2

// radius of each round's ring (round 0 = outer ring of 32 team slots)
const RING_RADII = [440, 348, 262, 182, 108]
// flag circle radius per round
const NODE_RADII = [36, 26, 21, 17, 19]

function polar(angle: number, radius: number) {
  return {
    x: CX + radius * Math.cos(angle),
    y: CY + radius * Math.sin(angle),
  }
}

// angle of slot j in a round with n slots
function slotAngle(j: number, n: number) {
  return ((j + 0.5) / n) * Math.PI * 2 - Math.PI / 2
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load bracket data')
  return res.json() as Promise<BracketData>
}

/** Flatten matches into team slots: rounds[r] has 2^(4-r) matches -> 2^(5-r) slots */
function toSlots(rounds: BracketMatch[][]): (MatchTeam | null)[][] {
  return rounds.map((round) =>
    round.flatMap((m) => [m.home ?? null, m.away ?? null]),
  )
}

function scoreLabel(m: BracketMatch): string | null {
  if (m.status === 'scheduled') return null
  if (m.home?.score == null || m.away?.score == null) return null
  let s = `${m.home.score}\u2013${m.away.score}`
  if (m.home.pens != null && m.away.pens != null) {
    s += ` (${m.home.pens}\u2013${m.away.pens}p)`
  }
  return s
}

function formatKickoff(iso: string, locale: Locale, timeZone?: string): string {
  const l = locale === 'es' ? 'es-AR' : undefined
  return new Date(iso).toLocaleString(l, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
}

function getVenueTimezone(venue?: string): string | undefined {
  if (!venue) return undefined
  const v = venue.toLowerCase()
  if (v.includes('bc place') || v.includes('vancouver')) return 'America/Vancouver'
  if (v.includes('lumen') || v.includes('seattle')) return 'America/Los_Angeles'
  if (v.includes('levi') || v.includes('francisco') || v.includes('clara')) return 'America/Los_Angeles'
  if (v.includes('sofi') || v.includes('angeles') || v.includes('inglewood')) return 'America/Los_Angeles'
  if (v.includes('akron') || v.includes('guadalajara')) return 'America/Mexico_City'
  if (v.includes('bbva') || v.includes('monterrey')) return 'America/Monterrey'
  if (v.includes('azteca') || v.includes('mexico city')) return 'America/Mexico_City'
  if (v.includes('arrowhead') || v.includes('kansas')) return 'America/Chicago'
  if (v.includes('at&t') || v.includes('dallas') || v.includes('arlington')) return 'America/Chicago'
  if (v.includes('nrg') || v.includes('houston')) return 'America/Chicago'
  if (v.includes('mercedes') || v.includes('atlanta')) return 'America/New_York'
  if (v.includes('gillette') || v.includes('boston') || v.includes('foxborough')) return 'America/New_York'
  if (v.includes('lincoln') || v.includes('philadelphia')) return 'America/New_York'
  if (v.includes('hard rock') || v.includes('miami')) return 'America/New_York'
  if (v.includes('metlife') || v.includes('new york') || v.includes('jersey')) return 'America/New_York'
  if (v.includes('bmo') || v.includes('toronto')) return 'America/Toronto'
  return undefined
}

/** Get a display name for a team, translated */
function displayTeamName(team: MatchTeam | null, locale: Locale, tbd: string): string {
  if (!team) return tbd
  return teamName(locale, team.abbr, team.name)
}

export function CircularBracket() {
  const { data, error, isValidating } = useSWR('/api/bracket', fetcher, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  const [secondsLeft, setSecondsLeft] = useState(5)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [simulatedData, setSimulatedData] = useState<BracketData | null>(null)

  const activeData = simulatedData || data

  const selected = useMemo(() => {
    if (!selectedId || !activeData) return null
    for (const round of activeData.rounds) {
      const match = round.find((m) => m.id === selectedId)
      if (match) return match
    }
    return null
  }, [selectedId, activeData])
  const [locale, setLocale] = useState<Locale>('en')
  const [userTimezone, setUserTimezone] = useState<string>('')

  // detect locale on mount
  useEffect(() => {
    setLocale(detectLocale())
    try {
      setUserTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
    } catch {
      setUserTimezone('UTC')
    }
  }, [])

  const t = useMemo(() => getTranslations(locale), [locale])

  // countdown resets whenever fresh data arrives
  useEffect(() => {
    if (data) setSecondsLeft(5)
  }, [data?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const slots = useMemo(() => (activeData ? toSlots(activeData.rounds) : null), [activeData])

  const todayMatches = useMemo(() => {
    if (!activeData || !userTimezone) return []
    const tz = userTimezone || 'UTC'
    try {
      const nowStr = new Date().toLocaleDateString('en-US', { timeZone: tz })
      const allMatches = activeData.rounds.flat()
      return allMatches.filter(m => {
        const matchStr = new Date(m.date).toLocaleDateString('en-US', { timeZone: tz })
        return matchStr === nowStr
      }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    } catch {
      return []
    }
  }, [activeData, userTimezone])
  const eliminatedTeams = useMemo(() => {
    const eliminated = new Set<string>()
    if (!activeData) return eliminated
    for (const round of activeData.rounds) {
      for (const match of round) {
        if (match.status === 'finished') {
          if (match.home && match.home.winner === false) eliminated.add(match.home.abbr)
          if (match.away && match.away.winner === false) eliminated.add(match.away.abbr)
        }
      }
    }
    return eliminated
  }, [activeData])

  const handleSimulate = () => {
    if (!data) return
    const simRounds = JSON.parse(JSON.stringify(data.rounds)) as BracketMatch[][]
    let finalChampion: MatchTeam | null = null
    
    const getTeamStrength = (abbr: string) => {
      const topTier = ['ARG', 'FRA', 'BRA', 'ESP', 'ENG']
      const highTier = ['GER', 'POR', 'NED', 'BEL', 'URU', 'COL', 'ITA']
      if (topTier.includes(abbr)) return 0.85
      if (highTier.includes(abbr)) return 0.65
      return 0.4
    }

    for (let r = 0; r < 5; r++) {
      for (let i = 0; i < simRounds[r].length; i++) {
        const match = simRounds[r][i]
        
        // Propagate winners from previous round
        if (r > 0) {
          const childHome = simRounds[r - 1][i * 2]
          const childAway = simRounds[r - 1][i * 2 + 1]
          
          const homeWinner = childHome?.home?.winner ? childHome.home : (childHome?.away?.winner ? childHome.away : null)
          const awayWinner = childAway?.home?.winner ? childAway.home : (childAway?.away?.winner ? childAway.away : null)
          
          if (homeWinner) match.home = { ...homeWinner, winner: false, score: null }
          if (awayWinner) match.away = { ...awayWinner, winner: false, score: null }
        }
        
        // Simulate match if no winner exists yet and both teams are known
        const hasWinner = match.status === 'finished' && (match.home?.winner || match.away?.winner)
        if (!hasWinner && match.home && match.away) {
          const homeStr = getTeamStrength(match.home.abbr)
          const awayStr = getTeamStrength(match.away.abbr)
          const homeWins = Math.random() < (homeStr / (homeStr + awayStr))
          
          match.status = 'finished'
          match.statusText = 'Simulated'
          match.clock = null
          if (homeWins) {
            match.home.winner = true
            match.away.winner = false
            match.home.score = Math.floor(Math.random() * 3) + 1
            match.away.score = match.home.score - 1
          } else {
            match.home.winner = false
            match.away.winner = true
            match.away.score = Math.floor(Math.random() * 3) + 1
            match.home.score = match.away.score - 1
          }
        }

        // Check if this is the final match to set champion
        if (r === 4) {
          finalChampion = match.home?.winner ? match.home : (match.away?.winner ? match.away : null)
        }
      }
    }
    
    setSimulatedData({ rounds: simRounds, champion: finalChampion, updatedAt: new Date().toISOString() })
  }

  const geometry = useMemo(() => {
    const connectors: string[] = []
    for (let r = 0; r < 4; r++) {
      const n = 2 ** (5 - r)
      const pn = 2 ** (4 - r)
      for (let j = 0; j < n; j++) {
        const childAngle = slotAngle(j, n)
        const parentAngle = slotAngle(Math.floor(j / 2), pn)
        const start = polar(childAngle, RING_RADII[r] - NODE_RADII[r])
        const elbow = polar(childAngle, RING_RADII[r + 1])
        const end = polar(parentAngle, RING_RADII[r + 1])
        connectors.push(
          `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${elbow.x.toFixed(1)} ${elbow.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
        )
      }
    }
    for (let j = 0; j < 2; j++) {
      const a = slotAngle(j, 2)
      const start = polar(a, RING_RADII[4] - NODE_RADII[4])
      connectors.push(`M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${CX} ${CY}`)
    }
    return { connectors }
  }, [])

  const liveCount =
    activeData?.rounds.flat().filter((m) => m.status === 'live').length ?? 0

  return (
    <div className="relative z-10 flex w-full flex-col items-center gap-6">
      <style>{`
        @keyframes shine {
          to {
            background-position: 200% center;
          }
        }
        .animate-shine {
          animation: shine 3s linear infinite;
        }
      `}</style>
      {/* Title */}
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-xl md:text-4xl whitespace-nowrap font-black uppercase tracking-widest bg-gradient-to-r from-yellow-500 via-yellow-200 to-yellow-500 bg-[length:200%_auto] bg-clip-text text-transparent animate-shine">
          {t.pageTitle}
        </h1>
      </header>

      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-5 py-2">
          <span
            className={`h-2 w-2 rounded-full ${
              error ? 'bg-destructive' : 'animate-pulse bg-green-500'
            }`}
            aria-hidden="true"
          />
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {error && !data ? t.liveDataUnavailable : t.liveData}
          </p>
        </div>
        {liveCount > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-accent/40 bg-card px-4 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              {t.matchesInPlay(liveCount)}
            </p>
          </div>
        )}
        
        {/* Simulation controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSimulate}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              simulatedData 
                ? 'border-accent/40 bg-card text-foreground hover:bg-accent/10'
                : 'border-blue-500/40 bg-card text-foreground hover:bg-blue-500/10'
            }`}
          >
            <svg className={`h-4 w-4 ${simulatedData ? 'text-accent' : 'text-blue-500'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            {simulatedData ? t.reSimulateMatches : t.simulateMatches}
          </button>
          {simulatedData && (
            <button
              type="button"
              onClick={() => setSimulatedData(null)}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive"
              title={t.clearSimulation}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              <span className="hidden sm:inline">{t.clearSimulation}</span>
            </button>
          )}
        </div>
      </div>

      {/* Bracket */}
      <div className="relative w-full max-w-[720px]">
        <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className={`h-auto w-full transition-opacity duration-500 ${
              !activeData ? 'opacity-30' : 'opacity-100'
            }`}
            role="img"
            aria-label={locale === 'es'
              ? 'Bracket eliminatorio de la Copa del Mundo 2026, los ganadores avanzan hacia el trofeo en el centro'
              : '2026 World Cup knockout bracket, winners advancing toward the trophy at the center'}
          >
            {/* ring guides */}
          {RING_RADII.map((r, i) => (
            <circle
              key={i}
              cx={CX}
              cy={CY}
              r={r}
              fill="none"
              stroke="#fbbf24"
              strokeOpacity={0.15}
              strokeWidth={0.5}
              strokeDasharray="3 5"
            />
          ))}

          <defs>
            {/* Static base glow (brightness near the cup) */}
            <radialGradient 
              id="baseGlow" 
              cx={CX} 
              cy={CY} 
              r={320} 
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#fef08a" stopOpacity="1" />
              <stop offset="40%" stopColor="#fbbf24" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0.15" />
            </radialGradient>

            {/* Traveling wave of light mask (moves towards the cup) - MOBILE */}
            <mask id="bracket-lines">
              {geometry.connectors.map((d, i) => (
                <path
                  key={`mask-${i}`}
                  d={d}
                  fill="none"
                  stroke="white"
                  strokeWidth={1.2}
                />
              ))}
            </mask>

            {/* Traveling wave of light (moves towards the cup) - DESKTOP */}
            <radialGradient 
              id="travelingLight" 
              cx={CX} 
              cy={CY} 
              gradientUnits="userSpaceOnUse"
            >
              <animate attributeName="r" values="450;0" dur="4s" repeatCount="indefinite" />
              <stop offset="0%" stopColor="#fef08a" stopOpacity="0" />
              <stop offset="75%" stopColor="#fef08a" stopOpacity="0" />
              <stop offset="92%" stopColor="#fef08a">
                <animate attributeName="stop-opacity" values="0; 0.8; 0.8; 0" keyTimes="0; 0.2; 0.8; 1" dur="4s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#fef08a" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Base glow connectors */}
          {geometry.connectors.map((d, i) => (
            <path
              key={`base-${i}`}
              d={d}
              fill="none"
              stroke="url(#baseGlow)"
              strokeWidth={1.2}
            />
          ))}

          {/* Animated moving light connectors - DESKTOP */}
          <g className="hidden md:inline">
            {geometry.connectors.map((d, i) => (
              <path
                key={`anim-${i}`}
                d={d}
                fill="none"
                stroke="url(#travelingLight)"
                strokeWidth={1.2}
              />
            ))}
          </g>

          {/* Animated moving light masked by connectors - MOBILE */}
          <g mask="url(#bracket-lines)" className="md:hidden">
            <circle
              cx={CX}
              cy={CY}
              r={450}
              fill="none"
              stroke="#fef08a"
              strokeWidth={60}
              className="origin-center animate-traveling-ring"
            />
          </g>

            {data && slots && (
              <>

                {/* team / TBD slots per round */}
                {slots.map((round, ri) =>
                  round.map((team, j) => {
                    const n = round.length
                    const angle = slotAngle(j, n)
                    const p = polar(angle, RING_RADII[ri])
                    const r = NODE_RADII[ri]

                    // match index (2 slots per match)
                    const mi = Math.floor(j / 2)
                    const match = data.rounds[ri][mi]

                    if (!team) {
                      return (
                        <g
                        key={`empty-${ri}-${j}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedId(match.id)}
                      >
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={r}
                          fill="var(--color-muted)"
                        />
                      </g>
                      )
                    }
                    const flag = flagUrl(team.flag, 160)
                    const isSelected = selected?.id === match.id
                    const isLoser = eliminatedTeams.has(team.abbr)
                    const isLive = match.status === 'live'
                    return (
                      <g
                        key={`team-${ri}-${j}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedId(match.id)}
                      >
                        {isLive && (
                          <g className="animate-pulse">
                            <circle cx={p.x} cy={p.y} r={r + 3} fill="none" stroke="#22c55e" strokeWidth={6} strokeOpacity={0.4} />
                            <circle cx={p.x} cy={p.y} r={r + 3} fill="none" stroke="#22c55e" strokeWidth={2} />
                          </g>
                        )}
                        {isSelected && (
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={r + (isLive ? 7 : 3)}
                            fill="none"
                            stroke="white"
                            strokeWidth={2}
                          />
                        )}
                        <clipPath id={`clip-${ri}-${j}`}>
                          <circle cx={p.x} cy={p.y} r={r} />
                        </clipPath>
                        <image
                          href={flag}
                          x={p.x - r}
                          y={p.y - r}
                          width={r * 2}
                          height={r * 2}
                          clipPath={`url(#clip-${ri}-${j})`}
                          preserveAspectRatio="xMidYMid slice"
                          className={isLoser ? 'saturate-[.25] opacity-100' : 'transition-all duration-300'}
                        >
                          <title>{displayTeamName(team, locale, t.tbd)}{isLive && match.clock ? ` (${t.live} - ${match.clock})` : ''}</title>
                        </image>
                      </g>
                    )
                  }),
                )}
              </>
            )}
          </svg>

          {/* Center trophy + champion */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
            <img
              src="https://cdn-img.zerozero.pt/img/logos/edicoes/176026_imgbank_.png"
              alt="World Cup trophy"
              className="h-[13%] w-auto object-contain"
            />
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground md:text-sm">
              {activeData?.champion ? displayTeamName(activeData.champion, locale, t.tbd) : t.tbd}
            </p>
          </div>
      </div>

      {/* Selected match detail */}
      {selected && (() => {
        const homeEvents = selected.events.filter((e) => e.teamId === selected.homeTeamId)
        const awayEvents = selected.events.filter((e) => e.teamId === selected.awayTeamId)
        return (
        <div className="w-full max-w-lg rounded-xl border border-border bg-card p-4">
          {/* Header row */}
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              {selected.status === 'live' ? (
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-green-500">
                  {t.live}
                  {selected.clock && (
                    <span className="text-muted-foreground lowercase normal-case tracking-normal animate-pulse">
                      ({selected.clock})
                    </span>
                  )}
                </p>
              ) : selected.status === 'finished' ? (
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{selected.statusText}</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-foreground">
                    {formatKickoff(selected.date, locale, getVenueTimezone(selected.venue))} <span className="text-xs font-normal text-muted-foreground">({t.stadiumTime})</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatKickoff(selected.date, locale, userTimezone || undefined)} <span className="font-light">({t.yourLocalTime})</span>
                  </p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="mt-0.5 shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              {t.close}
            </button>
          </div>

          {/* Venue */}
          {selected.venue && (
            <p className="mb-3 text-center text-xs text-muted-foreground">
              📍 {selected.venue}
            </p>
          )}

          {/* Teams + score */}
          <div className="flex items-center justify-between gap-4">
            {[selected.home, selected.away].map((team, i) => (
              <div
                key={i}
                className={`flex flex-1 items-center gap-2 ${i === 1 ? 'flex-row-reverse text-right' : ''}`}
              >
                {team ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={flagUrl(team.flag, 80) || '/placeholder.svg'}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover"
                    />
                    <span
                      className={`text-sm ${team.winner ? 'font-bold text-foreground' : 'text-muted-foreground'}`}
                    >
                      {displayTeamName(team, locale, t.tbd)}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">{t.tbd}</span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-center font-mono text-2xl font-bold text-foreground tabular-nums">
            {selected.status !== 'scheduled' &&
            selected.home?.score != null &&
            selected.away?.score != null
              ? `${selected.home.score} \u2013 ${selected.away.score}`
              : '\u2013'}
          </p>
          {selected.note && (
            <p className="mt-1 text-center text-xs text-muted-foreground">
              {selected.note}
            </p>
          )}

          {/* Events timeline */}
          {selected.events.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="flex flex-col gap-1.5">
                {selected.events.map((ev, i) => {
                  const isHome = ev.teamId === selected.homeTeamId
                  const icon =
                    ev.type === 'goal' ? '⚽' :
                    ev.type === 'penalty-goal' ? '⚽ (P)' :
                    ev.type === 'own-goal' ? '⚽ (OG)' :
                    ev.type === 'yellow' ? '🟨' :
                    ev.type === 'red' ? '🟥' : ''
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-xs ${isHome ? '' : 'flex-row-reverse text-right'}`}
                    >
                      <span className="w-10 shrink-0 font-mono text-muted-foreground tabular-nums">
                        {ev.minute}
                      </span>
                      <span>{icon}</span>
                      <span className="text-foreground">{ev.player}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        )
      })()}

      {/* Matches Today */}
      {todayMatches.length > 0 && (
        <section className="flex w-full max-w-4xl flex-col gap-4 px-4 py-8">
          <h2 className="text-center text-xl font-bold tracking-widest text-foreground uppercase">
            {t.matchesToday}
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            {todayMatches.map((match) => {
              const isLive = match.status === 'live'
              return (
                <div
                  key={match.id}
                  className={`flex w-full sm:w-[320px] cursor-pointer flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 ${
                    selected?.id === match.id ? 'border-primary ring-1 ring-primary' : 'border-border'
                  }`}
                  onClick={() => setSelectedId(match.id)}
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <span>
                      {isLive ? (
                        <span className="flex items-center gap-1.5 text-green-500">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                          {t.live}{match.clock ? ` (${match.clock})` : ''}
                        </span>
                      ) : match.status === 'finished' ? (
                        match.statusText
                      ) : (
                        formatKickoff(match.date, locale, userTimezone || undefined)
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {[match.home, match.away].map((team, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={team ? flagUrl(team.flag, 80) : '/placeholder.svg'}
                            className={`h-6 w-6 rounded-full object-cover ${
                              match.status === 'finished' && team && !team.winner
                                ? 'opacity-40 saturate-50'
                                : ''
                            }`}
                            alt=""
                          />
                          <span
                            className={`text-sm font-medium ${
                              match.status === 'finished' && team && team.winner
                                ? 'text-foreground font-bold'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {displayTeamName(team, locale, t.tbd)}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-foreground tabular-nums">
                          {match.status !== 'scheduled' && team?.score != null ? team.score : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Legend */}
      <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {t.roundLabels.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className="rounded-full bg-muted"
              style={{
                width: `${NODE_RADII[i] * 0.5}px`,
                height: `${NODE_RADII[i] * 0.5}px`,
              }}
              aria-hidden="true"
            />
            <span className="text-xs text-muted-foreground">{label}</span>
          </li>
        ))}
      </ul>

      {/* Settings Footer */}
      <footer className="mt-8 flex w-full flex-wrap items-center justify-center gap-6 border-t border-border/40 pt-4 pb-2">
        <div className="flex items-center gap-2 opacity-60 transition-opacity hover:opacity-100">
          <label htmlFor="locale-select" className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{t.language}</label>
          <select 
            id="locale-select" 
            value={locale} 
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="cursor-pointer appearance-none bg-transparent py-1 pl-1 pr-2 text-xs font-medium text-muted-foreground outline-none focus:text-foreground"
          >
            <option value="es" className="bg-background text-foreground">Español</option>
            <option value="en" className="bg-background text-foreground">English</option>
          </select>
        </div>
        {userTimezone && (
          <div className="flex items-center gap-2 opacity-60 transition-opacity hover:opacity-100">
            <label htmlFor="tz-select" className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{t.timezone}</label>
            <select 
              id="tz-select" 
              value={userTimezone} 
              onChange={(e) => setUserTimezone(e.target.value)}
              className="max-w-[150px] cursor-pointer appearance-none bg-transparent py-1 pl-1 pr-2 text-xs font-medium text-muted-foreground outline-none focus:text-foreground sm:max-w-[200px]"
            >
              {Intl.supportedValuesOf('timeZone').map(tz => (
                <option key={tz} value={tz} className="bg-background text-foreground">{tz.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        )}
      </footer>

      {/* Champion celebration popup */}
      {activeData?.champion && (
        <ChampionCelebration key={activeData.updatedAt} champion={activeData.champion} locale={locale} />
      )}
    </div>
  )
}
