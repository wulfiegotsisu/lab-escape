#!/usr/bin/env python3
"""Operation Lab Escape local real-time multiplayer server. Requires aiohttp."""
import asyncio
import json
import os
import random
import re
import secrets
import string
import time
from pathlib import Path
from aiohttp import web, WSMsgType

BASE = Path(__file__).resolve().parent
ROOMS = {}
ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
ROLE_NAMES = {'mouse': 'Pip the Mouse', 'chameleon': 'Echo the Chameleon'}
COLORS = ['red', 'blue', 'green', 'yellow']
VIAL_COLORS = ['violet', 'amber', 'cyan']
INGREDIENTS = ['CATALYST', 'STABILIZER', 'ACTIVATOR']
DIRECTIONS = ['NORTH', 'SOUTH', 'EAST', 'WEST']
CLUE_TITLES = [
    {'mouse':'Inside the ventilation shaft','chameleon':'Invisible door markings'},
    {'mouse':'Torn laboratory protocol','chameleon':'Spectral vial labels'},
    {'mouse':'Power-grid wire map','chameleon':'Ghosted security instructions'},
]
ACTOR_TARGETS = {
  0: {'mouse': {'clue': 49, 'terminal': 178}, 'chameleon': {'clue': 238, 'terminal': 264}},
  1: {'mouse': {'clue': 58, 'terminal': 163}, 'chameleon': {'clue': 238, 'terminal': 163}},
  2: {'mouse': {'clue': 55, 'terminal': 158, 'lever': 67}, 'chameleon': {'clue': 240, 'terminal': 158, 'lever': 246}},
}

def generate_puzzles(previous=None):
    # Generate an independent solution for each room, shared by this two-player lobby.
    # On replay, reroll until all three cooperative answers differ from the previous game.
    if previous is not None:
        for _ in range(50):
            fresh = generate_puzzles()
            if all(fresh[i]['answer'] != previous[i]['answer'] for i in range(3)):
                return fresh
        return fresh
    digits = random.sample('123456789', 8)
    order0 = random.sample(COLORS, 4)
    mapping0 = dict(zip(COLORS, digits[:4]))
    names1 = random.sample(INGREDIENTS, 3)
    mapping1 = dict(zip(INGREDIENTS, random.sample(VIAL_COLORS, 3)))
    order2 = random.sample(DIRECTIONS, 4)
    mapping2 = dict(zip(DIRECTIONS, digits[4:8]))
    coils, draw, reserve = random.randint(2, 5), random.randint(3, 7), random.randint(2, 9)
    puzzles = [
      {'mapping': mapping0, 'order': order0, 'answer': ''.join(mapping0[c] for c in order0),
       'wires': {'sources': random.sample(COLORS, 4), 'sockets': random.sample(COLORS, 4)},
       'crankTurns': random.choice([2.5, 3, 3.5, 4])},
      {'mapping': mapping1, 'order': names1, 'answer': [mapping1[c] for c in names1],
       'stirTurns': random.choice([2.5, 3, 3.5, 4])},
      {'mapping': mapping2, 'order': order2, 'answer': ''.join(mapping2[d] for d in order2),
       'calibration': {'coils': coils, 'draw': draw, 'reserve': reserve, 'answer': coils*draw+reserve},
       'frequencies': dict(zip(['a','b','c'], random.sample([240,410,680], 3)))},
    ]
    puzzles[2]['frequencyOrder'] = sorted(puzzles[2]['frequencies'],key=puzzles[2]['frequencies'].get)
    return puzzles

ROOM_NAMES = ['Containment Chamber', 'Experimental Storage', 'Security Control', 'Freedom!']
HINTS = [
    ['Repair or activate your character-specific device to inspect a clue.', 'Combine the colored wire digits with the ultraviolet color sequence.', None],
    ['Reassemble the protocol and reveal the spectral labels.', 'Match each ingredient in the numbered protocol with its vial color.', None],
    ['Fix the power grid and ghost display to receive two complementary clues.', 'Read the directional wire map using the ghost display order, then coordinate the levers.', None],
]

def dynamic_hint(room, stage, level):
    if level < 3:
        return HINTS[stage][level-1]
    p = room['puzzles'][stage]
    if stage == 0:
        return f"The keypad code is {p['answer']}. The chameleon enters it."
    if stage == 1:
        return 'Select ' + ' → '.join(x.upper() for x in p['answer']) + ', then mix on the mouse screen.'
    return f"The relay code is {p['answer']}. Both players must pull their levers within 12 seconds."


def clean_name(value):
    value = str(value or '').strip()[:24]
    return ''.join(c for c in value if c.isprintable() and c not in '<>') or 'Escapist'

def new_room():
    while True:
        code = ''.join(secrets.choice(ALPHABET) for _ in range(5))
        if code not in ROOMS:
            break
    return {'code': code, 'players': {}, 'ws': {}, 'host': None, 'status': 'lobby', 'stage': 0,
            'revealed': {'mouse': False, 'chameleon': False}, 'powered': False, 'levers': {},
            'deadline': None, 'messages': [], 'activity': [], 'hints_used': 0,
            'hint_levels': {}, 'started_at': None, 'finished_at': None, 'created_at': time.time(),
            'puzzles': generate_puzzles(), 'actors': {'mouse': {'x': 139, 'working': False, 'target': ''},
                                                         'chameleon': {'x': 179, 'working': False, 'target': ''}}}

def add_player(room, name):
    role = 'mouse' if not any(x['role'] == 'mouse' for x in room['players'].values()) else 'chameleon'
    token = secrets.token_urlsafe(30)
    room['players'][token] = {'name': clean_name(name), 'role': role, 'joined': time.time()}
    if not room['host']:
        room['host'] = token
    room['hint_levels'][token] = {}
    return token

def personalize(text, room):
    """Replace scripted character nicknames with the players' chosen names."""
    by_role = {p['role']: p['name'] for p in room['players'].values()}
    chosen = {'Pip': by_role.get('mouse', 'Pip'), 'Echo': by_role.get('chameleon', 'Echo')}
    return re.sub(r'\b(Pip|Echo)\b', lambda m: chosen[m.group(0)], text)

def named_clue(clue, room):
    return {key: personalize(value, room) for key, value in clue.items()}

def serialize(room, token):
    p = room['players'][token]
    stage = room['stage']
    role = p['role']
    hint_level = room['hint_levels'].get(token, {}).get(stage, 0)
    return {
        'room': room['code'], 'status': room['status'], 'stage': stage, 'roomName': ROOM_NAMES[min(stage, 3)],
        'you': {'name': p['name'], 'role': role, 'isHost': token == room['host']},
        'players': [{'name': v['name'], 'role': v['role'], 'online': bool(room['ws'].get(t))} for t, v in room['players'].items()],
        'revealed': dict(room['revealed']), 'powered': room['powered'],
        'leverRoles': [room['players'][t]['role'] for t in room['levers'] if t in room['players']],
        'deadline': room['deadline'], 'serverTime': time.time(),
        'privateClue': {'title': CLUE_TITLES[stage][role]} if stage < 3 and room['revealed'][role] else None,
        'evidence': (
            ({'order': room['puzzles'][stage]['order']} if stage == 1 else {'mapping': room['puzzles'][stage]['mapping']})
            if role == 'mouse' else
            ({'mapping': room['puzzles'][stage]['mapping']} if stage == 1 else {'order': room['puzzles'][stage]['order']})
        ) if stage < 3 and room['revealed'][role] else None,
        'taskConfig': (
            (room['puzzles'][0]['wires'] if role == 'mouse' else {'turns': room['puzzles'][0]['crankTurns']}) if stage == 0 else
            ({'fragments': dict(zip(['I','II','III'], room['puzzles'][1]['order']))} if role == 'mouse' else {'turns':room['puzzles'][1]['stirTurns']}) if stage == 1 else
            (room['puzzles'][2]['calibration'] if role == 'mouse' else {'frequencies':room['puzzles'][2]['frequencies']})
        ) if stage < 3 else None,
        'actors': room['actors'],
        'hint': personalize(dynamic_hint(room, stage, hint_level), room) if hint_level > 0 and stage < 3 else None,
        'hintLevel': hint_level, 'hintsUsed': room['hints_used'],
        'messages': room['messages'][-40:], 'activity': room['activity'][-12:],
        'startedAt': room['started_at'], 'finishedAt': room['finished_at'],
    }

async def broadcast(room):
    for token, ws in list(room['ws'].items()):
        if ws.closed:
            room['ws'].pop(token, None)
            continue
        try:
            await ws.send_json({'type': 'state', 'data': serialize(room, token)})
        except Exception:
            room['ws'].pop(token, None)

def log(room, msg):
    room['activity'].append({'message': msg, 'time': time.time()})
    room['activity'] = room['activity'][-20:]

def next_room(room):
    room['stage'] += 1
    room['revealed'] = {'mouse': False, 'chameleon': False}
    room['powered'] = False
    room['levers'] = {}
    room['deadline'] = None
    room['actors'] = {'mouse': {'x': 139, 'working': False, 'target': ''}, 'chameleon': {'x': 179, 'working': False, 'target': ''}}
    if room['stage'] == 3:
        room['status'] = 'won'
        room['finished_at'] = time.time()
        log(room, 'The security AI is offline. Operation Lab Escape succeeded!')
    else:
        log(room, f'Door opened! The team entered {ROOM_NAMES[room["stage"]]}.')

async def create(request):
    data = await request.json()
    room = new_room()
    ROOMS[room['code']] = room
    token = add_player(room, data.get('name'))
    log(room, f'{room["players"][token]["name"]} created the escape team.')
    return web.json_response({'room': room['code'], 'token': token})

async def join(request):
    data = await request.json()
    code = str(data.get('room') or '').upper().strip()
    room = ROOMS.get(code)
    if not room:
        raise web.HTTPNotFound(text='That room code does not exist. Check the letters and try again.')
    if room['status'] != 'lobby':
        raise web.HTTPConflict(text='This escape is already in progress. Create a new room instead.')
    if len(room['players']) >= 2:
        raise web.HTTPConflict(text='This room already has two players.')
    token = add_player(room, data.get('name'))
    log(room, f'{room["players"][token]["name"]} joined as Echo.')
    await broadcast(room)
    return web.json_response({'room': code, 'token': token})

async def ping(request):
    return web.json_response({'status':'ok', 'rooms':len(ROOMS)})

async def handle_action(room, token, data):
    p = room['players'][token]
    role = p['role']
    action = data.get('action')
    stage = room['stage']
    if action == 'start':
        if room['status'] != 'lobby' or token != room['host'] or len(room['players']) != 2:
            return 'Only the host can start after both animals join.'
        room['status'] = 'playing'
        room['started_at'] = time.time()
        log(room, 'Security failure detected! The escape begins.')
    elif action == 'swap_roles':
        if room['status'] != 'lobby' or token != room['host'] or len(room['players']) != 2:
            return 'Only the host can swap characters before the game starts.'
        for player in room['players'].values():
            player['role'] = 'chameleon' if player['role'] == 'mouse' else 'mouse'
        log(room, 'The animals swapped roles.')
    elif action in ('work_start', 'work_stop', 'move_to'):
        if room['status'] != 'playing' or stage > 2:
            return 'Movement is unavailable.'
        actor = room['actors'][role]
        if action == 'work_stop':
            actor['working'] = False
        else:
            target = str(data.get('target') or 'clue')
            if target not in ACTOR_TARGETS[stage][role]:
                return 'This mechanism is inaccessible.'
            actor['x'] = ACTOR_TARGETS[stage][role][target]
            actor['target'] = target
            actor['working'] = action == 'work_start'
    elif action == 'complete_task':
        # Mini-interactions now gate evidence discovery. Puzzle answers remain unchanged.
        if room['status'] != 'playing' or stage > 2:
            return 'This interaction is not available.'
        if not room['revealed'][role]:
            proof = data.get('proof')
            checks = {
                (0,'mouse'): ['red','blue','green','yellow'],
                (0,'chameleon'): 'uv-charged',
                (1,'mouse'): ['I','II','III'],
                (1,'chameleon'): 'vials-whisked',
                (2,'mouse'): str(room['puzzles'][2]['calibration']['answer']),
                (2,'chameleon'): room['puzzles'][2]['frequencyOrder'],
            }
            if proof != checks[(stage,role)]:
                return 'The laboratory mechanism is not yet calibrated. Finish the interaction first.'
            room['revealed'][role] = True
            room['actors'][role]['working'] = False
            log(room, f'{p["name"]} completed a laboratory mechanism and uncovered evidence.')
    elif action == 'reveal':
        return 'Complete the interactive laboratory mechanism to uncover your clue.'
    elif action == 'submit_code':
        if room['status'] != 'playing' or stage not in (0, 2):
            return 'This keypad is inactive.'
        if not all(room['revealed'].values()):
            return 'Both animals need to examine their hidden clues first.'
        expected_role = 'chameleon' if stage == 0 else 'mouse'
        if role != expected_role:
            return 'Only the animal at this terminal can use it.'
        supplied = str(data.get('code') or '').strip()
        expected = room['puzzles'][stage]['answer']
        if supplied != expected:
            log(room, 'ACCESS DENIED. The keypad flashes red.')
            return 'Access denied. Compare both animals’ clues and try again.'
        if stage == 0:
            next_room(room)
        else:
            room['powered'] = True
            log(room, 'Auxiliary power restored. Both emergency levers are active!')
    elif action == 'mix':
        if room['status'] != 'playing' or stage != 1 or role != 'mouse':
            return personalize('Only Pip can operate the mixing station.', room)
        if not all(room['revealed'].values()):
            return 'Both animals must inspect their clues first.'
        if data.get('sequence') != room['puzzles'][1]['answer']:
            log(room, 'The mixer sputters. Incorrect reagent order!')
            return 'Incorrect reagent order. Check the protocol and spectral labels.'
        next_room(room)
    elif action == 'lever':
        if room['status'] != 'playing' or stage != 2 or not room['powered']:
            return 'Restore auxiliary power before pulling the levers.'
        now = time.time()
        if room['deadline'] and now > room['deadline']:
            room['levers'] = {}
            room['deadline'] = None
        if token in room['levers']:
            return 'Your lever is already pulled. Your teammate must pull theirs.'
        if not room['deadline']:
            room['deadline'] = now + 12
            room['levers'] = {}
            asyncio.create_task(lever_timeout(room, room['deadline']))
        room['levers'][token] = now
        log(room, f'{p["name"]} pulled their emergency lever!')
        if len(room['levers']) == 2:
            next_room(room)
    elif action == 'hint':
        if room['status'] != 'playing':
            return 'Hints are available during the escape.'
        levels = room['hint_levels'].setdefault(token, {})
        old = levels.get(stage, 0)
        if old < 3:
            levels[stage] = old + 1
            room['hints_used'] += 1
        else:
            return 'You already revealed all the hints for this room.'
    elif action == 'chat':
        message = str(data.get('message') or '').strip()[:300]
        message = ''.join(c for c in message if c.isprintable())
        if message:
            room['messages'].append({'name': p['name'], 'role': role, 'message': message, 'time': time.time()})
            room['messages'] = room['messages'][-40:]
    elif action == 'restart':
        if token != room['host'] or room['status'] != 'won':
            return 'Only the host can restart after escaping.'
        room['puzzles'] = generate_puzzles(room['puzzles'])
        room['actors'] = {'mouse': {'x': 139, 'working': False, 'target': ''}, 'chameleon': {'x': 179, 'working': False, 'target': ''}}
        room.update({'status':'lobby','stage':0,'revealed':{'mouse':False,'chameleon':False},'powered':False,
                     'deadline':None,'levers':{},'messages':[],'activity':[],'hints_used':0,
                     'started_at':None,'finished_at':None})
        room['hint_levels'] = {t:{} for t in room['players']}
        log(room,'A new escape mission is ready.')
    else:
        return 'Unknown action.'
    return None

async def lever_timeout(room, deadline):
    await asyncio.sleep(max(0, deadline - time.time()) + .05)
    if room['status'] == 'playing' and room['deadline'] == deadline:
        room['levers'] = {}
        room['deadline'] = None
        log(room, 'Lever synchronization expired. Try again together!')
        await broadcast(room)

async def websocket(request):
    code = request.query.get('room', '').upper()
    token = request.query.get('token', '')
    room = ROOMS.get(code)
    if not room or token not in room['players']:
        raise web.HTTPForbidden(text='Invalid room or session. Rejoin from the start screen.')
    ws = web.WebSocketResponse(heartbeat=20, max_msg_size=8192)
    await ws.prepare(request)
    if old := room['ws'].get(token):
        await old.close()
    room['ws'][token] = ws
    await broadcast(room)
    async for msg in ws:
        if msg.type == WSMsgType.TEXT:
            try:
                data = json.loads(msg.data)
                if not isinstance(data, dict):
                    continue
                err = await handle_action(room, token, data)
                if err:
                    await ws.send_json({'type':'error','message':err})
                await broadcast(room)
            except (ValueError, TypeError):
                await ws.send_json({'type':'error','message':'Unable to process the action.'})
        elif msg.type == WSMsgType.ERROR:
            break
    if room['ws'].get(token) is ws:
        room['ws'].pop(token, None)
    await broadcast(room)
    return ws

async def index(request):
    return web.FileResponse(BASE / 'static' / 'index.html')

app = web.Application(client_max_size=10240)
app.router.add_get('/', index)
app.router.add_get('/api/ping', ping)
app.router.add_post('/api/create', create)
app.router.add_post('/api/join', join)
app.router.add_get('/ws', websocket)
app.router.add_static('/static', BASE / 'static', show_index=False)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8000'))
    print(f'\nOperation Lab Escape running at http://localhost:{port}\n', flush=True)
    web.run_app(app, host='0.0.0.0', port=port, print=None)
