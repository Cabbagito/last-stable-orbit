"""The reducer: apply one logged event to the game state. Pure, so replaying the log rebuilds the state."""

from __future__ import annotations

from .content import Content
from .models import RULES, BurnState, Fight, FilmState, FloodState, GameState, InvEntry, MapState, OpeningState, OverviewState, Preset, PresetItem, RollState, SlotBank, SlotSeat, TokenState, Vitals

KEEP_CLOSED_ROLLS = 20  # closed rolls kept in the state for the GM's history; the log keeps all of them


class UnknownEvent(ValueError):
    pass


def _roll(s: GameState, roll_id: str) -> RollState:
    r = next((r for r in s.rolls if r.id == roll_id), None)
    if r is None:
        raise ValueError(f"no roll {roll_id!r}")
    return r


def _trim_rolls(s: GameState) -> None:
    closed = [r for r in s.rolls if not r.open]
    drop = {r.id for r in closed[: max(0, len(closed) - KEEP_CLOSED_ROLLS)]}
    if drop:
        s.rolls = [r for r in s.rolls if r.id not in drop]


def state_from_preset(preset: Preset, content: Content) -> dict:
    """The full state a preset describes, as plain data for a `world.loaded` event."""
    maps = {m_id: MapState(mood=m.moods[0].id).model_dump() for m_id, m in content.maps.items()}
    for m_id, ms in preset.maps.items():
        maps[m_id] = ms.model_dump()
    tokens: dict[str, dict] = {}
    for t in preset.tokens:
        tid = t.id or t.ref
        n = 2
        while tid in tokens:
            tid, n = f"{t.id or t.ref}-{n}", n + 1
        tokens[tid] = TokenState(kind=t.kind, ref=t.ref, map=t.map, at=t.at, hidden=t.hidden).model_dump()
    vitals = {c: (preset.vitals.get(c) or Vitals(hp=ch.health)).model_dump() for c, ch in content.characters.items()}
    inventory = {c: [] for c in content.characters}
    for holder, entries in preset.inventory.items():
        inventory[holder] = [
            InvEntry(uid=f"{holder}-{i + 1}", item=e.item, count=e.count).model_dump()
            if isinstance(e, PresetItem)
            else InvEntry(uid=f"{holder}-{i + 1}", item=e).model_dump()
            for i, e in enumerate(entries)
        ]
    return {
        "rules": RULES,
        "party_map": preset.party_map,
        "maps": maps,
        "tokens": tokens,
        "vitals": vitals,
        "inventory": inventory,
        "codex": list(preset.codex),
        "station": station_lit(preset, content, tokens),
    }


def station_lit(preset: Preset, content: Content, tokens: dict[str, dict]) -> list[str]:
    """A preset's lit places: its own list, the party map, and wherever the crew stands."""
    places = {p.map for p in content.station.places} if content.station else set()
    lit = list(preset.station)
    for m in [preset.party_map] + [t["map"] for t in tokens.values() if t["kind"] == "crew"]:
        if m in places and m not in lit:
            lit.append(m)
    return lit


def _entry(s: GameState, holder: str, uid: str) -> InvEntry:
    e = next((e for e in s.inventory.get(holder, []) if e.uid == uid), None)
    if e is None:
        raise ValueError(f"{holder} holds no {uid!r}")
    return e


def _drop_fighter(s: GameState, token: str) -> None:
    """Someone left the map, or the map: out of its fight. Whoever's turn it is keeps it; a fight with nobody left ends."""
    for map_id, f in list(s.fights.items()):
        if token not in f.order:
            continue
        cur = f.order[f.turn]
        f.order = [t for t in f.order if t != token]
        f.rolled = [t for t in f.rolled if t != token]
        f.ini.pop(token, None)
        f.joined.pop(token, None)
        if not f.order:
            del s.fights[map_id]
        else:
            f.turn = f.order.index(cur) if cur != token else f.turn % len(f.order)


def _slot_seat(s: GameState, key: str, char: str) -> SlotSeat:
    seat = next((x for x in s.slots[key].seats if x.char == char), None)
    if seat is None:
        raise ValueError(f"{char} isn't sitting at {key!r}")
    return seat


def _settle_window(bank: SlotBank) -> None:
    """A stand window with nobody left standing in it is over."""
    if not any(x.page == "wait" for x in bank.seats):
        bank.until = None


def _leave_slots(s: GameState, char: str) -> None:
    """They got up, or the GM sent them somewhere else. What they'd lost is gone."""
    for bank in s.slots.values():
        bank.seats = [x for x in bank.seats if x.char != char]
        _settle_window(bank)


def apply(state: GameState, seq: int, ev_type: str, data: dict) -> GameState:
    s = state.model_copy(deep=True)
    s.seq = seq
    if ev_type == "world.loaded":
        fresh = GameState.model_validate({**data["state"], "seq": seq})
        fresh.stage = s.stage  # a preset sets the world, not the table: the camera and films carry over
        fresh.overviews = s.overviews  # and what's open on someone's screen stays open
        fresh.slots = {k: SlotBank(out=True) for k, b in s.slots.items() if b.out}  # a flood is for good; everyone's up
        if data.get("scene"):  # only the scene: who stands where and each map's mood. What the crew has and knows stays
            fresh.vitals, fresh.inventory, fresh.seen = s.vitals, s.inventory, s.seen
            fresh.codex, fresh.codex_read = s.codex, s.codex_read
            fresh.station = s.station + [m for m in fresh.station if m not in s.station]
            for m_id, ms in fresh.maps.items():
                old = s.maps[m_id].shown if m_id in s.maps else []
                ms.shown = old + [o for o in ms.shown if o not in old]
        return fresh
    if ev_type == "token.moved":
        s.tokens[data["token"]].at = tuple(data["at"])
    elif ev_type == "token.placed":
        s.tokens[data["token"]] = TokenState.model_validate(data["state"])
    elif ev_type == "token.removed":
        t = s.tokens.pop(data["token"], None)
        if t and t.kind == "crew":
            _leave_slots(s, t.ref)
        _drop_fighter(s, data["token"])
    elif ev_type == "token.sent":  # the GM sent the crew to another map
        t = s.tokens[data["token"]]
        if t.map != data["map"]:
            _drop_fighter(s, data["token"])
            if t.kind == "crew":
                _leave_slots(s, t.ref)
        t.map, t.at = data["map"], tuple(data["at"])
    elif ev_type == "map.added":  # a map the content gained after this game was saved
        s.maps[data["map"]] = MapState.model_validate(data["state"])
    elif ev_type == "map.removed":  # a map the content no longer has (the Executive tower, split into decks)
        s.maps.pop(data["map"], None)
        s.fights.pop(data["map"], None)
    elif ev_type == "token.hidden_set":
        s.tokens[data["token"]].hidden = bool(data["hidden"])
    elif ev_type == "map.mood_set":
        s.maps[data["map"]].mood = data["mood"]
    elif ev_type == "map.switch_set":
        s.maps[data["map"]].switches[data["switch"]] = int(data["value"])
    elif ev_type == "vitals.set":
        v = s.vitals.setdefault(data["char"], Vitals(hp=0))
        v.hp, v.entropy = int(data["hp"]), int(data["entropy"])
    elif ev_type == "codex.set":  # the GM unlocked (or locked again) entries or blocks, for the whole crew
        keys = list(data["keys"])
        s.codex = [k for k in s.codex if k not in keys] + (keys if data["unlocked"] else [])
    elif ev_type == "station.shown":  # a place lit on the Station: the crew went there, or the GM showed it
        s.station = [m for m in s.station if m != data["map"]] + ([data["map"]] if data["shown"] else [])
    elif ev_type == "codex.read":
        read = s.codex_read.setdefault(data["char"], [])
        read += [k for k in data["keys"] if k not in read]
    elif ev_type == "rules.updated":  # a game saved under older rules, brought up to date at boot
        for char, hp in data.get("hp", {}).items():
            s.vitals.setdefault(char, Vitals(hp=0)).hp = int(hp)
        s.rules = int(data["rules"])
    elif ev_type == "object.shown":
        ms = s.maps[data["map"]]
        ms.shown = [o for o in ms.shown if o != data["object"]] + ([data["object"]] if data["shown"] else [])
    elif ev_type == "object.seen":
        keys = s.seen.setdefault(data["char"], [])
        if data["key"] not in keys:
            keys.append(data["key"])
    elif ev_type == "item.given":
        s.inventory.setdefault(data["holder"], []).append(InvEntry.model_validate(data["entry"]))
    elif ev_type == "item.taken":
        e = _entry(s, data["holder"], data["uid"])
        s.inventory[data["holder"]].remove(e)
    elif ev_type == "item.moved":
        e = _entry(s, data["holder"], data["uid"])
        s.inventory[data["holder"]].remove(e)
        e.new = True  # news to its new holder
        s.inventory.setdefault(data["to"], []).append(e)
    elif ev_type == "item.counted":
        e = _entry(s, data["holder"], data["uid"])
        e.count = int(data["count"])
        e.new = e.new or bool(data.get("new"))
    elif ev_type == "item.seen":
        _entry(s, data["holder"], data["uid"]).new = False
    elif ev_type == "roll.started":
        s.rolls.append(RollState.model_validate(data["roll"]))
    elif ev_type == "roll.revealed":
        r = _roll(s, data["roll"])
        r.shown = max(r.shown, min(len(r.dice), int(data["shown"])))
    elif ev_type == "roll.pushed":
        r = _roll(s, data["roll"])
        r.shown, r.pushes, r.pushed = len(r.dice), r.pushes + 1, r.pushed + int(data["gain"])
    elif ev_type == "roll.failed":
        _roll(s, data["roll"]).failed = True
    elif ev_type == "roll.closed":
        r = _roll(s, data["roll"])
        r.shown, r.open = len(r.dice), False
        _trim_rolls(s)
    elif ev_type == "party.map_set":
        s.party_map = data["map"]
    elif ev_type == "film.started":
        s.stage.film = FilmState.model_validate(data)
    elif ev_type == "film.ended":
        s.stage.film = None
    elif ev_type == "opening.armed":
        s.stage.opening = OpeningState(loop_at=float(data["loop_at"]))
    elif ev_type == "opening.started":
        s.stage.opening = s.stage.opening.model_copy(update={"film_at": float(data["film_at"]), "ends": float(data["ends"])})
    elif ev_type in ("opening.cleared", "opening.ended"):
        s.stage.opening = None
    elif ev_type == "burn.started":
        s.stage.burn = BurnState.model_validate(data)
    elif ev_type == "burn.ended":
        s.stage.burn = None
    elif ev_type == "stage.setup_set":
        pass  # an old log's TV / no TV / online choice: the TV is always there now
    elif ev_type == "stage.camera_set":
        s.stage.camera, s.stage.follow = data["camera"], data.get("follow")
    elif ev_type == "stage.join_set":
        s.stage.join = data["show"]
    elif ev_type == "fight.started":
        at = float(data["at"])
        s.fights[data["map"]] = Fight(order=list(data["order"]), rolled=list(data["rolled"]), ini=dict(data["ini"]),
                                      joined={t: at for t in data["order"]}, started=at)
    elif ev_type == "fight.turned":
        f = s.fights[data["map"]]
        f.turn, f.round = int(data["turn"]), int(data["round"])
    elif ev_type == "fight.joined":
        f = s.fights[data["map"]]
        f.order, f.turn = list(data["order"]), int(data["turn"])
        f.ini[data["token"]], f.joined[data["token"]] = int(data["ini"]), float(data["at"])
    elif ev_type == "fight.left":
        _drop_fighter(s, data["token"])
    elif ev_type == "fight.ended":
        s.fights.pop(data["map"], None)
    elif ev_type == "npc.hp_set":
        s.tokens[data["token"]].hp = int(data["hp"])
    elif ev_type == "overview.sent":  # the GM sent an overview: it opens on each of these players' screens
        for char in data["chars"]:
            s.overviews[char] = OverviewState(kind=data["kind"], id=data["id"])
    elif ev_type == "overview.closed":  # the player closed it, or the GM took it back
        s.overviews.pop(data["char"], None)
    elif ev_type == "slots.sat":
        s.slots.setdefault(data["key"], SlotBank()).seats.append(SlotSeat(char=data["char"], unit=int(data["unit"])))
    elif ev_type == "slots.pulled":
        x = _slot_seat(s, data["key"], data["char"])
        x.lost += int(data["cost"])
        x.pulls += 1
        x.free, x.spin = False, x.spin + 1
        x.reels, x.near, x.line = list(data["reels"]), bool(data["near"]), data["line"]
    elif ev_type == "slots.stood":  # into the stand window; the first to stand opens it
        s.slots[data["key"]].until = float(data["until"])
        _slot_seat(s, data["key"], data["char"]).page = "wait"
    elif ev_type == "slots.sat_back":
        _slot_seat(s, data["key"], data["char"]).page = "play"
        _settle_window(s.slots[data["key"]])
    elif ev_type == "slots.paid":  # the stand window closed: everyone in it gets paid back
        bank = s.slots[data["key"]]
        for char, amount in data["paid"].items():
            x = _slot_seat(s, data["key"], char)
            x.page, x.payout = "flood" if data["flood"] else "lucky", int(amount)
            x.lost, x.pulls, x.free = 0, 0, False
        bank.until = None
        if data["flood"]:
            bank.out = True
            s.stage.flood = FloodState(at=float(data["at"]), ends=float(data["ends"]), paid=[int(v) for v in data["paid"].values()])
    elif ev_type == "slots.free":  # the free spin, taken
        x = _slot_seat(s, data["key"], data["char"])
        x.page, x.free = "play", True
    elif ev_type == "slots.left":
        _leave_slots(s, data["char"])
    elif ev_type == "slots.service":  # the GM took the machines out of service, or put them back
        bank = s.slots.setdefault(data["key"], SlotBank())
        bank.out = bool(data["out"])
        for x in bank.seats:
            if bank.out:
                x.page = "out"
            elif x.page == "out":
                x.page = "play"
        if bank.out:
            bank.until = None
    elif ev_type == "slots.flood_ended":
        s.stage.flood = None
        for bank in s.slots.values():
            for x in bank.seats:
                if x.page == "flood":
                    x.page = "out"
    else:
        raise UnknownEvent(ev_type)
    return s
