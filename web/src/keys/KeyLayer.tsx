import { useEffect } from 'react'
import { useGame } from '../store/game'
import { isCameraKey, resolve, type Action, type Tab } from './bindings'
import { endChord, fire, held, useKeys } from './registry'

/** Typing never triggers a key, and neither does anything with Cmd, Ctrl or Alt (Cmd+R still reloads). */
function typing(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"]')
}

/** A dialog of its own is open (Who's in the fight, a picker): it has the keyboard. Not the roll screen or the ? sheet. */
function otherDialog() {
  return !!document.querySelector('[aria-modal="true"]:not(.app-rolldlg):not(.app-keyhelp)')
}

/**
 * The keyboard, for players and the GM: listens on the window and hands each key to whatever is on screen for it
 * (see bindings.ts for the map, registry.ts for who acts). Players' keys go quiet while a film, the opening or an
 * overview has their screen. Mounted only in the game itself, never on the TV or in the GM's view of a player.
 */
export function KeyLayer({ tab }: { tab: Tab }) {
  useEffect(() => {
    const holding = new Map<string, 'burn' | 'push'>() // the key code that started a hold -> which hold

    const run = (act: Action, e: KeyboardEvent): boolean => {
      const g = useGame.getState()
      const view = g.view
      if (!view) return false
      switch (act.a) {
        case 'help':
          useKeys.setState({ help: !useKeys.getState().help })
          return true
        case 'esc': {
          const k = useKeys.getState()
          if (k.help) useKeys.setState({ help: false })
          else if (k.chord) endChord()
          else if (g.dialog) fire('dialog.close')
          else if (g.selected) g.select(null)
          else return false
          return true
        }
        case 'tab': {
          const to = act.tab === 'scene' && view.me.role === 'gm' && g.gmMap ? `scene/${g.gmMap}` : act.tab
          if (location.hash.slice(1) !== to) location.hash = to
          return true
        }
        case 'focus':
          return fire('cam.focus')
        case 'roll':
          if (view.me.role === 'gm') return fire('npc.start')
          if (!view.me.char) return false
          g.openPick(useKeys.getState().lastStat ?? 'body')
          return true
        case 'stat':
          return fire(view.me.role === 'gm' ? 'npc.stat' : 'pick.stat', act.i)
        case 'entry':
          return fire('pick.entry', act.i)
        case 'enter':
          return fire('dialog.enter')
        case 'hold':
          if (!fire(`${act.h}.down`)) return false
          holding.set(e.code, act.h)
          return true
        case 'mapPicker':
          g.setMapPicker(g.mapPicker ? null : { token: null })
          return true
        case 'next':
          return fire('fight.next')
        case 'god':
          return fire('npc.god')
        case 'tv':
          return fire('tv.toggle')
        case 'follow':
          return fire('tv.follow', act.i)
        case 'sound':
          if (!fire('sound.ready')) return false
          useKeys.setState({ chord: 'sound', soundCat: null })
          return true
        case 'soundCat':
          if (!fire('sound.cat', act.i)) {
            endChord()
            return true
          }
          useKeys.setState({ chord: 'soundCat', soundCat: act.i })
          return true
        case 'soundPlay':
          fire('sound.play', act.i)
          endChord()
          return true
      }
    }

    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return
      const g = useGame.getState()
      const view = g.view
      if (!view) return
      if (view.me.role === 'player' && (view.stage.held || view.stage.film || view.overview)) return
      if (e.key === 'Shift') {
        held.add(e.code) // Shift pans faster
        return
      }
      const help = useKeys.getState().help
      if (otherDialog() && !help) return
      if (g.mapPicker && e.code !== 'KeyM') return // the map picker is up: M closes it (and so does its own Esc)
      if (isCameraKey(e.code) && !g.dialog && !help && !useKeys.getState().chord) {
        if (fire('cam.go')) {
          held.add(e.code)
          e.preventDefault()
        }
        return
      }
      if (e.repeat) {
        if (holding.has(e.code)) e.preventDefault()
        return
      }
      const k = useKeys.getState()
      const act = resolve({ code: e.code, key: e.key, shift: e.shiftKey }, { role: view.me.role === 'gm' ? 'gm' : 'player', tab, dialog: !!g.dialog, chord: k.chord })
      if (help && act?.a !== 'help' && act?.a !== 'esc') return // the ? sheet is up: only ? and Esc
      if (!act) {
        if (k.chord) endChord() // any other key ends B or R, and does nothing else
        return
      }
      if (run(act, e)) e.preventDefault()
    }

    const up = (e: KeyboardEvent) => {
      held.delete(e.code)
      const h = holding.get(e.code)
      if (h) {
        holding.delete(e.code)
        fire(`${h}.up`)
      }
    }

    const reset = () => {
      held.clear()
      for (const h of holding.values()) fire(`${h}.up`)
      holding.clear()
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', reset)
      reset()
      endChord()
    }
  }, [tab])
  return null
}
