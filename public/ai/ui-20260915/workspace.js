(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const apiBase = '/ai/api';
  const storage = {
    get(key, fallback = null) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
    raw(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
    token(value) { try { if (value) localStorage.setItem('unays_ai_token', value); else localStorage.removeItem('unays_ai_token'); } catch {} }
  };
  const state = { user:null, token:storage.raw('unays_ai_token'), guest:null, chats:[], current:null, groups:[], group:null, view:'chat', mode:'general', web:false, sending:false, abort:null, attachments:[], register:false, googleReady:false, poll:null, messagesKey:'', groupLoading:false, noticeTimer:null, initialized:false, groupSending:false };
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const make = (tag, className, text) => { const el=document.createElement(tag); if(className)el.className=className;if(text!==undefined)el.textContent=text;return el; };
  const button = (label, className, handler) => { const el=make('button',className,label);el.type='button';el.addEventListener('click',handler);return el; };
  const uid = () => 'chat_' + crypto.randomUUID().replaceAll('-','');
  const storeKey = () => 'unays_ai_workspace_' + (state.user?.id || 'guest');
  const currentChat = () => state.chats.find(c => c.id === state.current);
  const groupName = id => state.groups.find(g => g.id === id)?.name || 'Group';
  const ownsGroup = group => group?.ownerId === state.user?.id;
  const canDeleteChat = chat => !state.user || chat.userId === state.user.id || ownsGroup(state.groups.find(g => g.id === chat.projectId));
  const dateLabel = value => { const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleDateString(undefined,{month:'short',day:'numeric'}); };
  const pendingSaves = new Map();
  let pendingGroupMessage = null;
  let confirmTask = null;

  function notify(message, persistent=false) { clearTimeout(state.noticeTimer);$('notice').textContent=message;$('notice').hidden=false;if(!persistent)state.noticeTimer=setTimeout(() => {$('notice').hidden=true;},6500); }
  function showDialog(id) { if(!$(id).open)$(id).showModal(); }
  function confirmAction(title, description, action, label='Delete') { $('confirm-title').textContent=title;$('confirm-description').textContent=description;$('confirm-yes').textContent=label;confirmTask=action;showDialog('confirm-dialog'); }
  $('confirm-yes').onclick=async () => { const task=confirmTask;$('confirm-yes').disabled=true;try{await task?.();$('confirm-dialog').close();}catch(e){notify(e.message);}finally{$('confirm-yes').disabled=false;} };
  document.querySelectorAll('[data-close]').forEach(el => el.onclick=() => $(el.dataset.close).close());
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click',e => { if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();} }));

  function headers() { return { 'Content-Type':'application/json', Accept:'application/json', ...(state.token ? {Authorization:'Bearer '+state.token} : {}) }; }
  async function api(path, options={}) {
    const response=await fetch(apiBase+path,{credentials:'same-origin',...options,headers:{...headers(),...options.headers}});
    let data;try{data=await response.json();}catch{throw new Error('The server returned an unexpected response. Please try again.');}
    if(!response.ok||data.ok===false)throw Object.assign(new Error(data.error||data.message||'This request could not be completed.'),{status:response.status,code:data.code,data});
    return data;
  }
  const post = (path, body) => api(path,{method:'POST',body:JSON.stringify(body)});
  function persist() { storage.set(storeKey(),state.chats.filter(c => !state.user || !c.userId || c.userId===state.user.id).slice(0,40)); }
  function savedChats() { const rows=storage.get(storeKey(),[]);return Array.isArray(rows)?rows.filter(c => c&&typeof c.id==='string'&&Array.isArray(c.messages)):[]; }
  function updateQuota(guest) {
    window.dispatchEvent(new CustomEvent('unays-identity',{detail:state.user?.id||'guest'}));
    if(guest)state.guest=guest;
    const signed=!!state.user,remaining=state.guest?.remaining ?? 10;
    $('guest-card').hidden=signed;$('top-signin').hidden=signed;$('profile-link').hidden=!signed;
    $('guest-copy').textContent=remaining+' of 10 questions left to explore.';
    $('quota-fill').style.width=(remaining*10)+'%';
    $('remaining-label').textContent=signed?'Your Unays account':remaining+' free question'+(remaining===1?'':'s')+' left';
    $('account-name').textContent=state.user?.profile?.displayName||state.user?.username||'Your workspace';
    $('account-caption').textContent=signed?'Manage your account':'Free to use';
    $('avatar').textContent=(state.user?.profile?.displayName||state.user?.username||'U').slice(0,1).toUpperCase();
  }
  function resize(textarea) { textarea.style.height='auto';textarea.style.height=Math.min(textarea.scrollHeight,textarea.id==='question'?180:130)+'px'; }
  function toggleSidebar(open) { $('app').classList.toggle('sidebar-open',open);$('sidebar-shade').hidden=!open;$('menu-button').setAttribute('aria-expanded',String(open));if(open)$('sidebar').querySelector('button').focus(); }
  $('menu-button').onclick=() => toggleSidebar(!$('app').classList.contains('sidebar-open'));
  $('sidebar-shade').onclick=() => toggleSidebar(false);
  document.querySelector('[data-action="close-sidebar"]').onclick=() => toggleSidebar(false);
  document.addEventListener('keydown',e => {if(e.key==='Escape')toggleSidebar(false);if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();newChat();$('question').focus();}});
  $('theme-button').onclick=() => {document.body.dataset.theme=document.body.dataset.theme==='dark'?'light':'dark';storage.set('unays_ai_theme_v2',document.body.dataset.theme);};
  document.body.dataset.theme=storage.get('unays_ai_theme_v2','dark');
  function viewport() { const view=window.visualViewport;document.documentElement.style.setProperty('--app-height',(view?view.height:window.innerHeight)+'px'); }
  viewport();window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);

  function setMode(mode) {
    state.mode=['general','educational','business','coder'].includes(mode)?mode:'general';
    $('mode-icon').innerHTML=`<use href="#i-${state.mode==='business'?'business':state.mode==='educational'?'learn':state.mode==='coder'?'code':'spark'}"/>`;
    $('auto-mode-label').textContent=state.mode==='educational'?'Learn':state.mode==='business'?'Business':state.mode==='coder'?'Code':'Smart';
    const effectiveWeb=state.web||state.mode==='business';$('web-button').setAttribute('aria-pressed',String(effectiveWeb));
    $('web-button').title=state.mode==='business'?'Business research includes web search':'Search the web for this answer';
    $('mode-note').textContent=state.mode==='business'?'Business research with web sources.':state.mode==='educational'?'Hints and questions. You work out the answer.':state.mode==='coder'?'A dedicated space to write, debug and build.':'The right approach, chosen automatically.';
  }
  $('web-button').onclick=() => {if(state.mode==='business'){notify('Web search is included in business research.');return;}state.web=!state.web;setMode(state.mode);};
  function view(name) { state.view=name;$('chat-view').hidden=name!=='chat';$('groups-view').hidden=name!=='groups';$('nav-chat').classList.toggle('active',name==='chat');$('nav-groups').classList.toggle('active',name==='groups');$('workspace-title').textContent=name==='groups'?'Team projects':'Chat';window.dispatchEvent(new CustomEvent('unays-view',{detail:name}));toggleSidebar(false);if(name!=='groups')stopPolling(); }
  function newChat(projectId=null) {
    if(state.sending){notify('Stop the current answer before starting a new conversation.');return;}
    state.current=null;state.attachments=[];state.newProjectId=projectId;renderAttachments();view('chat');renderChat();renderHistory();
  }
  $('new-chat').onclick=() => newChat();$('nav-chat').onclick=() => {window.UnaysCode?.close();view('chat');renderChat();};
  document.querySelectorAll('[data-prompt]').forEach(el => el.onclick=() => {setMode("general");$('question').value=el.dataset.prompt;resize($('question'));$('question').focus();});
  $('question').oninput=() => resize($('question'));
  $('question').onkeydown=e => {if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&matchMedia('(pointer:fine)').matches&&window.UnaysInterface?.preference('enterSend')!==false){e.preventDefault();$('chat-form').requestSubmit();}};

  function renderHistory() {
    const list=$('history-list');list.replaceChildren();const query=$('history-search').value.trim().toLowerCase();
    const chats=state.chats.filter(c => !query||String(c.title).toLowerCase().includes(query)).sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));
    if(!chats.length){list.append(make('p','quiet',query?'No matching conversations.':'Your ideas will find a home here.'));return;}
    chats.slice(0,60).forEach(chat => {
      const row=make('div','history-item'+(chat.id===state.current?' selected':''));
      const open=button(chat.title||'New conversation','history-open',() => openChat(chat));open.title=(chat.title||'New conversation')+(chat.projectId?' · '+groupName(chat.projectId):'');row.append(open);
      if(canDeleteChat(chat)){const remove=button('','icon-button',() => confirmAction('Delete this conversation?','This removes the conversation from your workspace.',async () => {if(state.user&&chat._saved)await post('/chats/delete',{id:chat.id});state.chats=state.chats.filter(c=>c.id!==chat.id);persist();if(state.current===chat.id)newChat();renderHistory();}));remove.innerHTML=icon('trash');remove.setAttribute('aria-label','Delete '+(chat.title||'conversation'));row.append(remove);}
      list.append(row);
    });
  }
  $('history-search').oninput=renderHistory;
  function openChat(chat) {if(state.sending){notify('Stop the current answer before opening another conversation.');return;}state.current=chat.id;state.newProjectId=null;state.attachments=[];renderAttachments();setMode(chat.mode);view('chat');renderChat();renderHistory();window.UnaysCode?.sync(chat);}
  function renderMarkdown(container, source) {
    if(!window.marked||!window.DOMPurify){container.textContent=source;return;}
    const maths=[];
    const text=String(source).split(/(```[\s\S]*?(?:```|$))/g).map((segment,i) => i%2?segment:segment.replace(/\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$\$([\s\S]+?)\$\$/g,(_,display,inline,dollars) => {const n=maths.length;maths.push({text:display??inline??dollars,display:display!==undefined||dollars!==undefined});return `<span data-math="${n}"></span>`;})).join('');
    const html=DOMPurify.sanitize(marked.parse(text,{breaks:true,gfm:true}),{USE_PROFILES:{html:true},FORBID_TAGS:['img','style','form','input','button','iframe','video','audio','object','embed'],FORBID_ATTR:['style','srcset','id','name']});
    container.innerHTML=html;
    container.querySelectorAll('a').forEach(a => {try{const url=new URL(a.getAttribute('href'),location.origin);if(!['http:','https:','mailto:'].includes(url.protocol)){a.removeAttribute('href');return;}a.target='_blank';a.rel='noopener noreferrer';}catch{a.removeAttribute('href');}});
    container.querySelectorAll('[data-math]').forEach(el => {const math=maths[Number(el.dataset.math)];if(!math)return;try{katex.render(math.text,el,{displayMode:math.display,throwOnError:false,trust:false,strict:'ignore',maxExpand:500});}catch{el.textContent=math.text;}});
    container.querySelectorAll('table').forEach(table => {const wrap=make('div','table-wrap');table.replaceWith(wrap);wrap.append(table);});
  }
  function sourcesNode(sources, status) {
    if(!sources?.length){if(status==='unavailable')return make('p','quiet','Web search is temporarily unavailable. Live details could not be verified.');return null;}
    const details=make('details','sources');details.open=true;details.append(make('summary','',sources.length+' web sources'));
    const grid=make('div','source-grid');
    sources.forEach((source,i) => {try{const url=new URL(source.url);if(!['https:','http:'].includes(url.protocol))return;const a=make('a','source-card');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.append(make('small','',(i+1)+'. '+url.hostname.replace(/^www\./,'')),make('strong','',source.title));grid.append(a);}catch{}});
    details.append(grid);return details;
  }
  async function copy(text, trigger) {try{await navigator.clipboard.writeText(text);trigger.innerHTML=icon('check');setTimeout(()=>trigger.innerHTML=icon('copy'),1800);}catch{notify('Copy is unavailable in this browser. Select the answer text to copy it.');}}
  function answerNode(message, chat, index) {
    const article=make('article','message assistant');
    const heading=make('div','message-heading');heading.innerHTML='<span class="ai-avatar">'+icon('spark')+'</span><span>Unays AI</span>';
    heading.append(make('span','route-badge',message.mode==='educational'?'Learn · hints only':message.mode==='business'?'Business · web research':message.mode==='coder'?'Code · build & debug':message.searchStatus==='complete'?'General · web search':'General'));article.append(heading);
    const content=make('div','markdown');renderMarkdown(content,message.mode==='coder'&&window.UnaysCode?window.UnaysCode.message(message.content||''):message.content||'');article.append(content);
    const sources=sourcesNode(message.sources,message.searchStatus);if(sources)article.append(sources);
    if(message.error)article.append(make('div','answer-error',message.error));
    if(message.content){const actions=make('div','message-actions');const cp=button('','icon-button',()=>copy(message.content,cp));cp.innerHTML=icon('copy');cp.setAttribute('aria-label','Copy answer');actions.append(cp);article.append(actions);}
    if(message.error && (!chat.userId||chat.userId===state.user?.id)){const retry=button('Try again','retry-button',()=>retryAnswer(chat,index));article.append(retry);}
    return article;
  }
  function renderChat() {
    const chat=currentChat(),list=$('conversation');list.replaceChildren();
    $('welcome').hidden=!!chat?.messages?.length;list.hidden=!chat?.messages?.length;
    const projectId=chat?.projectId||state.newProjectId;
    const sharedOther=chat?.userId&&chat.userId!==state.user?.id;
    $('chat-context').replaceChildren();$('chat-context').hidden=!projectId&&!sharedOther;
    if(projectId){$('chat-context').append(make('span','', 'Shared in '+groupName(projectId)));$('chat-context').append(button('Open group →','',()=>{const g=state.groups.find(g=>g.id===projectId);if(g)openGroup(g);}));}
    if(sharedOther){$('chat-context').append(make('span','read-only-banner','Viewing a teammate’s conversation. Start a new group conversation to ask your own questions.'));}
    $('question').disabled=!!sharedOther;$('send-button').disabled=!!sharedOther;
    chat?.messages.forEach((m,i) => {if(m.role==='user'){const article=make('article','message user');article.append(make('div','user-bubble',m.displayContent||m.content));list.append(article);}else if(m.role==='assistant')list.append(answerNode(m,chat,i));});
    requestAnimationFrame(()=>{$('chat-scroll').scrollTop=$('chat-scroll').scrollHeight;});
  }
  async function saveChat(chat) {
    persist();
    if(!state.user)return;
    if(state.user.role==='student'&&!chat.projectId){notify('This conversation stays on this device. Choose a group to save student work to your account.');return;}
    if(chat.userId&&chat.userId!==state.user.id)return;
    const previous=pendingSaves.get(chat.id)||Promise.resolve();
    const task=previous.catch(()=>{}).then(async () => {const data=await post('/chats',{id:chat.id,title:chat.title,mode:chat.mode,projectId:chat.projectId||null,messages:chat.messages.filter(m=>m.content),workspaceFiles:chat.workspaceFiles||undefined});chat._saved=true;chat.userId=data.chat.userId;delete chat._saveError;persist();});
    pendingSaves.set(chat.id,task);
    try{await task;}catch(e){chat._saveError=true;persist();notify('Saved on this device. Account sync failed: '+e.message);}finally{if(pendingSaves.get(chat.id)===task)pendingSaves.delete(chat.id);}
  }
  async function retryAnswer(chat,index) {
    if(state.sending)return;
    const last=chat.messages[index-1];if(last?.role!=='user')return;
    chat.messages=chat.messages.slice(0,index-1);state.current=chat.id;await send(last.displayContent||last.content,last.content);
  }
  async function send(displayText, fullText) {
    if(!state.initialized){await ready;}
    if(state.sending||!displayText.trim())return;
    if(!window.UnaysCode?.active()&&/\b(?:generate|create|make|draw|design)\b.{0,65}\b(?:image|picture|illustration|photo|poster|artwork)\b/i.test(displayText)&&!fullText&&!/\b(?:code|website|html|css|javascript|web app)\b/i.test(displayText)){window.UnaysImages?.open(displayText,true);return;}
    if(!state.user&&state.guest?.remaining===0){openAuth(true);return;}
    let chat=currentChat();
    if(!chat){chat={id:uid(),title:displayText.slice(0,65),mode:state.mode,projectId:state.newProjectId||null,userId:state.user?.id||null,createdAt:new Date().toISOString(),messages:[]};state.chats.unshift(chat);state.current=chat.id;}
    if(chat.userId&&chat.userId!==state.user?.id){notify('Start a new group conversation to add your own questions.');return;}
    const prompt=fullText||displayText+(window.UnaysCode?.context()||'')+(window.UnaysInterface?.context()||'')+(state.attachments.length?'\n\n'+state.attachments.map(f=>f.content).join('\n\n'):'');
    const userMessage={role:'user',content:prompt,displayContent:displayText+(state.attachments.length?'\n\n📎 '+state.attachments.map(f=>f.name).join(', '):'')};
    chat.messages.push(userMessage);chat.mode=state.mode;chat.updatedAt=new Date().toISOString();
    const payload=chat.messages.filter(m=>m.content&&!m.error).map(m=>({role:m.role,content:m.content}));
    const answer={role:'assistant',content:'',mode:state.mode,sources:[]};chat.messages.push(answer);
    state.sending=true;window.dispatchEvent(new CustomEvent('unays-generation',{detail:{type:'start'}}));state.abort=new AbortController();$('question').value='';resize($('question'));state.attachments=[];renderAttachments();renderChat();renderHistory();persist();
    $('send-button').classList.add('stopping');$('send-button').setAttribute('aria-label','Stop answer');$('question').disabled=false;
    const article=$('conversation').lastElementChild,content=article.querySelector('.markdown');
    const status=make('div','status-line');status.innerHTML='<span class="thinking-dots"><i></i><i></i><i></i></span><span>Thinking…</span>';article.append(status);
    let lastPaint=0,completed=false,timer;
    const paint=force => {const now=performance.now();if(!force&&now-lastPaint<100)return;lastPaint=now;const scroll=$('chat-scroll'),nearEnd=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<170;renderMarkdown(content,answer.mode==='coder'&&window.UnaysCode?window.UnaysCode.message(answer.content):answer.content);if(nearEnd)scroll.scrollTop=scroll.scrollHeight;};
    try {
      timer=setTimeout(()=>state.abort?.abort('timeout'),155000);
      const response=await fetch(apiBase+'/chat',{method:'POST',credentials:'same-origin',headers:headers(),body:JSON.stringify({messages:payload.slice(-20),webSearch:state.web,workspace:window.UnaysCode?.active()?'code':undefined,chatId:chat.id,stream:true}),signal:state.abort.signal});
      if(!response.ok){let d;try{d=await response.json();}catch{d={error:'The service could not start this reply.'};}if(d.guest)updateQuota(d.guest);throw Object.assign(Error(d.error),{code:d.code});}
      if(!String(response.headers.get('content-type')).includes('text/event-stream'))throw Error('Unexpected response from the AI service.');
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      const consume=line => {if(!line.startsWith('data:'))return;const event=JSON.parse(line.slice(5));
        if(event.type==='status')status.lastChild.textContent=event.message;
        window.dispatchEvent(new CustomEvent('unays-generation',{detail:event}));if(event.type==='routing'){answer.mode=event.mode;chat.mode=event.mode;setMode(event.mode);if(event.mode==='coder'){window.UnaysCode?.open();window.UnaysCode?.building(true);}answer.searchStatus=event.searchStatus;article.querySelector('.route-badge').textContent=event.mode==='educational'?'Learn · hints only':event.mode==='business'?'Business · web research':event.mode==='coder'?'Code · build & debug':event.searchStatus==='complete'?'General · web search':'General';}
        if(event.type==='sources'){answer.sources=event.sources;answer.searchStatus=event.status;status.lastChild.textContent=event.sources?.length?'Found '+event.sources.length+' sources. Writing your answer…':'Writing your answer…';}
        if(event.type==='text'){status.hidden=true;answer.content+=event.text;paint(false);}
        if(event.type==='done'){completed=true;if(event.model)answer.model=event.model;if(event.guest)updateQuota(event.guest);}
        if(event.type==='error'){if(event.guest)updateQuota(event.guest);throw Object.assign(Error(event.error),{code:event.code});}
      };
      while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines)consume(line.trimEnd());if(done){if(buffer.trim())consume(buffer);break;}}
      if(completed&&answer.mode==='coder')window.UnaysCode?.suggest(answer.content,answer.model);
      if(!completed)throw Error('The connection ended before the answer finished. Please try again.');
    } catch(e) {
      answer.error=state.abort?.signal.aborted?(state.abort.signal.reason==='timeout'?'The answer took too long. Please try again.':'Answer stopped.'):e.message;
      if(['GUEST_LIMIT','SESSION_EXPIRED','SIGN_IN_REQUIRED'].includes(e.code))openAuth(e.code==='GUEST_LIMIT');
    } finally {
      clearTimeout(timer);window.UnaysCode?.building(false);state.sending=false;window.dispatchEvent(new CustomEvent('unays-generation',{detail:{type:'idle'}}));state.abort=null;$('send-button').classList.remove('stopping');$('send-button').setAttribute('aria-label','Send message');chat.updatedAt=new Date().toISOString();renderChat();renderHistory();await saveChat(chat);
      if(!state.user){try{const access=await api('/chat/access');updateQuota(access.guest);}catch{}}
      if(completed&&!state.user&&state.guest?.remaining===0)notify('That was your tenth free question. Sign in whenever you’re ready to continue.',true);
    }
  }
  $('chat-form').onsubmit=e => {e.preventDefault();if(state.sending){state.abort?.abort();return;}send($('question').value.trim());};

  function renderAttachments() {const list=$('attachment-list');list.replaceChildren();state.attachments.forEach((file,i)=>{const chip=make('div','attachment-chip');chip.innerHTML=icon('file');chip.append(make('span','',file.name));const remove=button('','',()=>{state.attachments.splice(i,1);renderAttachments();});remove.innerHTML=icon('close');remove.setAttribute('aria-label','Remove '+file.name);chip.append(remove);list.append(chip);});}
  $('attach-button').onclick=() => {if(!state.user){openAuth();$('auth-description').textContent='Sign in to attach documents. You can still ask 10 text questions as a guest.';return;}$('file-input').click();};
  $('file-input').onchange=async () => {const file=$('file-input').files[0];$('file-input').value='';if(!file)return;if(state.attachments.length>=2){notify('Attach up to two documents per message.');return;}if(file.size>12*1024*1024){notify('Choose a document smaller than 12 MB.');return;}$('attach-button').disabled=true;notify('Reading '+file.name+'…');try{const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});const data=await post('/files/analyze',{name:file.name,mime:file.type,dataBase64:encoded,projectId:currentChat()?.projectId||state.newProjectId||null});const bounded=String(data.file.content||'').slice(0,9000);state.attachments.push({name:file.name,content:bounded});renderAttachments();notify(data.file.warning||'Document ready. Ask a question about it.');}catch(e){notify(e.message);}finally{$('attach-button').disabled=false;}};

  function openAuth(limit=false) {if(state.user)return;state.register=false;authTab(false);$('auth-title').textContent=limit?'Keep the conversation going.':'Welcome to your next idea.';$('auth-description').textContent=limit?'You’ve explored all 10 free questions. Sign in to continue right where you left off.':'Sign in to keep chatting, save conversations and collaborate.';showDialog('auth-dialog');loadGoogle();}
  document.querySelectorAll('[data-action="signin"]').forEach(el=>el.onclick=()=>openAuth());
  $('account-button').onclick=() => {if(!state.user){openAuth();return;}confirmAction('Signed in as '+(state.user.profile?.displayName||state.user.username),'You can manage your profile using “My account”, or sign out on this device.',async()=>{if(state.sending)state.abort?.abort();await post('/auth/logout',{});state.token='';storage.token('');state.user=null;state.current=null;state.groups=[];state.chats=savedChats();state.newProjectId=null;stopPolling();newChat();await refreshAccess();updateQuota();},'Sign out');};
  function authTab(register) {state.register=register;$('login-tab').classList.toggle('active',!register);$('register-tab').classList.toggle('active',register);$('username-label').hidden=!register;$('register-username').required=register;$('login-label-text').textContent=register?'Email address':'Email or username';$('login-input').type=register?'email':'text';$('password-input').autocomplete=register?'new-password':'current-password';$('password-input').minLength=register?8:1;$('auth-submit').firstChild.textContent=register?'Create account ':'Sign in ';$('auth-error').textContent='';}
  $('login-tab').onclick=()=>authTab(false);$('register-tab').onclick=()=>authTab(true);
  $('show-password').onclick=()=>{const visible=$('password-input').type==='password';$('password-input').type=visible?'text':'password';$('show-password').textContent=visible?'Hide':'Show';$('show-password').setAttribute('aria-label',visible?'Hide password':'Show password');};
  async function acceptLogin(data) {
    const guestChats=!state.user?state.chats.filter(c=>!c.userId):[];
    state.token=data.token||state.token;storage.token(state.token);state.user=data.user;$('password-input').value='';$('auth-dialog').close();
    await loadAccount();
    for(const chat of guestChats){if(!state.chats.some(c=>c.id===chat.id)){chat.userId=state.user.id;state.chats.push(chat);await saveChat(chat);}}
    if(state.current&&!currentChat())state.current=null;
    updateQuota();renderHistory();if(state.view==='groups'){renderGroups();}else renderChat();notify('You’re signed in. Pick up where you left off.');
  }
  $('auth-form').onsubmit=async e => {e.preventDefault();const submit=$('auth-submit');submit.disabled=true;$('auth-error').textContent='';try{const body=state.register?{username:$('register-username').value.trim(),email:$('login-input').value.trim(),password:$('password-input').value}:{login:$('login-input').value.trim(),password:$('password-input').value};const data=await post(state.register?'/auth/register':'/auth/login',body);await acceptLogin(data);}catch(e){$('auth-error').textContent=e.message;}finally{submit.disabled=false;}};
  async function loadGoogle() {
    if(state.googleReady)return;
    $('google-note').textContent='Loading Google sign-in…';
    try {const config=await api('/auth/config');if(!config.google?.enabled){$('google-note').textContent='Google sign-in is unavailable. Use your email and password.';return;}
      if(!window.google?.accounts?.id)await new Promise((resolve,reject)=>{const existing=document.getElementById('google-library');if(existing)existing.remove();const script=document.createElement('script');script.id='google-library';script.src='https://accounts.google.com/gsi/client';script.async=true;const timeout=setTimeout(()=>reject(Error('Google sign-in took too long. Use email and password.')),10000);script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);reject(Error('Google sign-in could not load. Use email and password.'));};document.head.append(script);});
      google.accounts.id.initialize({client_id:config.google.clientId,auto_select:false,callback:async response=>{try{$('auth-error').textContent='';await acceptLogin(await post('/auth/google',{credential:response.credential}));}catch(e){$('auth-error').textContent=e.message;}}});
      google.accounts.id.renderButton($('google-button'),{theme:'outline',size:'large',shape:'pill',width:Math.min(330,$('auth-dialog').clientWidth-52)});state.googleReady=true;$('google-note').textContent='';
    }catch(e){$('google-note').textContent=e.message;}
  }
  async function refreshAccess() {const data=await api('/chat/access');updateQuota(data.guest);}
  async function loadAccount() {
    const previous=savedChats();
    const results=await Promise.allSettled([api('/chats'),api('/projects')]);
    if(results[0].status==='fulfilled'){state.chats=results[0].value.chats.map(c=>({...c,_saved:true}));for(const c of previous){const index=state.chats.findIndex(x=>x.id===c.id);if(index<0&&!c._saved)state.chats.push(c);else if(index>=0&&c._saveError&&new Date(c.updatedAt)>new Date(state.chats[index].updatedAt))state.chats[index]=c;}}
    else{state.chats=previous;notify('Conversation sync is unavailable. Your local copies are still here.');}
    if(results[1].status==='fulfilled')state.groups=results[1].value.projects;else notify('Groups could not load. Please try again.');
    $('group-count').textContent=state.groups.length;persist();
  }

  function mergeConversations(remote) {
    const local=state.chats;
    state.chats=remote.map(c=>({...c,_saved:true}));
    for(const chat of local){
      if(chat.projectId&&!state.groups.some(g=>g.id===chat.projectId))continue;
      const index=state.chats.findIndex(c=>c.id===chat.id);
      if(index<0&&!chat._saved)state.chats.push(chat);
      else if(index>=0&&chat._saveError&&new Date(chat.updatedAt)>new Date(state.chats[index].updatedAt))state.chats[index]=chat;
    }
    persist();
  }

  function renderGroups() {
    $('groups-index').hidden=false;$('group-detail').hidden=true;stopPolling();
    const cards=$('group-cards');cards.replaceChildren();$('group-count').textContent=state.groups.length;
    if(!state.user||!state.groups.length){const empty=make('div','empty-state');empty.innerHTML=icon('group');empty.append(make('h2','',state.user?'Great ideas grow together.':'Your next idea could be a shared one.'),make('p','',state.user?'Create a group for your class, team or next project. Share updates and work with AI in the same space.':'Sign in to create groups, invite teammates and bring your conversations together.'));empty.append(button(state.user?'Create your first group':'Sign in to collaborate','primary-button',()=>state.user?showDialog('group-dialog'):openAuth()));cards.append(empty);return;}
    state.groups.forEach((group,i)=>{const card=button('','group-card',()=>openGroup(group));card.style.animationDelay=(Math.min(i,5)*.04)+'s';const emblem=make('span','group-emblem');emblem.innerHTML=icon('group');card.append(emblem,make('h2','',group.name),make('p','',group.description||'A space for your team’s next idea.'));const foot=make('div','card-foot');foot.append(make('small','',(group.members?.length||0)+' members'+(ownsGroup(group)?' · You own this group':'')));const arrow=make('span');arrow.innerHTML=icon('right');foot.append(arrow);card.append(foot);cards.append(card);});
  }
  $('nav-groups').onclick=async()=>{if(state.sending){notify('Stop the AI answer before switching to groups.');return;}view('groups');renderGroups();if(state.user){try{state.groups=(await api('/projects')).projects;renderGroups();}catch(e){notify(e.message);}}};
  $('create-group').onclick=()=>state.user?showDialog('group-dialog'):openAuth();
  $('group-create-form').onsubmit=async e=>{e.preventDefault();const submit=e.currentTarget.querySelector('button');submit.disabled=true;$('group-create-error').textContent='';try{const data=await post('/projects',{name:$('group-create-name').value.trim(),description:$('group-create-description').value.trim()});state.groups.unshift(data.project);$('group-dialog').close();$('group-create-form').reset();$('group-count').textContent=state.groups.length;openGroup(data.project);}catch(e){$('group-create-error').textContent=e.message;}finally{submit.disabled=false;}};
  function stopPolling(){clearInterval(state.poll);state.poll=null;state.messagesKey='';}
  function openGroup(group){view('groups');state.group=group;state.messagesKey='';$('groups-index').hidden=true;$('group-detail').hidden=false;$('group-name').textContent=group.name;$('group-description').textContent=group.description||'Your shared thinking space.';$('group-member-count').textContent=(group.members?.length||0)+' members';$('group-messages').replaceChildren();$('group-message').value='';groupTab(false);}
  $('back-groups').onclick=renderGroups;
  function groupTab(shared){$('tab-discussion').setAttribute('aria-selected',String(!shared));$('tab-shared').setAttribute('aria-selected',String(shared));$('group-discussion').hidden=shared;$('shared-conversations').hidden=!shared;stopPolling();if(shared)renderShared();else{loadMessages(true);state.poll=setInterval(()=>{if(!document.hidden)loadMessages();},5000);}}
  $('tab-discussion').onclick=()=>groupTab(false);$('tab-shared').onclick=()=>groupTab(true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.view==='groups'&&state.group&&!$('group-discussion').hidden)loadMessages();});
  async function loadMessages(force=false){
    if(!state.group||state.groupLoading)return;
    const id=state.group.id;state.groupLoading=true;
    try{const data=await api('/projects/group-messages?projectId='+encodeURIComponent(id));if(state.group?.id!==id||state.view!=='groups')return;
      const key=data.messages.map(m=>m.id).join('|');$('group-sync').textContent='Up to date · '+(new Date()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      if(key===state.messagesKey&&!force)return;state.messagesKey=key;const list=$('group-messages'),nearEnd=list.scrollHeight-list.scrollTop-list.clientHeight<100,previousTop=list.scrollTop;list.replaceChildren();
      if(!data.messages.length){const empty=make('div','empty-state');empty.innerHTML=icon('chat');empty.append(make('h2','','Start the conversation.'),make('p','','Share a question, a discovery or your next step with the group.'));list.append(empty);}
      data.messages.forEach(message=>{const row=make('article','group-msg'+(message.userId===state.user.id?' mine':''));const heading=make('div','group-msg-heading');heading.append(make('strong','',message.userId===state.user.id?'You':message.username),make('time','',dateLabel(message.createdAt)+' · '+new Date(message.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})));if(message.userId===state.user.id||ownsGroup(state.group)){const remove=button('','icon-button',()=>confirmAction('Delete this group message?','The message will be removed for all group members.',async()=>{await post('/projects/group-messages/delete',{messageId:message.id});await loadMessages(true);}));remove.innerHTML=icon('trash');remove.setAttribute('aria-label','Delete group message');heading.append(remove);}row.append(heading,make('div','group-msg-body',message.content));list.append(row);});
      list.scrollTop=force||nearEnd?list.scrollHeight:previousTop;
    }catch(e){$('group-sync').textContent='Could not refresh: '+e.message;}finally{state.groupLoading=false;}
  }
  $('group-message').oninput=()=>resize($('group-message'));
  $('group-message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&matchMedia('(pointer:fine)').matches&&window.UnaysInterface?.preference('enterSend')!==false){e.preventDefault();$('group-message-form').requestSubmit();}};
  $('group-message-form').onsubmit=async e=>{e.preventDefault();const content=$('group-message').value.trim();if(!content||state.groupSending)return;const id=state.group.id;state.groupSending=true;const submit=e.currentTarget.querySelector('button');submit.disabled=true;try{if(!pendingGroupMessage||pendingGroupMessage.projectId!==id||pendingGroupMessage.content!==content)pendingGroupMessage={projectId:id,content,clientId:crypto.randomUUID()};await post('/projects/group-messages',pendingGroupMessage);pendingGroupMessage=null;if(state.group?.id===id){$('group-message').value='';resize($('group-message'));await loadMessages(true);}}catch(e){notify('Message not sent: '+e.message);}finally{submit.disabled=false;state.groupSending=false;}};
  async function renderShared(){const list=$('shared-chat-list');list.replaceChildren(make('p','quiet','Loading shared conversations…'));try{mergeConversations((await api('/chats')).chats);renderHistory();const chats=state.chats.filter(c=>c.projectId===state.group?.id);list.replaceChildren();if(!chats.length)list.append(make('div','empty-state','No AI conversations here yet. Ask AI together to start one.'));chats.forEach(chat=>{const row=button('','shared-card',()=>openChat(chat));row.innerHTML=icon('chat');const text=make('div');text.append(make('strong','',chat.title),make('small','',dateLabel(chat.updatedAt||chat.createdAt)+' · '+chat.messages.length+' messages'));row.append(text);list.append(row);});}catch(e){list.replaceChildren(make('p','form-error',e.message));}}
  $('group-new-chat').onclick=()=>newChat(state.group.id);
  function renderMembers(){const group=state.group,list=$('members-list');$('members-title').textContent=group.name;list.replaceChildren();(group.members||[]).forEach(member=>{const row=make('div','member-row');row.append(make('span','avatar',(member.username||'U')[0].toUpperCase()));const info=make('div');info.append(make('strong','',member.username||'Member'),make('small','',member.email||''));row.append(info);if(member.userId===group.ownerId)row.append(make('span','member-role','Owner'));else if(ownsGroup(group)){const remove=button('','icon-button',()=>confirmAction('Remove this member?','They will lose access to this group’s messages and shared conversations.',async()=>{const data=await post('/projects/remove-member',{projectId:group.id,userId:member.userId});state.group=data.project;state.groups=state.groups.map(g=>g.id===data.project.id?data.project:g);renderMembers();$('group-member-count').textContent=data.project.members.length+' members';},'Remove'));remove.innerHTML=icon('close');remove.setAttribute('aria-label','Remove '+member.username);row.append(remove);}list.append(row);});$('invite-form').hidden=!ownsGroup(group);$('delete-group').hidden=!ownsGroup(group);$('invite-error').textContent='';}
  $('manage-group').onclick=()=>{renderMembers();showDialog('members-dialog');};
  $('invite-form').onsubmit=async e=>{e.preventDefault();const submit=e.currentTarget.querySelector('button');submit.disabled=true;$('invite-error').textContent='';try{const data=await post('/projects/invite',{projectId:state.group.id,usernameOrEmail:$('invite-input').value.trim()});state.group=data.project;state.groups=state.groups.map(g=>g.id===data.project.id?data.project:g);$('invite-input').value='';renderMembers();$('group-member-count').textContent=data.project.members.length+' members';notify('Member added to your group.');}catch(e){$('invite-error').textContent=e.message;}finally{submit.disabled=false;}};
  $('delete-group').onclick=()=>confirmAction('Delete '+state.group.name+'?','This permanently deletes the group, its messages and shared AI conversations for every member.',async()=>{const id=state.group.id;await post('/projects/delete',{projectId:id});state.groups=state.groups.filter(g=>g.id!==id);state.chats=state.chats.filter(c=>c.projectId!==id);state.group=null;$('members-dialog').close();persist();renderGroups();renderHistory();});

  async function init(){
    try{const me=await api('/auth/me');state.user=me.user;}catch(e){if(e.status===401){state.token='';storage.token('');}else if(state.token)notify('Could not check your account. Please reload when your connection is available.');}
    if(state.user)await loadAccount();else state.chats=savedChats();
    try{await refreshAccess();}catch(e){notify(e.message);}
    updateQuota();renderHistory();setMode('general');state.initialized=true;if(new URLSearchParams(location.search).has('signin')&&!state.user)openAuth();
  }
  window.UnaysWorkspace={
    identity:()=>state.user?.id||'guest',chat:currentChat,notify,confirm:confirmAction,signin:openAuth,
    snapshot:()=>({user:state.user,chats:state.chats,groups:state.groups,sending:state.sending}),openChat,openGroup,read:api,
    async createCode(title){newChat();const chat=this.ensureCodeChat();chat.title=title;chat.updatedAt=new Date().toISOString();persist();renderHistory();window.UnaysCode?.open();await saveChat(chat);return chat;},
    prepare(text){view('chat');$('question').value=text;resize($('question'));$('question').focus();},
    attachText(name,content){if(state.attachments.length>=2){notify('Attach up to two sources per message.');return;}state.attachments.push({name,content:String(content).slice(0,9000)});renderAttachments();},
    request:post,updateQuota,
    ask(text){$('question').value=text;resize($('question'));send(text);},
    ensureCodeChat(){let chat=currentChat();if(!chat){chat={id:uid(),title:'Coding project',mode:'coder',projectId:state.newProjectId||null,userId:state.user?.id||null,createdAt:new Date().toISOString(),messages:[]};state.chats.unshift(chat);state.current=chat.id;renderHistory();}return chat;},
    resumeCode(id){const chat=state.chats.find(c=>c.id===id&&c.mode==='coder');if(!chat)return false;openChat(chat);return true;},
    async saveFiles(files){const chat=currentChat();if(!chat)return false;chat.workspaceFiles=files;chat.updatedAt=new Date().toISOString();await saveChat(chat);return !!chat._saved&&!chat._saveError;},
    canEdit:()=>!currentChat()?.userId||currentChat().userId===state.user?.id,
    newChat,view
  };
  const ready=init();
  ready.then(()=>window.dispatchEvent(new Event('unays-ready')));
})();
