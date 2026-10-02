let mp;
try{mp=await import('./multiplayer.js')}catch(e){
  console.error('Firebase setup problem:',e);
  const why=String(e&&e.message||'').includes('Firebase config')?e.message:'Online play is not set up. Check firebase-config.js';
  const off=()=>{throw new Error(why)};
  mp={me:()=>null,onUser(cb){setTimeout(()=>cb(null))},signIn:off,signUp:off,guest:off,logout:async()=>{},createRoom:off,joinRoom:off,txRoom:off,watchRoom:off,setRoom:off,sendChat:off,watchChat:off,saveProfile:async()=>{},loadProfile:async()=>null};
}

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const NAME={1:'Red',2:'Yellow'};
const S={mode:'pass',level:'medium',first:1,how:'basics'};
let g=null,ctx={hc:-1},upd=false,pendingRoom=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

const show=id=>$$('.sc').forEach(s=>s.hidden=s.id!=id);
const say=(id,m)=>$('#'+id).textContent=m||'';
const fe=e=>({'auth/email-already-in-use':'That username is taken','auth/invalid-credential':'Wrong username or password','auth/user-not-found':'Wrong username or password','auth/wrong-password':'Wrong username or password','auth/operation-not-allowed':'Turn on Email/Password sign-in in Firebase','auth/network-request-failed':'No connection','auth/admin-restricted-operation':'Turn on Anonymous sign-in in Firebase','permission-denied':'The database rules are blocking this. Add the connect4Rooms rules in Firebase.'}[e.code]||e.message||String(e));

/* ---------- rules (pure functions, reused by the computer in step 2) ---------- */
const rowFor=(b,c)=>{for(let r=5;r>=0;r--)if(!b[r*7+c])return r;return -1};
function findWin(b){
  const D=[[0,1],[1,0],[1,1],[1,-1]];
  for(let r=0;r<6;r++)for(let c=0;c<7;c++){
    const p=b[r*7+c];if(!p)continue;
    for(const [dr,dc] of D){
      const cells=[];
      for(let k=0;k<4;k++){const rr=r+dr*k,cc=c+dc*k;if(rr<0||rr>5||cc<0||cc>6||b[rr*7+cc]!=p)break;cells.push(rr*7+cc)}
      if(cells.length==4)return cells;
    }
  }
  return null;
}

/* ---------- sound: your files if present, otherwise synthesised ---------- */
let ac=null,muted=false,soundsLoaded=false;const bufs={};
try{muted=localStorage.getItem('c4_mute')=='1'}catch{}
const audio=()=>{
  if(!ac){try{ac=new(window.AudioContext||window.webkitAudioContext)()}catch{return null}}
  if(ac.state=='suspended')ac.resume();return ac;
};
async function loadSounds(){
  if(soundsLoaded)return;soundsLoaded=true;
  const a=audio();if(!a)return;
  for(const n of ['drop','win','lose','start']){
    try{const r=await fetch(n+'.mp3');if(!r.ok)continue;bufs[n]=await a.decodeAudioData(await r.arrayBuffer())}catch{}
  }
}
document.addEventListener('pointerdown',()=>{audio();loadSounds()},{passive:true});
function playBuf(n,v=1){
  const a=audio(),b=bufs[n];if(!a||muted||!b)return false;
  const s=a.createBufferSource(),gn=a.createGain();gn.gain.value=v;s.buffer=b;s.connect(gn).connect(a.destination);s.start();return true;
}
function tone(f,t0,d,type,v){
  const a=audio();if(!a||muted)return;
  const o=a.createOscillator(),gn=a.createGain(),t=a.currentTime+t0;
  o.type=type;o.frequency.setValueAtTime(f,t);gn.gain.setValueAtTime(v,t);gn.gain.exponentialRampToValueAtTime(.001,t+d);
  o.connect(gn).connect(a.destination);o.start(t);o.stop(t+d);
}
function slide(f0,f1,t0,d,type,v){
  const a=audio();if(!a||muted)return;
  const o=a.createOscillator(),gn=a.createGain(),t=a.currentTime+t0;
  o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+d);
  gn.gain.setValueAtTime(v,t);gn.gain.exponentialRampToValueAtTime(.001,t+d);
  o.connect(gn).connect(a.destination);o.start(t);o.stop(t+d);
}
// short plastic "clack": muffled noise tick plus a low thump
function clack(t0,v,f){
  const a=audio();if(!a||muted)return;
  const t=a.currentTime+t0,n=Math.floor(a.sampleRate*.04),buf=a.createBuffer(1,n,a.sampleRate),ch=buf.getChannelData(0);
  for(let i=0;i<n;i++)ch[i]=(Math.random()*2-1)*Math.pow(1-i/n,3);
  const s=a.createBufferSource(),lp=a.createBiquadFilter(),gn=a.createGain();
  lp.type='lowpass';lp.frequency.value=f;gn.gain.value=v;s.buffer=buf;
  s.connect(lp).connect(gn).connect(a.destination);s.start(t);
  const o=a.createOscillator(),og=a.createGain();
  o.type='sine';o.frequency.setValueAtTime(150+f/12,t);o.frequency.exponentialRampToValueAtTime(70,t+.06);
  og.gain.setValueAtTime(v*.6,t);og.gain.exponentialRampToValueAtTime(.001,t+.08);
  o.connect(og).connect(a.destination);o.start(t);o.stop(t+.09);
}
const sfx={
  drop(){if(playBuf('drop'))return;clack(0,.5,1500);clack(.11,.22,1100);clack(.19,.1,900)},
  start(){if(playBuf('start'))return;[392,523,659,784].forEach((f,i)=>tone(f,i*.11,.22,'triangle',.2));tone(1047,.5,.6,'triangle',.22)},
  win(){if(playBuf('win'))return;[523,659,784,1047,784,1047,1319].forEach((f,i)=>tone(f,i*.13,.32,'triangle',.22));tone(262,0,1,'sine',.14)},
  lose(){if(playBuf('lose'))return;slide(440,110,0,.6,'sawtooth',.13);slide(330,80,.3,.7,'sawtooth',.13)}
};
const setMuteLabel=()=>$('#mute').textContent=muted?'Muted':'Sound';
setMuteLabel();
$('#mute').onclick=()=>{muted=!muted;try{localStorage.setItem('c4_mute',muted?'1':'0')}catch{}setMuteLabel();if(!muted)sfx.drop()};

/* ---------- characters ---------- */
const AVS=['🦁','🐯','🐼','🦊','🐸','🐵','🦄','🐲','🤖','👑','🥷','🧙','👻','🐧','🦖','🐙'];
const myAv=()=>{try{return localStorage.getItem('c4_av')||AVS[0]}catch{return AVS[0]}};
const setAv=a=>{try{localStorage.setItem('c4_av',a)}catch{}if(mp.me())mp.saveProfile(a).catch(()=>{})};
function buildAvGrid(){
  const gr=$('#avgrid');gr.innerHTML='';
  AVS.forEach(a=>{
    const b=document.createElement('button');b.textContent=a;b.setAttribute('aria-label','Character '+a);
    b.classList.toggle('on',a==myAv());
    b.onclick=()=>{setAv(a);buildAvGrid()};gr.append(b);
  });
}

/* ---------- menu ---------- */
function markSeg(){
  $$('.seg').forEach(sg=>[...sg.children].forEach(b=>b.classList.toggle('on',String(S[sg.dataset.k])==b.dataset.v)));
  const bot=S.mode=='bot';$('#lvl').hidden=!bot;$('#lvll').hidden=!bot;
  $$('.hp').forEach(p=>p.hidden=p.dataset.t!=S.how);
}
$$('.seg').forEach(sg=>sg.onclick=e=>{const b=e.target.closest('button');if(!b)return;S[sg.dataset.k]=isNaN(b.dataset.v)?b.dataset.v:+b.dataset.v;markSeg()});
markSeg();

function renderMe(){
  const u=mp.me(),m=$('#me');m.innerHTML='';
  const ab=document.createElement('button');ab.className='avbtn';ab.textContent=myAv();ab.setAttribute('aria-label','Choose your character');
  ab.onclick=()=>{buildAvGrid();show('chars')};m.append(ab);
  const un=document.createElement('span');un.className='uname';un.textContent=u?u.name:'Not signed in';m.append(un);
  const b=document.createElement('button');b.className='btn';
  if(u){b.textContent='Log out';b.onclick=async()=>{await mp.logout();renderMe()}}
  else{b.textContent='Sign in';b.onclick=()=>show('auth')}
  m.append(b);
}
async function syncProfile(){
  try{const p=await mp.loadProfile();if(p&&p.c4av&&p.c4av!=myAv()){try{localStorage.setItem('c4_av',p.c4av)}catch{}renderMe()}}catch{}
}
mp.onUser(u=>{renderMe();if(u)syncProfile();tryPending()});
renderMe();
try{const lu=localStorage.getItem('c4_user');if(lu)$('#u').value=lu}catch{}

function leave(){
  exitRoom();
  [ctx.ru,ctx.cu].forEach(f=>{if(f)try{f()}catch{}});
  ['t1','t2','bt','bk','nx','rr','rt'].forEach(k=>clearTimeout(ctx[k]));clearInterval(ctx.tt);
  ctx={hc:-1};g=null;
  $('#result').hidden=true;$('#dlg').hidden=true;$('#chat').hidden=true;$('#chatbtn').hidden=true;$('#chatbtn').classList.remove('new');
  $('#series').hidden=true;$('#note').textContent='';
  $('#rreplay').textContent='Replay';$('#rreplay').disabled=false;
}
function home(){leave();show('home');renderMe();applyUpdate()}

$$('[data-go]').forEach(b=>b.onclick=()=>{
  const v=b.dataset.go;
  if(v=='how'){S.how='basics';markSeg();return show('how')}
  if(v=='friends')return show(mp.me()?'friends':'auth');
  S.mode=v;markSeg();show('setup');
});

async function doAuth(create){
  const u=$('#u').value.trim(),p=$('#p').value;
  if(!/^[A-Za-z0-9_]{3,14}$/.test(u))return say('aerr','Username: 3-14 letters, numbers or _');
  if(p.length<6)return say('aerr','Password needs 6 or more characters');
  try{
    create?await mp.signUp(u,p):await mp.signIn(u,p);
    try{localStorage.setItem('c4_user',u)}catch{}
    say('aerr');$('#p').value='';
    if(create)mp.saveProfile(myAv()).catch(()=>{});else await syncProfile();
    afterAuth();
  }catch(e){say('aerr',fe(e))}
}
$('#guest').onclick=async()=>{
  const t=$('#u').value.trim(),name=/^[A-Za-z0-9_]{3,14}$/.test(t)?t:'Guest'+(1000+Math.floor(Math.random()*9000));
  try{await mp.guest(name);say('aerr');afterAuth()}catch(e){say('aerr',fe(e))}
};
$('#signin').onclick=()=>doAuth(false);
$('#signup').onclick=()=>doAuth(true);

function afterAuth(){renderMe();if(pendingRoom)tryPending();else if(!ctx.room)show('friends')}

/* ---------- computer ---------- */
const LV={easy:'Easy',medium:'Medium',hard:'Hard',expert:'Expert'};
const valid=b=>[3,2,4,1,5,0,6].filter(c=>b[c]==0);
// would a disc of colour p at (r,c) complete four? (neighbours only, the cell itself may be empty)
function winsAt(b,r,c,p){
  for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
    let n=1;
    for(let s=1;s<4;s++){const rr=r+dr*s,cc=c+dc*s;if(rr<0||rr>5||cc<0||cc>6||b[rr*7+cc]!=p)break;n++}
    for(let s=1;s<4;s++){const rr=r-dr*s,cc=c-dc*s;if(rr<0||rr>5||cc<0||cc>6||b[rr*7+cc]!=p)break;n++}
    if(n>=4)return true;
  }
  return false;
}
const winMove=(b,p)=>{for(const c of valid(b))if(winsAt(b,rowFor(b,c),c,p))return c;return -1};

function moveEasy(b,me){
  let c=winMove(b,me);if(c>=0&&Math.random()<.6)return c;
  c=winMove(b,3-me);if(c>=0&&Math.random()<.35)return c;
  const v=valid(b);return v[Math.floor(Math.random()*v.length)];
}
function moveMedium(b,me){
  let c=winMove(b,me);if(c>=0)return c;
  c=winMove(b,3-me);if(c>=0)return c;
  const v=valid(b),W=[1,2,4,8,4,2,1];let r=Math.random()*v.reduce((a,x)=>a+W[x],0);
  for(const x of v){r-=W[x];if(r<0)return x}
  return v[0];
}

// all 69 four-cell windows, for the position score
const WINDOWS=[];
for(let r=0;r<6;r++)for(let c=0;c<7;c++)for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
  const er=r+dr*3,ec=c+dc*3;if(er<0||er>5||ec<0||ec>6)continue;
  WINDOWS.push([0,1,2,3].map(k=>(r+dr*k)*7+c+dc*k));
}
// score from p's point of view: centre control plus open threes and twos (expert weighs threats more)
function evalBoard(b,p,deep){
  const o=3-p,w3=deep?7:4;let s=0;
  for(let r=0;r<6;r++){const x=b[r*7+3];if(x==p)s+=4;else if(x==o)s-=4;
    const y=b[r*7+2],z=b[r*7+4];if(y==p)s+=1;else if(y==o)s-=1;if(z==p)s+=1;else if(z==o)s-=1}
  for(const w of WINDOWS){
    let m=0,t=0;for(let k=0;k<4;k++){const x=b[w[k]];if(x==p)m++;else if(x==o)t++}
    if(m&&t)continue;
    if(m==3)s+=w3;else if(m==2)s+=2;
    if(t==3)s-=w3+1;else if(t==2)s-=2;
  }
  return s;
}

const WIN=100000;
// negamax with alpha-beta, iterative deepening and a time limit; me = 1 or 2
function search(b0,me,maxDepth,ms,deep){
  const b=Int8Array.from(b0),h=new Int8Array(7);let pieces=0;
  for(let i=0;i<42;i++)if(b[i]){h[i%7]++;pieces++}
  // centre-first move order, ties between mirrored columns shuffled so games differ
  const ord=[3,...[[2,4],[1,5],[0,6]].flatMap(p=>Math.random()<.5?p:[p[1],p[0]])];
  let nodes=0,stop=false;const dl=Date.now()+ms;
  function nm(p,d,al,be,ply,moves){
    if((++nodes&2047)==0&&Date.now()>dl)stop=true;
    if(stop)return 0;
    if(moves==42)return 0;
    const o=3-p;
    for(const c of ord)if(h[c]<6&&winsAt(b,5-h[c],c,p))return WIN-ply;
    let cand=ord;const blocks=[];
    for(const c of ord)if(h[c]<6&&winsAt(b,5-h[c],c,o))blocks.push(c);
    if(blocks.length>1)return -(WIN-ply-1);
    if(blocks.length==1)cand=blocks;
    if(d==0)return evalBoard(b,p,deep);
    let best=-Infinity;
    for(const c of cand){
      if(h[c]>=6)continue;
      const r=5-h[c];b[r*7+c]=p;h[c]++;
      const v=-nm(o,d-1,-be,-al,ply+1,moves+1);
      h[c]--;b[r*7+c]=0;
      if(stop)return 0;
      if(v>best)best=v;
      if(best>al)al=best;
      if(al>=be)break;
    }
    return best;
  }
  let rootOrd=ord.filter(c=>h[c]<6),bestMove=rootOrd[0];
  for(let d=1;d<=maxDepth;d++){
    let bestV=-Infinity,bm=null,al=-Infinity;
    for(const c of rootOrd){
      const r=5-h[c];
      if(winsAt(b,r,c,me))return c;
      b[r*7+c]=me;h[c]++;
      const v=-nm(3-me,d-1,-Infinity,-al,1,pieces+1);
      h[c]--;b[r*7+c]=0;
      if(stop)break;
      if(v>bestV){bestV=v;bm=c}
      if(bestV>al)al=bestV;
    }
    if(stop||bm===null)break;
    bestMove=bm;
    rootOrd=[bm,...rootOrd.filter(x=>x!=bm)];
    if(Math.abs(bestV)>WIN-100)break;
  }
  return bestMove;
}
const pickMove=(b,me,lvl)=>lvl=='easy'?moveEasy(b,me):lvl=='medium'?moveMedium(b,me):lvl=='hard'?search(b,me,5,1200,false):search(b,me,8,1800,true);

// the computer is always Yellow (seat 2); it "thinks" for a moment so the human can follow
function botTurn(){
  clearTimeout(ctx.bt);
  if(!g||!g.bot||g.st!='play'||g.turn!=2)return;
  ctx.bt=setTimeout(()=>{
    if(!g||g.st!='play'||g.turn!=2||g.busy)return;
    const t0=Date.now(),c=pickMove(g.b,2,g.level),left=Math.max(0,650-(Date.now()-t0));
    ctx.bt=setTimeout(()=>drop(c,true),left);
  },450);
}

/* ---------- start a game ---------- */
$('#play').onclick=startGame;
function startGame(){
  leave();
  const first=S.first=='r'?1+Math.floor(Math.random()*2):+S.first;
  const u=mp.me(),a1=myAv(),a2=AVS[(AVS.indexOf(a1)+1)%AVS.length],bot=S.mode=='bot';
  g={b:Array(42).fill(0),turn:first,moves:0,win:[],st:'play',busy:false,bot,level:S.level,idle:0,
     names:{1:u&&u.name||(bot?'You':'Player 1'),2:bot?'Computer':'Player 2'},avs:{1:a1,2:bot?'🤖':a2}};
  show('game');$('#series').hidden=true;note('');buildCards();buildBoard();status();sfx.start();botTurn();humanTimer();
}

// online, every player sees themselves as Red (view colour 1) and the other player as Yellow
const vc=s=>g.online?(s==g.seat?1:2):s;
const seatOf=v=>g.online?(v==1?g.seat:3-g.seat):v;
const myTurn=()=>!g?false:g.online?g.turn==g.seat:g.bot?g.turn==1:true;
function buildCards(){
  const el=$('#cards');el.innerHTML='';
  [1,2].forEach(v=>{
    const s=seatOf(v);
    const d=document.createElement('div');d.className='pc p'+v+(v==2?' r':'');d.dataset.s=s;
    d.innerHTML='<span class="av"></span><div class="pn"><b></b><small></small></div><i class="chip"></i>';
    d.querySelector('.av').textContent=g.avs[s];
    d.querySelector('b').textContent=g.names[s];
    d.querySelector('small').textContent=NAME[v]+(g.bot&&v==2?' · '+LV[g.level]:'');
    el.append(d);
  });
  markCards();
}
const markCards=()=>$$('.pc').forEach(d=>d.classList.toggle('act',!!g&&g.st=='play'&&+d.dataset.s==g.turn));

function status(){
  const s=$('#status');s.innerHTML='';
  if(!g)return;
  const i=document.createElement('i');i.style.background=vc(g.turn)==1?'var(--red)':'var(--yel)';
  const t=document.createElement('span');
  const w0=g.win.length?g.b[g.win[0]]:0;
  if(g.online)t.textContent=g.st=='play'?(g.turn==g.seat?'Your turn':g.names[g.turn]+"'s turn"):g.st=='series'?'Series over':w0?(w0==g.seat?'You win this game':g.names[w0]+' wins this game'):'Draw';
  else t.textContent=g.st=='done'?(g.win.length?g.names[g.b[g.win[0]]]+' wins':'Draw'):g.bot?(g.turn==1?'Your turn':'Computer is thinking'):g.names[g.turn]+"'s turn";
  s.append(i,t);
}

/* ---------- board ---------- */
function disc(p,r,c){
  const d=document.createElement('div');d.className='d p'+p;
  d.style.setProperty('--r',r);d.style.setProperty('--c',c);d.dataset.i=r*7+c;
  d.innerHTML='<span class="dc"></span>';return d;
}
function buildBoard(){
  const b=$('#board');
  b.innerHTML='<div id="pv"></div><div id="plate"><div id="bfrm"><div id="dl"></div><div id="face"></div><div id="ring"></div><div id="bev"></div><div id="wl"></div><div id="cols"></div></div></div><div id="feet"><i></i><i></i></div>';
  const cs=$('#cols');
  for(let c=0;c<7;c++){
    const k=document.createElement('button');k.setAttribute('aria-label','Drop in column '+(c+1));
    k.onpointerenter=e=>{if(e.pointerType!='touch'){ctx.hc=c;preview()}};
    k.onpointerleave=()=>{ctx.hc=-1;preview()};
    k.onfocus=()=>{ctx.hc=c;preview()};
    k.onblur=()=>{ctx.hc=-1;preview()};
    k.onclick=()=>drop(c);
    cs.append(k);
  }
  syncCols();
}
function syncCols(){
  $$('#cols button').forEach((k,c)=>k.disabled=!g||g.st!='play'||g.busy||g.sending||!myTurn()||g.b[c]!=0);
}
function preview(){
  const e=$('#pv');if(!e)return;e.innerHTML='';
  if(!g||g.st!='play'||g.busy||g.sending||!myTurn()||ctx.hc<0||rowFor(g.b,ctx.hc)<0)return;
  e.append(disc(vc(g.turn),0,ctx.hc));
}

function drop(c,byBot,auto){
  if(!g||g.st!='play'||g.busy)return;
  if(!byBot&&!myTurn())return;
  if(g.online)return sendMove(c);
  if(g.bot&&g.turn==1&&!auto)g.idle=0;
  const r=rowFor(g.b,c);if(r<0)return;
  const p=g.turn;g.busy=true;g.b[r*7+c]=p;g.moves++;
  preview();syncCols();
  const d=disc(vc(p),r,c),dur=reduced?.05:.5+.07*r;
  d.classList.add('fall');d.style.setProperty('--t',dur+'s');
  $('#dl').append(d);
  ctx.t1=setTimeout(sfx.drop,dur*620);
  ctx.t2=setTimeout(()=>{g.busy=false;afterMove()},dur*1000);
}

function afterMove(){
  const w=findWin(g.b);
  if(w){g.win=w;g.st='done'}
  else if(g.moves>=42)g.st='done';
  else g.turn=3-g.turn;
  markCards();status();syncCols();preview();
  if(g.st!='done'){botTurn();humanTimer();return}
  stopTimer();
  if(g.win.length){
    markWin(g.win);
    if(g.bot&&g.b[g.win[0]]==2)sfx.lose();else sfx.win();
  }else sfx.lose();
  ctx.t1=setTimeout(showResult,g.win.length?1300:600);
}

/* ---------- online rooms: lobby, best-of-5 series, timers, chat ---------- */
const TARGET=3,TURN_MS=10000;   // 5 games at most, first to 3 wins the series; 10 seconds per turn
const zeros=()=>Array(42).fill(0);
const inviteUrl=code=>location.origin+location.pathname.replace(/index\.html$/,'')+'?room='+code;

// Pure patch builders. They run inside Firestore transactions, so they only look at the room data they are given.
function applyMove(d,seat,col,auto){
  if(d.status!='play'||d.turn!=seat)return null;
  const r=rowFor(d.b,col);if(r<0)return null;
  const b=d.b.slice();b[r*7+col]=seat;
  const p={b,moves:d.moves+1,lc:col};
  p['idle'+seat]=auto?(d['idle'+seat]||0)+1:0;
  const w=findWin(b);
  if(w){
    p.win=w;const k='s'+seat,n=(d[k]||0)+1;p[k]=n;
    if(n>=TARGET){p.status='series';p.sw=seat;p.why='win'}else p.status='done';
  }else if(p.moves>=42){p.win=[];p.status='done'}
  else p.turn=3-seat;
  return p;
}
// the player ran out of time: play a move for them, or forfeit the series on the third missed turn in a row
function timeoutPatch(d,gid,moves){
  if(d.status!='play'||d.gid!=gid||d.moves!=moves)return null;
  const seat=d.turn,n=(d['idle'+seat]||0)+1;
  if(n>=3)return {status:'series',sw:3-seat,why:'forfeit',['idle'+seat]:n};
  return applyMove(d,seat,pickMove(d.b,seat,'medium'),true);
}
const startPatch=d=>{
  const starter=d.status=='lobby'?1:3-d.starter;
  return {status:'play',b:zeros(),turn:starter,starter,moves:0,win:[],game:1,gid:d.gid+1,s1:0,s2:0,idle1:0,idle2:0,rm1:false,rm2:false,sw:0,why:'',gone:0,lc:-1};
};
function nextGamePatch(d,gid){
  if(d.status!='done'||d.gid!=gid)return null;
  const starter=3-d.starter,decided=d.win&&d.win.length>0;   // a draw replays the same game number
  return {status:'play',b:zeros(),turn:starter,starter,moves:0,win:[],game:decided?d.game+1:d.game,gid:d.gid+1,idle1:0,idle2:0,lc:-1};
}

/* ---- joining ---- */
function enterRoom(code){
  leave();ctx.room=code;ctx.seen=0;ctx.cl=0;
  show('lobby');$('#rcode').textContent=code;say('lmsg','Connecting...');$('#start').hidden=true;$('#plist').innerHTML='';
  $('#chatbtn').hidden=false;
  ctx.ru=mp.watchRoom(code,onRoom,e=>roomGone(fe(e)));
  ctx.cu=mp.watchChat(code,onChat);
}
function roomGone(msg){ctx.room=null;home();ask('Room closed',msg,'OK',()=>{},true)}
$('#create').onclick=async()=>{
  say('ferr');
  try{enterRoom(await mp.createRoom(myAv()))}catch(e){say('ferr',fe(e))}
};
async function joinCode(c){
  try{await mp.joinRoom(c,myAv());enterRoom(c)}catch(e){show('friends');say('ferr',fe(e))}
}
$('#join').onclick=()=>{
  const c=$('#code').value.trim();
  if(!/^\d{4}$/.test(c))return say('ferr','Enter the 4-digit room code');
  say('ferr');joinCode(c);
};
// an invite link (?room=1234) joins automatically once the player is signed in
(()=>{const q=new URLSearchParams(location.search).get('room');if(/^\d{4}$/.test(q||'')){pendingRoom=q;history.replaceState(null,'',location.pathname)}})();
function tryPending(){
  if(!pendingRoom)return;
  if(!mp.me()){if(cur()!='auth'){say('aerr','Sign in or play as guest to join room '+pendingRoom);show('auth')}return}
  const c=pendingRoom;pendingRoom=null;joinCode(c);
}
$('#wa').onclick=()=>window.open('https://wa.me/?text='+encodeURIComponent('Join my Connect Four game! Room code '+ctx.room+'\n'+inviteUrl(ctx.room)),'_blank');
$('#copy').onclick=async()=>{
  try{await navigator.clipboard.writeText(inviteUrl(ctx.room));say('lmsg','Invite link copied')}
  catch{say('lmsg','Could not copy. Long-press the link below.')}
};
$('#start').onclick=()=>mp.txRoom(ctx.room,d=>d.status=='lobby'&&d.players.length==2?startPatch(d):null).catch(e=>say('lmsg',fe(e)));

function renderLobby(d){
  const ul=$('#plist');ul.innerHTML='';
  d.players.forEach((p,i)=>{
    const li=document.createElement('li');li.style.setProperty('--c',i+1==ctx.seat?'var(--red)':'var(--yel)');
    li.textContent=(p.av||'')+' '+p.name+(i==0?' (host)':'');ul.append(li);
  });
  const full=d.players.length>=2;
  say('lmsg',full?(ctx.seat==1?'Your friend is here. Tap Start game.':'Waiting for the host to start...'):'Waiting for a friend to join...');
  $('#start').hidden=!(ctx.seat==1&&full);
  $('#link').textContent=inviteUrl(ctx.room);
}

/* ---- room updates ---- */
function onRoom(d){
  if(!ctx.room)return;
  if(!d)return roomGone('That room no longer exists.');
  const u=mp.me(),idx=u?d.players.findIndex(p=>p.uid==u.uid):-1;
  if(idx<0)return roomGone('You are no longer in this room.');
  ctx.rd=d;ctx.seat=idx+1;
  if(d.status=='closed')return roomGone('The host closed the room.');
  if(d.status=='lobby'){if(cur()=='lobby')renderLobby(d);return}
  if(!g||!g.online||g.code!=ctx.room)startOnline(d);
  applySnap(d);
}
function startOnline(d){
  const pl=d.players;
  g={online:true,code:ctx.room,seat:ctx.seat,names:{1:pl[0].name,2:pl[1]?pl[1].name:'?'},avs:{1:pl[0].av||'🙂',2:pl[1]?(pl[1].av||'🙂'):'🙂'},
     b:zeros(),shown:zeros(),turn:d.turn,st:d.status,win:[],busy:false,sending:false,gid:-1,idle:0};
  show('game');$('#series').hidden=false;buildCards();buildBoard();
}
function syncDiscs(b){
  const dl=$('#dl');dl.innerHTML='';
  b.forEach((s,i)=>{if(s)dl.append(disc(vc(s),Math.floor(i/7),i%7))});
  g.shown=b.slice();
}
function applySnap(d){
  if(!g||!g.online)return;
  if(g.busy){g.pend=d;return}
  g.d=d;
  if(d.gid!==g.gid){
    const first=g.gid==-1;
    g.gid=d.gid;g.fin=null;g.tkey=null;
    $('#result').hidden=true;$('#wl').innerHTML='';note('');
    clearTimeout(ctx.rt);clearTimeout(ctx.nx);
    syncDiscs(d.b);if(!first)sfx.start();
    return afterSync(d);
  }
  const add=[];let bad=false;
  for(let i=0;i<42;i++)if(d.b[i]!=g.shown[i]){if(!g.shown[i])add.push(i);else bad=true}
  if(bad||add.length>1){syncDiscs(d.b);return afterSync(d)}
  if(add.length==1)return animateIn(d,add[0]);
  afterSync(d);
}
function animateIn(d,i){
  const r=Math.floor(i/7),c=i%7,seat=d.b[i];
  g.busy=true;preview();syncCols();
  const el=disc(vc(seat),r,c),dur=reduced?.05:.5+.07*r;
  el.classList.add('fall');el.style.setProperty('--t',dur+'s');$('#dl').append(el);
  ctx.t1=setTimeout(sfx.drop,dur*620);
  ctx.t2=setTimeout(()=>{
    if(!g)return;
    g.busy=false;g.shown[i]=seat;
    const p=g.pend;g.pend=null;
    if(p)applySnap(p);else afterSync(d);
  },dur*1000);
}
function afterSync(d){
  if(!g)return;
  g.d=d;g.b=d.b.slice();g.turn=d.turn;g.st=d.status;g.win=d.win||[];g.sending=false;
  markCards();status();syncCols();preview();seriesLine(d);
  const key=d.gid+'/'+d.status+'/'+d.moves;
  if(d.status=='play'){
    $('#result').hidden=true;
    if(g.tkey!=key){g.tkey=key;timerOnline(d)}
    return;
  }
  stopTimer();g.tkey=null;
  if(d.status=='series')rematchUi(d);
  if(g.fin==key)return;
  g.fin=key;
  const w=g.win.length?g.b[g.win[0]]:0;
  if(w){markWin(g.win);if(w==g.seat)sfx.win();else sfx.lose()}
  if(d.status=='done'){
    note(w?(w==g.seat?'You won game '+d.game+'.':g.names[w]+' won game '+d.game+'.')+' Next game starting...':'Draw. Replaying this game...');
    const code=g.code,gid=d.gid;
    ctx.nx=setTimeout(()=>mp.txRoom(code,x=>nextGamePatch(x,gid)).catch(()=>{}),g.seat==1?4000:6000);
  }else ctx.rt=setTimeout(()=>showOnlineResult(g&&g.d),w?1300:300);
}
function seriesLine(d){
  const me=g.seat,opp=3-me;
  $('#series').textContent='Game '+d.game+' of 5 · First to '+TARGET+' · You '+(d['s'+me]||0)+' – '+(d['s'+opp]||0)+' '+g.names[opp];
}
function note(m){$('#note').textContent=m||''}

/* ---- playing ---- */
async function sendMove(c){
  if(g.sending)return;
  g.sending=true;syncCols();
  const gid=g.gid,seat=g.seat;
  try{await mp.txRoom(g.code,d=>d.gid==gid?applyMove(d,seat,c,false):null)}
  catch(e){note(fe(e));if(g)g.sending=false;syncCols()}
}
const autoPlay=(code,gid,mv)=>mp.txRoom(code,d=>timeoutPatch(d,gid,mv)).catch(()=>{});
// the player whose turn it is acts at 10 seconds; the other phone steps in 6 seconds later in case that player went offline
function timerOnline(d){
  const gid=d.gid,mv=d.moves,mine=d.turn==g.seat,code=g.code;
  startTimer(d.turn,()=>{if(mine)autoPlay(code,gid,mv);else ctx.bk=setTimeout(()=>autoPlay(code,gid,mv),6000)});
}

/* ---- timer (online and against the computer) ---- */
function stopTimer(){clearInterval(ctx.tt);clearTimeout(ctx.bk);$$('.pc').forEach(d=>delete d.dataset.t)}
function startTimer(seat,onTimeout){
  stopTimer();
  const end=Date.now()+TURN_MS,card=$('.pc[data-s="'+seat+'"]');
  const tick=()=>{
    const left=Math.max(0,Math.ceil((end-Date.now())/1000));
    if(card)card.dataset.t=left;
    if(left<=0){clearInterval(ctx.tt);onTimeout()}
  };
  tick();ctx.tt=setInterval(tick,250);
}
function humanTimer(){if(g&&g.bot&&g.st=='play'&&g.turn==1)startTimer(1,botAutoPlay);else stopTimer()}
function botAutoPlay(){
  if(!g||g.st!='play'||g.turn!=1||g.busy)return;
  g.idle=(g.idle||0)+1;
  if(g.idle>=3){stopTimer();g.st='done';syncCols();ask('Game closed','You missed 3 turns in a row, so the game was closed.','OK',home,true);return}
  drop(pickMove(g.b,1,'medium'),true,true);
}

/* ---- series result and rematch ---- */
function showOnlineResult(d){
  if(!g||!g.online||!d||d.status!='series')return;
  const me=g.seat,opp=3-me,iWon=d.sw==me,list=$('#rlist');list.innerHTML='';
  let title;
  if(d.why=='win')title=iWon?'You win the series!':g.names[opp]+' wins the series';
  else if(d.why=='forfeit')title=iWon?g.names[opp]+' timed out. You win!':'You timed out. Series lost';
  else title=iWon?g.names[opp]+' left. You win!':'You left the series';
  $('#rtitle').textContent=title;
  [d.sw,3-d.sw].forEach((s,i)=>{
    const row=document.createElement('div');row.className='rrow'+(i==0?' r0':'');
    const av=document.createElement('span');av.className='rav';av.textContent=g.avs[s];
    const nm=document.createElement('span');nm.className='nm';nm.textContent=g.names[s]+(s==me?' (you)':'');
    const n=d['s'+s]||0,tag=document.createElement('span');tag.textContent=n+(n==1?' game won':' games won');
    row.append(av,nm,tag);list.append(row);
  });
  confetti(iWon);
  $('#result').hidden=false;rematchUi(d);
}
function rematchUi(d){
  const b=$('#rreplay'),mine=!!d['rm'+g.seat];
  b.textContent=d.gone?'Opponent left':mine?'Waiting...':'Rematch';
  b.disabled=!!d.gone||mine;
  if(d.rm1&&d.rm2){
    clearTimeout(ctx.rr);const code=g.code;
    ctx.rr=setTimeout(()=>mp.txRoom(code,x=>x.status=='series'&&x.rm1&&x.rm2?startPatch(x):null).catch(()=>{}),g.seat==1?0:2500);
  }
}

/* ---- leaving ---- */
function exitRoom(){
  const code=ctx.room,seat=ctx.seat,d=ctx.rd,u=mp.me();
  if(!code||!seat||!u)return;
  let job;
  if(!d||d.status=='lobby'){
    job=seat==1?mp.txRoom(code,x=>x.status=='lobby'?{status:'closed'}:null)
               :mp.txRoom(code,x=>x.status=='lobby'?{players:x.players.filter(p=>p.uid!=u.uid)}:null);
  }else{
    job=mp.txRoom(code,x=>(x.status=='play'||x.status=='done')?{status:'series',sw:3-seat,why:'left',gone:seat}:{gone:seat});
  }
  Promise.resolve(job).catch(()=>{});
}

/* ---- chat ---- */
function onChat(list){
  const box=$('#msgs'),u=mp.me();box.innerHTML='';
  list.forEach(m=>{
    const e=document.createElement('div');e.className='m'+(u&&m.uid==u.uid?' me':'');
    const b=document.createElement('b');b.textContent=m.name;
    const t=document.createElement('span');t.textContent=m.text;
    e.append(b,t);box.append(e);
  });
  box.scrollTop=box.scrollHeight;
  ctx.cl=list.length;
  if($('#chat').hidden){if(ctx.cl>(ctx.seen||0))$('#chatbtn').classList.add('new')}else ctx.seen=ctx.cl;
}
$('#chatbtn').onclick=()=>{$('#chat').hidden=false;ctx.seen=ctx.cl||0;$('#chatbtn').classList.remove('new');$('#msgs').scrollTop=$('#msgs').scrollHeight};
$('#cclose').onclick=()=>{$('#chat').hidden=true};
async function sendChatMsg(){
  const t=$('#ct').value.trim();if(!t||!ctx.room)return;
  $('#ct').value='';
  try{await mp.sendChat(ctx.room,t.slice(0,200))}catch(e){note(fe(e))}
}
$('#send').onclick=sendChatMsg;
$('#ct').onkeydown=e=>{if(e.key=='Enter')sendChatMsg()};

function markWin(cells){
  const wl=$('#wl');wl.innerHTML='';
  cells.forEach(i=>{
    const m=document.createElement('div');m.className='wm';
    m.style.setProperty('--r',Math.floor(i/7));m.style.setProperty('--c',i%7);wl.append(m);
    const d=$('#dl .d[data-i="'+i+'"]');if(d)d.classList.add('win');
  });
}

/* ---------- results ---------- */
function confetti(on){
  const cf=$('#confetti');cf.innerHTML='';
  if(on&&!reduced)for(let i=0;i<26;i++){
    const s=document.createElement('span');s.textContent=['🎉','✨','⭐','🎊'][i%4];
    s.style.left=Math.random()*100+'%';s.style.animationDuration=3+Math.random()*3+'s';s.style.animationDelay=Math.random()*3+'s';cf.append(s);
  }
}
function showResult(){
  if(!g||g.st!='done')return;
  const win=g.win.length?g.b[g.win[0]]:0,list=$('#rlist');list.innerHTML='';
  $('#rtitle').textContent=!win?"It's a draw":g.bot?(win==1?'You win!':'Computer wins!'):g.names[win]+' wins!';
  const order=win?[win,3-win]:[1,2];
  order.forEach((p,i)=>{
    const row=document.createElement('div');row.className='rrow'+(win&&i==0?' r0':'');
    const av=document.createElement('span');av.className='rav';av.textContent=g.avs[p];
    const nm=document.createElement('span');nm.className='nm';nm.textContent=g.names[p]+' ('+NAME[p]+')';
    const tag=document.createElement('span');tag.textContent=!win?'Draw':i==0?'Winner':'Loser';
    row.append(av,nm,tag);list.append(row);
  });
  confetti(!!win);
  $('#rreplay').textContent='Replay';$('#rreplay').disabled=false;
  $('#result').hidden=false;
}
$('#rmenu').onclick=home;
$('#rreplay').onclick=()=>{
  if(g&&g.online){const seat=g.seat;mp.txRoom(g.code,x=>x.status=='series'?{['rm'+seat]:true}:null).catch(()=>{});return}
  $('#result').hidden=true;startGame();
};
$('#rshare').onclick=()=>shareApp('I just played Supermania Connect Four! Come play with me:');

/* ---------- share app ---------- */
async function shareApp(text){
  const url=location.origin+location.pathname.replace(/index\.html$/,'');
  text=text||'Play Supermania Connect Four with me!';
  if(navigator.share){try{await navigator.share({title:'Supermania Connect Four',text,url});return}catch(e){if(e.name=='AbortError')return}}
  window.open('https://wa.me/?text='+encodeURIComponent(text+'\n'+url),'_blank');
}
$('#shareapp').onclick=()=>shareApp();

/* ---------- "are you sure?" and the phone's back button ---------- */
function ask(title,text,yes,cb,info){
  $('#dno').hidden=!!info;
  $('#dt').textContent=title;$('#dp').textContent=text;$('#dyes').textContent=yes;
  $('#dyes').onclick=()=>{closeDlg();cb()};$('#dno').onclick=closeDlg;$('#dlg').hidden=false;
}
const closeDlg=()=>{$('#dlg').hidden=true};
const cur=()=>($$('.sc').find(s=>!s.hidden)||{}).id;
function leaveFlow(){
  const sc=cur();
  if(sc=='game'&&g&&(g.online?(g.st=='play'||g.st=='done'):g.st!='done'))ask('Leave game?',g.online?'Leaving now means you forfeit the series.':'Your game will be lost.','Leave',home);
  else home();
}
$$('[data-back]').forEach(b=>b.onclick=leaveFlow);
let armed=false,exiting=false;
document.addEventListener('pointerdown',()=>{if(!armed){armed=true;history.pushState({sm:1},'')}},{passive:true});
addEventListener('popstate',()=>{
  armed=false;
  if(exiting)return;
  if(!$('#dlg').hidden){closeDlg();return}
  if(!$('#result').hidden){home();return}
  if(cur()=='home')ask('Exit app?','Do you want to exit Supermania Connect Four?','Exit',()=>{exiting=true;try{window.close()}catch{}history.go(-2)});
  else leaveFlow();
});

/* ---------- updates come from the network, never a stale cache ---------- */
if('serviceWorker' in navigator){
  const had=!!navigator.serviceWorker.controller;let reloaded=false;
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>{
    r.update();
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState=='visible')r.update()});
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!reloaded){reloaded=true;upd=true;applyUpdate()}});
}
// Resuming an installed app does not reload it, so compare the files on the server with the ones this
// page started with. A newer version reloads the app as soon as it is on a menu screen (never mid-game).
async function fileSig(){
  let h=0;
  for(const f of ['index.html','main.js','multiplayer.js','style.css','manifest.json','firebase-config.js']){
    const r=await fetch(f,{cache:'no-store'});if(!r.ok)throw 0;
    const t=await r.text();for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))|0;
  }
  return h;
}
let sig0=null;
async function checkUpdate(){
  if(!navigator.onLine||document.visibilityState!='visible')return;
  try{const s=await fileSig();if(sig0===null)sig0=s;else if(s!==sig0)upd=true}catch{}
  applyUpdate();
}
function applyUpdate(){
  if(!upd)return;
  if(!['home','how','setup','chars','auth','friends'].includes(cur())||!$('#result').hidden||!$('#dlg').hidden)return;
  location.reload();
}
checkUpdate();
document.addEventListener('visibilitychange',checkUpdate);
setInterval(checkUpdate,120000);

/* ---------- install button ---------- */
let installEvt=null;
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
let installedNow=false;
const showInstall=()=>{$('#install').hidden=!!standalone||installedNow};
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;showInstall()});
addEventListener('appinstalled',()=>{installEvt=null;installedNow=true;showInstall()});
$('#install').onclick=async()=>{
  if(installEvt){installEvt.prompt();await installEvt.userChoice;installEvt=null;showInstall()}
  else if(isIOS)ask('Install on iPhone','Tap the Share button in Safari, then choose Add to Home Screen.','OK',()=>{},true);
  else installHelp();
};
// the browser has not offered its install prompt: say why it may be, and show what it sees
async function installHelp(){
  let m={};const mu=document.querySelector('link[rel=manifest]').href;
  try{m=await (await fetch(mu,{cache:'no-store'})).json()}catch{}
  const start=new URL(m.start_url||'.',mu),id=m.id?new URL(m.id,start.origin).href:'(none)',scope=new URL(m.scope||'.',mu).href;
  ask('Install app',
   'Chrome has not offered its install prompt. Try the 3 dot menu, then Install app or Add to Home screen.\n\n'+
   'If it says already installed, uninstall the older copy (long-press its icon, Uninstall), then clear this site\'s data in Chrome and reload.\n\n'+
   'This app sees:\nid: '+id+'\nscope: '+scope,'OK',()=>{},true);
}
showInstall();
