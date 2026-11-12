"""A character's sheet as it stands now: what characters.yaml gives them, plus what the saved game has added.

Chrome comes two ways (items.yaml). A piece with `raises` is held like any item, and while someone holds it the most
health or Entropy they can have is 1 higher. Any other piece sits on the sheet as a fourth skill, picked on a roll like
the first three. The GM can also move either maximum by hand.
"""

from __future__ import annotations

from .content import Content
from .models import ENTROPY_CAP, ENTROPY_MAX, HEALTH_CAP, GameState, ListEntry


def _held(state: GameState, content: Content, char: str, what: str, without: str | None) -> int:
    """How many pieces of chrome that raise `what` this character holds, leaving out the entry `without`."""
    n = 0
    for e in state.inventory.get(char, []):
        it = content.items.get(e.item)
        if it and it.raises == what and e.uid != without:
            n += 1
    return n


def _most(base: int, cap: int) -> int:
    return max(1, min(cap, base))


def max_health(state: GameState, content: Content, char: str, without: str | None = None) -> int:
    """The most health they can have. `without`: as if they didn't hold that entry (it's about to leave)."""
    adj = state.maxes.get(char)
    return _most(content.characters[char].health + (adj.health if adj else 0) + _held(state, content, char, "health", without), HEALTH_CAP)


def max_entropy(state: GameState, content: Content, char: str, without: str | None = None) -> int:
    adj = state.maxes.get(char)
    return _most(ENTROPY_MAX + (adj.entropy if adj else 0) + _held(state, content, char, "entropy", without), ENTROPY_CAP)


def chrome(state: GameState, content: Content, char: str) -> list[str]:
    """The chrome on their sheet: item ids, leaving out any the content no longer has."""
    return [i for i in state.chrome.get(char, []) if i in content.items and content.items[i].chrome and not content.items[i].raises]


def entries(state: GameState, content: Content, char: str) -> list[ListEntry]:
    """Their skills, then their chrome: the rows on the sheet, and what a roll's pick is an index into."""
    out = list(content.characters[char].entries)
    for i in chrome(state, content, char):
        it = content.items[i]
        out.append(ListEntry(name=it.name, kind="chrome", icon=it.icon, text=it.text))
    return out
