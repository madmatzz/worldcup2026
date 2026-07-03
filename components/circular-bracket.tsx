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

function getPeriodText(match: BracketMatch, t: ReturnType<typeof getTranslations>) {
  if (match.statusName === 'STATUS_HALFTIME') return t.periods.halftime;
  if (match.statusName === 'STATUS_FULL_TIME') return t.periods.fulltime;
  if (match.statusName === 'STATUS_SHOOTOUT' || match.period === 5) return t.periods.penalties;
  if (match.period === 1) return t.periods.firstHalf;
  if (match.period === 2) return t.periods.secondHalf;
  if (match.period === 3) return t.periods.extraTime1;
  if (match.period === 4) return t.periods.extraTime2;
  return null;
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
  const [viewDate, setViewDate] = useState<Date>(new Date())

  const adjustViewDate = (days: number) => {
    setViewDate(prev => {
      const next = new Date(prev)
      next.setDate(next.getDate() + days)
      return next
    })
  }

  const [locale, setLocale] = useState<Locale>('en')
  const [userTimezone, setUserTimezone] = useState<string>('')
  const [hoverTooltip, setHoverTooltip] = useState<{ content: React.ReactNode, x: number, y: number } | null>(null)
  
  const [isManualMode, setIsManualMode] = useState(false)
  const [showManualPopup, setShowManualPopup] = useState(false)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [manualOverrides, setManualOverrides] = useState<Record<string, { home: number | '', away: number | '', pensWinner?: 'home' | 'away' }>>({})

  const activeData = useMemo(() => {
    if (simulatedData) return simulatedData
    if (!data) return null
    if (!isManualMode || Object.keys(manualOverrides).length === 0) return data
    
    // Apply manual overrides
    const cloned = JSON.parse(JSON.stringify(data)) as BracketData
    let finalChampion = cloned.champion
    for (let r = 0; r < 5; r++) {
      for (let i = 0; i < cloned.rounds[r].length; i++) {
        const match = cloned.rounds[r][i]
        
        // Propagate winners from previous round
        if (r > 0) {
          const childHome = cloned.rounds[r - 1][i * 2]
          const childAway = cloned.rounds[r - 1][i * 2 + 1]
          
          const homeWinner = childHome?.home?.winner ? childHome.home : (childHome?.away?.winner ? childHome.away : null)
          const awayWinner = childAway?.home?.winner ? childAway.home : (childAway?.away?.winner ? childAway.away : null)
          
          if (homeWinner) match.home = { ...homeWinner, winner: false, score: null, pens: null }
          if (awayWinner) match.away = { ...awayWinner, winner: false, score: null, pens: null }
        }
        
        const override = manualOverrides[match.id]
        if (override && match.home && match.away) {
          match.status = 'finished'
          match.statusText = 'Manual'
          match.clock = null
          
          const homeScore = override.home === '' ? 0 : override.home
          const awayScore = override.away === '' ? 0 : override.away
          
          match.home.score = homeScore
          match.away.score = awayScore
          
          if (homeScore > awayScore) {
            match.home.winner = true
            match.away.winner = false
          } else if (override.away > override.home) {
            match.home.winner = false
            match.away.winner = true
          } else if (override.home === override.away) {
            if (override.pensWinner === 'home') {
              match.home.winner = true
              match.away.winner = false
            } else if (override.pensWinner === 'away') {
              match.home.winner = false
              match.away.winner = true
            } else {
              match.home.winner = false
              match.away.winner = false
            }
          }
        }
        
        if (r === 4) {
          finalChampion = match.home?.winner ? match.home : (match.away?.winner ? match.away : null)
        }
      }
    }
    cloned.champion = finalChampion
    return cloned
  }, [data, simulatedData, isManualMode, manualOverrides])

  const fillManualRandomly = () => {
    if (!data) return
    const newOverrides: typeof manualOverrides = {}
    data.rounds.forEach(round => {
      round.forEach(match => {
        const home = Math.floor(Math.random() * 4)
        const away = Math.floor(Math.random() * 4)
        let pensWinner: 'home' | 'away' | undefined
        
        if (home === away) {
          pensWinner = Math.random() > 0.5 ? 'home' : 'away'
        }
        
        newOverrides[match.id] = { home, away, pensWinner }
      })
    })
    setManualOverrides(newOverrides)
  }

  const closeManualPopup = () => {
    setShowManualPopup(false)
    const filledCount = Object.keys(manualOverrides).length
    if (filledCount === 0) {
      setIsManualMode(false)
    } else {
      const totalMatches = data?.rounds.reduce((acc, round) => acc + round.length, 0) || 0
      if (filledCount < totalMatches) {
        setWarningMessage(t.fillAllMatchesWarning)
        setTimeout(() => setWarningMessage(null), 4000)
      }
    }
  }

  const selected = useMemo(() => {
    if (!selectedId || !activeData) return null
    for (const round of activeData.rounds) {
      const match = round.find((m) => m.id === selectedId)
      if (match) return match
    }
    return null
  }, [selectedId, activeData])

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

  const visibleMatches = useMemo(() => {
    if (!activeData || !userTimezone) return []
    const tz = userTimezone || 'UTC'
    try {
      const viewStr = viewDate.toLocaleDateString('en-US', { timeZone: tz })
      const allMatches = activeData.rounds.flat()
      return allMatches.filter(m => {
        const matchStr = new Date(m.date).toLocaleDateString('en-US', { timeZone: tz })
        return matchStr === viewStr
      }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    } catch {
      return []
    }
  }, [activeData, userTimezone, viewDate])
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
    
    const TEAM_STRENGTHS: Record<string, number> = {
      ARG: 10, FRA: 10, 
      ESP: 9, ENG: 9, BRA: 9,
      GER: 8, POR: 8, NED: 8,
      BEL: 7, CRO: 7, COL: 7, MAR: 7, JPN: 7, SUI: 7, AUT: 7,
      MEX: 6, USA: 6, SEN: 6, SWE: 6, NOR: 6, CIV: 6, ALG: 6, EGY: 6, ECU: 6,
      PAR: 5, GHA: 5, AUS: 5, RSA: 5, CAN: 5, BIH: 5,
      COD: 4, CPV: 4
    }

    const getTeamStrength = (abbr: string) => {
      return TEAM_STRENGTHS[abbr] || 5
    }

    let recentChampions: string[] = []
    try {
      const stored = localStorage.getItem('recentChampions')
      if (stored) recentChampions = JSON.parse(stored)
    } catch (e) {
      // Ignore parse errors
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
          
          if (homeWinner) match.home = { ...homeWinner, winner: false, score: null, pens: null }
          if (awayWinner) match.away = { ...awayWinner, winner: false, score: null, pens: null }
        }
        
        // Simulate match if no winner exists yet and both teams are known
        const hasWinner = match.status === 'finished' && (match.home?.winner || match.away?.winner)
        if (!hasWinner && match.home && match.away) {
          const homeStr = getTeamStrength(match.home.abbr)
          const awayStr = getTeamStrength(match.away.abbr)
          
          let homeProb = Math.pow(homeStr, 2) / (Math.pow(homeStr, 2) + Math.pow(awayStr, 2))
          
          const isHomeRecentChamp = recentChampions.includes(match.home.abbr)
          const isAwayRecentChamp = recentChampions.includes(match.away.abbr)
          
          if (isHomeRecentChamp && !isAwayRecentChamp) {
            homeProb *= 0.5 // Reduce chances for recent champs to encourage variety
          } else if (!isHomeRecentChamp && isAwayRecentChamp) {
            homeProb = 1 - ((1 - homeProb) * 0.5) // Increase chances against recent champs
          }
          
          match.status = 'finished'
          match.statusText = 'Simulated'
          match.clock = null
          
          const drawProb = Math.max(0.05, 0.35 - (Math.abs(homeStr - awayStr) * 0.05))
          if (Math.random() < drawProb) {
            const score = Math.floor(Math.random() * 3) // 0-0, 1-1, 2-2
            match.home.score = score
            match.away.score = score
            
            const homeWinsPens = Math.random() < homeProb
            if (homeWinsPens) {
              match.home.winner = true
              match.away.winner = false
              match.home.pens = 4 + Math.floor(Math.random() * 2)
              match.away.pens = match.home.pens - 1 - Math.floor(Math.random() * 2)
            } else {
              match.home.winner = false
              match.away.winner = true
              match.away.pens = 4 + Math.floor(Math.random() * 2)
              match.home.pens = match.away.pens - 1 - Math.floor(Math.random() * 2)
            }
          } else {
            const homeWins = Math.random() < homeProb
            if (homeWins) {
              match.home.winner = true
              match.away.winner = false
              match.home.score = Math.floor(Math.random() * 3) + 1
              match.away.score = Math.floor(Math.random() * match.home.score)
            } else {
              match.home.winner = false
              match.away.winner = true
              match.away.score = Math.floor(Math.random() * 3) + 1
              match.home.score = Math.floor(Math.random() * match.away.score)
            }
          }
        }

        // Check if this is the final match to set champion
        if (r === 4) {
          finalChampion = match.home?.winner ? match.home : (match.away?.winner ? match.away : null)
        }
      }
    }

    if (finalChampion) {
      recentChampions.push(finalChampion.abbr)
      if (recentChampions.length > 10) recentChampions = recentChampions.slice(-10)
      try {
        localStorage.setItem('recentChampions', JSON.stringify(recentChampions))
      } catch (e) {
        // Ignore errors
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

  const liveCount = activeData?.rounds.flat().filter((m) => m.status === 'live').length ?? 0

  const todayStatusElement = useMemo(() => {
    if (!activeData || !userTimezone) return null
    if (todayMatches.length === 0) return <span>{t.noMatchesToday}</span>

    const upcomingCount = todayMatches.filter(m => m.status === 'scheduled').length

    if (liveCount > 0) {
      const firstLive = activeData.rounds.flat().find((m) => m.status === 'live')
      return (
        <button 
          type="button"
          onClick={() => firstLive && setSelectedId(firstLive.id)}
          className="flex items-center gap-2 text-green-500 hover:text-green-400 transition-colors"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="font-semibold">{t.liveMatchNotice(liveCount)}</span>
          {upcomingCount > 0 && <span className="text-muted-foreground font-normal"> • {t.matchesLeftToday(upcomingCount)}</span>}
        </button>
      )
    }

    if (upcomingCount > 0) return <span>{t.matchesLeftToday(upcomingCount)}</span>

    return <span>{t.allMatchesFinished}</span>
  }, [activeData, userTimezone, todayMatches, liveCount, t])

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
        
        {/* Today status summary */}
        {todayStatusElement && (
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground">
            {todayStatusElement}
          </div>
        )}
        
        {/* Simulation controls */}
        <div className="flex items-center gap-2">
          {/* Manual Mode Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsManualMode(prev => {
                if (!prev) {
                  setSimulatedData(null)
                  setShowManualPopup(true)
                } else {
                  setShowManualPopup(false)
                }
                return !prev
              })
            }}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              isManualMode 
                ? 'border-green-500/40 bg-green-500/10 text-green-500 hover:border-green-500 hover:bg-green-500/20'
                : 'border-muted bg-card text-foreground hover:border-foreground/40 hover:bg-muted/50'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            {isManualMode ? t.exitManual : t.manualMode}
          </button>

          {isManualMode && !showManualPopup && (
            <button
              type="button"
              onClick={() => setShowManualPopup(true)}
              className="flex items-center gap-2 rounded-full border border-green-500/40 bg-card px-4 py-2 text-sm font-medium text-green-500 transition-colors hover:border-green-500 hover:bg-green-500/10"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              {locale === 'es' ? 'Editar Resultados' : 'Edit Scores'}
            </button>
          )}
          
          <button
            type="button"
            onClick={() => {
              setIsManualMode(false)
              handleSimulate()
            }}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              simulatedData 
                ? 'border-accent/40 bg-card text-foreground hover:border-accent hover:bg-accent/10'
                : 'border-blue-500/40 bg-card text-foreground hover:border-blue-500 hover:bg-blue-500/10'
            }`}
          >
            <svg className={`h-4 w-4 ${simulatedData ? 'text-accent' : 'text-blue-500'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            {simulatedData ? t.reSimulateMatches : t.simulateMatches}
          </button>
          {(simulatedData || (isManualMode && Object.keys(manualOverrides).length > 0)) && (
            <button
              type="button"
              onClick={() => {
                setSimulatedData(null)
                setManualOverrides({})
              }}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:border-destructive hover:text-destructive"
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
            {/* iOS Safari compatible desaturation filter for SVG images */}
            <filter id="desaturate">
              <feColorMatrix type="saturate" values="0.10" />
            </filter>

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
                        onMouseEnter={(e) => {
                          const periodText = getPeriodText(match, t)
                          const showClock = match.clock && !['HT', 'Halftime', 'FT', 'Pen'].includes(match.clock) && match.statusName !== 'STATUS_HALFTIME'
                          
                          const tooltipContent = (
                            <div className="flex items-center gap-2">
                              <span>{displayTeamName(team, locale, t.tbd)}</span>
                              {isLive && (periodText || showClock) && (
                                <span className="flex items-center gap-1.5 border-l border-border/40 pl-2">
                                  {periodText && (
                                    <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-bold text-green-500 uppercase tracking-wider">
                                      {periodText}
                                    </span>
                                  )}
                                  {showClock && (
                                    <span className="flex items-center gap-1 rounded border border-green-500/20 bg-green-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-green-500/90 font-mono tracking-tight animate-pulse">
                                      <svg className="w-2.5 h-2.5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                      {match.clock}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          )

                          setHoverTooltip({
                            content: tooltipContent,
                            x: e.clientX,
                            y: e.clientY
                          })
                        }}
                        onMouseMove={(e) => {
                          setHoverTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
                        }}
                        onMouseLeave={() => setHoverTooltip(null)}
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
                          filter={isLoser ? 'url(#desaturate)' : undefined}
                          className="transition-all duration-300"
                        />
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
              {selected.status === 'live' ? (() => {
                const periodText = getPeriodText(selected, t)
                const showClock = selected.clock && !['HT', 'Halftime', 'FT', 'Pen'].includes(selected.clock) && selected.statusName !== 'STATUS_HALFTIME'
                return (
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-green-500">
                      {t.live}
                    </p>
                    {(periodText || showClock) && (
                      <div className="flex items-center gap-1.5 ml-1">
                        {periodText && (
                          <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-bold text-green-500 uppercase tracking-wider">
                            {periodText}
                          </span>
                        )}
                        {showClock && (
                          <span className="flex items-center gap-1 rounded border border-green-500/20 bg-green-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-green-500/90 font-mono tracking-tight animate-pulse">
                            <svg className="w-2.5 h-2.5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {selected.clock}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })() : selected.status === 'finished' ? (
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{selected.statusText}</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-foreground">
                    {formatKickoff(selected.date, locale, getVenueTimezone(selected.venue || undefined))} <span className="text-xs font-normal text-muted-foreground">({t.stadiumTime})</span>
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
                      className={`h-6 w-6 rounded-full object-cover ${
                        eliminatedTeams.has(team.abbr) ? 'saturate-[.10]' : ''
                      }`}
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
          <div className="mt-2 flex flex-col items-center">
            <p className="font-mono text-2xl font-bold text-foreground tabular-nums">
              {selected.status !== 'scheduled' && selected.home?.score != null && selected.away?.score != null
                ? `${selected.home.score} \u2013 ${selected.away.score}`
                : '\u2013'}
            </p>
            {selected.home?.pens != null && selected.away?.pens != null && (
              <p className="text-xs font-semibold text-muted-foreground mt-0.5">
                {`(${selected.home.pens} \u2013 ${selected.away.pens} p)`}
              </p>
            )}
          </div>
          {selected.note && (
            <p className="mt-1 text-center text-xs text-muted-foreground">
              {selected.note}
            </p>
          )}

          {/* Stats */}
          {selected.status !== 'scheduled' && selected.statusText !== 'Simulated' && selected.statusText !== 'Manual' && (selected.home?.stats || selected.away?.stats) && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="flex flex-col gap-2.5">
                {[
                  { label: t.stats.possession, key: 'possession', unit: '%' },
                  { label: t.stats.totalShots, key: 'totalShots' },
                  { label: t.stats.shotsOnTarget, key: 'shotsOnTarget' },
                  { label: t.stats.corners, key: 'corners' },
                  { label: t.stats.fouls, key: 'fouls' },
                ].map((stat, i) => {
                  // @ts-ignore - dynamic key access
                  const hVal = selected.home?.stats?.[stat.key]
                  // @ts-ignore - dynamic key access
                  const aVal = selected.away?.stats?.[stat.key]
                  if (hVal == null && aVal == null) return null
                  
                  const hNum = Number(hVal || 0)
                  const aNum = Number(aVal || 0)
                  const total = hNum + aNum
                  const hPct = total > 0 ? (hNum / total) * 100 : 50
                  const aPct = total > 0 ? (aNum / total) * 100 : 50
                  
                  return (
                    <div key={i} className="flex flex-col gap-1.5 text-xs">
                      <div className="flex justify-between font-medium text-foreground">
                        <span className="w-10 tabular-nums">{hVal ?? '-'}{stat.unit && hVal ? stat.unit : ''}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{stat.label}</span>
                        <span className="w-10 text-right tabular-nums">{aVal ?? '-'}{stat.unit && aVal ? stat.unit : ''}</span>
                      </div>
                      <div className="flex h-1.5 w-full gap-1">
                        <div className="flex h-full flex-1 justify-end overflow-hidden rounded-l-full bg-muted">
                          <div className="bg-foreground transition-all duration-500" style={{ width: `${hPct}%` }} />
                        </div>
                        <div className="flex h-full flex-1 overflow-hidden rounded-r-full bg-muted">
                          <div className="bg-muted-foreground transition-all duration-500" style={{ width: `${aPct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Events timeline */}
          {selected.status !== 'scheduled' && selected.statusText !== 'Simulated' && selected.statusText !== 'Manual' && selected.events.length > 0 && (
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

      {/* Matches By Day */}
      {activeData && (
        <section className="flex w-full max-w-4xl flex-col gap-4 px-4 py-8">
          <div className="flex items-center justify-center gap-4">
            <button 
              onClick={() => adjustViewDate(-1)} 
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
            </button>
            <h2 className="text-center text-xl font-bold tracking-widest text-foreground uppercase min-w-[200px]">
              {(() => {
                const tz = userTimezone || 'UTC'
                const isToday = viewDate.toLocaleDateString('en-US', { timeZone: tz }) === new Date().toLocaleDateString('en-US', { timeZone: tz })
                if (isToday) return t.matchesToday
                return viewDate.toLocaleDateString(locale === 'es' ? 'es-AR' : 'en-US', { month: 'short', day: 'numeric', timeZone: tz })
              })()}
            </h2>
            <button 
              onClick={() => adjustViewDate(1)} 
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </button>
          </div>
          
          {visibleMatches.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-4">
              {visibleMatches.map((match) => {
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
                          {t.live}{match.clock && match.statusName !== 'STATUS_HALFTIME' ? ` (${match.clock})` : ''}
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
                              team && eliminatedTeams.has(team.abbr)
                                ? 'saturate-[.10]'
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
                        <div className="flex items-center gap-2">
                          {match.status !== 'scheduled' && team?.pens != null && (
                            <span className="text-[10px] text-muted-foreground font-semibold">({team.pens})</span>
                          )}
                          <span className="font-mono font-bold text-foreground tabular-nums">
                            {match.status !== 'scheduled' && team?.score != null ? team.score : '-'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                )
              })}
            </div>
          ) : (
            <p className="mt-4 text-center text-muted-foreground">
              {t.noMatchesToday}
            </p>
          )}
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
        <ChampionCelebration key={activeData.champion.abbr} champion={activeData.champion} locale={locale} />
      )}

      {/* Custom Hover Tooltip */}
      {hoverTooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded bg-foreground px-2 py-1 text-xs text-background shadow-lg transition-opacity duration-200"
          style={{
            left: hoverTooltip.x,
            top: hoverTooltip.y,
            transform: 'translate(-50%, -100%)',
            marginTop: '-12px',
          }}
        >
          {hoverTooltip.content}
          <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
        </div>
      )}

      {/* Manual Mode Popup */}
      {showManualPopup && activeData && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-2 sm:p-4"
          onClick={closeManualPopup}
        >
          <div 
            className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-4 sm:p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={fillManualRandomly}
              className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth={2} />
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
              </svg>
              <span className="hidden sm:inline">{t.randomScores}</span>
              <span className="sm:hidden">{locale === 'es' ? 'Aleatorio' : 'Random'}</span>
            </button>

            <button 
              onClick={closeManualPopup}
              className="absolute top-2 right-2 sm:top-4 sm:right-4 p-2 text-muted-foreground hover:text-foreground"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-widest text-center mb-6 mt-8 sm:mt-0">
              {locale === 'es' ? 'Resultados Manuales' : 'Manual Scores'}
            </h2>
            
            <div className="flex flex-col gap-8">
              {[...activeData.rounds].map((round, rIndex) => {
                const roundName = rIndex === 0 ? (locale === 'es' ? 'Dieciseisavos' : 'Round of 32')
                                : rIndex === 1 ? (locale === 'es' ? 'Octavos de Final' : 'Round of 16')
                                : rIndex === 2 ? (locale === 'es' ? 'Cuartos de Final' : 'Quarterfinals')
                                : rIndex === 3 ? (locale === 'es' ? 'Semifinales' : 'Semifinals')
                                : (locale === 'es' ? 'Final' : 'Final');
                return (
                  <div key={rIndex} className="flex flex-col gap-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">{roundName}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {round.map(match => (
                        <div key={match.id} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 shadow-sm hover:border-muted-foreground/30 transition-colors">
                          <div className="flex items-center justify-between">
                            {/* Home */}
                            <div className="flex flex-1 items-center gap-2 overflow-hidden">
                              {match.home ? (
                                <>
                                  <img src={flagUrl(match.home.flag, 80) || '/placeholder.svg'} className="w-5 h-5 shrink-0 rounded-full object-cover" />
                                  <span className="text-sm font-medium truncate">{displayTeamName(match.home, locale, t.tbd)}</span>
                                </>
                              ) : <span className="text-sm text-muted-foreground truncate">{t.tbd}</span>}
                              
                              {match.home && match.away && (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  autoComplete="off"
                                  data-lpignore="true"
                                  value={manualOverrides[match.id]?.home ?? ''}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value)
                                    setManualOverrides(prev => ({
                                      ...prev, [match.id]: { ...(prev[match.id] || { home: '', away: '' }), home: isNaN(val) ? '' : val }
                                    }))
                                  }}
                                  className="w-10 sm:w-12 shrink-0 rounded border bg-card px-1 py-1.5 sm:py-1 text-center font-mono text-sm focus:outline-none focus:ring-1 focus:ring-accent ml-auto"
                                />
                              )}
                            </div>
                            
                            <span className="mx-1 sm:mx-2 text-xs font-bold text-muted-foreground">-</span>
                            
                            {/* Away */}
                            <div className="flex flex-1 items-center justify-end gap-2 overflow-hidden">
                              {match.home && match.away && (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  autoComplete="off"
                                  data-lpignore="true"
                                  value={manualOverrides[match.id]?.away ?? ''}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value)
                                    setManualOverrides(prev => ({
                                      ...prev, [match.id]: { ...(prev[match.id] || { home: '', away: '' }), away: isNaN(val) ? '' : val }
                                    }))
                                  }}
                                  className="w-10 sm:w-12 shrink-0 rounded border bg-card px-1 py-1.5 sm:py-1 text-center font-mono text-sm focus:outline-none focus:ring-1 focus:ring-accent mr-auto"
                                />
                              )}
                              {match.away ? (
                                <>
                                  <span className="text-sm font-medium truncate text-right">{displayTeamName(match.away, locale, t.tbd)}</span>
                                  <img src={flagUrl(match.away.flag, 80) || '/placeholder.svg'} className="w-5 h-5 shrink-0 rounded-full object-cover" />
                                </>
                              ) : <span className="text-sm text-muted-foreground truncate text-right">{t.tbd}</span>}
                            </div>
                          </div>
                          
                          {/* Penalties */}
                          {match.home && match.away && manualOverrides[match.id]?.home === manualOverrides[match.id]?.away && manualOverrides[match.id]?.home !== undefined && (
                            <div className="flex justify-between px-2 sm:px-8 mt-1">
                              <button 
                                onClick={() => setManualOverrides(prev => ({ ...prev, [match.id]: { ...prev[match.id], pensWinner: 'home' } }))}
                                className={`text-[10px] uppercase font-bold px-2 py-1 rounded transition-colors ${manualOverrides[match.id]?.pensWinner === 'home' ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                              >
                                Pen
                              </button>
                              <button 
                                onClick={() => setManualOverrides(prev => ({ ...prev, [match.id]: { ...prev[match.id], pensWinner: 'away' } }))}
                                className={`text-[10px] uppercase font-bold px-2 py-1 rounded transition-colors ${manualOverrides[match.id]?.pensWinner === 'away' ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                              >
                                Pen
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            
            <div className="mt-8 flex justify-center">
              <button onClick={closeManualPopup} className="rounded-full bg-foreground text-background px-8 py-2 font-bold hover:bg-foreground/90 transition-colors">
                {locale === 'es' ? 'Ver Bracket' : 'View Bracket'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warning Toast */}
      {warningMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] bg-orange-500/90 backdrop-blur text-white px-6 py-3 rounded-full shadow-2xl text-sm sm:text-base font-bold animate-in fade-in slide-in-from-bottom-4">
          {warningMessage}
        </div>
      )}
    </div>
  )
}
