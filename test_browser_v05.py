import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
BASE=Path(__file__).parent
CSS=(BASE/'static/styles.css').read_text()
JS=(BASE/'static/app.js').read_text()

SAMPLE={
 'room':'ABCDE','status':'playing','stage':0,'roomName':'Containment Chamber',
 'you':{'name':'Mouselix','role':'mouse','isHost':True},
 'players':[{'name':'Mouselix','role':'mouse','online':True},{'name':'Greenie','role':'chameleon','online':True}],
 'revealed':{'mouse':False,'chameleon':False},'powered':False,'leverRoles':[],
 'deadline':None,'serverTime':1770000000,'privateClue':None,'hint':None,
 'hintLevel':0,'hintsUsed':0,'messages':[],'activity':[],'startedAt':1770000000,'finishedAt':None,
}
async def setup(browser,width,height,game=None):
 page=await browser.new_page(viewport={'width':width,'height':height})
 errors=[]
 page.on('pageerror',lambda exc:errors.append(str(exc)))
 await page.set_content('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div class="scanlines"></div><div id="app"></div><div id="toast"></div></body></html>')
 await page.add_style_tag(content=CSS)
 await page.add_script_tag(content=JS)
 if game:
  await page.evaluate('(g)=>{game=g;send=(a,p={})=>{window.lastAction={a,p};};render();}',game)
 return page,errors

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page,errors=await setup(browser,1360,960)
  await page.screenshot(path=str(BASE/'v0.5_landing.png'),full_page=True)
  await page.close()
  page,errors=await setup(browser,1360,960,SAMPLE)
  assert await page.locator('text=YOUR SECRET NOTES').count()==0
  await page.locator('[data-action="mini-task"]').click()
  assert await page.get_by_text('RECONNECT THE VENT WIRES').count()==1
  await page.locator('[data-wire="red"]').click()
  await page.locator('[data-socket="red"]').click()
  await page.locator('[data-wire="blue"]').click()
  await page.locator('[data-socket="blue"]').click()
  await page.locator('[data-wire="green"]').click()
  await page.locator('[data-socket="green"]').click()
  await page.locator('[data-wire="yellow"]').click()
  await page.locator('[data-socket="yellow"]').click()
  action=await page.evaluate('window.lastAction')
  assert action=={'a':'complete_task','p':{'proof':['red','blue','green','yellow']}},action
  await page.evaluate("game.revealed.mouse=true;game.privateClue={title:'Inside the ventilation shaft'};render()")
  await page.locator('[data-action="view-clue"]').click()
  assert await page.get_by_text('EVIDENCE FOUND').count()==1
  assert await page.get_by_text('Four wires are tagged').count()==0
  await page.screenshot(path=str(BASE/'v0.5_evidence.png'),full_page=True)
  await page.evaluate('closePopup();game.status="won";game.stage=3;game.finishedAt=1770000123;render()')
  assert await page.get_by_text('FREEDOM!',exact=True).count()==1
  assert await page.locator('.victory-particles span').count()==42
  await page.wait_for_timeout(2300)
  await page.screenshot(path=str(BASE/'v0.5_victory.png'),full_page=True)
  assert not errors,errors
  await page.close()
  mobile,errors=await setup(browser,390,844,SAMPLE)
  await mobile.locator('[data-action="mini-task"]').click()
  await mobile.screenshot(path=str(BASE/'v0.5_mobile_task.png'),full_page=True)
  assert await mobile.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),'Mobile horizontal overflow'
  await mobile.evaluate('closePopup();game.status="won";game.stage=3;game.finishedAt=1770000123;render()')
  await mobile.wait_for_timeout(2300)
  await mobile.screenshot(path=str(BASE/'v0.5_mobile_victory.png'),full_page=True)
  assert not errors,errors
  await mobile.close()
  # Other mini tasks smoke-check from all roles/stages
  for stage,role in [(0,'chameleon'),(1,'mouse'),(1,'chameleon'),(2,'mouse'),(2,'chameleon')]:
   g={**SAMPLE,'stage':stage,'roomName':['Containment Chamber','Experimental Storage','Security Control'][stage],
      'you':{'name':'Tester','role':role,'isHost':role=='mouse'},'revealed':{'mouse':False,'chameleon':False}}
   page,errors=await setup(browser,900,800,g)
   await page.locator('[data-action="mini-task"]').click()
   if stage==0:
    for _ in range(5):await page.locator('[data-minitap="charge"]').click()
    expected='uv-charged'
   elif stage==1 and role=='mouse':
    for frag in ['I','II','III']:await page.locator(f'[data-fragment="{frag}"]').click()
    expected=['I','II','III']
   elif stage==1:
    for _ in range(6):await page.locator('[data-minitap="stir"]').click()
    expected='vials-whisked'
   elif role=='mouse':
    await page.locator('#equation-form input').fill('17');await page.locator('#equation-form button').click()
    expected='17'
   else:
    for freq in ['low','mid','high']:await page.locator(f'[data-frequency="{freq}"]').click()
    expected=['low','mid','high']
   assert await page.evaluate('window.lastAction')=={'a':'complete_task','p':{'proof':expected}}
   assert not errors,errors
   await page.close()
  await browser.close()
  print('Browser checks passed: desktop/mobile, six tasks, no Secret Notes, evidence reopen, victory animation.')

if __name__=='__main__':asyncio.run(main())
