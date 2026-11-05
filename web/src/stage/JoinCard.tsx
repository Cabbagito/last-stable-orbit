import type { JoinQr, JoinView } from '../types'

/** A QR code from the server's path, on the white margin scanners need. */
function Qr({ qr, label }: { qr: JoinQr; label: string }) {
  const q = 4 // the quiet zone, in modules
  return (
    <svg className="app-joinqr" viewBox={`${-q} ${-q} ${qr.size + q * 2} ${qr.size + q * 2}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x={-q} y={-q} width={qr.size + q * 2} height={qr.size + q * 2} fill="#fff" />
      <path d={qr.path} fill="#000" />
    </svg>
  )
}

/**
 * How to get into the game: the wifi, then the URL. It has to be on a screen everyone can already see, because
 * nobody can load a page until they're on the wifi. Phones can scan the codes; laptops read the words.
 */
export function JoinCard({ join }: { join: JoinView }) {
  return (
    <div className="app-joinsteps">
      {join.ssid && join.wifi_qr && (
        <div className="app-joinstep">
          <Qr qr={join.wifi_qr} label={`QR code to join the wifi network ${join.ssid}`} />
          <div className="app-jointext">
            <span className="r5-sec">Join the wifi</span>
            <span className="app-joinbig">{join.ssid}</span>
            {join.password && <span className="app-joinbig">{join.password}</span>}
          </div>
        </div>
      )}
      <div className="app-joinstep">
        <Qr qr={join.url_qr} label={`QR code to open ${join.url}`} />
        <div className="app-jointext">
          <span className="r5-sec">Then open</span>
          <span className="app-joinbig">{join.url}</span>
          {join.fallback && <span className="app-joinsmall">If that doesn't load: {join.fallback}</span>}
        </div>
      </div>
    </div>
  )
}
