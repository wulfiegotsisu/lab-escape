"""Integration smoke test. Run with server.py listening on port 8000."""
import asyncio
from aiohttp import ClientSession,WSMsgType

BASE='http://127.0.0.1:8000'

async def state(ws,criteria=None):
    for _ in range(25):
        m=await ws.receive(timeout=3)
        assert m.type == WSMsgType.TEXT, m
        obj=m.json()
        if obj.get('type')=='state' and (criteria is None or criteria(obj['data'])):
            return obj['data']
    raise AssertionError('Timed out waiting for expected game state')

async def go(ws,act,**kwargs):
    await ws.send_json({'action':act,**kwargs})

async def main():
    async with ClientSession() as s:
        async with s.post(BASE+'/api/create',json={'name':'Captain Squeak'}) as r:
            assert r.status==200,(r.status,await r.text())
            a=await r.json()
        async with s.post(BASE+'/api/join',json={'room':a['room'],'name':'Dr. Scales'}) as r:
            assert r.status==200,(r.status,await r.text())
            b=await r.json()
        async with s.ws_connect(BASE+f'/ws?room={a["room"]}&token={a["token"]}') as wa, s.ws_connect(BASE+f'/ws?room={b["room"]}&token={b["token"]}') as wb:
            sa=await state(wa)
            sb=await state(wb)
            assert sa['you']['role']=='mouse' and sb['you']['role']=='chameleon'
            assert len(sa['players'])==2 and sb['status']=='lobby'
            await go(wa,'start')
            sa=await state(wa,lambda d:d['status']=='playing')
            sb=await state(wb,lambda d:d['status']=='playing')
            print('✓ 2 players connected and started the same room')
            await go(wa,'complete_task',proof=['red','blue','green','yellow'])
            sa=await state(wa,lambda d:d['revealed']['mouse'])
            sb=await state(wb,lambda d:d['revealed']['mouse'])
            assert sa['privateClue']['title'] == 'Inside the ventilation shaft'
            assert 'body' not in sa['privateClue']
            assert sb['privateClue'] is None
            await go(wb,'complete_task',proof='uv-charged')
            sb=await state(wb,lambda d:d['revealed']['chameleon'])
            assert sb['privateClue']['title'] == 'Invisible door markings'
            assert 'body' not in sb['privateClue']
            print('✓ Private clue titles stay role-specific without transmitting spoiler text')
            await go(wb,'submit_code',code='1111')
            await state(wb)
            await go(wb,'submit_code',code='9742')
            sa=await state(wa,lambda d:d['stage']==1)
            sb=await state(wb,lambda d:d['stage']==1)
            print('✓ Wrong answer rejected; correct code advances both players to Room 2')
            await go(wa,'complete_task',proof=['I','II','III']);await state(wa,lambda d:d['revealed']['mouse'])
            await go(wb,'complete_task',proof='vials-whisked')
            chameleon_clue=await state(wb,lambda d:d['revealed']['chameleon'])
            assert 'body' not in chameleon_clue['privateClue']
            await go(wa,'hint');await state(wa,lambda d:d['hintLevel']==1)
            await go(wa,'hint')
            personalized_hint=await state(wa,lambda d:d['hintLevel']==2)
            assert 'Captain Squeak' in personalized_hint['hint'] and 'Dr. Scales' in personalized_hint['hint']
            print('✓ Optional hints still use players’ custom names')
            await go(wa,'mix',sequence=['violet','amber','cyan'])
            sa=await state(wa,lambda d:d['stage']==2)
            sb=await state(wb,lambda d:d['stage']==2)
            print('✓ Room 2 reagent puzzle advances both clients to Room 3')
            await go(wb,'chat',message='I can read East → West → North → South')
            sa=await state(wa,lambda d:len(d['messages'])>0)
            assert sa['messages'][-1]['role']=='chameleon'
            print('✓ Team chat synchronizes immediately')
            await go(wa,'complete_task',proof='17');await state(wa,lambda d:d['revealed']['mouse'])
            await go(wb,'complete_task',proof=['low','mid','high']);await state(wb,lambda d:d['revealed']['chameleon'])
            await go(wa,'submit_code',code='2685')
            sa=await state(wa,lambda d:d['powered'])
            sb=await state(wb,lambda d:d['powered'])
            print('✓ Final power code synchronizes across both players')
            await go(wa,'lever')
            sa=await state(wa,lambda d:d['deadline'] is not None)
            assert sa['leverRoles']==['mouse']
            await go(wb,'lever')
            sa=await state(wa,lambda d:d['status']=='won')
            sb=await state(wb,lambda d:d['status']=='won')
            print('✓ Two-person timed finale succeeds and victory synchronizes')
            await go(wa,'restart')
            sa=await state(wa,lambda d:d['status']=='lobby')
            print('✓ Host can reset game for replay')
            print('\nAll integration checks passed. Room:',a['room'])
if __name__=='__main__':asyncio.run(main())
