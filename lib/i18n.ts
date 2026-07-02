export type Locale = 'en' | 'es'

const translations = {
  en: {
    pageTitle: '2026 FIFA World Cup',
    liveData: 'Live data',
    liveDataUnavailable: 'Live data unavailable — retrying…',
    matchesInPlay: (n: number) => `${n} match${n > 1 ? 'es' : ''} in play`,
    close: 'Close',
    tbd: 'TBD',
    live: 'Live',
    stadiumTime: 'Stadium Time',
    yourLocalTime: 'Your Local Time',
    roundLabels: [
      'Round of 32',
      'Round of 16',
      'Quarter-finals',
      'Semi-finals',
      'Final',
    ] as string[],
    // Team names
    teams: {
      CAN: 'Canada',
      RSA: 'South Africa',
      GER: 'Germany',
      PAR: 'Paraguay',
      NED: 'Netherlands',
      MAR: 'Morocco',
      BRA: 'Brazil',
      JPN: 'Japan',
      FRA: 'France',
      SWE: 'Sweden',
      CIV: 'Ivory Coast',
      NOR: 'Norway',
      MEX: 'Mexico',
      ECU: 'Ecuador',
      ENG: 'England',
      COD: 'DR Congo',
      USA: 'United States',
      BIH: 'Bosnia-Herzegovina',
      BEL: 'Belgium',
      SEN: 'Senegal',
      POR: 'Portugal',
      CRO: 'Croatia',
      ESP: 'Spain',
      AUT: 'Austria',
      SUI: 'Switzerland',
      ALG: 'Algeria',
      ARG: 'Argentina',
      CPV: 'Cape Verde',
      COL: 'Colombia',
      GHA: 'Ghana',
      AUS: 'Australia',
      EGY: 'Egypt',
    } as Record<string, string>,
  },
  es: {
    pageTitle: 'Copa del Mundo FIFA 2026',
    liveData: 'Datos en vivo',
    liveDataUnavailable: 'Datos no disponibles — reintentando…',
    matchesInPlay: (n: number) => `${n} partido${n > 1 ? 's' : ''} en juego`,
    close: 'Cerrar',
    tbd: 'A definir',
    live: 'En vivo',
    stadiumTime: 'Hora local del estadio',
    yourLocalTime: 'Tu hora local',
    roundLabels: [
      'Dieciseisavos',
      'Octavos de final',
      'Cuartos de final',
      'Semifinales',
      'Final',
    ] as string[],
    teams: {
      CAN: 'Canadá',
      RSA: 'Sudáfrica',
      GER: 'Alemania',
      PAR: 'Paraguay',
      NED: 'Países Bajos',
      MAR: 'Marruecos',
      BRA: 'Brasil',
      JPN: 'Japón',
      FRA: 'Francia',
      SWE: 'Suecia',
      CIV: 'Costa de Marfil',
      NOR: 'Noruega',
      MEX: 'México',
      ECU: 'Ecuador',
      ENG: 'Inglaterra',
      COD: 'RD del Congo',
      USA: 'Estados Unidos',
      BIH: 'Bosnia-Herzegovina',
      BEL: 'Bélgica',
      SEN: 'Senegal',
      POR: 'Portugal',
      CRO: 'Croacia',
      ESP: 'España',
      AUT: 'Austria',
      SUI: 'Suiza',
      ALG: 'Argelia',
      ARG: 'Argentina',
      CPV: 'Cabo Verde',
      COL: 'Colombia',
      GHA: 'Ghana',
      AUS: 'Australia',
      EGY: 'Egipto',
    } as Record<string, string>,
  },
} as const

export type Translations = typeof translations.en

export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  
  // 1. Check all preferred languages
  if (navigator.languages && navigator.languages.length > 0) {
    if (navigator.languages.some(l => l.startsWith('es'))) return 'es'
  }
  
  // 2. Check primary language
  const lang = navigator.language || (navigator as any).userLanguage || ''
  if (lang.startsWith('es')) return 'es'
  
  // 3. Check physical location via TimeZone
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    const spanishTimezones = [
      'America/Argentina', 'America/Bogota', 'America/Caracas', 
      'America/Guatemala', 'America/La_Paz', 'America/Lima', 
      'America/Mexico_City', 'America/Monterrey', 'America/Montevideo', 
      'America/Panama', 'America/Santiago', 'America/Santo_Domingo', 
      'America/Asuncion', 'America/Havana', 'America/Costa_Rica', 
      'America/El_Salvador', 'America/Managua', 'America/Tegucigalpa',
      'America/Guayaquil', 'America/Puerto_Rico', 'Europe/Madrid'
    ]
    if (spanishTimezones.some(prefix => tz.startsWith(prefix))) {
      return 'es'
    }
  } catch (e) {
    // ignore
  }

  return 'en'
}

export function getTranslations(locale: Locale): Translations {
  return translations[locale]
}

/** Translate a team name by abbreviation */
export function teamName(locale: Locale, abbr: string, fallback: string): string {
  return translations[locale].teams[abbr] ?? fallback
}
