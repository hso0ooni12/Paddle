const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(function defineSmokeTests(){
  const source=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const match=source.match(/<script>([\s\S]*?)<\/script>/);
  if(!match)throw Error('Application script not found');
  const startup="window.addEventListener('beforeprint',renderPrintReport);initializeApp();bindProControls();setupWelcome();setupMobileExperience();";
  if(!match[1].includes(startup))throw Error('Application startup marker missing');
  const js=match[1].replace(startup,'');
  function createHarness(){
    const mock=String.raw`
const log={drawn:0,downloads:0,notes:[],renders:0};
const nodes={};let store={},quota=false;
function node(id){return nodes[id] ||= {id,value:'',innerHTML:'',textContent:'',disabled:false,
classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelectorAll(){return []},
cloneNode(){return node(id)},replaceWith(){},focus(){},scrollIntoView(){}}}
const document={getElementById:id=>node(id),addEventListener(){},querySelectorAll(){return []},
fonts:{ready:Promise.resolve()},body:{appendChild(){}},createElement(tag){
if(tag==='canvas')return{width:0,height:0,getContext(){return{
beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},closePath(){},fill(){},
stroke(){},fillRect(){},fillText(){log.drawn++},measureText(v){return{width:String(v).length*11}}
}},toBlob(cb){cb({size:999,type:'image/png'})}};
if(tag==='a')return{href:'',download:'',style:{},click(){log.downloads++},remove(){}};
return node(tag);
}};
const localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{if(quota)throw Error('quota');store[k]=v},
removeItem:k=>delete store[k]},sessionStorage={getItem(){return null},setItem(){}},
navigator={userAgent:'Desktop',platform:'Linux',maxTouchPoints:0},window={addEventListener(){}},
confirm=()=>true,setTimeout=()=>0,URL={createObjectURL:()=> 'blob:test',revokeObjectURL(){}};
`;
    const end=String.raw`
render=()=>log.renders++;
refreshLiveScoreUI=()=>{};
notify=message=>log.notes.push(message);
return{set:s=>state=s,get:()=>state,resetCurrent,normalizeTeams,
  score:addMatchPoint,undo:undoMatchPoint,finish:finishMatch,
  ensure:ensureMatchScoreboard,validate:validateSessionData,
  choose:choosePlayers,teams:chooseBalancedTeams,
  renderPrintReport,reportPerformance,downloadReportImage,setMatchTarget,
  renameSessionPlayer,addSessionPlayers,renderPlayersManager,
  save,log,nodes,quota:v=>quota=v,storage:store,restore:restoreLastSession,
  newDayBackup:saveSession};
`;
    return new Function(mock+js+end)();
  }
  const fixture=(n=6,format=4)=>({players:Array.from({length:n},(_,i)=>({
    id:'p'+i,name:'لاعب '+(i+1),matches:0,wins:0,losses:0,lastPlayed:null
  })),format,matches:[],current:null,started:false,resting:[],sessionStartedAt:'2026-09-22T10:00:00.000Z'});
  test('JavaScript parses and all obsolete duplicate functions are gone',()=>{
    assert.doesNotThrow(()=>new Function(match[1]));
    for(const name of ['choosePlayers','render','renderReport','startSession']){
      const count=(match[1].match(new RegExp('function '+name+'\\(','g'))||[]).length;
      assert.equal(count,1,name+' duplicated');
    }
    assert.equal((match[1].match(/data-court-half="[AB]"/g)||[]).length,2);
    assert.ok(!source.includes('id="historyCard"'));
    assert.ok(!source.includes('id="sessionsCard"'));
    assert.ok(source.includes('id="restoreLastSessionBtn"'));
  });
  test('Score: deuce, advantage, undo, first to four and no double finish',()=>{
    const app=createHarness();app.set(fixture());app.resetCurrent();
    assert.equal(app.get().current.players.length,4);
    app.normalizeTeams(app.get().current.players);app.get().started=true;
    app.score('Z');assert.equal(app.ensure().history.length,0);
    for(let i=0;i<3;i++){app.score('A');app.score('B')}
    assert.equal(app.ensure().pointA,3);assert.equal(app.ensure().pointB,3);
    app.score('A');assert.equal(app.ensure().adv,'A');
    app.score('B');assert.equal(app.ensure().adv,null);
    app.score('B');assert.equal(app.ensure().adv,'B');
    app.score('B');assert.equal(app.ensure().gamesB,1);
    app.undo();assert.equal(app.ensure().gamesB,0);assert.equal(app.ensure().adv,'B');
    app.score('B');
    for(let g=0;g<3;g++)for(let p=0;p<4;p++)app.score('B');
    assert.equal(app.ensure().complete,true);assert.equal(app.get().current.winner,'B');
    app.finish();assert.equal(app.get().matches.length,1);
    assert.equal(app.get().players.filter(p=>p.wins===1).length,2);
    app.finish();assert.equal(app.get().matches.length,1);
  });
  test('Rotation balances teammate pairs, respects resting and keeps stats near equal',()=>{
    const app=createHarness(),four=fixture(4,1);app.set(four);
    const pairs=new Set();
    for(let m=0;m<3;m++){
      const selected=app.teams(['p0','p1','p2','p3']);
      pairs.add(selected.slice(0,2).sort().join('|'));
      pairs.add(selected.slice(2).sort().join('|'));
      four.matches.push({id:'m'+m,number:m+1,players:selected,teamA:selected.slice(0,2),
        teamB:selected.slice(2),winner:'A',score:'1-0',format:1,time:new Date().toISOString()});
    }
    assert.equal(pairs.size,6);
    const six=fixture();app.set(six);six.resting=['p0','p1','p2'];
    app.resetCurrent();assert.equal(six.current,null);
    assert.ok(app.log.notes.some(m=>m.includes('٤ لاعبين')));
    six.resting=[];for(let m=0;m<18;m++){
      const group=app.choose();
      assert.equal(new Set(group).size,4);
      six.matches.push({id:'r'+m,number:m+1,players:group,teamA:group.slice(0,2),
        teamB:group.slice(2),winner:'A',score:'1-0',format:1,time:new Date().toISOString()});
      // Actual app regenerates stats when rendering its dashboard.
      const counts=new Map(six.players.map(p=>[p.id,0]));
      six.matches.forEach(match=>match.players.forEach(id=>counts.set(id,counts.get(id)+1)));
      six.players.forEach(p=>{p.matches=counts.get(p.id);
        p.lastPlayed=six.matches.map((x,i)=>x.players.includes(p.id)?i:-1).reduce((a,b)=>Math.max(a,b),-1)});
    }
    const values=six.players.map(p=>p.matches);
    assert.ok(Math.max(...values)-Math.min(...values)<=1);
  });
  test('Backup validation rejects bad input and recovers old null dates',()=>{
    const app=createHarness(),sample=fixture();
    const restored=app.validate(sample);assert.equal(restored.players.length,6);
    const old=fixture();delete old.sessionStartedAt;
    assert.equal(app.validate(old).sessionStartedAt,null);
    for(const invalid of [null,{players:[],matches:[],format:0},
      {players:[{id:'x',name:'A'},{id:'x',name:'B'}],matches:[],format:4},
      {players:[{id:'x',name:'A'}],matches:[{teamA:['x','x'],teamB:['x','x'],winner:'Z'}],format:4}
    ])assert.throws(()=>app.validate(invalid));
    app.set(fixture());app.quota(true);assert.equal(app.save(),false);
    app.quota(false);assert.equal(app.save(),true);
  });
  test('Printed A4 report and desktop PNG both render',async()=>{
    const app=createHarness(),session=fixture(4);
    const ids=session.players.map(p=>p.id);
    session.matches.push({id:'m1',number:1,players:ids,teamA:ids.slice(0,2),
      teamB:ids.slice(2),winner:'A',score:'4-2',format:4,time:'2026-09-22T14:00:00.000Z'});
    app.set(session);app.renderPrintReport();
    assert.ok(app.nodes.printReportRoot.innerHTML.includes('إحصائيات اللاعبين'));
    assert.ok(app.nodes.printReportRoot.innerHTML.includes('أفضل ثنائية'));
    await app.downloadReportImage();
    assert.equal(app.log.downloads,1);
    assert.ok(app.log.drawn>30);
  });

  test('Award cards distinguish game differential from genuine ties without listing everyone',()=>{
    const app=createHarness(),baseline=fixture(4,4),ids=baseline.players.map(p=>p.id);
    const match=(number,winner,score,teamA=ids.slice(0,2),teamB=ids.slice(2))=>({
      id:'award-'+number,number,teamA,teamB,players:[...teamA,...teamB],
      winner,score,format:4,time:'2026-09-22T14:00:00.000Z'
    });
    // Identical wins, losses and game difference must be labelled as a tie,
    // not printed as a misleading list of all four "best" players.
    baseline.matches=[match(1,'A','4 - 0'),match(2,'B','0 - 4')];
    app.set(baseline);app.renderPrintReport();
    let awards=app.reportPerformance();
    assert.equal(awards.bestPlayer.tie,true);
    assert.equal(awards.bestPlayer.name,'تعادل — لا يوجد ترتيب منفرد');
    assert.equal(awards.bestPlayer.tiedCount,4);
    assert.equal(awards.worstPair.tie,true);
    assert.equal(awards.worstPair.tiedCount,2);
    assert.ok(app.nodes.printReportRoot.innerHTML.includes('تعادل'));
    // Same 50% win rate, but one pair won by more games: identify
    // the actual pair-level best and worst while player-level ties remain.
    baseline.matches=[match(1,'A','4 - 0'),match(2,'B','2 - 4')];
    app.set(baseline);app.renderPrintReport();
    awards=app.reportPerformance();
    assert.equal(awards.bestPair.tie,false);
    assert.equal(awards.bestPair.name,baseline.players[0].name+' + '+baseline.players[1].name);
    assert.equal(awards.bestPair.gamesDiff,2);
    assert.equal(awards.worstPair.gamesDiff,-2);
    assert.equal(awards.bestPlayer.tiedCount,2);
    // Three different line-ups: a single 3/3 winner and a distinct lowest
    // game-difference player are correctly chosen.
    baseline.matches=[
      match(1,'A','4 - 0',[ids[0],ids[1]],[ids[2],ids[3]]),
      match(2,'A','4 - 2',[ids[0],ids[2]],[ids[1],ids[3]]),
      match(3,'A','4 - 3',[ids[0],ids[3]],[ids[1],ids[2]])
    ];
    app.set(baseline);app.renderPrintReport();awards=app.reportPerformance();
    assert.equal(awards.bestPlayer.name,baseline.players[0].name);
    assert.equal(awards.bestPlayer.tie,false);
    assert.equal(awards.worstPlayer.name,baseline.players[3].name);
    assert.equal(awards.worstPlayer.tie,false);
  });

  test('Changing winning games while playing keeps scores and point history',()=>{
    const app=createHarness(),session=fixture(4,4);
    app.set(session);app.resetCurrent();
    app.normalizeTeams(session.current.players);session.started=true;
    for(let n=0;n<8;n++)app.score('A'); // Two games
    app.score('A'); // 15-0 in the third game
    assert.equal(app.ensure().gamesA,2);
    assert.equal(app.ensure().pointA,1);
    const prevHistory=app.ensure().history.length;
    let res=app.setMatchTarget('6');
    assert.equal(res.ok,true);
    assert.equal(session.format,6);
    assert.equal(app.ensure().gamesA,2);
    assert.equal(app.ensure().pointA,1);
    assert.equal(app.ensure().history.length,prevHistory);
    assert.equal(app.ensure().complete,false);
    assert.equal(app.storage['padel-rotation-v1']!==undefined,true);
    app.undo();
    assert.equal(app.ensure().pointA,0);
    assert.equal(app.ensure().gamesA,2);
  });
  test('Lowering the games target declares a winner and raising it reopens play',()=>{
    const app=createHarness(),session=fixture(4,4);
    app.set(session);app.resetCurrent();
    app.normalizeTeams(session.current.players);session.started=true;
    for(let n=0;n<8;n++)app.score('B'); // B leads 2-0
    app.score('B'); // third game in progress
    const lower=app.setMatchTarget('2');
    assert.equal(lower.ok,true);
    assert.equal(lower.justCompleted,true);
    assert.equal(session.format,2);
    assert.equal(app.ensure().complete,true);
    assert.equal(session.current.winner,'B');
    assert.equal(app.ensure().pointB,0);
    assert.equal(app.ensure().history.length,0);
    const raise=app.setMatchTarget('5');
    assert.equal(raise.ok,true);
    assert.equal(raise.reopened,true);
    assert.equal(app.ensure().complete,false);
    assert.equal(session.current.winner,null);
    assert.equal(app.ensure().gamesB,2);
    app.score('A');
    assert.equal(app.ensure().pointA,1);
    app.undo();
    assert.equal(app.ensure().pointA,0);
    assert.equal(app.ensure().complete,false);
    for(let n=0;n<12;n++)app.score('B');
    assert.equal(app.ensure().complete,true);
    assert.equal(app.ensure().gamesB,5);
    app.finish();
    assert.equal(session.matches.length,1);
    assert.equal(session.matches[0].format,5);
  });
  test('Reject invalid and ambiguous game targets without changing the match',()=>{
    const app=createHarness(),session=fixture(4,4);
    app.set(session);app.resetCurrent();app.normalizeTeams(session.current.players);
    session.started=true;
    for(const raw of ['0','100','2.5','abc','-1','',null]){
      const result=app.setMatchTarget(raw);
      assert.equal(result.ok,false,'invalid: '+raw);
      assert.equal(session.format,4);
    }
    const before=app.ensure();
    before.gamesA=3;before.gamesB=3;before.history.push({
      gamesA:3,gamesB:3,pointA:0,pointB:0,adv:null,complete:false,winner:null,score:'3 - 3'
    });
    const reject=app.setMatchTarget('3');
    assert.equal(reject.ok,false);
    assert.ok(reject.error.includes('متعادل'));
    assert.equal(session.format,4);
    assert.equal(app.ensure().gamesA,3);
    assert.equal(app.ensure().history.length,1);
  });
  test('A failed browser save rolls back changed target and preserves live points',()=>{
    const app=createHarness(),session=fixture(4,4);
    app.set(session);app.resetCurrent();app.normalizeTeams(session.current.players);
    session.started=true;app.score('A');
    const oldHistory=app.ensure().history.length;
    app.quota(true);
    const result=app.setMatchTarget('7');
    assert.equal(result.ok,false);
    assert.equal(session.format,4);
    assert.equal(app.ensure().pointA,1);
    assert.equal(app.ensure().history.length,oldHistory);
    assert.equal(session.current.winner,null);
    app.quota(false);
    const good=app.setMatchTarget('7');
    assert.equal(good.ok,true);
    assert.equal(session.format,7);
  });
  test('Changing session target does not retroactively edit historical matches',()=>{
    const app=createHarness(),session=fixture(4,4);
    const ids=session.players.map(p=>p.id);
    session.matches=[{id:'old',number:1,players:ids,
      teamA:ids.slice(0,2),teamB:ids.slice(2),winner:'A',
      score:'4 - 2',format:4,time:'2026-09-22T16:00:00.000Z'}];
    app.set(session);
    const changed=app.setMatchTarget('6');
    assert.equal(changed.ok,true);
    assert.equal(session.format,6);
    assert.equal(session.matches[0].format,4);
    assert.equal(app.nodes.formatStat?.textContent??'', '');
  });


  test('Rename a player during play without resetting points or previous match history',()=>{
    const app=createHarness(),session=fixture(4);
    const ids=session.players.map(p=>p.id);
    session.matches=[{id:'m1',number:1,players:ids,teamA:ids.slice(0,2),
      teamB:ids.slice(2),winner:'A',score:'4 - 1',format:4,time:'2026-09-22T15:00:00.000Z'}];
    app.set(session);app.resetCurrent();app.normalizeTeams(session.current.players);
    session.started=true;
    app.score('A');app.score('A');
    const beforeScore=JSON.stringify(app.ensure()),oldId=ids[0],history=JSON.stringify(session.matches);
    const renamed=app.renameSessionPlayer(oldId,'حسن الجديد');
    assert.equal(renamed.ok,true);
    assert.equal(session.players[0].id,oldId);
    assert.equal(session.players[0].name,'حسن الجديد');
    assert.equal(JSON.stringify(app.ensure()),beforeScore);
    assert.equal(JSON.stringify(session.matches),history);
    app.renderPrintReport();
    assert.ok(app.nodes.printReportRoot.innerHTML.includes('حسن الجديد'));
    app.renderPlayersManager();
    assert.ok(app.nodes.playerManagerList.innerHTML.includes('حسن الجديد'));
    assert.equal(session.players[0].wins,1);
    assert.equal(session.current.teamA[0],oldId);
    assert.equal(JSON.parse(app.storage['padel-rotation-v1']).players[0].name,'حسن الجديد');
    app.undo();
    assert.equal(app.ensure().pointA,1);
  });
  test('Reject empty and duplicate player names including whitespace and case',()=>{
    const app=createHarness(),session=fixture(4);
    app.set(session);
    for(const name of ['', '   ', 'لاعب   2', 'لاعب ٢'.repeat(30)]){
      const result=app.renameSessionPlayer('p0',name);
      assert.equal(result.ok,false,'Invalid rename '+name);
    }
    const add=app.addSessionPlayers('جديد\nجديد');
    assert.equal(add.ok,false);
    assert.equal(session.players.length,4);
    assert.equal(app.addSessionPlayers('لاعب 1').ok,false);
    assert.equal(session.players[0].name,'لاعب 1');
  });
  test('Add players during a live match without changing teams, score or old stats',()=>{
    const app=createHarness(),session=fixture(4);
    const ids=session.players.map(p=>p.id);
    session.matches=[{id:'m1',number:1,players:ids,teamA:ids.slice(0,2),
      teamB:ids.slice(2),winner:'A',score:'4 - 0',format:4,time:'2026-09-22T15:00:00.000Z'}];
    app.set(session);app.resetCurrent();app.normalizeTeams(session.current.players);
    session.started=true;app.score('B');
    const beforeScore=JSON.stringify(app.ensure()),lineup=JSON.stringify(session.current.players);
    const result=app.addSessionPlayers('إبراهيم\nموسى');
    assert.equal(result.ok,true);
    assert.equal(result.added,2);
    assert.equal(session.players.length,6);
    assert.equal(JSON.stringify(app.ensure()),beforeScore);
    assert.equal(JSON.stringify(session.current.players),lineup);
    app.renderPrintReport();
    assert.equal(session.players[4].matches,0);
    assert.equal(session.players[5].wins,0);
    assert.equal(JSON.parse(app.storage['padel-rotation-v1']).players.length,6);
    session.current=null;session.started=false;
    const next=app.choose();
    assert.ok(next.includes(session.players[4].id));
    assert.ok(next.includes(session.players[5].id));
  });
  test('Player changes roll back when browser storage is full',()=>{
    const app=createHarness(),session=fixture(4);
    app.set(session);
    const former=JSON.stringify(session.players);
    app.quota(true);
    assert.equal(app.renameSessionPlayer('p0','اسم جديد').ok,false);
    assert.equal(JSON.stringify(session.players),former);
    assert.equal(app.addSessionPlayers('لاعب خامس').ok,false);
    assert.equal(JSON.stringify(session.players),former);
    app.quota(false);
    assert.equal(app.addSessionPlayers('لاعب خامس').ok,true);
    assert.equal(session.players.length,5);
  });
  test('Adding players enforces 64-person roster and retains historical identities',()=>{
    const app=createHarness(),session=fixture(64);
    app.set(session);
    assert.equal(app.addSessionPlayers('زيادة').ok,false);
    assert.equal(session.players.length,64);
    session.players.length=63;
    assert.equal(app.addSessionPlayers('اسم واحد').ok,true);
    assert.equal(session.players.length,64);
    assert.equal(app.addSessionPlayers('واحد\nاثنين').ok,false);
  });

})();
