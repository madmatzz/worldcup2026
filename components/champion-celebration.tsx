'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { flagUrl, TEAM_INFO, type MatchTeam } from '@/lib/teams'
import { teamName, type Locale } from '@/lib/i18n'

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  color: string
  rotation: number
  rotationSpeed: number
  opacity: number
}

function createParticles(colors: string[], count: number): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * 400,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      opacity: 0.8 + Math.random() * 0.2,
    })
  }
  return particles
}

export function ChampionCelebration({
  champion,
  locale,
}: {
  champion: MatchTeam
  locale: Locale
}) {
  const [dismissed, setDismissed] = useState(false)
  const [visible, setVisible] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])

  const colors = TEAM_INFO[champion.abbr]?.colors ?? ['#FFD700', '#FFFFFF']
  const name = teamName(locale, champion.abbr, champion.name)
  const flag = flagUrl(champion.flag, 160)

  // Fade in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  // Confetti animation
  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    // Add new particles periodically
    if (particlesRef.current.length < 300) {
      particlesRef.current.push(...createParticles(colors, 8))
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    particlesRef.current = particlesRef.current.filter((p) => {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.04 // gravity
      p.vx *= 0.999 // drag
      p.rotation += p.rotationSpeed

      // Fade out near bottom
      if (p.y > canvas.height - 100) {
        p.opacity -= 0.02
      }

      if (p.opacity <= 0 || p.y > canvas.height + 20) return false

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.globalAlpha = p.opacity
      ctx.fillStyle = p.color
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()

      return true
    })

    animRef.current = requestAnimationFrame(animate)
  }, [colors])

  useEffect(() => {
    particlesRef.current = createParticles(colors, 120)
    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [animate, colors])

  return (
    <>
      {/* Confetti canvas */}
      <canvas
        ref={canvasRef}
        className={`pointer-events-none fixed inset-0 z-[-1] blur-[2px] transition-opacity duration-700 ${
          visible ? 'opacity-50' : 'opacity-0'
        }`}
        aria-hidden="true"
      />

      <div
        className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-700 pointer-events-none ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >

      {/* Backdrop */}
      {!dismissed && (
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm pointer-events-auto"
          onClick={() => setDismissed(true)}
        />
      )}

      {/* Popup */}
      {!dismissed && (
        <div className="relative z-10 mx-4 flex max-w-md flex-col items-center gap-6 rounded-2xl border border-yellow-500/30 bg-gradient-to-b from-yellow-950/90 via-card/95 to-card/95 p-8 shadow-2xl shadow-yellow-500/20 sm:p-10 pointer-events-auto">
          {/* Trophy */}
          <img
            src="https://cdn-img.zerozero.pt/img/logos/edicoes/176026_imgbank_.png"
            alt="World Cup Trophy"
            className="h-24 w-auto object-contain drop-shadow-[0_0_30px_rgba(251,191,36,0.5)]"
          />

          {/* Title */}
          <h2 className="text-center text-sm font-bold uppercase tracking-[0.3em] text-yellow-400">
            {locale === 'es' ? '¡Campeón del Mundo!' : 'World Champion!'}
          </h2>

          {/* Flag + Name */}
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={flag}
              alt={name}
              className="h-28 w-28 rounded-full object-cover shadow-lg ring-4 ring-yellow-500/40"
            />
            <p className="text-center text-3xl font-extrabold tracking-wide text-foreground sm:text-4xl">
              {name}
            </p>
            <p className="text-center text-sm text-muted-foreground">
              {locale === 'es'
                ? 'Copa del Mundo FIFA 2026'
                : '2026 FIFA World Cup'}
            </p>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="mt-2 rounded-full border border-border bg-card/80 px-6 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            {locale === 'es' ? 'Cerrar' : 'Close'}
          </button>
        </div>
      )}
      </div>
    </>
  )
}
