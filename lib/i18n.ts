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
  const lang = navigator.language || (navigator as any).userLanguage || 'en'
  return lang.startsWith('es') ? 'es' : 'en'
}

export function getTranslations(locale: Locale): Translations {
  return translations[locale]
}

/** Translate a team name by abbreviation */
export function teamName(locale: Locale, abbr: string, fallback: string): string {
  return translations[locale].teams[abbr] ?? fallback
}
