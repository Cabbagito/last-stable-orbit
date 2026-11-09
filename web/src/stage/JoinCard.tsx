import type { JoinView } from '../types'

/** A URL as you'd say it: nobody needs to read out the http://. */
export const bareUrl = (url: string) => url.replace(/^https?:\/\//, '')

function Block({ label, value, link, small }: { label: string; value: string; link?: boolean; small?: string }) {
  return (
    <div className="app-joinb">
      <span className="app-joinlab">{label}</span>
      <span className={'app-joinval' + (link ? ' link' : '')}>{value}</span>
      {small && <span className="app-joinsmall">{small}</span>}
    </div>
  )
}

/**
 * How to get into the game: the wifi, then the URL, straight on the TV's picture. It has to be on a screen everyone can
 * already see, because nobody can load a page until they're on the wifi. `boxed` backs it in black, for over a map,
 * where the art is too bright to read words on.
 */
export function JoinCard({ join, boxed }: { join: JoinView; boxed?: boolean }) {
  return (
    <aside className={'app-tvjoin' + (boxed ? ' boxed' : '')} aria-label="How to join the game">
      {join.ssid && <Block label="Wifi" value={join.ssid} />}
      {join.password && <Block label="Password" value={join.password} />}
      <Block label={join.ssid ? 'Then open' : 'Open'} value={bareUrl(join.url)} link small={join.fallback ? `or ${bareUrl(join.fallback)}` : undefined} />
    </aside>
  )
}
