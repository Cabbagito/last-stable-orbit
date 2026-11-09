import { useEffect, useState } from 'react'

/** True for a few seconds after the mouse moves or the screen is touched: when a full-screen page shows its way out. */
export function useAwake() {
  const [awake, setAwake] = useState(false)
  useEffect(() => {
    let t = 0
    const on = () => {
      setAwake(true)
      window.clearTimeout(t)
      t = window.setTimeout(() => setAwake(false), 3000)
    }
    window.addEventListener('pointermove', on)
    window.addEventListener('pointerdown', on)
    return () => {
      window.removeEventListener('pointermove', on)
      window.removeEventListener('pointerdown', on)
      window.clearTimeout(t)
    }
  }, [])
  return awake
}
