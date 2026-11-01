'use strict';
const $ = (id) => document.getElementById(id);
const app = $('app');
let game = null, socket = null, session = null, seq = [], chatDraft = '', timerOffset = 0, toastTimer = null;
let enterCode = '';
let miniTask = null;
let miniModalActive = false;
let dragState = null;
let actorDisplay = {mouse:139,chameleon:179};
let previousCanvasStage = -1;
let victoryAnimated = false;
const names = ['CONTAINMENT CHAMBER', 'EXPERIMENTAL STORAGE', 'SECURITY CONTROL', 'FREEDOM'];
const objectives = [
  'Your cages are sealed. Search the laboratory for hidden wiring and invisible markings, then open the containment door.',
  'A keycard is locked inside the chemical mixer. Combine the lab protocol and hidden vial labels to prepare the correct formula.',
  'The security AI controls the exit. Restore auxiliary power and pull both emergency levers before it reactivates.'
];
const mouseTasks = ['Inspect the narrow ventilation panel', 'Read the torn reagent protocol', 'Inspect the auxiliary power grid'];
const chameleonTasks = ['Reveal the invisible door markings', 'Scan the secret vial labels', 'Decode the ghost display'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t = (sec) => { const d = Math.max(0, Math.floor(sec)); return `${Math.floor(d/60).toString().padStart(2,'0')}:${(d%60).toString().padStart(2,'0')}`; };
const roleIcon = r => r === 'mouse' ? '🐭' : '🦎';
const roleName = r => r === 'mouse' ? 'PIP THE MOUSE' : 'ECHO THE CHAMELEON';
// Small UI enhancements: chosen player names, synthesized sound, and illustrated inspection popups.
const playerName = role => game?.players?.find(p => p.role === role)?.name || (role === 'mouse' ? 'Pip' : 'Echo');
const teammateName = role => playerName(role === 'mouse' ? 'chameleon' : 'mouse');
let soundOn = (()=>{try{return localStorage.getItem('paws-sound') !== 'off';}catch{return true;}})();
let audioContext = null;
function sound(type='tap') {
 if (!soundOn) return;
 try {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  if (!audioContext) audioContext = new Audio();
  if (audioContext.state === 'suspended') audioContext.resume().catch(()=>{});
  const presets = {
   tap: [[540,0,.045,'square',.012]],
   vial: [[720,0,.10,'sine',.045],[1010,.065,.14,'sine',.025]],
   clue: [[425,0,.12,'sine',.032],[580,.10,.12,'sine',.030],[825,.20,.18,'sine',.035]],
   hint: [[770,0,.10,'sine',.025],[960,.12,.16,'sine',.030]],
   chat: [[660,0,.055,'sine',.018]],
   error: [[220,0,.14,'triangle',.028],[165,.13,.2,'triangle',.027]],
   lever: [[150,0,.12,'square',.035],[85,.095,.18,'triangle',.030]],
   unlock: [[392,0,.18,'triangle',.035],[523,.12,.18,'triangle',.035],[659,.24,.24,'triangle',.035]],
   victory: [[392,0,.16,'triangle',.040],[523,.16,.16,'triangle',.040],[659,.32,.16,'triangle',.040],[784,.48,.4,'triangle',.045]],
  };
  const start = audioContext.currentTime + .01;
  for (const [freq,delay,length,shape,volume] of presets[type] || presets.tap) {
   const osc=audioContext.createOscillator(), gain=audioContext.createGain();
   osc.type=shape;osc.frequency.value=freq;
   gain.gain.setValueAtTime(.0001,start+delay);
   gain.gain.exponentialRampToValueAtTime(volume,start+delay+.012);
   gain.gain.exponentialRampToValueAtTime(.0001,start+delay+length);
   osc.connect(gain);gain.connect(audioContext.destination);
   osc.start(start+delay);osc.stop(start+delay+length+.02);
  }
 } catch(e) { console.warn('Audio playback unavailable',e); }
}
// Original spooky laboratory escape theme, composed specifically for this game.
// Pre-rendered music box melody, pulsing bass, eerie chords and mechanical percussion.
// Kept separate from one-shot WebAudio sound effects and controlled by MUSIC ON/OFF.
let musicOn = (()=>{try{return localStorage.getItem('paws-music') !== 'off';}catch{return true;}})();
let musicTrack = null;
function getMusicTrack(){
 if(!musicTrack){
  musicTrack = new Audio('/static/audio/lab_escape_theme.mp3');
  musicTrack.loop = true;
  musicTrack.preload = 'auto';
  musicTrack.volume = 0.58;
 }
 return musicTrack;
}
function startMusic(){
 if(!musicOn)return;
 const track = getMusicTrack();
 if(track.paused){
  // Browser autoplay rules require a player gesture before starting playback.
  track.play().catch(err=>{if(err.name!=='NotAllowedError')console.warn('Music playback unavailable:',err);});
 }
}
function stopMusic(){
 if(musicTrack){musicTrack.pause();musicTrack.currentTime=0;}
}
function updateMusicButton(){
 const btn=document.querySelector('[data-action="toggle-music"]');
 if(btn){
  btn.textContent=musicOn?'♫ MUSIC ON':'♪ MUSIC OFF';
  btn.setAttribute('aria-pressed',String(musicOn));
 }
}
// Music begins after the first click/tap/key press so it also works on phones.
document.addEventListener('pointerdown',()=>{if(musicOn)startMusic();},{passive:true});
document.addEventListener('keydown',()=>{if(musicOn)startMusic();});
function updateSoundButton() {
 const btn=document.querySelector('[data-action="toggle-sound"]');
 if(btn) {btn.textContent=soundOn?'♫ SOUND ON':'♪ SOUND OFF';btn.setAttribute('aria-pressed',String(soundOn));btn.setAttribute('aria-label',soundOn?'Mute sound effects':'Enable sound effects');}
}
function vialArt(color, caption='', size='') {
 const safe=['violet','amber','cyan'].includes(color)?color:'cyan';
 return `<div class="illustrated-vial ${safe} ${size}"><div class="vial-cap"></div><div class="vial-neck"></div><div class="vial-glass"><div class="vial-fluid"></div><i class="vial-bubble b1"></i><i class="vial-bubble b2"></i><i class="vial-shine"></i></div>${caption?`<div class="vial-caption">${esc(caption)}</div>`:''}</div>`;
}
function illustratedClue() {
 const stage=game.stage, role=game.you.role, data=game.evidence;
 if(!data)return '<p>Evidence not yet discovered.</p>';
 if(stage===0 && role==='mouse')return `<div class="clue-wires">${['red','blue','green','yellow'].map(c=>`<div class="clue-wire ${c}"><span class="wire"></span><b>${esc(data.mapping[c])}</b></div>`).join('')}</div>`;
 if(stage===0)return `<div class="uv-sequence">${data.order.map((color,i)=>`<span class="uv-dot ${color}" title="${color}">${i+1}</span>`).join('')}</div><p class="diagram-caption">Invisible markings revealed under ultraviolet light</p>`;
 if(stage===1 && role==='mouse')return `<div class="protocol-diagram">${data.order.map((name,i)=>`<span><b>0${i+1}</b> ${esc(name)}</span>`).join('')}</div>`;
 if(stage===1)return `<div class="vial-gallery">${['CATALYST','STABILIZER','ACTIVATOR'].map(x=>vialArt(data.mapping[x],x)).join('')}</div>`;
 if(stage===2 && role==='mouse')return `<div class="circuit-diagram">${[['N','NORTH'],['S','SOUTH'],['E','EAST'],['W','WEST']].map(([short,name])=>`<span><b>${short}</b> = ${esc(data.mapping[name])}</span>`).join('')}</div>`;
 if(stage===2)return `<div class="direction-diagram">${data.order.map(x=>`<span>${{EAST:'→',WEST:'←',NORTH:'↑',SOUTH:'↓'}[x]}<small>${x}</small></span>`).join('')}</div>`;
 return '';
}
const mechanismSpecs = [
 {mouse:['RECONNECT THE VENT WIRES','Drag each loose wire all the way onto the matching colored socket. Releasing early or over a wrong socket will not connect it.'],
  chameleon:['POWER THE UV SCANNER','Hold and trace circles around the generator handle with your mouse or finger until the ultraviolet lamp is charged.']},
 {mouse:['REASSEMBLE THE PROTOCOL','The torn lab pages have tiny Roman numeral tabs. Tap the fragments in their numbered order.'],
  chameleon:['PREPARE THE SPECTRAL REAGENT','Stir the glowing sample by tracing circles inside the vessel using your mouse or finger.']},
 {mouse:['REPAIR THE AUXILIARY CIRCUIT','Compute the calibration load from the coils, power draw, and reserve power shown below.'],
  chameleon:['CALIBRATE THE GHOST FREQUENCY','Activate the signal bands from lowest frequency to highest frequency.']},
];
function taskKey(){return game.stage+'-'+game.you.role;}
function getTask(){if(!miniTask||miniTask.key!==taskKey())miniTask={key:taskKey(),progress:[],count:0,selected:null};return miniTask;}
function taskMarkup(){
 const role=game.you.role,stage=game.stage,m=getTask();
 if(stage===0&&role==='mouse'){
  const colors=game.taskConfig?.sources||['red','blue','green','yellow'];const sockets=game.taskConfig?.sockets||['yellow','green','red','blue'];
  return `<div class="mini-task"><p class="mini-instruction">${mechanismSpecs[0][role][1]}</p><div class="wire-connect wire-drag-board"><div class="wire-bank">${colors.map(col=>`<button type="button" class="wire-port ${col} ${m.progress.includes(col)?'connected':''}" data-wire="${col}" ${m.progress.includes(col)?'disabled':''}>${col.toUpperCase()} WIRE ●</button>`).join('')}</div><svg class="wire-svg" aria-hidden="true"><g class="wire-connections"></g><path class="wire-preview" /></svg><div class="wire-bank">${sockets.map(col=>`<button type="button" class="wire-port ${col} ${m.progress.includes(col)?'connected':''}" data-socket="${col}" ${m.progress.includes(col)?'disabled':''}>● ${col.toUpperCase()} SOCKET</button>`).join('')}</div></div><div class="mini-status" aria-live="polite">${m.progress.length}/4 circuits restored</div></div>`;
 }
 if(stage===0&&role==='chameleon')return `<div class="mini-task"><p class="mini-instruction">${mechanismSpecs[0][role][1]}</p><div class="uv-machine"><div class="gesture-wheel generator" data-gesture="crank" role="img" aria-label="Drag around the generator wheel in circles to charge UV power"><div class="gesture-ring"></div><div class="gesture-knob">⚙</div><div class="gesture-handle"></div></div><div class="charge-track"><div style="width:${Math.min(100,m.count/(game.taskConfig?.turns||3)*100)}%"></div></div><div class="mini-status">${Math.floor(m.count*10)/10}/${game.taskConfig?.turns||3} circular turns · UV charge</div></div></div>`;
 if(stage===1&&role==='mouse'){
  const fragments=game.taskConfig?.fragments||{'I':'CATALYST','II':'STABILIZER','III':'ACTIVATOR'};
  const parts=[['III',fragments.III],['I',fragments.I],['II',fragments.II]];
  return `<div class="mini-task"><p class="mini-instruction">${mechanismSpecs[1][role][1]}</p><div class="paper-pieces">${parts.map(([num,label])=>`<button class="paper-piece ${m.progress.includes(num)?'placed':''}" data-fragment="${num}" ${m.progress.includes(num)?'disabled':''}><span>FRAGMENT ${num}</span><b>${label}</b></button>`).join('')}</div><div class="mini-status">Restored pages: ${m.progress.join(' → ')||'—'}</div></div>`;
 }
 if(stage===1&&role==='chameleon')return `<div class="mini-task"><p class="mini-instruction">${mechanismSpecs[1][role][1]}</p><div class="whisk-setup"><div class="gesture-wheel reagent" data-gesture="stir" role="img" aria-label="Drag in circles inside the reagent vessel"><div class="reagent-liquid"></div><div class="reagent-bubbles">◦ ✧ ◦</div><div class="reagent-spoon">⚗</div></div><div class="charge-track"><div style="width:${Math.min(100,m.count/(game.taskConfig?.turns||3)*100)}%"></div></div><div class="mini-status">${Math.floor(m.count*10)/10}/${game.taskConfig?.turns||3} circular stirs</div></div></div>`;
 if(stage===2&&role==='mouse'){
  const cfg=game.taskConfig||{coils:3,draw:4,reserve:5};
  return `<div class="mini-task"><p class="mini-instruction">${mechanismSpecs[2][role][1]}</p><div class="equation-panel"><div>${cfg.coils} × ${cfg.draw} + ${cfg.reserve} = <b>?</b></div><form id="equation-form" class="mini-form"><input name="answer" type="number" inputmode="numeric" placeholder="?" aria-label="Power calibration result" required/><button class="btn amber">CALIBRATE</button></form><div id="mini-feedback" class="mini-status" aria-live="polite">Enter the total required power units.</div></div></div>`;
 }
 if(stage===2&&role==='chameleon'){
  const freqs=game.taskConfig?.frequencies||{a:240,b:680,c:410};
  return `<div class="mini-task"><p class="mini-instruction">${mechanismSpecs[2][role][1]}</p><div class="frequency-bands">${['a','b','c'].map((k,i)=>`<button class="frequency ${m.progress.includes(k)?'placed':''}" data-frequency="${k}" ${m.progress.includes(k)?'disabled':''}><span>${['▂▅█','▁▂▃','▁▄▆'][i]}</span><b>RELAY ${k.toUpperCase()}</b><small>${freqs[k]} Hz</small></button>`).join('')}</div><div class="mini-status">Signal locked: ${m.progress.join(' → ')||'—'}</div></div>`;
 }
 return '';
}
function showTaskPopup(){
 if(!game||game.status!=='playing')return;
 if(game.revealed[game.you.role]){showCluePopup();return;}
 const [title]=mechanismSpecs[game.stage][game.you.role];
 showPopup('INTERACTIVE LAB MECHANISM',title,'',taskMarkup());
 miniModalActive=true;
 send('work_start',{target:'clue'});
 if(game.stage===0 && game.you.role==='mouse')requestAnimationFrame(redrawWireLinks);
}
function refreshTask(){const graphic=document.querySelector('#paws-modal-layer .inspect-graphic');if(graphic){graphic.innerHTML=taskMarkup();if(game.stage===0&&game.you.role==='mouse')requestAnimationFrame(redrawWireLinks);}}
function finishTask(proof){sound('unlock');closePopup(false);send('complete_task',{proof});}
function taskMisstep(msg){sound('error');const el=document.querySelector('#paws-modal-layer .mini-status');if(el)el.textContent=msg;}
function taskInteraction(btn){
 const s=game.stage,r=game.you.role,m=getTask();
 if(s===1&&r==='mouse'&&btn.dataset.fragment){const expected=['I','II','III'][m.progress.length];if(btn.dataset.fragment===expected){m.progress.push(expected);sound('tap');if(m.progress.length===3)return finishTask(['I','II','III']);refreshTask();}else{m.progress=[];refreshTask();taskMisstep('The paper edges do not line up. Try the order again.');}return;}
 if(s===2&&r==='chameleon'&&btn.dataset.frequency){const hz=game.taskConfig?.frequencies||{a:240,b:680,c:410};const sorted=Object.keys(hz).sort((a,b)=>hz[a]-hz[b]);const expected=sorted[m.progress.length];if(btn.dataset.frequency===expected){m.progress.push(expected);sound('clue');if(m.progress.length===3)return finishTask(sorted);refreshTask();}else{m.progress=[];refreshTask();taskMisstep('Frequency interference! Start from the lowest signal.');}return;}
}
function pointIn(el,x,y){const r=el.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;}
function center(el){const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}
function redrawWireLinks(){
 const board=document.querySelector('.wire-drag-board');if(!board)return;
 const svg=board.querySelector('.wire-svg'), g=board.querySelector('.wire-connections');const r=board.getBoundingClientRect();
 svg.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);
 const m=getTask();g.innerHTML=m.progress.map(col=>{
  const a=board.querySelector(`[data-wire="${col}"]`), b=board.querySelector(`[data-socket="${col}"]`);if(!a||!b)return '';
  const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),x1=ar.right-r.left,y1=ar.top+ar.height/2-r.top,x2=br.left-r.left,y2=br.top+br.height/2-r.top;
  return `<path d="M${x1} ${y1} C${x1+34} ${y1},${x2-34} ${y2},${x2} ${y2}" stroke="${{red:'#e96670',blue:'#75b5e6',green:'#80c9a0',yellow:'#f8d17e'}[col]}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
 }).join('');
}
function updateWirePreview(x,y){
 const d=dragState;if(!d||d.type!=='wire')return;
 const board=d.board,r=board.getBoundingClientRect(),start=d.from.getBoundingClientRect(),x1=start.right-r.left,y1=start.top+start.height/2-r.top;
 const px=x-r.left,py=y-r.top;
 board.querySelector('.wire-preview')?.setAttribute('d',`M${x1} ${y1} Q${(x1+px)/2} ${py-14},${px} ${py}`);
}
function startDrag(e){
 const wire=e.target.closest('[data-wire]');const wheel=e.target.closest('[data-gesture]');
 if(wire&&!wire.disabled){e.preventDefault();const board=wire.closest('.wire-drag-board');dragState={type:'wire',col:wire.dataset.wire,from:wire,board,pointer:e.pointerId};wire.setPointerCapture(e.pointerId);updateWirePreview(e.clientX,e.clientY);return;}
 if(wheel){e.preventDefault();const p=center(wheel),dx=e.clientX-p.x,dy=e.clientY-p.y,r=Math.hypot(dx,dy),size=wheel.getBoundingClientRect().width;
  if(r<size*.12||r>size*.65)return;
  dragState={type:'circle',pointer:e.pointerId,from:wheel,center:p,last:Math.atan2(dy,dx),total:0,gesture:wheel.dataset.gesture};wheel.setPointerCapture(e.pointerId);
 }
}
function trackDrag(e){
 if(!dragState||dragState.pointer!==e.pointerId)return;
 if(dragState.type==='wire'){updateWirePreview(e.clientX,e.clientY);return;}
 const d=dragState,dx=e.clientX-d.center.x,dy=e.clientY-d.center.y,r=Math.hypot(dx,dy),size=d.from.getBoundingClientRect().width;
 if(r<size*.12||r>size*.7){d.last=null;return;}
 const a=Math.atan2(dy,dx);if(d.last!==null){let diff=a-d.last;while(diff>Math.PI)diff-=2*Math.PI;while(diff< -Math.PI)diff+=2*Math.PI;if(Math.abs(diff)<1){d.total+=diff;}}
 d.last=a;
 const m=getTask();const turns=game.taskConfig?.turns||3;m.count=Math.min(turns,Math.abs(d.total)/(2*Math.PI));
 const track=document.querySelector('.mini-task .charge-track>div');if(track)track.style.width=`${m.count/(game.taskConfig?.turns||3)*100}%`;
 const status=document.querySelector('.mini-task .mini-status');if(status)status.textContent=`${m.count.toFixed(1)}/${game.taskConfig?.turns||3} circular ${d.gesture==='crank'?'turns · UV charge':'stirs'}`;
 const knob=d.from.querySelector('.gesture-knob,.reagent-spoon');if(knob)knob.style.transform=`rotate(${d.total}rad)`;
}
function endDrag(e){
 const d=dragState;if(!d||d.pointer!==e.pointerId)return;
 dragState=null;
 if(d.type==='wire'){
  const col=d.col,board=d.board,socket=board.querySelector(`[data-socket="${col}"]`),hits=board.querySelectorAll('[data-socket]');
  const found=[...hits].find(el=>pointIn(el,e.clientX,e.clientY));
  if(found&&found===socket&&!getTask().progress.includes(col)){
   getTask().progress.push(col);sound('vial');if(getTask().progress.length===4){finishTask(['red','blue','green','yellow']);return;}refreshTask();
  }else{board.querySelector('.wire-preview')?.setAttribute('d','');taskMisstep(found?'Wrong connector. Follow the wire color.':'Drag all the way to a matching socket before releasing.');}
  return;
 }
 if(d.type==='circle'){
  if(getTask().count>=(game.taskConfig?.turns||3)-.1){finishTask(d.gesture==='crank'?'uv-charged':'vials-whisked');return;}
  getTask().count=0;taskMisstep('Keep tracing complete circles around the center until the meter is full.');
  const bar=document.querySelector('.mini-task .charge-track>div');if(bar)bar.style.width='0%';
 }
}
function genericDiagram() {
 if(game.stage===1)return `<div class="vial-gallery">${vialArt('violet','VIOLET')}${vialArt('amber','AMBER')}${vialArt('cyan','CYAN')}</div>`;
 if(game.stage===0)return `<div class="mystery-diagram"><span>▥</span><b>LOCKED</b><span>▣</span></div>`;
 return `<div class="mystery-diagram"><span>⚡</span><b>SECURITY RELAY</b><span>⚙</span></div>`;
}
function closePopup(announce=true) {if(miniModalActive && announce && game?.status==='playing')send('work_stop');miniModalActive=false;dragState=null;const layer=document.getElementById('paws-modal-layer');if(layer)layer.remove();}
function showPopup(label,title,description,diagram) {
 closePopup();
 const layer=document.createElement('div');layer.id='paws-modal-layer';layer.className='inspect-overlay';
 layer.innerHTML=`<section class="inspect-modal" role="dialog" aria-modal="true" aria-labelledby="inspect-title" tabindex="-1"><div class="inspect-top"><span>✦ ${esc(label)}</span><button type="button" class="inspect-close" data-action="close-modal" aria-label="Close inspection">×</button></div><h2 id="inspect-title">${esc(title)}</h2><div class="inspect-graphic">${diagram}</div>${description ? `<p class="inspect-description">${esc(description)}</p>` : ''}<button class="btn primary" data-action="close-modal">CONTINUE EXPLORING →</button></section>`;
 document.body.appendChild(layer);layer.querySelector('.inspect-modal').focus();
}
function showCluePopup(){if(game?.privateClue)showPopup('EVIDENCE FOUND',game.privateClue.title,'',illustratedClue());}
function showHintPopup(){if(game?.hint)showPopup(`EMERGENCY HINT ${game.hintLevel}/3`,'SECURITY ASSISTANCE',game.hint,genericDiagram());}
function showVialPopup(color){
 const title=color.toUpperCase()+' REAGENT';
 showPopup('REAGENT SELECTED',title,`Added vial ${seq.length} of 3 to the mixer. Return to the formula station to select the next vial or mix your completed sequence.`,
 `<div class="vial-gallery selected-vial">${vialArt(color,title)}<div class="vial-progress"><b>FORMULA QUEUE</b><div class="vial-minirow">${[0,1,2].map(i=>seq[i]?vialArt(seq[i],'', 'mini'):`<span class="empty-mini">?</span>`).join('')}</div></div></div>`);
}
const header = (right='') => `<div class="shell-top"><div class="brand"><span class="brandmark">✦</span><span>OPERATION LAB ESCAPE</span></div><div class="top-right"><button class="sound-toggle" data-action="toggle-sound" aria-pressed="${soundOn}" aria-label="${soundOn?'Mute sound effects':'Enable sound effects'}">${soundOn?'♫ SOUND ON':'♪ SOUND OFF'}</button><button class="sound-toggle" data-action="toggle-music" aria-pressed="${musicOn}" aria-label="Toggle background music">${musicOn?'♫ MUSIC ON':'♪ MUSIC OFF'}</button><span class="pill">CO-OP ESCAPE ROOM</span>${right}</div></div>`;
const footer = () => `<div class="footer"><span>LAB ESCAPE / EXPERIMENT NO. 042</span><span>CONTAINMENT IS NOT AN OPTION.</span></div>`;
function toast(message) {const el=$('toast'); el.textContent=message;el.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.display='none',5000);}
function landing(){
 const code=(new URLSearchParams(location.search).get('room')||'').toUpperCase().slice(0,5);
 app.innerHTML=header('<span class="pill orange">ALPHA BUILD 0.7</span>')+`
 <main class="hero"><section><div class="eyebrow">✧ PROTOCOL: BREAK OUT ✧</div><h1>BREAK CONTAINMENT.<br><span>ESCAPE TOGETHER.</span></h1>
 <p>Two experimental animals. One locked-down laboratory. Different clues on every screen. <b class="teal">You can only escape together.</b></p>
 <div class="hero-bits"><span class="pill">2 PLAYERS</span><span class="pill">3 PUZZLE ROOMS</span><span class="pill">REAL-TIME CO-OP</span></div>
 <div class="login">
 <form class="panel" id="create-form"><h3>01 / CREATE ROOM</h3><p class="muted tiny">Start a new escape mission.</p><div class="field"><label for="host-name">Your animal name</label><input id="host-name" name="name" maxlength="24" placeholder="e.g. Captain Squeak" autocomplete="nickname" required /></div><button class="btn primary block" type="submit">CREATE ESCAPE →</button></form>
 <form class="panel" id="join-form"><h3>02 / JOIN A FRIEND</h3><p class="muted tiny">Have a room code? Join them.</p><div class="field"><label for="join-name">Your animal name</label><input id="join-name" name="name" maxlength="24" placeholder="e.g. Dr. Scales" autocomplete="nickname" required /></div><div class="field"><label for="join-code">Five-character code</label><input id="join-code" name="room" maxlength="5" value="${esc(code)}" placeholder="ABCDE" autocapitalize="characters" required /></div><button class="btn amber block" type="submit">JOIN ESCAPE →</button></form>
 </div></section><div class="hero-art"><canvas id="lab-canvas" width="320" height="180" aria-label="Pixel art laboratory"></canvas></div></main>
 <div class="features"><div class="feature"><b>01</b> / Unique animal abilities</div><div class="feature"><b>02</b> / Share secrets to solve puzzles</div><div class="feature"><b>03</b> / Escape as a team</div></div>${footer()}`;
 drawScene(0,'mouse',false,0);
}
async function post(path,body){const res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); if(!res.ok){throw Error(await res.text());}return res.json();}
function saveSession(data){session=data;sessionStorage.setItem('paws-session',JSON.stringify(session));connect();}
function connect(){
 if(socket){socket.onclose=null;socket.close();}
 const url=`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws?room=${encodeURIComponent(session.room)}&token=${encodeURIComponent(session.token)}`;
 socket=new WebSocket(url);
 socket.onopen=()=>{ if(game) toast('Connected to the laboratory network.'); };
 socket.onmessage=(e)=>{try{const msg=JSON.parse(e.data);if(msg.type==='state'){const previous=game;game=msg.data;timerOffset=game.serverTime-Date.now()/1000;
 const newRoom=previous?.stage!==game.stage;
 if(newRoom){seq=[];enterCode='';miniTask=null;closePopup(false);previousCanvasStage=-1;}
 render();
 if(previous?.status==='playing'&&game.status==='won'){sound('victory');}
 else if(previous?.status==='playing'&&game.status==='playing'&&newRoom){sound('unlock');}
 else if(previous?.status==='playing'&&game.status==='playing'&&previous.stage===game.stage){
  const role=game.you.role;
  if(!previous.revealed?.[role]&&game.revealed?.[role]){sound('clue');showCluePopup();}
  else if(game.hintLevel>previous.hintLevel){sound('hint');showHintPopup();}
  else if(!previous.powered&&game.powered){sound('unlock');}
  else if(game.messages.length>previous.messages.length&&game.messages.at(-1)?.name!==game.you.name){sound('chat');}
 }
 }else if(msg.type==='error'){toast(msg.message);sound('error');}}catch(err){console.error(err);}};
 socket.onclose=()=>{if(session){const old=game;game=null;app.innerHTML=header()+`<section class="lobby panel" style="text-align:center"><h2 class="gold">SIGNAL LOST</h2><p>The connection to the laboratory was interrupted. Your room may still be active.</p><button class="btn primary" data-action="reconnect">RECONNECT</button> <button class="btn ghost" data-action="home">NEW ROOM</button></section>`+footer();if(old)console.info('Disconnected from',old.room);}};
 socket.onerror=()=>console.warn('WebSocket connection error');
}
function send(action, payload={}){if(!socket || socket.readyState!==WebSocket.OPEN){toast('You are not connected. Try reconnecting.');return;}socket.send(JSON.stringify({action,...payload}));}
function render(){ if(!game)return;
 if(game.status==='lobby')return lobby();
 if(game.status==='won')return victory();
 return play();
}
function lobby(){const host=game.you.isHost;const you=game.you;const players=game.players;
 app.innerHTML=header(`<span class="pill">ROOM: ${esc(game.room)}</span>`)+`<section class="lobby"><div class="lobbyhero"><div class="eyebrow">✦ TEAM ASSEMBLY ✦</div><h1>THE ESCAPE CREW</h1><p class="muted">Recruit your partner. Two creatures, two abilities, one way out.</p></div>
 <div class="panel"><div class="smalllabel" style="text-align:center">YOUR ROOM CODE</div><div class="codebox"><span class="roomcode">${esc(game.room)}</span><button class="btn small" data-action="copy-code">COPY</button></div><div style="text-align:center"><button class="btn ghost small" data-action="copy-link">COPY INVITE LINK ↗</button></div>
 <div class="lobby-grid">${['mouse','chameleon'].map(role=>{const p=players.find(x=>x.role===role);return `<div class="playercard ${p?'active':''}"><div class="avatar">${roleIcon(role)}</div><div><div class="smalllabel">${role==='mouse'?'01 / ENGINEERING':'02 / SPECTRAL VISION'}</div><h3>${roleName(role)}</h3><div class="muted tiny">${role==='mouse'?'Crawl into vents · Inspect wiring':'Reveal UV clues · Uncover hidden symbols'}</div><p class="${p?'teal':'muted'} tiny" style="margin:7px 0 0">${p?`● ${esc(p.name)} ${p.online?'(connected)':'(offline)'}`:'◌ Waiting for player...'}</p></div></div>`;}).join('')}</div>
 <div class="instruction"><b>HOW TO PLAY:</b> Click glowing objects to investigate. Each animal gets different clues. Share discoveries using in-game chat or voice. Work out the answers together and escape three rooms.</div>
 <p class="muted tiny" style="text-align:center">Playing on another device? The host computer must be reachable on the same Wi-Fi using its local IP address, or the app must be publicly hosted.</p><div class="lobby-actions">${host?`<button class="btn primary" ${players.length<2?'disabled':''} data-action="start">BEGIN ESCAPE →</button><button class="btn ghost" ${players.length<2?'disabled':''} data-action="swap_roles">SWAP CHARACTERS ⇄</button>`:`<span class="pill orange">WAITING FOR HOST TO START...</span>`}</div></div></section>${footer()}`;
}
function tasks(){let role=game.you.role;const own=game.revealed[role],other=game.revealed[role==='mouse'?'chameleon':'mouse'];
 const stage=game.stage;
 let actions=[{label:role==='mouse'?mouseTasks[stage]:chameleonTasks[stage],done:own},{label:`${teammateName(role)} discovers their private clue`,done:other}];
 if(stage===2)actions.push({label:'Restore auxiliary power',done:game.powered},{label:'Both animals pull emergency levers',done:false});
 else actions.push({label:stage===0?'Unlock the containment door':'Create the keycard formula',done:false});
 return actions.map((a,i)=>`<li class="${a.done?'ok':''}"><span class="num">${a.done?'✓':i+1}</span><span>${esc(a.label)}</span></li>`).join('');
}
function hotspot(x,y,label,action,cls=''){return `<button class="hotspot ${cls}" style="left:${x}%;top:${y}%" data-action="${action}">${label}</button>`;}
function sceneControls(){const s=game.stage,r=game.you.role,own=game.revealed[r],both=Object.values(game.revealed).every(Boolean);let out='';
 if(s===0){
   if(r==='mouse')out+=hotspot(23,43,own?'✓ REOPEN VENT':'✦ VENT SHAFT',own?'view-clue':'mini-task',own?'done':'');
   if(r==='chameleon'){out+=hotspot(72,36,own?'✓ REINSPECT UV':'✦ UV MARKINGS',own?'view-clue':'mini-task',own?'done':'');out+=hotspot(81,62,both?'▣ DOOR KEYPAD':'🔒 KEYPAD','focus-code',both?'action':'locked');}
 }
 if(s===1){
   if(r==='mouse'){out+=hotspot(22,65,own?'✓ REOPEN LOG':'✦ DRAIN LOG',own?'view-clue':'mini-task',own?'done':'');out+=hotspot(51,62,both?'⚗ MIXER':'🔒 MIXER','focus-mix',both?'action':'locked');}
   if(r==='chameleon')out+=hotspot(71,38,own?'✓ RESCAN VIALS':'✦ SCAN VIALS',own?'view-clue':'mini-task',own?'done':'');
 }
 if(s===2){
   if(r==='mouse'){out+=hotspot(22,46,own?'✓ RECHECK GRID':'✦ POWER GRID',own?'view-clue':'mini-task',own?'done':'');out+=hotspot(53,70,both&&!game.powered?'▣ POWER TERMINAL':game.powered?'✓ POWER ONLINE':'🔒 POWER TERMINAL','focus-code',game.powered?'done':both?'action':'locked');}
   if(r==='chameleon')out+=hotspot(74,36,own?'✓ RECHECK SIGNAL':'✦ GHOST DISPLAY',own?'view-clue':'mini-task',own?'done':'');
   if(game.powered)out+=hotspot(r==='mouse'?28:75,76,game.leverRoles.includes(r)?'✓ LEVER PULLED':'⚡ PULL YOUR LEVER','lever',game.leverRoles.includes(r)?'done':'action');
 }
 return out;
}
function terminal(){const s=game.stage,r=game.you.role,both=Object.values(game.revealed).every(Boolean);
 if(s===0&&r==='chameleon')return `<div class="terminal-panel" id="terminal"><h3>▣ CONTAINMENT DOOR KEYPAD</h3><p class="tiny muted">Ask ${esc(playerName('mouse'))} for the numbers matching your UV color sequence.</p><form id="code-form"><div class="input-row"><input id="pin" class="codeinput" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" value="${esc(enterCode)}" placeholder="••••" aria-label="Four digit security code" ${!both?'disabled':''} required /><button class="btn amber" ${!both?'disabled':''}>UNLOCK DOOR →</button></div></form>${!both?'<div class="status-line">⚠ WAITING FOR BOTH CLUES</div>':''}</div>`;
 if(s===1&&r==='mouse')return `<div class="terminal-panel" id="terminal"><h3>⚗ EXPERIMENTAL MIXER</h3><p class="tiny muted">Choose the three reagent colors in the order described by your protocol. ${esc(playerName('chameleon'))} knows the colors.</p><div class="vial-options">${[['violet','◉ VIOLET'],['amber','◉ AMBER'],['cyan','◉ CYAN']].map(v=>`<button class="vial ${v[0]}" data-vial="${v[0]}" ${!both||seq.length>=3?'disabled':''}>${v[1]}</button>`).join('')}</div><div class="chosen">${[0,1,2].map(i=>`<span>${seq[i]?esc(seq[i]):'?'}</span>`).join('')}</div><div class="input-row"><button class="btn amber" data-action="mix" ${!both||seq.length!==3?'disabled':''}>MIX FORMULA →</button><button class="btn ghost small" data-action="clear-vials">RESET</button></div>${!both?'<div class="status-line">⚠ WAITING FOR BOTH CLUES</div>':''}</div>`;
 if(s===2){return `<div class="terminal-panel" id="terminal"><h3>⚡ FINAL SECURITY SHUTDOWN</h3>${r==='mouse'&&!game.powered?`<p class="tiny muted">Translate the invisible direction sequence into wire numbers.</p><form id="code-form"><div class="input-row"><input id="pin" class="codeinput" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" value="${esc(enterCode)}" placeholder="••••" ${!both?'disabled':''} aria-label="Four digit power code" required/><button class="btn amber" ${!both?'disabled':''}>RESTORE POWER →</button></div></form>`:game.powered?`<p class="teal">✓ AUXILIARY POWER ONLINE</p><p class="tiny">Both players must click their own glowing lever within <b>12 seconds</b> of the first pull.</p><div class="status-line">Mouse lever: ${game.leverRoles.includes('mouse')?'✓ PULLED':'◌ WAITING'} &nbsp; | &nbsp; Chameleon lever: ${game.leverRoles.includes('chameleon')?'✓ PULLED':'◌ WAITING'}</div><div id="countdown" class="countdown"></div>`:`<p class="muted tiny">Waiting for the mouse to restore auxiliary power. Share your hidden routing order with ${esc(playerName('mouse'))}!</p>`}</div>`;}
 return '';
}
function play(){const role=game.you.role;const s=game.stage;
 app.innerHTML=header(`<span class="pill">ROOM ${esc(game.room)}</span><span class="pill orange" id="timer">00:00</span>`)+`
 <div class="game-top"><div><div class="smalllabel">STAGE ${s+1} OF 3 / LABORATORY SECTOR ${String(s+1).padStart(2,'0')}</div><h2>${names[s]}</h2></div><div class="pill ${role==='mouse'?'orange':''}">${roleIcon(role)} ${esc(game.you.name)} <span class="muted tiny">/ ${roleName(role)}</span></div></div>
 <div class="progress">${[0,1,2].map(i=>`<span class="progress-item ${i<s?'complete':i===s?'current':''}" title="Stage ${i+1}"></span>`).join('')}</div>
 <div class="game-grid">
 <aside class="side left"><div class="panel"><div class="panelhead"><span class="smalllabel">MISSION OBJECTIVE</span><span class="gold">0${s+1}</span></div><span class="room-tag">${names[s]}</span><p class="objective">${objectives[s]}</p><ol class="steps">${tasks()}</ol></div>
</aside>
 <main class="scene-col"><div class="scene-top"><span class="roomname">◈ ${names[s]}</span><span class="signal">● LAB SECURITY: ${s===2&&game.powered?'COMPROMISED':'ACTIVE'}</span></div>
 <div class="scene-wrap"><canvas id="lab-canvas" width="320" height="180" aria-label="Interactive pixel-art escape room"></canvas>${sceneControls()}</div>
 <div class="scene-foot"><span class="actor">${roleIcon(role)} ${esc(game.you.name)} · ${roleName(role)}</span><span>${Object.entries(game.actors||{}).filter(([r,a])=>a.working&&r!==role).map(([r,a])=>`<b class="working-live">⚙ ${esc(playerName(r))} is working at their ${a.target==='clue'?'clue':'station'}...</b>`).join('')||'Tap glowing objects to investigate ▲'}</span></div>${terminal()}
 </main>
 <aside class="side right"><div class="panel tight"><div class="panelhead"><span class="smalllabel">TEAM RADIO / CHAT</span><span class="teal">● LIVE</span></div>
 <div class="chat-wrap" id="chatlog">${game.messages.length?game.messages.map(m=>`<div class="msg ${m.role}"><div class="msghead">${roleIcon(m.role)} ${esc(m.name)}</div>${esc(m.message)}</div>`).join(''):'<p class="muted tiny">Tell your teammate what you see! Every animal has a different clue.</p>'}</div>
 <form class="chat-form" id="chat-form"><input class="chat-input" id="chat-text" maxlength="300" autocomplete="off" aria-label="Team chat message" placeholder="Share a clue..." value="${esc(chatDraft)}" /><button class="btn small primary">SEND</button></form></div>
 <div class="panel tight"><div class="panelhead"><span class="smalllabel">EMERGENCY HINT</span><span>💡</span></div><p class="tiny muted">Stuck? Hints become more specific each time.</p>${game.hint?`<div class="hint-display">${esc(game.hint)}</div><button class="btn ghost small" data-action="view-hint" style="margin-bottom:12px">VIEW HINT CARD ↗</button>`:''}<button class="btn ghost block" data-action="hint" ${game.hintLevel>=3?'disabled':''}>${game.hintLevel>=3?'ALL HINTS REVEALED':`REVEAL HINT ${game.hintLevel+1}/3`}</button><p class="tiny muted" style="margin:12px 0 0">Team hints used: ${game.hintsUsed}</p></div>
 <div class="panel tight"><div class="panelhead"><span class="smalllabel">SECURITY LOG</span><span>▣</span></div><div class="activity">${game.activity.slice(-4).reverse().map(a=>`<p>› ${esc(a.message)}</p>`).join('')}</div></div></aside></div>${footer()}`;
 drawScene(s,role,game.powered,game.revealed[role]);
 const chat=$('chatlog');if(chat)chat.scrollTop=chat.scrollHeight;
 updateTime();
}
function victory(){const elapsed=t((game.finishedAt||Date.now()/1000)-(game.startedAt||Date.now()/1000));
 const pieces=Array.from({length:42},(_,i)=>`<span style="--x:${(i*43+17)%100}%;--delay:${(i*13)%23/10}s;--duration:${3+(i%6)*.55}s;--rot:${(i*37)%360}deg;--tone:${i%4}"></span>`).join('');
 app.innerHTML=header(`<span class="pill">ROOM ${esc(game.room)}</span>`)+`<section class="victory freedom-victory"><div class="victory-particles" aria-hidden="true">${pieces}</div><div class="freedom-rays" aria-hidden="true"></div><div class="eyebrow freedom-eyebrow">✦ LABORATORY LOCKDOWN TERMINATED ✦</div><div class="broken-chains" aria-hidden="true">⛓ ✨ ⛓</div><div class="freedom-banner"><span>VICTORY!</span><strong>FREEDOM!</strong></div><p class="freedom-story">The security AI is disabled. The laboratory doors burst open. Two very clever animals have escaped into the night!</p><div class="hero-art freedom-art" style="max-width:650px;min-height:260px;margin:25px auto"><canvas id="lab-canvas" width="320" height="180" style="min-height:260px" aria-label="Pixel art animals celebrating their freedom"></canvas></div><div class="victory-stats"><div class="stat"><strong>3/3</strong><span>ROOMS ESCAPED</span></div><div class="stat"><strong>${elapsed}</strong><span>ESCAPE TIME</span></div><div class="stat"><strong>${game.hintsUsed}</strong><span>TEAM HINTS</span></div></div><p class="teal">Cooperation successful. Nobody left behind.</p><button class="btn ghost" data-action="replay-victory">✦ REPLAY CELEBRATION</button> ${game.you.isHost?'<button class="btn primary" data-action="restart">↻ PLAY AGAIN WITH SAME TEAM</button>':''}</section>${footer()}`;
 drawScene(3,game.you.role,true,true);
}
function updateTime(){if(!game)return;const clock=$('timer');if(clock&&game.startedAt)clock.textContent='◷ '+t(Date.now()/1000+timerOffset-game.startedAt);
 const count=$('countdown');if(count)count.textContent=game.deadline?Math.max(0,game.deadline-(Date.now()/1000+timerOffset)).toFixed(1)+' SECONDS REMAIN':'WAITING FOR FIRST LEVER...';}
async function copy(str){try{await navigator.clipboard.writeText(str);toast('Copied to clipboard.');}catch(e){prompt('Copy this:',str);}}
document.addEventListener('submit', async e=>{
 if(e.target.id==='create-form'){e.preventDefault();try{const data=await post('/api/create',{name:e.target.elements.namedItem('name').value});saveSession(data);}catch(err){toast(err.message);}}
 if(e.target.id==='join-form'){e.preventDefault();try{const d=await post('/api/join',{name:e.target.elements.namedItem('name').value,room:e.target.elements.namedItem('room').value.toUpperCase()});saveSession(d);}catch(err){toast(err.message);}}
 if(e.target.id==='chat-form'){e.preventDefault();const msg=$('chat-text')?.value.trim();if(msg){sound('chat');send('chat',{message:msg});}chatDraft='';if($('chat-text'))$('chat-text').value='';}
 if(e.target.id==='equation-form'){e.preventDefault();const val=e.target.elements.namedItem('answer').value.trim();if(Number(val)===game.taskConfig?.answer)finishTask(val);else taskMisstep('The load is incorrect. Check the coils and reserve units.');return;}
 if(e.target.id==='code-form'){e.preventDefault();const pin=$('pin')?.value.trim();if(pin&&pin.length===4){sound('tap');send('submit_code',{code:pin});}}
});
document.addEventListener('focusin',e=>{if(e.target.id==='pin')send('move_to',{target:'terminal'});});
document.addEventListener('input',e=>{if(e.target.id==='chat-text')chatDraft=e.target.value;if(e.target.id==='pin')enterCode=e.target.value.replace(/\D/g,'').slice(0,4);});
document.addEventListener('click',e=>{
 if(e.target.id==='paws-modal-layer'){closePopup();return;}
 const v=e.target.closest('[data-vial]');if(v){if(seq.length<3){if(seq.length===0)send('move_to',{target:'terminal'});seq.push(v.dataset.vial);sound('vial');play();}return;}
 const mini=e.target.closest('[data-fragment],[data-frequency]');if(mini){if(!mini.disabled)taskInteraction(mini);return;}
 const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
 const a=b.dataset.action;
 if(a==='close-modal'){closePopup();return;}
 if(a==='view-clue'){sound('clue');send('move_to',{target:'clue'});showCluePopup();return;}
 if(a==='mini-task'){sound('tap');showTaskPopup();return;}
 if(a==='view-hint'){sound('hint');showHintPopup();return;}
 if(a==='toggle-music'){musicOn=!musicOn;try{localStorage.setItem('paws-music',musicOn?'on':'off');}catch{}if(musicOn)startMusic();else stopMusic();updateMusicButton();return;}
 if(a==='toggle-sound'){soundOn=!soundOn;try{localStorage.setItem('paws-sound',soundOn?'on':'off');}catch{}updateSoundButton();if(soundOn)sound('vial');return;}
 if(['start','reveal','hint','lever','swap_roles','restart'].includes(a)){sound(a==='lever'?'lever':'tap');if(a==='lever')send('move_to',{target:'lever'});send(a);return;}
 if(a==='copy-code'){copy(game.room);return;}
 if(a==='copy-link'){copy(`${location.origin}/?room=${game.room}`);return;}
 if(a==='clear-vials'){seq=[];sound('tap');play();return;}
 if(a==='mix'){sound('vial');send('mix',{sequence:seq});return;}
 if(a==='focus-code'||a==='focus-mix'){send('move_to',{target:'terminal'});const elem=$('terminal');if(elem){elem.scrollIntoView({behavior:'smooth',block:'nearest'});if(a==='focus-code')$('pin')?.focus();}return;}
 if(a==='replay-victory'){victory();sound('victory');return;}
 if(a==='reconnect'){connect();return;}
 if(a==='home'){sessionStorage.removeItem('paws-session');session=null;game=null;landing();return;}
});
document.addEventListener('pointerdown',startDrag);
document.addEventListener('pointermove',trackDrag);
document.addEventListener('pointerup',endDrag);
document.addEventListener('pointercancel',e=>{if(dragState?.pointer===e.pointerId){dragState=null;const pr=document.querySelector('.wire-preview');if(pr)pr.setAttribute('d','');}});
window.addEventListener('resize',()=>requestAnimationFrame(redrawWireLinks));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePopup();});
setInterval(()=>{updateTime();if($('lab-canvas'))drawScene(game?.stage??0,game?.you?.role??'mouse',game?.powered??false,game?.revealed?.[game?.you?.role]??false);},55);
// Original 320×180 procedural pixel-art scenes, now restyled with a whimsical gothic pixel look.
function drawScene(stage,role,powered,revealed){
 const canvas=$('lab-canvas');if(!canvas)return;
 const c=canvas.getContext('2d');const W=320,H=180; c.imageSmoothingEnabled=false;
 const rect=(x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
 const line=(x,y,x2,y2,col,width=1)=>{c.strokeStyle=col;c.lineWidth=width;c.beginPath();c.moveTo(x+.5,y+.5);c.lineTo(x2+.5,y2+.5);c.stroke();};
 const text=(v,x,y,size,col)=>{c.fillStyle=col;c.font=`bold ${size}px monospace`;c.fillText(v,x,y);};
 const moon=Math.floor(Date.now()/650)%2;
 const torchGlow=(x,y,col1,col2,r=28)=>{const g=c.createRadialGradient(x,y,2,x,y,r);g.addColorStop(0,col1);g.addColorStop(1,col2);c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);};
 const bottle=(x,y,color,scale=1)=>{rect(x+3*scale,y,8*scale,3*scale,'#c5b6a5');rect(x+5*scale,y+3*scale,4*scale,3*scale,'#7ea2a0');rect(x,y+6*scale,14*scale,15*scale,'#5f6270');rect(x+2*scale,y+10*scale,10*scale,9*scale,color);rect(x+1*scale,y+8*scale,2*scale,11*scale,'#c4d1d1');rect(x+3*scale,y+20*scale,9*scale,2*scale,'#d8ddd8');};
 const monitor=(x,y,w,h,label,on=true)=>{rect(x-3,y-3,w+6,h+6,'#0c0910');rect(x,y,w,h,'#5b4b57');rect(x+3,y+3,w-6,h-6,'#191520');rect(x+6,y+6,w-12,h-12,on?'#30483d':'#33262c');for(let i=0;i<8;i++){let tx=x+7+i*3,ty=y+12+Math.sin(i*1.7+Date.now()/1800)*5;rect(tx,ty,2,2,on?'#a9df9c':'#c57476');}if(label)text(label,x+5,y+h-4,5,on?'#dff0c4':'#e6aba8');};
 const torch=(x,y)=>{rect(x-1,y-6,3,15,'#7f634d');rect(x-2,y+7,5,2,'#b5946d');rect(x-3,y-10,7,6,'#c35758');rect(x-2,y-15,5,5,'#e4826f');rect(x-1,y-20,3,5,'#ffd09c');torchGlow(x,y-14,'#dc3f4e54','#dc3f4e00',24);};
 const banner=(x,y,col='#6b303a')=>{rect(x,y,10,30,col);rect(x+2,y+2,6,26,col==='#6b303a'?'#9b5160':'#4d6f47');rect(x+2,y+29,6,4,col==='#6b303a'?'#7b3f4c':'#608857');};
 const cage=(x,y,w,h)=>{rect(x,y,w,h,'#1a141c');rect(x,y,w,4,'#6b5b5d');for(let i=x+6;i<x+w;i+=10){rect(i,y+4,3,h-8,'#9d9592');rect(i+1,y+4,1,h-8,'#d8c4af');}rect(x,y+h-5,w,5,'#68585b');};
 const stoneWall=()=>{
   for(let y=0;y<138;y+=14){for(let x=0;x<W;x+=30){const ox=(y/14)%2?0:-14;rect(x+ox,y,29,13,((x+y)%4===0)?'#29202a':'#1c1922');line(x+ox,y+13,x+ox+29,y+13,'#121018');}}
   for(let i=0;i<120;i++){let x=(i*47+13)%320,y=(i*61+11)%124;rect(x,y,i%5===0?2:1,1,i%3===0?'#5a434b':'#403640');}
   rect(0,138,320,42,'#252027');rect(0,136,320,4,'#181318');
   for(let i=0;i<26;i++){line(i*14,140,i*14-12,180,'#302831');line(0,145+i*11,320,145+i*11,'#1c1921');}
 };
 const arch=(x,y,w,h)=>{rect(x,y+10,w,h-10,'#211a23');rect(x+5,y+15,w-10,h-20,'#2b2430');for(let i=0;i<w;i+=8){rect(x+i,y+2+Math.abs(i-w/2)/8,7,8,'#342b36');}}
 const occultRing=(x,y,r,col)=>{for(let i=0;i<360;i+=16){const rx=x+Math.cos(i*Math.PI/180)*r, ry=y+Math.sin(i*Math.PI/180)*r;rect(rx,ry,2,2,col);}line(x-r,y,x+r,y,col);line(x,y-r,x,y+r,col)};
 rect(0,0,W,H,stage===3?'#191622':'#151019');
 if(stage===3){
   for(let y=0;y<180;y+=2)rect(0,y,320,2,y<90?'#2a2240':y<130?'#493653':'#382b33');
   rect(0,130,320,50,'#233025');rect(0,149,320,31,'#1f271f');
   for(let i=0;i<35;i++){const x=i*10,y=148+(i*17%24);rect(x,y,5,2,i%2?'#4b563e':'#39523f');}
   for(let i=0;i<50;i++){const x=(i*83+32)%320,y=(i*47+11)%95;rect(x,y,1,1,i%3?'#b9bacd':'#f2d59a');}
   const g=c.createRadialGradient(235,34,6,235,34,42);g.addColorStop(0,'#f2dfa2');g.addColorStop(1,'#f2dfa200');c.fillStyle=g;c.fillRect(190,0,95,80);
   rect(230,15,14,14,'#f3e5b0');rect(234,19,6,6,'#fffde2');
   rect(22,88,56,55,'#3d2629');rect(28,95,12,38,'#56454a');rect(54,95,12,38,'#56454a');rect(42,82,12,18,'#6f5a43');rect(30,120,36,23,'#231a1f');
   for(let i=0;i<4;i++)banner(20+i*16,96,'#5b3d56');
   rect(0,160,320,20,'#283121');
   text('FREEDOM!',112,30,13,'#f8db9c');
   torchGlow(72,66,'#7cc28a40','#7cc28a00',40);
 } else {
   stoneWall();
   rect(18,7,7,120,'#644553');rect(20,8,2,116,'#ac6770');rect(18,7,96,6,'#644553');rect(18,7,96,2,'#ac6770');
   rect(282,7,7,123,'#59474d');rect(285,9,2,119,'#aa8f95');rect(216,15,70,6,'#57414b');rect(216,15,70,2,'#aa8f95');
   banner(38,16,'#752735');banner(260,18,'#3a5d3f');
   torch(58,45); torch(244,44);
   // Red security lamps and ominous coolant glow make the lab feel hostile.
   rect(147,15,26,4,'#3a222d');rect(151,18,18,5,'#a9384e');
   rect(155,20,10,3,moon?'#ff6672':'#dc394d');
   torchGlow(160,24,moon?'#e93a5355':'#e93a532d','#e93a5300',30);
   rect(123,11,12,12,'#3c2738');text('!',126,20,9,'#efb2b5');
   rect(181,11,12,12,'#3c2738');text('!',184,20,9,'#efb2b5');
 }
 if(stage===0){
   arch(18,42,113,96);arch(190,40,112,98);
   cage(27,61,95,73);cage(198,59,98,75);
   rect(14,120,122,12,'#5d4f4b');rect(188,120,117,12,'#5d4f4b');
   rect(47,82,52,31,'#1a151d');rect(50,86,46,5,'#6f5f61');rect(55,95,15,3,'#a6a0aa');
   rect(59,56,32,20,'#61555d');rect(61,59,28,14,'#14111a');for(let y=62;y<72;y+=3)rect(64,y,22,1,'#8ca08f');
   monitor(223,39,52,30,'KEYPAD',true);rect(244,71,8,20,'#7e6b70');rect(246,75,4,6,'#e0ae73');
   rect(140,49,42,84,'#17121a');rect(143,52,36,78,'#453b46');for(let y=58;y<117;y+=11)rect(144,y,34,2,'#7c7280');rect(154,113,18,5,'#b58064');
   occultRing(160,92,11,revealed&&role==='chameleon'?'#85ddb8':'#4d4452');
   text('SUBJECT 01',31,55,6,'#d2c2ba');text('SUBJECT 02',204,55,6,'#d2c2ba');
   if(revealed&&role==='chameleon'){rect(218,14,66,18,'#284c42');text('UV ACTIVE',223,26,7,'#bdf9de');}
 }
 if(stage===1){
   for(let i=0;i<3;i++){
     rect(18+i*92,39,79,82,'#1a141b');rect(22+i*92,44,71,72,'#29202b');rect(18+i*92,39,79,4,'#82684b');rect(18+i*92,117,79,4,'#82684b');
     for(let k=0;k<3;k++)bottle(24+i*92+k*20,58,(k+i)%3===0?'#9a61c0':(k+i)%3===1?'#dea95c':'#52c3b1');
   }
   for(let i=0;i<3;i++){rect(38+i*86,101,4,18,'#ae765b');rect(46+i*86,104,20,3,'#8b7880');}
   rect(123,96,70,38,'#332630');rect(128,102,60,26,'#171119');occultRing(158,115,9,'#8bb98d');rect(150,120,18,3,'#d0bc77');rect(156,87,6,18,'#9eb6b1');bottle(149,71,'#55c6a4');
   rect(17,128,85,9,'#6a5a49');rect(25,116,18,13,'#8a6a57');rect(48,119,26,8,'#d4c499');text('FORMULA STATION',110,145,6,'#e0d4b4');
   if(revealed&&role==='chameleon'){text('UV - VIAL TAGS FOUND',184,33,6,'#b6eed3');}
 }
 if(stage===2){
   rect(110,28,100,108,'#17121a');rect(119,36,80,97,powered?'#263d2c':'#3b202c');rect(125,42,69,82,powered?'#355240':'#4b2a39');
   for(let i=0;i<4;i++)rect(130,52+i*14,59,3,powered?'#9ee59e':'#f36d72');
   text(powered?'EXIT OPEN':'LOCKDOWN',132,76,9,powered?'#c8f2b7':'#efb6ba');
   monitor(34,39,46,42,'GRID',true);monitor(239,30,47,45,'SECURITY',!powered);rect(47,87,24,33,'#4a3b40');rect(251,89,23,34,'#46373f');
   rect(137,118,41,11,'#74606b');rect(153,123,8,7,powered?'#7de4c9':'#d79b61');
   rect(15,129,90,5,'#7b554a');rect(218,129,88,5,'#7b554a');rect(55,114,5,17,'#b3a070');rect(264,114,5,17,'#b3a070');
   occultRing(160,90,18,powered?'#a2dca4':'#925961');
   text('AUX POWER',19,29,8,'#e3d6c3');text('AI CORE',236,22,7,'#e3b4b3');
   if(powered){rect(114,29,92,4,'#7ee0bd');rect(128,136,60,3,'#76dfb5');}
 }
 function drawMouse(x,y){
   rect(x+7,y+18,13,12,'#8a6c72');rect(x+9,y+12,10,10,'#b5a0a2');rect(x+7,y+5,14,12,'#b8a3a5');
   rect(x+4,y+1,7,7,'#8d7077');rect(x+17,y+1,7,7,'#8d7077');rect(x+6,y+3,4,4,'#d8a4ac');rect(x+18,y+3,4,4,'#d8a4ac');
   rect(x+11,y+10,2,2,'#1d1920');rect(x+16,y+10,2,2,'#1d1920');rect(x+14,y+14,3,2,'#f0d7be');
   rect(x+6,y+18,3,10,'#b8a3a5');rect(x+18,y+18,3,10,'#b8a3a5');rect(x+9,y+30,4,3,'#5f4d57');rect(x+16,y+30,4,3,'#5f4d57');
   rect(x+20,y+21,7,2,'#d0a0a7');rect(x+26,y+22,4,2,'#d0a0a7');rect(x+29,y+23,2,2,'#d0a0a7');
 }
 function drawChameleon(x,y){
   rect(x+8,y+19,15,11,'#507955');rect(x+9,y+11,12,10,'#86b381');rect(x+6,y+5,17,10,'#86b381');
   rect(x+4,y+4,4,4,'#6da171');rect(x+2,y+3,3,4,'#6da171');rect(x+22,y+7,6,4,'#a6d89f');
   rect(x+11,y+9,2,2,'#14201a');rect(x+18,y+9,2,2,'#14201a');rect(x+15,y+13,2,2,'#d6edbb');
   rect(x+7,y+29,4,3,'#36533d');rect(x+18,y+29,4,3,'#36533d');rect(x+10,y+19,3,9,'#86b381');rect(x+20,y+19,3,9,'#86b381');
   rect(x+22,y+20,6,3,'#3a5d43');rect(x+26,y+23,4,3,'#3a5d43');rect(x+23,y+26,4,3,'#86b381');rect(x+20,y+28,3,3,'#3a5d43');
 }
 const actors=game?.status==='playing' && game?.stage===stage ? game.actors : null;
 if(previousCanvasStage!==stage){actorDisplay={mouse:139,chameleon:179};previousCanvasStage=stage;}
 const bob=Math.floor(Date.now()/450)%2;
 for(const kind of ['mouse','chameleon']){
  const target=actors?.[kind]?.x ?? (kind==='mouse'?139:179);
  actorDisplay[kind]+=(target-actorDisplay[kind])*.14;
  if(Math.abs(target-actorDisplay[kind])<.35)actorDisplay[kind]=target;
  const moving=Math.abs(target-actorDisplay[kind])>1.5;
  const working=!!actors?.[kind]?.working;
  const x=Math.round(actorDisplay[kind]),y=140+(moving ? Math.floor(Date.now()/110)%3 : working ? Math.floor(Date.now()/250)%2 : bob);
  if(kind==='mouse')drawMouse(x,y);else drawChameleon(x,y);
  if(working){
    const phase=Math.floor(Date.now()/220)%4;
    const sparks=['✦','⚙','✧','✦'];
    text(sparks[phase],x+11,y-7,13,'#f3d38c');
    rect(x+2,y-13,27,3,'#2b2028');rect(x+2,y-13,8+phase*6,3,'#8fdd97');
    text('WORK',x+3,y-18,6,'#eecdb0');
  }else if(moving){rect(x+8,y+32,4,1,'#c3a38f');rect(x+3,y+32,3,1,'#b68c82');}
 }
 if(stage!==3){text('✦',role==='mouse'?92:241,137,10,'#f5d48b');}
 const glow=c.createRadialGradient(stage===1?162:60,62,5,stage===1?162:60,62,120);
 glow.addColorStop(0,stage===3?'#8ac09333':'#bb314126');glow.addColorStop(1,'#01030c00');c.fillStyle=glow;c.fillRect(0,0,320,180);
 const shade=c.createLinearGradient(0,0,0,180);shade.addColorStop(0,'#1a061155');shade.addColorStop(.6,'#03061100');shade.addColorStop(1,'#14070e66');c.fillStyle=shade;c.fillRect(0,0,320,180);
}

try{const saved=JSON.parse(sessionStorage.getItem('paws-session')||'null');if(saved?.room&&saved?.token){session=saved;connect();}else{landing();}}catch(e){landing();}
