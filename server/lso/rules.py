"""The dice rules from the Campaign Bible ("The roll"). Pure functions; the caller supplies the randomness.

- Roll the stat's die. A skill or a piece of chrome steps it up one size: d4 → d6 → d8 → d10 → d12 → d20.
  A d20 can't step up, so it gets +2 instead.
- Exploding: the die's maximum rolls again and adds, as long as it keeps happening (at most 6 dice).
- Natural 1: the first die shows 1. The roll fails and Entropy can't save it.
- Push: after seeing the roll, spend 1 Entropy for +1, or +2 if the die exploded. At most 2 per roll.

Difficulty never enters the app: Peter says it out loud, and the app never judges pass or fail.
"""

from __future__ import annotations

from typing import Protocol

from .models import DIE_SIDES, STATS

STEP_UP = {4: 6, 6: 8, 8: 10, 10: 12, 12: 20}
D20_BONUS = 2
MAX_DICE = 6
MAX_PUSHES = 2
PUSH_COST = 1

# The animation each stat plays on the roller's screen. The insult pools in content/insults.yaml use the stat names.
STAT_MODES = {"body": "slam", "reflex": "reel", "tech": "decrypt", "intel": "solve", "cool": "fade", "empathy": "pulse"}


class Rng(Protocol):
    def randint(self, a: int, b: int) -> int: ...
    def randrange(self, stop: int) -> int: ...


def effective_die(sides: int, stepped: bool) -> tuple[int, int]:
    """(die to roll, flat bonus) for a stat die, with or without a skill or chrome pick."""
    if sides not in DIE_SIDES:
        raise ValueError(f"no such die: d{sides}")
    if not stepped:
        return sides, 0
    if sides == 20:
        return 20, D20_BONUS
    return STEP_UP[sides], 0


def roll_dice(sides: int, rng: Rng) -> list[int]:
    """One roll, explosions included: keep rolling while the die shows its maximum, up to MAX_DICE dice."""
    dice: list[int] = []
    while True:
        r = rng.randint(1, sides)
        dice.append(r)
        if r != sides or len(dice) >= MAX_DICE:
            return dice


def is_nat1(dice: list[int]) -> bool:
    """Only the first die counts: a 1 after an explosion just adds 1."""
    return bool(dice) and dice[0] == 1


def exploded(dice: list[int]) -> bool:
    return len(dice) > 1


def push_gain(dice: list[int]) -> int:
    return 2 if exploded(dice) else 1


def total(dice: list[int], bonus: int, pushed: int) -> int:
    return sum(dice) + bonus + pushed


def push_refusal(dice: list[int], pushes: int, entropy: int) -> str | None:
    """Why this roll can't be pushed, or None if it can."""
    if is_nat1(dice):
        return "a natural 1 can't be pushed"
    if pushes >= MAX_PUSHES:
        return f"a roll can be pushed at most {MAX_PUSHES} times"
    if entropy < PUSH_COST:
        return "no Entropy left"
    return None


def pick_insult(stat: str, insults: dict[str, list[str]], rng: Rng) -> str:
    """The line a natural 1 slams on the roller's screen. The stat's own lines count double, as in R6."""
    if stat not in STATS:
        raise ValueError(f"unknown stat {stat!r}")
    own = insults.get(stat, [])
    pool = own + own + insults.get("any", [])
    return pool[rng.randrange(len(pool))] if pool else "DUMBASS."
