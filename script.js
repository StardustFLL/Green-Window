/* ===== IA ABERTA (sem conta) — vários provedores com troca automática =====
   Ordem de tentativa: cada provedor é tentado UMA vez (limite de tempo curto); se falhar, passa ao próximo.
   Chave opcional (melhora limites): coloque em AI_KEY ou rode localStorage.setItem("jv_ai_key","SUA_CHAVE"). */
const AI_KEY="";
function aiProviders(img){
 let key=AI_KEY;try{key=localStorage.getItem("jv_ai_key")||AI_KEY}catch(e){}
 const L=[];
 if(key)L.push({id:"pollinations-key",url:"https://gen.pollinations.ai/v1/chat/completions",model:"openai",key,vision:true,to:30000});
 L.push({id:"ovh-visao",url:"https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions",model:"Qwen2.5-VL-72B-Instruct",vision:true,to:35000});
 L.push({id:"pollinations",url:"https://text.pollinations.ai/openai",model:"openai-fast",vision:false,to:20000});
 L.push({id:"pollinations-vis",url:"https://text.pollinations.ai/openai",model:"openai",vision:true,to:30000});
 L.push({id:"ovh-texto",url:"https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions",model:"Meta-Llama-3_3-70B-Instruct",vision:false,to:25000});
 return L.filter(p=>img?p.vision:true);
}
const _bad={};window.__aiLog=[];
function _blobURL(b){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no({code:"image"});r.readAsDataURL(b)})}
async function _openCall(prompt,opts){
 opts=opts||{};
 let msgs=Array.isArray(prompt)?prompt.map(m=>({role:m.role,content:m.content})):[{role:"user",content:String(prompt)}];
 const hasImg=!!(opts.images&&opts.images.length);
 if(hasImg){
  const urls=await Promise.all(opts.images.map(i=>typeof i=="string"?i:_blobURL(i)));
  const last=msgs[msgs.length-1];
  last.content=[{type:"text",text:String(last.content)}].concat(urls.map(u=>({type:"image_url",image_url:{url:u}})));
 }
 const provs=aiProviders(hasImg),fails=[];let all429=true;
 const order=provs.filter(p=>!(_bad[p.id]>Date.now())).concat(provs.filter(p=>_bad[p.id]>Date.now()));
 for(const p of order){
  const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),p.to);
  try{
   const h={"Content-Type":"application/json"};if(p.key)h.Authorization="Bearer "+p.key;
   const res=await fetch(p.url,{method:"POST",headers:h,signal:ctl.signal,body:JSON.stringify({model:p.model,messages:msgs,max_tokens:900,temperature:0.3,stream:false})});
   if(!res.ok){fails.push(p.id+":"+res.status);if(res.status!=429)all429=false;_bad[p.id]=Date.now()+(res.status==429?30000:90000);continue}
   const j=await res.json();
   const txt=j&&j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content;
   if(!txt){fails.push(p.id+":vazio");all429=false;_bad[p.id]=Date.now()+30000;continue}
   _bad[p.id]=0;window.__aiLog.push({ok:p.id,t:Date.now()});return{text:String(txt)};
  }catch(e){all429=false;fails.push(p.id+":"+(e&&e.name=="AbortError"?"tempo":"rede"));_bad[p.id]=Date.now()+60000}
  finally{clearTimeout(tm)}
 }
 window.__aiLog.push({falhou:fails,t:Date.now()});
 if(all429&&fails.length)throw{code:"rate_limited"};
 throw{code:"IA: "+fails.join(", ")};
}
function openSample(){
 const f=async(prompt,opts)=>{
  try{if(typeof claude!="undefined"&&claude&&claude.use){const sm=await claude.use("sample");if(sm){const o={...(opts||{})};return await sm(prompt,o)}}}catch(e){if(e&&e.code=="rate_limited"){}}
  return _openCall(prompt,opts)};
 f.limits=async()=>({images:true});
 return f;
}
window.testarIA=async()=>{try{const r=await openSample()("Responda só: ok");console.log("IA OK:",r.text,window.__aiLog);return r.text}catch(e){console.log("IA FALHOU:",e,window.__aiLog);return e}};
"use strict";
/* ===== CONFIG (administrador do projeto) ===== */
const CFG={modoTeste:true,pontosPorDia:10,pontosPlantaNova:5,
 // Recompensas oficiais devem ser cadastradas aqui pela equipe. Vazio = nenhuma recompensa disponível.
 recompensas:[], // ex.: {id:"r1",nome:"...",desc:"...",custo:100,emoji:"🎁",estoque:10}
 qrPrefixo:"janelaverde:" /* QR válido do projeto: "janelaverde:<atividade>" */};
const AVATARS=["🌸","🪻","🌿","🌱","⭐","🪐","🚀","🤖","🦋","🌙","🌺","☄️"];
const LS="jv_demo_v1";
let DB;try{DB=JSON.parse(localStorage.getItem(LS))||{users:{},session:null}}catch(e){DB={users:{},session:null}}
function save(){try{localStorage.setItem(LS,JSON.stringify(DB));return true}catch(e){toast("Armazenamento cheio. Exclua registros antigos.");return false}}
const $=s=>document.querySelector(s);
const U=()=>DB.users[DB.session];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const day=d=>{const x=new Date(d);return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0")};
const fmt=d=>new Date(d).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
function toast(m){const t=document.createElement("div");t.className="toast";t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
/* senha: PBKDF2 + sal (demonstração; o correto é fazer isso em servidor) */
async function hash(pw,salt){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveBits"]);const b=await crypto.subtle.deriveBits({name:"PBKDF2",salt:Uint8Array.from(atob(salt),c=>c.charCodeAt(0)),iterations:150000,hash:"SHA-256"},k,256);return btoa(String.fromCharCode(...new Uint8Array(b)))}
const newSalt=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
function cpfOk(c){c=c.replace(/\D/g,"");if(c.length!=11||/^(\d)\1+$/.test(c))return false;for(let t=9;t<11;t++){let s=0;for(let i=0;i<t;i++)s+=c[i]*(t+1-i);if((s*10%11)%10!=c[t])return false}return true}
const maskCpf=v=>v.replace(/\D/g,"").slice(0,11).replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2");
const maskTel=v=>{v=v.replace(/\D/g,"").slice(0,11);return v.length>10?v.replace(/(\d\d)(\d{5})(\d{4})/,"($1) $2-$3"):v.replace(/(\d\d)(\d{0,4})(\d{0,4})/,(m,a,b,c)=>"("+a+") "+b+(c?"-"+c:""))};
/* ===== LÓGICA ===== */
function days(u){return [...new Set(u.regs.map(r=>day(r.ts)))].sort()}
function streaks(u){const d=days(u);let best=0,run=0,prev=null;d.forEach(x=>{const t=new Date(x+"T12:00");run=prev&&Math.round((t-prev)/864e5)==1?run+1:1;prev=t;best=Math.max(best,run)});
 let cur=0;if(d.length){const last=d[d.length-1],today=day(Date.now()),yest=day(Date.now()-864e5);if(last==today||last==yest){cur=1;for(let i=d.length-1;i>0;i--){if(Math.round((new Date(d[i]+"T12:00")-new Date(d[i-1]+"T12:00"))/864e5)==1)cur++;else break}}}return{cur,best,total:d.length}}
const saldo=u=>u.pts.reduce((a,p)=>a+p.v,0);
function goals(u){const s=streaks(u),p=saldo(u),n=u.regs.length;return[
 {t:"Fazer o primeiro registro",a:Math.min(n,1),b:1},{t:"Registrar a planta durante 3 dias",a:Math.min(s.total,3),b:3},
 {t:"Completar 7 dias de acompanhamento",a:Math.min(s.total,7),b:7},{t:"Registrar 5 etapas de crescimento",a:Math.min(n,5),b:5},
 {t:"Alcançar 100 pontos ganhos",a:Math.min(u.pts.filter(x=>x.v>0).reduce((a,x)=>a+x.v,0),100),b:100},{t:"Manter 3 dias seguidos",a:Math.min(s.best,3),b:3},{t:"Completar 14 dias de acompanhamento",a:Math.min(s.total,14),b:14},{t:"Enviar 15 fotos validadas",a:Math.min(n,15),b:15}]}
/* ===== ROTEAMENTO ===== */
let view="splash",tmp={};
function go(v){view=v;render()}
function render(){const a=$("#app");a.innerHTML="";const u=U();
 const authed=["home","assist","profile","rewards","plants","rank"];
 if(view=="admin"&&!tmp.admok)view=u?"profile":"splash";
 if(u&&["splash","signup","login"].includes(view))view="home";
 if(!u&&authed.includes(view))view="splash";
 a.innerHTML='<div class="page">'+(V[view]?V[view]():"")+"</div>";
 $("#nav").innerHTML=u&&authed.includes(view)?'<nav><div>'+[["home","🏡","Início"],["reg","📷","Registro"],["assist","🤖","Green AI"],["rank","🏆","Ranking"],["profile","🪐","Perfil"]].map(([k,i,l])=>`<button class="${view==k?"on":""}" onclick="${k=="reg"?"openReg()":`go('${k}')`}" aria-label="${l}"><b>${i}</b>${l}</button>`).join("")+"</div></nav>":"";
 if(V2[view])V2[view]();window.scrollTo(0,0)}
const hdr=(t,back)=>`<div class="row" style="margin-bottom:6px">${back?`<button class="btn sec sm" style="flex:0" onclick="go('${back}')">← Voltar</button>`:""}<h2 style="flex:3">${t}</h2></div>`;
const STARDUST='<svg width="46" height="46" viewBox="0 0 48 48" aria-label="Símbolo STARDUST"><path d="M24 3l4.5 14.5L43 24l-14.5 4.5L24 45l-4.5-16.5L5 24l14.5-6.5z" fill="#cdb3e6" stroke="#fff" stroke-width="1"/><circle cx="24" cy="24" r="4" fill="#fff"/></svg>';
const V={},V2={};
/* --- Splash --- */
V.splash=()=>`<div class="center" style="padding-top:8vh"><div class="flower">🪻</div><h1>Janela Verde</h1><p class="mu">Cultive, registre e cresça junto com o universo.</p>
<div class="row" style="justify-content:center;flex:none"><span class="mu">STARDUST · SESI 005 – Limeira</span></div>
<button class="btn" onclick="go('signup')">Criar conta</button><button class="btn sec" onclick="go('login')">Já tenho conta</button>
<button class="btn sec sm" style="margin-top:18px" onclick="adminLogin()">Acesso do administrador</button>
</div>`;
function birthDateChange(){
 const d=$("#nasc_d").value,m=$("#nasc_m").value,y=$("#nasc_a").value,hidden=$("#nasc");
 hidden.value="";
 if(!d||!m||!y)return;
 const maxDay=new Date(Number(y),Number(m),0).getDate();
 if(Number(d)>maxDay){$("#nasc_d").value="";return}
 const value=`${y}-${m}-${d}`;
 if(value>day(Date.now()))return;
 hidden.value=value;
}
/* --- Cadastro --- */
V.signup=()=>`${hdr("Criar conta","splash")}<div class="card"><form onsubmit="return false" id="f">
<label>Nome completo</label><input id="nome" autocomplete="name"><div class="err" id="e_nome"></div>
<label>CPF</label><input id="cpf" inputmode="numeric" placeholder="000.000.000-00" oninput="this.value=maskCpf(this.value)"><div class="err" id="e_cpf"></div>
<label>E-mail</label><input id="email" type="email" autocomplete="email"><div class="err" id="e_email"></div>
<label>Telefone</label><input id="tel" inputmode="tel" placeholder="(00) 00000-0000" oninput="this.value=maskTel(this.value)"><div class="err" id="e_tel"></div>
<label>Data de nascimento</label>
<div class="row" style="gap:8px">
<select id="nasc_d" aria-label="Dia do nascimento" onchange="birthDateChange()"><option value="">Dia</option>${Array.from({length:31},(_,i)=>`<option value="${String(i+1).padStart(2,"0")}">${i+1}</option>`).join("")}</select>
<select id="nasc_m" aria-label="Mês do nascimento" onchange="birthDateChange()"><option value="">Mês</option>${["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m,i)=>`<option value="${String(i+1).padStart(2,"0")}">${m}</option>`).join("")}</select>
<select id="nasc_a" aria-label="Ano do nascimento" onchange="birthDateChange()"><option value="">Ano</option>${Array.from({length:new Date().getFullYear()-1899},(_,i)=>new Date().getFullYear()-i).map(y=>`<option value="${y}">${y}</option>`).join("")}</select>
</div><input id="nasc" type="hidden"><div class="err" id="e_nasc"></div>
<div class="card" style="background:#2a185088"><b>Local de cultivo</b><p class="mu">Informe o estado e o local do cultivo.</p>
<label>Estado</label><select id="luf"><option value="">Selecione</option>${"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ").map(u=>`<option>${u}</option>`).join("")}</select>
<label>Cidade</label><input id="lcid" maxlength="60" autocomplete="address-level2"><label>Endereço onde mora (rua e número)</label><input id="lloc" maxlength="120" autocomplete="street-address"><div class="err" id="e_loc"></div><div id="e_sug"></div><div class="chk" style="margin-top:10px"><input type="checkbox" id="gpsok"><span class="mu">Autorizo o Janela Verde a usar minha localização atual do GPS para mostrar minha posição no mapa do administrador. Se eu não autorizar ou o GPS não funcionar, será usada uma localização aproximada pelo endereço.</span></div></div>
<label>Senha (mín. 8, com letra e número)</label><input id="pw" type="password" autocomplete="new-password"><div class="err" id="e_pw"></div>
<label>Confirmar senha</label><input id="pw2" type="password" autocomplete="new-password"><div class="err" id="e_pw2"></div>
<div class="chk"><input type="checkbox" id="lgpd"><span class="mu">Li e aceito o tratamento dos meus dados conforme a LGPD, para fins de participação no projeto. Posso exportar ou excluir meus dados em Perfil → Privacidade.</span></div><div class="err" id="e_lgpd"></div>
<div class="chk"><input type="checkbox" id="resp"><span class="mu">Se tenho menos de 18 anos, um responsável legal autorizou minha participação.</span></div><div class="err" id="e_resp"></div>
<button class="btn" id="sb" onclick="signup()">Cadastrar</button></form></div>`;
const UFC={AC:[-9,-70.8],AL:[-9.6,-36.8],AP:[1.4,-51.8],AM:[-3.9,-64.6],BA:[-12.5,-41.7],CE:[-5.1,-39.4],DF:[-15.8,-47.9],ES:[-19.6,-40.6],GO:[-15.9,-49.8],MA:[-5,-45.3],MT:[-12.9,-55.9],MS:[-20.5,-54.6],MG:[-18.5,-44.6],PA:[-3.8,-52],PB:[-7.1,-36.7],PR:[-24.6,-51.5],PE:[-8.4,-37.9],PI:[-7.7,-42.7],RJ:[-22.2,-42.7],RN:[-5.8,-36.6],RS:[-29.7,-53.2],RO:[-10.9,-62.8],RR:[2.1,-61.4],SC:[-27.2,-50.5],SP:[-22.2,-48.8],SE:[-10.6,-37.4],TO:[-10.2,-48.3]};
async function verifyLoc(cid,uf,bai,tp){try{const sm=await openSample();if(!sm)return{ok:false,m:"Não consegui validar o local agora (IA indisponível). Tente de novo em instantes."};
 const t=(await sm("Você valida endereços do Brasil. Cidade: \""+cid.replace(/"/g,"'")+"\"; Estado: "+uf+"; Bairro ou rua: \""+bai.replace(/"/g,"'")+"\"; Tipo: "+tp+". Responda APENAS JSON {\"ok\":boolean,\"lat\":number,\"lng\":number,\"motivo\":\"frase curta em português\"}. ok=true somente se a cidade REALMENTE existe nesse estado e o bairro ou rua é um nome real e plausível de lá (ou escola/condomínio plausível). Palavrões, partes do corpo, piadas, nomes aleatórios, sem sentido ou lugares inexistentes = ok=false. lat/lng = coordenadas aproximadas do bairro (ou da cidade se não souber o bairro).",{cache:false,modelTier:"default"})).text;
 const r=JSON.parse(t.match(/\{[\s\S]*\}/)[0]);if(!r.ok)return{ok:false,m:"Local não confirmado: "+(r.motivo||"informe um local que exista.")};const la=+r.lat,ln=+r.lng;return{ok:true,geo:isFinite(la)&&isFinite(ln)?{lat:la,lng:ln,acc:"aprox"}:null}}catch(e){const c=UFC[uf];return{ok:true,tech:true,geo:c?{lat:c[0],lng:c[1],acc:"aprox"}:null}}}
async function uniqueChar(base,selfId){base=base.replace(/\s+/g," ").trim().slice(0,16)||"Jardineiro";const taken=new Set(Object.values(DB.users).filter(x=>x.id!=selfId).map(x=>String(x.char).toLowerCase()));
 try{const h=await dbh();if(h){const q=await h.db.collection("ranking").get();q.docs.forEach(d=>{const x=d.data();if(x&&x.char&&d.id!=h.id+"_"+selfId)taken.add(String(x.char).toLowerCase())})}}catch(e){}
 let c=base,n=0;while(taken.has(c.toLowerCase())){c=base+String(Math.floor(100+Math.random()*900));if(++n>50)c=base+Date.now()%100000}return c}
async function chSave(){const v=$("#ch").value.trim();if(v.length<2)return toast("Mínimo 2 letras");const c=await uniqueChar(v,U().id);U().char=c;save();pubRank();syncUser();render();if(c!=v)toast("Esse nome já existe. Ficou: "+c)}
const gps=()=>new Promise((ok,no)=>navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>ok({lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy)}),no,{enableHighAccuracy:true,timeout:30000,maximumAge:0}):no());
async function signup(){const g=id=>$("#"+id).value.trim(),E=(k,m)=>{$("#e_"+k).textContent=m||"";return !!m};let bad=false;
 bad|=E("nome",g("nome").split(/\s+/).length<2?"Informe nome e sobrenome.":"");
 bad|=E("cpf",!cpfOk(g("cpf"))?"CPF inválido.":"");
 bad|=E("email",!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(g("email"))?"E-mail inválido.":"");
 bad|=E("tel",g("tel").replace(/\D/g,"").length<10?"Telefone inválido.":"");
 bad|=E("nasc",!g("nasc")?"Informe a data de nascimento.":g("nasc")>day(Date.now())?"A data não pode ser no futuro.":"");
 
 const pw=$("#pw").value;bad|=E("loc",(!g("luf")||g("lcid").length<2||g("lloc").length<4)?"Informe estado, cidade e endereço (rua e número).":"");
 bad|=E("pw",pw.length<8||!/[A-Za-z]/.test(pw)||!/\d/.test(pw)?"Senha fraca: mín. 8 caracteres com letras e números.":"");
 bad|=E("pw2",pw!==$("#pw2").value?"As senhas não conferem.":"");
 bad|=E("lgpd",!$("#lgpd").checked?"É necessário aceitar para continuar.":"");
 const age=(Date.now()-new Date(g("nasc")))/315576e5;bad|=E("resp",age<18&&!$("#resp").checked?"Menores de 18 anos precisam de autorização do responsável.":"");
 const em=g("email").toLowerCase();if(!bad&&!CFG.modoTeste&&Object.values(DB.users).some(x=>x.email==em||x.cpf==g("cpf"))&&tmp.dup!=em+g("cpf")){tmp.dup=em+g("cpf");E("email","Já existe uma conta com este e-mail ou CPF neste aparelho (provavelmente de um teste). Se é você, volte e toque em “Já tenho conta”. Para criar outra mesmo assim, toque em Cadastrar de novo.");return}
 if(bad)return;const c0=UFC[g("luf")];let pos=c0?{lat:c0[0],lng:c0[1],acc:"aprox"}:null;$("#sb").disabled=true;$("#sb").textContent="Confirmando endereço…";showSug(null);
 let gpsPos=null,gpsMsg="";
 if($("#gpsok").checked){
   if(!window.isSecureContext){gpsMsg="GPS indisponível: abra o app por um endereço HTTPS seguro."}
   else {$("#sb").textContent="Solicitando permissão do GPS…";try{gpsPos=await gps()}catch(e){gpsMsg="GPS não autorizado ou indisponível; será usada uma localização aproximada."}}
 }
 $("#sb").textContent="Confirmando endereço…";
 const vl=await geoEnd(g("lcid"),g("luf"),g("lloc"));if(!vl.ok){E("loc",vl.m);showSug(vl,g("lloc"));$("#sb").disabled=false;$("#sb").textContent="Cadastrar";return}if(vl.geo)pos=vl.geo;if(gpsPos)pos=gpsPos;$("#sb").textContent="Criando…";
 const chr=await uniqueChar(g("nome").split(" ")[0],""),salt=newSalt(),id="u"+Date.now();
 DB.users[id]={id,nome:g("nome"),cpf:g("cpf"),email:em,tel:g("tel"),nasc:g("nasc"),salt,ph:await hash(pw,salt),avatar:"🌸",char:chr,consent:Date.now(),plants:[{id:"p"+Date.now(),nome:"Minha planta",especie:"",inicio:day(Date.now()),local:g("lloc")+", "+g("lcid")+" – "+g("luf"),foto:"",obs:""}],geo:pos,gpsConsent:$("#gpsok").checked,gpsAccuracy:gpsPos?gpsPos.acc:null,end:g("lloc")+", "+g("lcid")+" – "+g("luf"),locNote:gpsPos?("GPS autorizado; precisão aproximada de "+gpsPos.acc+" m"):(gpsMsg||vl.conf||""),regs:[],pts:[],resg:[],qr:[],onboarded:false,created:Date.now()};
 DB.session=id;save();syncUser();tmp.step=0;go("intro1")}
/* --- Login --- */
V.login=()=>`${hdr("Entrar","splash")}<div class="card"><label>E-mail</label><input id="le" autocomplete="username"><label>Senha</label><div class="row"><input id="lp" type="password" autocomplete="current-password"><button class="btn sec sm" style="flex:0" onclick="const i=$('#lp');i.type=i.type=='password'?'text':'password'">👁</button></div>
<div class="err" id="le_e"></div><button class="btn" onclick="login()">Entrar</button><button class="btn sec" onclick="recover()">Esqueci minha senha</button><button class="btn sec sm" onclick="resetDemo()">Reiniciar demonstração</button></div>`;
let tries=0;async function login(){const em=$("#le").value.trim().toLowerCase(),pw0=$("#lp").value;let u=null;for(const x of Object.values(DB.users).filter(x=>x.email==em)){if(await hash(pw0,x.salt)===x.ph){u=x;break}}
 if(tries>=5){$("#le_e").textContent="Muitas tentativas. Aguarde 30 s.";return}
 if(!u){tries++;setTimeout(()=>tries=0,3e4);$("#le_e").textContent="E-mail ou senha incorretos.";return}
 DB.session=u.id;save();syncUser();go(u.onboarded?"home":"intro1")}
function recover(){const em=$("#le").value.trim();toast(em?"Em produção, enviaríamos um link para "+em+". Esta demo local não envia e-mails.":"Digite seu e-mail primeiro.")}
/* --- Introdução --- */
const deco='<div class="center" style="font-size:2.2rem;letter-spacing:10px">✦ 🌿 ✦</div>';
V.intro1=()=>`<div class="center" style="padding-top:5vh">${STARDUST}<h2>Quem somos</h2><div class="card"><div style="font-size:3rem">🤖🪻</div><p style="line-height:1.7;text-align:left">A equipe Stardust do SESI 005 – Limeira foi formada em 30 de maio de 2025, com o propósito de aprender, inovar e crescer por meio da tecnologia e da robótica. Nosso lema, “We are all made of stardust”, representa nossa união, humildade e vontade de superar desafios juntos.</p></div><button class="btn" onclick="go('intro2')">Continuar</button></div>`;
V.intro2=()=>`<div class="center" style="padding-top:5vh"><h2>Nosso propósito</h2><div class="card"><div style="font-size:3rem">🌱➜🪻</div><p style="line-height:1.7">O propósito do projeto é incentivar o cultivo de plantas em áreas urbanas, promovendo a sustentabilidade e a educação ambiental por meio da tecnologia, além de estimular os alunos a cuidar das plantas e acompanhar seu crescimento.</p></div><button class="btn" onclick="go('intro3')">Continuar</button></div>`;
const STEPS=[["📱","Escanear o QR Code","O usuário escaneia o QR Code disponibilizado pelo projeto para acessar ou iniciar o processo de participação."],["📝","Fazer o cadastro","O usuário cria sua conta ou entra em uma conta já existente."],["📍","Informar o local de cultivo","O usuário informa onde está cultivando sua planta, utilizando a localização autorizada ou preenchendo o endereço ou local manualmente."],["📷","Enviar fotos da planta","O usuário registra fotos frequentes da planta para acompanhar seu desenvolvimento."],["🏆","Ganhar pontos e trocar por recompensas","O usuário acumula pontos ao registrar seus cuidados e pode utilizar esses pontos para resgatar recompensas disponibilizadas pelo projeto."]];
const stepsHtml=()=>`<div class="tl">${STEPS.map((s,i)=>`<div class="card"><b>${s[0]} ${i+1}. ${s[1]}.</b><p class="mu">${s[2]}</p></div>`).join("")}</div>`;
V.intro3=()=>`<h2 class="center">Como funciona o Janela Verde?</h2>${stepsHtml()}<button class="btn" onclick="U().onboarded=true;save();go('home')">Começar</button>`;
V.help=()=>`${hdr("Ajuda","profile")}${stepsHtml()}<button class="btn sec" onclick="go('intro1')">Rever apresentação da equipe</button>`;
/* --- Home --- */
V.home=()=>{const u=U(),s=streaks(u),ord=[...u.regs].sort((a,b)=>b.ts-a.ts),start=u.regs.length?Math.min(...u.regs.map(r=>r.ts)):null;
 return `<div class="row"><div style="flex:none">${av(u,54)}</div><div><span class="mu">Olá,</span><h2>${esc(u.char)}</h2></div><div style="flex:0;white-space:nowrap" class="stat"><b>⭐ ${saldo(u)}</b>pontos</div></div>
<button class="reg" onclick="openReg()"><span>📷</span>Registro<div style="font-size:.85rem;font-weight:400">Toque para enviar a foto da planta</div></button>
${plantPick(u)}${goalHero(u)}<div class="card"><h2>Próximas conquistas</h2><div class="gs">${goals(u).map(ring).join("")}</div></div>
<div class="card"><h2>Seu percurso</h2>${ord.length?`<div class="tl">${ord.map(r=>{const p=u.plants.find(p=>p.id==r.plant);return `<div class="tli" onclick="viewReg('${r.id}')"><img src="${r.foto||QRIMG}" alt="Foto"><div><b>${esc(p?.nome||r.amigo||"Planta")}</b> · ${fmt(r.ts)}<div class="mu">Dia ${Math.floor((r.ts-start)/864e5)+1} do acompanhamento</div><div>${esc(r.obs).slice(0,70)||'<span class="mu">Sem observações</span>'}</div></div></div>`}).join("")}</div>`:`<p class="center mu">🌱<br>Seu percurso começa com a primeira foto!</p>`}</div>
<div class="card gv"><h2>Sua jornada verde</h2><div class="grid"><div class="stat"><b>🔥 ${s.cur}</b>ofensiva atual (dias seguidos)</div><div class="stat"><b>🏅 ${s.best}</b>maior sequência</div><div class="stat"><b>📅 ${s.total}</b>total de dias registrados</div><div class="stat"><b>🎯 ${goals(u).filter(g=>g.a>=g.b).length}/${goals(u).length}</b>metas concluídas</div></div>
<p class="mu">Só conta 1 dia por data, não importa quantas fotos. Ofensiva = dias consecutivos com registro.</p>
<h3>Ranking geral</h3><div id="hrk" class="mu">Carregando…</div><button class="btn sec sm" onclick="go('rank')">Ver ranking completo</button><p class="center ok">${s.cur?"Você está fazendo a diferença!":"Continue cuidando da sua planta!"}</p></div>
<div class="card"><h2>Pontos e recompensas</h2><p class="mu">+${CFG.pontosPorDia} pontos no 1º registro de cada dia · +${CFG.pontosPlantaNova} ao cadastrar uma planta nova. Fotos extras no mesmo dia não geram pontos.</p><div class="row"><button class="btn sec" onclick="go('rewards')">🎁 Recompensas</button><button class="btn sec" onclick="go('plants')">🪴 Minhas plantas</button></div></div>`};
/* --- Registro --- */
function plantPick(u){return "";const a=u.active||u.plants[0].id;return `<div class="card"><b>Planta ativa</b><div>${u.plants.map(p=>`<span class="chip ${p.id==a?"sel":""}" onclick="U().active='${p.id}';save();render()">${esc(p.nome)}</span>`).join("")}<span class="chip" onclick="go('plants')">+ Nova</span></div></div>`}
function openReg(keep){const u=U();if(!keep){tmp.foto=null;tmp.qrCode=null;tmp.rpo="";tmp.rpn="";return regQR()}const act=u.active&&u.plants.find(p=>p.id==u.active)?u.active:u.plants[0].id;
 const nm=keep&&tmp.rpn?tmp.rpn:(u.plants.find(p=>p.id==act)||u.plants[0]).nome;
 $("#modal").innerHTML=`<div class="modal"><div><h2>Novo registro</h2><label>Nome da planta (ou das plantas)</label><input id="rp" maxlength="40" list="pls" value="${esc(nm)}"><datalist id="pls">${u.plants.map(p=>`<option value="${esc(p.nome)}">`).join("")}</datalist>
 <div class="card" style="margin:8px 0;padding:10px"><b>QR Code do vaso:</b> <span class="ok">Lido com sucesso</span><div class="mu" style="font-size:.85rem;overflow-wrap:anywhere">${esc(tmp.qrCode||"")}</div></div><div style="display:flex;align-items:center;gap:10px"><p class="mu" style="flex:1;margin:6px 0">Agora tire uma foto da planta para registrar.</p><button type="button" id="hb" class="btn sm sec" style="width:auto;white-space:nowrap;padding:8px 14px;border-radius:999px" onclick="helpToggle()" aria-label="Pedir ajuda: a IA não reconheceu minha foto">❓ Pedir ajuda</button></div><div id="hp" class="card" style="display:none;margin:6px 0"><b>A IA recusou uma foto válida?</b><p class="mu">Descreva o que aparece (ex.: vaso com terra e pequenos brotos recém-nascidos). A IA analisa a mesma foto de novo junto com a sua descrição. Plantas, brotos, sementes, terra, vasos, minhocas e abelhas são aceitos; fotos sem relação com jardinagem continuam recusadas.</p><textarea id="hx" rows="2" maxlength="300" placeholder="Ex.: vaso com terra e brotos de lentilha pequenos"></textarea><button type="button" class="btn sm" id="hs" onclick="helpSend()">Enviar explicação</button><div class="err" id="hm"></div></div>
 <div id="prev" class="center mu" style="margin:8px 0">${tmp.foto?`<img class="big" src="${tmp.foto}" alt="Prévia">`:"Nenhuma foto selecionada"}</div>
 <button class="btn sec" onclick="$('#fcam').click()">📷 Tirar foto agora</button><button class="btn sec" onclick="$('#fc').click()">🖼 ${tmp.foto?"Trocar foto":"Escolher da galeria"}</button>
 <input id="fcam" type="file" accept="image/*" capture="environment" hidden onchange="pick(this)"><input id="fc" type="file" accept="image/*" hidden onchange="pick(this)">
 <label>Observações (opcional)</label><textarea id="ro" rows="3" maxlength="500">${esc(tmp.rpo||"")}</textarea><div class="err" id="re"></div>
 <button class="btn" id="rs" onclick="saveReg()">Salvar registro</button><button class="btn sec" onclick="$('#modal').innerHTML=''">Cancelar</button></div></div>`}
const QRIMG="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#3b2260"/><g fill="none" stroke="#d9c2f5" stroke-width="5"><rect x="14" y="14" width="18" height="18"/><rect x="48" y="14" width="18" height="18"/><rect x="14" y="48" width="18" height="18"/></g><path d="M48 48h8v8h-8zM60 60h6v6h-6zM58 48h8v4h-8z" fill="#d9c2f5"/></svg>');
/* Câmera: tenta traseira, depois qualquer câmera; se o navegador/iframe bloquear, cai no app de câmera do celular (foto do QR). */
async function getCam(){
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw{name:"Unsupported"};
 try{return await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false})}
 catch(e){if(e&&(e.name=="OverconstrainedError"||e.name=="NotFoundError"||e.name=="AbortError"))return await navigator.mediaDevices.getUserMedia({video:true,audio:false});throw e}}
function camMsg(e){const n=e&&e.name||"";
 if(n=="NotAllowedError"||n=="SecurityError")return"A câmera foi bloqueada (pelo navegador ou porque o app está dentro de outra página). Se já tocou em Permitir e continua assim, use o botão “Tirar foto agora”, que abre o app de câmera do celular.";
 if(n=="NotFoundError"||n=="DevicesNotFoundError")return"Nenhuma câmera encontrada neste aparelho.";
 if(n=="NotReadableError"||n=="TrackStartError")return"A câmera está em uso por outro app. Feche os outros apps e tente de novo.";
 if(n=="Unsupported")return"Este navegador não permite acessar a câmera aqui. Use o botão “Tirar foto agora”.";
 return"Não consegui abrir a câmera"+(n?" ("+n+")":"")+"."}
async function decodeQRFile(f){const bmp=await createImageBitmap(f);
 if("BarcodeDetector" in window){try{const r=await new BarcodeDetector({formats:["qr_code"]}).detect(bmp);if(r[0]&&r[0].rawValue)return r[0].rawValue}catch(e){}}
 if(window.jsQR){const w=Math.min(bmp.width,1200),h=Math.round(bmp.height*w/bmp.width),cv=document.createElement("canvas");cv.width=w;cv.height=h;const cx=cv.getContext("2d",{willReadFrequently:true});cx.drawImage(bmp,0,0,w,h);const im=cx.getImageData(0,0,w,h),r=jsQR(im.data,w,h);if(r&&r.data)return r.data}
 return null}
function scanPhoto(title,valid,done,cancel,why){
 $("#modal").innerHTML=`<div class="modal"><div><h2>${title}</h2><p class="mu">${esc(why||"")}</p><p class="mu">Toque abaixo, fotografe o QR Code e o app lê a foto.</p><div class="err" id="qe"></div><button class="btn" onclick="$('#qf').click()">📷 Fotografar o QR Code</button><input id="qf" type="file" accept="image/*" capture="environment" hidden><button class="btn sec" id="qc">Cancelar</button></div></div>`;
 $("#qc").onclick=()=>{cancel&&cancel()};
 $("#qf").onchange=async function(){const f=this.files[0];if(!f)return;$("#qe").textContent="Lendo a foto…";let c=null;try{c=await decodeQRFile(f)}catch(e){}
  if(!c){$("#qe").textContent="Não achei um QR Code na foto. Chegue mais perto, deixe o código inteiro e bem iluminado, e tente de novo.";this.value="";return}
  if(valid(c))done(c);else{$("#qe").textContent="QR Code inválido para o Janela Verde. Tente outro.";this.value=""}}}
async function scanCam(title,valid,done,cancel){
 let st;try{st=await getCam()}catch(e){return scanPhoto(title,valid,done,cancel,camMsg(e))}
 $("#modal").innerHTML=`<div class="modal"><div><h2>${title}</h2><video id="qv" autoplay playsinline muted style="width:100%;border-radius:16px"></video><p class="mu">Aponte a câmera para o QR Code.</p><div class="err" id="qe"></div><button class="btn sec" id="qc">Cancelar</button></div></div>`;
 const v=$("#qv");v.setAttribute("playsinline","");v.muted=true;v.srcObject=st;tmp.qs=st;try{await v.play()}catch(e){}
 const det=("BarcodeDetector" in window)?new BarcodeDetector({formats:["qr_code"]}):null,cv=document.createElement("canvas"),cx=cv.getContext("2d",{willReadFrequently:true});
 const stop=()=>{clearInterval(tmp.qt);st.getTracks().forEach(t=>t.stop())};
 $("#qc").onclick=()=>{stop();cancel&&cancel()};
 tmp.qt=setInterval(async()=>{try{if(v.readyState<2||!v.videoWidth)return;let code=null;
  if(det){try{const r=await det.detect(v);code=r[0]&&r[0].rawValue}catch(e){}}
  if(!code&&window.jsQR){cv.width=v.videoWidth;cv.height=v.videoHeight;cx.drawImage(v,0,0);const im=cx.getImageData(0,0,cv.width,cv.height),r=jsQR(im.data,im.width,im.height);code=r&&r.data}
  if(!code)return;if(valid(code)){stop();done(code)}else $("#qe").textContent="QR Code inválido para o Janela Verde. Tente outro."}catch(e){}},400)}
function regQR(){
 tmp.rpn="";tmp.rpo="";
 scanCam("Escaneie o QR Code que está no vaso",c=>String(c||"").trim().length>0,c=>{
   tmp.qrCode=String(c).trim().slice(0,500);
   openReg(true);
   toast("QR Code lido. Agora tire a foto da planta.");
   setTimeout(()=>{const cam=$("#fcam");if(cam){try{cam.click()}catch(e){}}},450);
 },()=>{
   $("#modal").innerHTML="";
   toast("Registro cancelado. Para registrar, escaneie o QR Code do vaso.");
 })
}
async function aiRetry(fn){for(let t=0;;t++){try{return await fn()}catch(e){if(e&&e.code=="rate_limited"&&t<1){await new Promise(r=>setTimeout(r,4000));continue}throw e}}}
function aiParse(t){const m=String(t||"").match(/\{[\s\S]*\}/);if(!m)throw{code:"parse"};try{return JSON.parse(m[0])}catch(e){throw{code:"parse"}}}
/* A IA só DESCREVE a foto (marca o que existe). Quem decide aprovar/recusar é este código, com regra de jardinagem/biodiversidade. */
function dataBlob(u){const p=String(u).split(","),m=/data:([^;]+)/.exec(p[0]),bin=atob(p[1]),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:m?m[1]:"image/jpeg"})}
async function verify(foto,obs,nm,ap){const r=await verifyAI(foto,obs,nm,ap);if(r.ok||String(r.m).startsWith("Esta foto"))return r;return{ok:true,tech:true,m:r.m}}
async function verifyAI(foto,obs,nm,ap){const cp=tmp.cfgP||{};try{const sm=await openSample();if(!sm)return{ok:false,m:"A verificação por IA não está disponível agora. Tente de novo em instantes."};
 const lim=await sm.limits();if(!lim||!lim.images)return{ok:false,m:"A IA não está analisando imagens agora. Tente mais tarde."};
 const img=(tmp.ai&&foto===tmp.foto)?tmp.ai:foto;const b=dataBlob(img);
 const cl=v=>String(v||"").replace(/["\\]/g,"'").slice(0,300);
 let q="Você é o analista de fotos do app Janela Verde (projeto escolar de jardinagem e biodiversidade, equipe STARDUST, SESI 005 Limeira). Sua tarefa é DESCREVER o que existe na foto, olhando a imagem INTEIRA e o contexto completo, e marcar cada elemento encontrado. Você não aprova nem recusa: apenas observe com cuidado e marque o que realmente aparece. SEJA GENEROSO: plantas, flores, árvores, brotos, sementes, terra, vasos e qualquer coisa ambiental, de QUALQUER tipo, tamanho ou espécie, devem ser marcados como true. Uma mão, dedos, janela, ventosa ou pessoa ao fundo NÃO impedem a marcação. Na dúvida, marque true.\n"+
 "Elementos de jardinagem, meio ambiente e biodiversidade (aceite QUALQUER foto claramente ambiental: natureza, paisagem natural, rio, mata, parque, solo, compostagem, reciclagem, coleta seletiva, energia solar, horta, árvore plantada, animais silvestres): planta, flor, folha, árvore, horta, jardim, muda, semente, BROTO ou plântula (mesmo minúsculo, recém-nascido, de poucos milímetros, com um ou dois cotilédones, ou um fiozinho verde saindo da terra), terra/solo/substrato, adubo/composto, vaso/jardineira/canteiro/copinho de plantio, regador e ferramentas de jardinagem, minhoca, abelha, borboleta e outros insetos ou pássaros na natureza, e o vaso inteligente do projeto ("+(cp.vaso||"vaso amarelo impresso em 3D com copo plástico dentro, painel dourado, gancho e ventosa na janela; ou vaso com sensores e eletrônica que monitora umidade, luz e rega, com reservatório, display e/ou painel solar")+").\n"+
 "IMPORTANTE: a planta NÃO precisa estar grande nem desenvolvida. Um vaso com terra e poucos brotos pequenos é uma foto válida de jardinagem. Um vaso só com terra (semente recém-plantada, nada visível ainda) também é válido. Examine com atenção a superfície da terra procurando pontinhos ou talos verdes pequenos, mesmo em foto escura, de longe ou levemente tremida. Uma mão segurando o vaso ou uma pessoa pequena ao fundo não invalida a foto.\n"+
 "Nome informado pelo usuário: \""+cl(nm)+"\". Observação do usuário: \""+cl(obs)+"\".\n";
 if(ap)q+="PEDIDO DE REVISÃO: uma análise anterior desta MESMA imagem a recusou"+(tmp.lastRej?" (na época foi vista como: "+cl(tmp.lastRej)+")":"")+". O usuário explica que a foto mostra: \""+cl(ap)+"\". Reanalise a imagem com cuidado redobrado e use a descrição como pista de onde olhar (se ele diz que há brotos, procure-os na terra; se diz que é terra recém-plantada, marque terra e vaso). Dê o benefício da dúvida quando a imagem for compatível com a descrição e com jardinagem, marcando como true os elementos correspondentes. Mas a descrição NÃO muda o que existe na imagem: se a foto mostrar apenas objetos sem relação (copo, cadeira, tela, comida, animal doméstico, paisagem urbana) ou uma pessoa como assunto principal, deixe tudo false e marque pessoa_principal conforme a imagem.\n";
 q+=(cp.regras||"")+"\nResponda APENAS JSON: {\"descricao\":\"o que aparece, até 15 palavras\",\"planta\":boolean (planta, flor, folha, árvore, muda, broto ou plântula, de qualquer tamanho),\"semente_ou_terra\":boolean (semente, terra, solo, adubo, substrato),\"vaso_ou_jardinagem\":boolean (vaso, jardineira, canteiro, regador, ferramenta de jardinagem, vaso inteligente ou seus sensores),\"ambiental\":boolean (natureza, paisagem natural, rio, mata, parque, solo, compostagem, reciclagem, coleta seletiva, energia solar, horta ou outra ação ambiental),\"fauna\":boolean (minhoca, abelha, borboleta, inseto ou pássaro na natureza),\"pessoa_principal\":boolean (true somente se pessoa, rosto, selfie ou grupo for o assunto principal e NÃO houver planta, vaso ou terra em destaque),\"contradiz\":boolean (true somente se o nome ou a observação descreverem algo claramente DIFERENTE do que aparece; terra ou vaso sem planta visível, ou broto pequeno, NUNCA contradiz),\"motivo\":\"frase curta em português\"}";
 const t=(await aiRetry(()=>sm(q,{cache:false,modelTier:"default",images:[b]}))).text;const r=aiParse(t);
 const gard=!!(r.planta||r.semente_ou_terra||r.vaso_ou_jardinagem||r.fauna||r.ambiental);
 if(!gard){tmp.lastRej=r.descricao||"outro assunto";return{ok:false,m:"Esta foto não combina com o projeto (natureza, meio ambiente, plantas, brotos, sementes, terra, adubo, vasos, minhocas, abelhas ou vaso inteligente). Vi: "+(r.descricao||"outro assunto")+"."}}
 
 tmp.lastRej=null;return{ok:true,m:r.descricao||"ok"}}catch(e){return{ok:false,m:e&&e.code=="not_granted"?"Não consegui usar a IA agora.":e&&e.code=="rate_limited"?"A IA aberta está cheia agora. Aguarde ~20 segundos e tente de novo.":e&&e.code=="parse"?"A IA respondeu de forma inesperada. Tente de novo.":"Não consegui validar a foto ("+((e&&(e.code||e.message))||"erro")+"). Tente de novo."}}}
function helpToggle(){const p=$("#hp");if(p)p.style.display=p.style.display=="none"?"block":"none"}
async function helpSend(){const m=$("#hm"),b=$("#hs"),t=($("#hx").value||"").trim();const err=x=>{m.className="err";m.textContent=x};
 if(!tmp.foto)return err("Primeiro escolha uma foto.");if(t.length<5)return err("Descreva o que aparece na foto (ex.: vaso com terra e brotos pequenos).");
 b.disabled=true;b.textContent="A IA está olhando a foto de novo…";m.className="mu";m.textContent="";
 const nm=($("#rp").value||"").trim()||"planta",ob=($("#ro").value||"").trim();let vr;
 try{vr=await verify(tmp.foto,ob,nm,t)}catch(e){vr={ok:false,m:"Não consegui reavaliar agora. Tente de novo."}}
 logFoto(vr.ok,"[ajuda] "+t.slice(0,60)+" → "+vr.m,nm);b.disabled=false;b.textContent="Enviar explicação";
 if(vr.ok){tmp.okFoto=tmp.foto;m.className="ok";m.textContent="Foto aprovada! A IA reconheceu: "+vr.m+". Agora toque em Salvar registro.";$("#re").textContent="";const rs=$("#rs");if(rs)rs.scrollIntoView({behavior:"smooth",block:"center"})}
 else err(vr.m+" Se for um engano, descreva com mais detalhes e envie de novo.")}
function pick(inp){const f=inp.files[0];if(!f)return;if(!f.type.startsWith("image/"))return $("#re").textContent="Arquivo não é uma imagem.";
 const im=new Image();im.onload=()=>{const c=document.createElement("canvas"),k=Math.min(1,600/Math.max(im.width,im.height));c.width=im.width*k;c.height=im.height*k;c.getContext("2d").drawImage(im,0,0,c.width,c.height);tmp.foto=c.toDataURL("image/jpeg",.6);{const c3=document.createElement("canvas"),k3=Math.min(1,1280/Math.max(im.width,im.height));c3.width=Math.round(im.width*k3);c3.height=Math.round(im.height*k3);c3.getContext("2d").drawImage(im,0,0,c3.width,c3.height);tmp.ai=c3.toDataURL("image/jpeg",.85)}tmp.okFoto=null;tmp.lastRej=null;const c2=document.createElement("canvas"),k2=Math.min(1,360/Math.max(im.width,im.height));c2.width=im.width*k2;c2.height=im.height*k2;c2.getContext("2d").drawImage(im,0,0,c2.width,c2.height);tmp.th=c2.toDataURL("image/jpeg",.6);$("#prev").innerHTML=`<img class="big" src="${tmp.foto}" alt="Prévia">`;$("#re").textContent=""};im.onerror=()=>$("#re").textContent="Não foi possível ler a imagem. Tente tirar outra foto.";const fr=new FileReader();fr.onerror=im.onerror;fr.onload=()=>{im.src=fr.result};fr.readAsDataURL(f)}
async function saveReg(){const E=m=>{$("#re").textContent=m;const b=$("#rs");b.disabled=false;b.textContent="Salvar registro"};
 
 if(!tmp.qrCode)return E("Primeiro escaneie o QR Code que está no vaso.");
 if(!tmp.foto)return E("Envie uma foto da planta.");
 const nm=$("#rp").value.trim();if(!nm)return E("Dê um nome à planta.");const obs=$("#ro").value.trim();
 const bt=$("#rs");bt.disabled=true;bt.textContent="A IA está analisando a foto…";const vr=tmp.okFoto===tmp.foto?{ok:true,m:"aprovado pela explicação"}:await verify(tmp.foto,obs,nm);if(tmp.okFoto!==tmp.foto)logFoto(vr.ok,vr.m,nm);if(!vr.ok){const rej=vr.m.startsWith("Esta foto")||vr.m.startsWith("O nome");if(rej){const hp=$("#hp");if(hp){hp.style.display="block";hp.scrollIntoView({behavior:"smooth",block:"center"})}}return E(vr.m+(rej?" Toque em ❓ Pedir ajuda se for um engano.":""))}bt.textContent="Salvando...";
 const u=U();const pos=u.geo||null;
 const today=day(Date.now()),first=!u.regs.some(r=>day(r.ts)==today);
 let pl=u.plants.find(p=>p.nome.toLowerCase()==nm.toLowerCase());if(!pl){pl={id:"p"+Date.now(),nome:nm,especie:"",inicio:today,local:u.plants[0]?.local||"",foto:"",obs:""};u.plants.push(pl)}
 const r={id:"r"+Date.now(),plant:pl.id,amigo:"",ts:Date.now(),foto:tmp.foto,obs,geo:pos,qrCode:tmp.qrCode};u.regs.push(r);u.active=pl.id;
 if(first)u.pts.push({id:"g"+Date.now(),ts:Date.now(),v:CFG.pontosPorDia,why:"Registro do dia "+today,key:"dia:"+today});
 if(save()){syncReg(r);pubRank();$("#modal").innerHTML="";tmp.foto=null;tmp.qrCode=null;toast((first?"Registro salvo! +"+CFG.pontosPorDia+" pontos":"Registro salvo (pontos do dia já recebidos)")+(vr.tech?" · a IA não conferiu a foto ("+String(vr.m).slice(0,90)+")":""));go("home")}else{u.regs.pop();if(first)u.pts.pop();E("Armazenamento cheio.")}}
function viewReg(id){const u=U(),r=u.regs.find(x=>x.id==id),p=u.plants.find(p=>p.id==r.plant);
 $("#modal").innerHTML=`<div class="modal"><div><img class="big" src="${r.foto||QRIMG}" alt="Foto"><h3>${esc(p?.nome)}</h3><p class="mu">${fmt(r.ts)}</p><label>Observações</label><textarea id="eo" rows="3">${esc(r.obs)}</textarea>
 <button class="btn" onclick="r_=U().regs.find(x=>x.id=='${id}');r_.obs=$('#eo').value;save();$('#modal').innerHTML='';render()">Salvar correção</button>
 <button class="btn dng" onclick="if(confirm('Excluir este registro?')){const u=U();u.regs=u.regs.filter(x=>x.id!='${id}');save();$('#modal').innerHTML='';render()}">Excluir</button><button class="btn sec" onclick="$('#modal').innerHTML=''">Fechar</button></div></div>`}
/* --- Plantas --- */
V.plants=()=>{const u=U();return `${hdr("Minhas plantas","home")}${u.plants.map(p=>`<div class="card"><b>🪴 ${esc(p.nome)}</b><div class="mu">${esc(p.especie||"Espécie não informada")} · início ${esc(p.inicio)} · ${esc(p.local)}</div><div class="mu">${u.regs.filter(r=>r.plant==p.id).length} registros</div><button class="btn sec sm" onclick="editPlant('${p.id}')">Editar</button></div>`).join("")}<button class="btn" onclick="editPlant()">+ Adicionar planta</button>`};
function editPlant(id){const u=U(),p=u.plants.find(x=>x.id==id)||{nome:"",especie:"",inicio:day(Date.now()),local:u.plants[0]?.local||"",obs:""};
 $("#modal").innerHTML=`<div class="modal"><div><h2>${id?"Editar":"Nova"} planta</h2><label>Nome personalizado</label><input id="pn" value="${esc(p.nome)}"><label>Espécie (se souber)</label><input id="pe" value="${esc(p.especie)}"><label>Início do cultivo</label><input id="pi" type="date" value="${p.inicio}"><label>Local de cultivo</label><input id="pl" value="${esc(p.local)}"><label>Observações gerais</label><textarea id="po">${esc(p.obs)}</textarea><div class="err" id="pe_e"></div>
 <button class="btn" onclick="savePlant('${id||""}')">Salvar</button>${id&&u.plants.length>1?`<button class="btn dng" onclick="if(confirm('Excluir planta e seus registros?')){const u=U();u.regs=u.regs.filter(r=>r.plant!='${id}');u.plants=u.plants.filter(p=>p.id!='${id}');save();$('#modal').innerHTML='';render()}">Excluir</button>`:""}<button class="btn sec" onclick="$('#modal').innerHTML=''">Cancelar</button></div></div>`}
function savePlant(id){const u=U(),n=$("#pn").value.trim();if(!n||!$("#pl").value.trim())return $("#pe_e").textContent="Informe nome e local.";
 const d={nome:n,especie:$("#pe").value.trim(),inicio:$("#pi").value,local:$("#pl").value.trim(),obs:$("#po").value.trim()};
 if(id)Object.assign(u.plants.find(p=>p.id==id),d);else{const pid="p"+Date.now();u.plants.push({id:pid,foto:"",...d});u.pts.push({id:"g"+Date.now(),ts:Date.now(),v:CFG.pontosPlantaNova,why:"Nova planta: "+n,key:"planta:"+pid})}
 save();$("#modal").innerHTML="";render()}
/* --- Recompensas --- */
V.rewards=()=>{const u=U(),s=saldo(u);return `${hdr("Recompensas","home")}<div class="stat"><b>⭐ ${s}</b>seu saldo</div>${CFG.recompensas.length?CFG.recompensas.map(r=>`<div class="card"><b>${r.emoji||"🎁"} ${esc(r.nome)}</b><p class="mu">${esc(r.desc)}</p><b>${r.custo} pontos</b><button class="btn" ${s<r.custo?"disabled":""} onclick="redeem('${r.id}')">${s<r.custo?"Saldo insuficiente":"Resgatar"}</button></div>`).join(""):`<div class="card center mu">🎁<br>Ainda não há recompensas cadastradas. Novas recompensas serão disponibilizadas pelo projeto.</div>`}
<h3>Histórico de pontos</h3>${[...u.pts].reverse().map(p=>`<div class="row"><span>${esc(p.why)}<br><span class="mu">${fmt(p.ts)}</span></span><b style="text-align:right;color:${p.v>0?"var(--ok)":"var(--er)"}">${p.v>0?"+":""}${p.v}</b></div>`).join("")||'<p class="mu">Sem movimentações.</p>'}`};
function redeem(id){const u=U(),r=CFG.recompensas.find(x=>x.id==id);if(!r||saldo(u)<r.custo)return toast("Saldo insuficiente.");if(!confirm("Resgatar “"+r.nome+"” por "+r.custo+" pontos?"))return;
 u.pts.push({id:"s"+Date.now(),ts:Date.now(),v:-r.custo,why:"Resgate: "+r.nome});u.resg.push({id:r.id,ts:Date.now()});save();toast("Resgate solicitado!");render()}
/* --- QR --- */
function scanQR(){scanCam("Ler QR Code do projeto",c=>c.startsWith(CFG.qrPrefixo),c=>{$("#modal").innerHTML="";handleQR(c)},()=>{$("#modal").innerHTML=""})}
function stopQ(){clearInterval(tmp.qt);tmp.qs?.getTracks().forEach(t=>t.stop());$("#modal").innerHTML=""}
function manualQR(){const c=prompt("Código do QR Code:");if(c)handleQR(c)}
function handleQR(c){if(!c.startsWith(CFG.qrPrefixo))return toast("QR Code inválido para o Janela Verde.");const u=U();if(!u.qr.includes(c))u.qr.push(c);save();toast("QR Code do projeto reconhecido ✔ (não gera pontos automaticamente)")}
/* --- Assistente (IA aberta via Pollinations) --- */
V.assist=()=>`<div class="row"><h2>🤖 Green AI</h2><button class="btn sec sm" style="flex:0" onclick="go('home')">Início</button></div><div id="chat" class="card" style="min-height:260px">${(tmp.chat||[]).map(m=>`<div class="bub ${m.role=="user"?"me":"bot"}">${esc(m.content)}</div>`).join("")||'<p class="mu">Olá! Pergunte sobre rega, luz, pragas, folhas amareladas e mais.</p>'}</div>
<div>${["Como cuidar da minha planta?","Com que frequência devo regar?","Por que as folhas estão amareladas?","Como identificar pragas?"].map(q=>`<span class="chip" onclick="ask(this.textContent)">${q}</span>`).join("")}</div>
<div class="row" style="margin-top:8px"><input id="q" placeholder="Digite sua pergunta" onkeydown="if(event.key=='Enter')ask()"><button class="btn" style="flex:0" onclick="ask()">Enviar</button></div><p class="mu">Respostas de IA podem conter erros, principalmente ao identificar espécies, doenças e pragas. Confirme com um adulto ou especialista.</p>`;
async function ask(t){const q=(t||$("#q").value).trim();if(!q)return;tmp.chat=tmp.chat||[];tmp.chat.push({role:"user",content:q});render();
 const u=U(),pl=u.plants.map(p=>p.nome+(p.especie?" ("+p.especie+")":"")).join(", ");
 const add=m=>{tmp.chat=tmp.chat.filter(x=>!x.tmp);tmp.chat.push({role:"assistant",content:m});render()};
 tmp.chat.push({role:"assistant",content:"Pensando…",tmp:1});render();
 let sample=null;try{sample=await openSample()}catch(e){}if(!sample){await new Promise(r=>setTimeout(r,1500));try{sample=await openSample()}catch(e){}}
 if(!sample)return add("A IA não está disponível agora. Verifique a internet e tente de novo.");
 try{const hist=tmp.chat.filter(m=>!m.tmp).slice(-8).map(m=>({role:m.role,content:m.content}));
  const r=await sample([{role:"user",content:"Você é a Green AI, assistente do app Janela Verde (STARDUST, SESI 005 Limeira). Ajude estudantes com cultivo de plantas, em português do Brasil, de forma clara, curta, educativa e segura. Plantas do usuário: "+pl+". Se faltar informação, peça detalhes; não afirme certezas sobre espécie/pragas/doenças. Conversa:\n"+hist.map(m=>m.role+": "+m.content).join("\n")}],{cache:false});
  add(r.text)}catch(e){add(e.code=="not_granted"?"Não consegui usar a IA agora.":e.code=="rate_limited"?"A IA aberta está cheia agora. Aguarde ~20 segundos e tente de novo.":"Não consegui responder agora ("+((e&&(e.code||e.message))||"erro")+"). Tente novamente.")}}
/* --- Perfil --- */
V.profile=()=>{const u=U(),s=streaks(u),g=goals(u),a=getAv(u),yr=new Date(u.created).getFullYear(),L=["1º registro","3 dias","7 dias","5 etapas","100 pontos","3 seguidos","14 dias","15 fotos"];
 return `<div class="ph" style="background:${a.bg}"><button class="btn sec sm bk" onclick="go('home')">←</button><h2 style="color:#1b1020;text-align:center;margin:0">${esc(u.char)}</h2><div style="padding:4px 0 18px">${avSvg(a,190)}</div></div>
<div class="mu" style="font-weight:700;letter-spacing:.6px;margin-top:16px">@${esc(u.char.toLowerCase().replace(/[^a-z0-9]/g,""))}${String(u.created).slice(-5)} · AQUI DESDE ${yr}</div>
<div class="row" style="margin:12px 0;text-align:center"><div><b style="font-size:1.3rem">${u.plants.length}</b><div class="mu">Plantas</div></div><div><b style="font-size:1.3rem">${s.total}</b><div class="mu">Dias</div></div><div><b style="font-size:1.3rem">${saldo(u)}</b><div class="mu">Pontos</div></div></div>
<button class="btn" onclick="$('#aved').scrollIntoView({behavior:'smooth'})">PERSONALIZAR AVATAR</button>
<h3 class="sech">VISÃO GERAL</h3><div class="grid" style="gap:16px"><div class="ov" style="color:#ff6a3d">🔥<span>${s.cur} dias<small>Ofensiva atual</small></span></div><div class="ov" style="color:#ffe08a">📅<span>${s.total}<small>Dias registrados</small></span></div><div class="ov" style="color:#cdb3e6">🏅<span>${s.best} dias<small>Maior sequência</small></span></div><div class="ov" style="color:#ffd24a">⭐<span>${saldo(u)}<small>Pontos</small></span></div></div>
<h3 class="sech">CONQUISTAS</h3><div class="bds">${g.map((x,i)=>`<div class="bdw"><div class="bdg ${x.a>=x.b?"on":""}">${x.a>=x.b?"🏆":x.b}</div>${L[i]}</div>`).join("")}</div>
<h3 class="sech">PRÓXIMAS METAS</h3><div class="card">${g.map(x=>`<div style="margin:10px 0">${x.a>=x.b?"🏆 ":""}${x.t}<div class="bar"><i style="width:${x.a/x.b*100}%"></i></div><span class="mu">${x.a} de ${x.b}${x.a>=x.b?" · Conquista!":""}</span></div>`).join("")}</div>
<div class="card" id="aved"><h3>Monte seu avatar</h3>${avEditor(u)}<label>Nome de personagem (aparece no ranking)</label><div class="row"><input id="ch" maxlength="20" value="${esc(u.char)}"><button class="btn sm" style="flex:0" onclick="chSave()">Salvar</button></div><p class="mu">Plantas: ${u.plants.map(p=>esc(p.nome)).join(", ")} · E-mail: ${esc(u.email)}</p></div>
<button class="btn sec" id="admb" onclick="adminLogin()">🔐 Acesso do administrador</button><button class="btn sec" onclick="go('plants')">🪴 Minhas plantas</button><button class="btn sec" onclick="go('rewards')">🎁 Recompensas e pontos</button><button class="btn sec" onclick="go('help')">❓ Ajuda e tutorial</button><button class="btn sec" onclick="go('priv')">🔒 Configurações e privacidade</button><button class="btn dng" onclick="DB.session=null;save();go('splash')">Sair da conta</button>`};
V.priv=()=>`${hdr("Privacidade","profile")}<div class="card"><p class="mu">CPF e telefone nunca aparecem no ranking; só seu nome de personagem. A localização exata não é publicada. Dados salvos neste aparelho; senha armazenada com hash (PBKDF2 + sal). Consentimento LGPD registrado em ${fmt(U().consent)}.</p>
<button class="btn sec" onclick="const b=new Blob([JSON.stringify({...U(),ph:undefined,salt:undefined},null,1)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='meus-dados-janela-verde.json';a.click()">Baixar meus dados</button>
<button class="btn dng" onclick="if(confirm('Excluir conta e todos os dados DESTE aparelho? Não dá para desfazer.')){delete DB.users[DB.session];DB.session=null;save();go('splash')}">Excluir minha conta</button></div>`;
/* --- Ícones (SVG) --- */
const P=d=>`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const FL='';
const SP=P('<path d="M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2-5 6-5 0 3-2 5-6 5z"/>');
const ST=P('<path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6L2.5 9.5l6.6-.8z" fill="currentColor"/>');
const EM={"🪐":P('<circle cx="12" cy="12" r="5.200" fill="currentColor" fill-opacity=".3"/><ellipse cx="12" cy="12" rx="10.500" ry="3.600" transform="rotate(-24 12 12)"/><path d="M19 4l.8 1.700 1.700.8-1.700.8L19 9l-.8-1.700-1.700-.8 1.700-.8z" fill="currentColor" stroke="none"/>'),"🪻":FL,"🌸":FL,"🤖":P('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4"/><circle cx="9" cy="14" r="1.2"/><circle cx="15" cy="14" r="1.2"/>'),"📷":P('<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="4"/>'),"📸":P('<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="4"/>'),"🏡":P('<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),"🔥":P('<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>'),"🏅":P('<circle cx="12" cy="9" r="6"/><path d="M8 14l-2 7 6-3 6 3-2-7"/>'),"📅":P('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),"🎯":P('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),"⭐":ST,"✦":ST,"🎁":P('<rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9M12 8v13M12 8C9 8 8 4 10 4s2 4 2 4zm0 0c3 0 4-4 2-4s-2 4-2 4z"/>'),"🪴":SP,"🌱":SP,"🌿":SP,"🏆":P('<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8"/>'),"📍":P('<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),"⚠":P('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'),"👁":P('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),"🖼":P('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 5 5 3-3 5 5"/>'),"🔒":P('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),"❓":P('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.700M12 17v.5"/>'),"➜":P('<path d="M4 12h16M14 6l6 6-6 6"/>'),"✔":P('<path d="M4 12l5 5 11-11"/>')};
const RE=/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2B50\uFE0F]/gu;
function swap(root){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>(n.nodeValue.search(RE)>=0&&!n.parentNode.closest("textarea,script,style,option,svg"))?1:2});const L=[];while(w.nextNode())L.push(w.currentNode);
 L.forEach(n=>{const sp=document.createElement("span");sp.innerHTML=esc(n.nodeValue).replace(RE,c=>EM[c]||"");n.replaceWith(...sp.childNodes)})}
let busy=false,raf=0;new MutationObserver(()=>{if(busy||raf)return;raf=requestAnimationFrame(()=>{raf=0;busy=true;swap(document.body);busy=false})}).observe(document.body,{childList:true,subtree:true});
/* --- Avatares (pessoas, personalizáveis) --- */
const OPT={ec:["#3a8fd0","#2f9f6a","#7a4a2c","#8560ab","#d08a2f","#4a4a55"],skin:["#f6d5bd","#e8b48f","#c68a5e","#a06a42","#7a4a2c","#4e2e1b"],hc:["#1c1410","#3b2a20","#7a4a2c","#c9a14a","#c4452d","#b8b8c8","#5e3984","#2f9f6a","#3a8fd0","#e6477a"],tc:["#5e3984","#2f6f8f","#3f8f5a","#c4452d","#e0a030","#222222"],bg:["#cdb3e6","#a8d5ba","#f4c7c3","#b5d3f0","#f7e1a6","#2a1d3a"]};
const LB={hair:["Social","Raspado","Topete","Black power","Cacheado curto","Coque masculino","Chanel","Longo liso","Cacheado volumoso","Marias-chiquinhas","Rabo de cavalo","Coque alto","Careca","Degradê","Ondulado","Crespo","Cabelo médio","Franja lateral"],fh:["Sem barba","Barba","Bigode","Cavanhaque"],top:["Camiseta","Moletom","Gola alta","Uniforme","Jaqueta","Vestido","Polo"],acc:["Nenhum","Óculos","Flor","Fone","Boné","Chapéu","Coroa de flores"],brow:["Natural","Grossa","Fina"],eyes:["Redondos","Sorridentes","Cílios"],mouth:["Sorriso","Sorriso fechado","Surpresa"],face:["Redondo","Quadrado","Largo"],ft:["Nenhum","Sardas","Bochechas"]};
const getAv=u=>Object.assign({skin:"#e8b48f",hair:0,hc:"#3b2a20",top:0,tc:"#5e3984",bg:"#cdb3e6",acc:0,fh:0,brow:0,eyes:0,mouth:0,face:0,ft:0,ec:"#3a8fd0"},u.av||{});
function mix(h,t,c){const n=parseInt(h.slice(1),16),m=c=="w"?255:0,f=x=>Math.round(x+(m-x)*t).toString(16).padStart(2,"0");return"#"+f(n>>16)+f(n>>8&255)+f(n&255)}
let gid=0;
function avSvg(a,z,sq){const n=++gid,sk=a.skin,hc=a.hc,tc=a.tc,skS=mix(sk,.2,"k"),hcD=mix(hc,.3,"k"),hcL=mix(hc,.32,"w"),tcD=mix(tc,.24,"k"),H=`fill="${hc}"`,D=`fill="${hcD}"`,ec=mix(a.ec,.2,"k");
 const circ=l=>`<g ${H}>${l.map(c=>`<circle cx="${c[0]}" cy="${c[1]}" r="${c[2]}"/>`).join("")}</g>`;
 const cap=`<path d="M27 48C24 24 38 16 50 16S76 24 73 48C71 38 64 32 50 32S29 38 27 48z" ${H}/>`;
 const bang=`<path d="M27 48C24 25 38 17 51 17S76 26 73 48C70 38 62 31 54 30C46 36 36 38 27 48z" ${H}/>`;
 const sh=`<path d="M35 26Q46 18 62 23" stroke="${hcL}" stroke-width="2.600" fill="none" stroke-linecap="round" opacity=".6"/>`;
 const back=[``,``,``,`<circle cx="50" cy="40" r="31" ${H}/>`,``,``,`<rect x="22" y="18" width="56" height="52" rx="22" ${H}/>`,`<rect x="22" y="18" width="56" height="76" rx="24" ${H}/>`,circ([[24,42,13],[26,60,12],[31,72,10],[76,42,13],[74,60,12],[69,72,10],[36,24,14],[50,18,15],[64,24,14]]),`<g ${H}><ellipse cx="21" cy="62" rx="8" ry="14" transform="rotate(12 21 62)"/><ellipse cx="79" cy="62" rx="8" ry="14" transform="rotate(-12 79 62)"/></g>`,`<ellipse cx="19" cy="60" rx="8" ry="17" transform="rotate(14 19 60)" ${H}/>`,`<circle cx="50" cy="11" r="11" ${H}/>`,``,``,`<path d="M22 50C19 24 34 13 50 13S81 24 78 50C79 61 85 70 77 80C70 74 72 64 69 56H31C28 64 30 74 23 80C15 70 21 61 22 50z" ${H}/>`,circ([[28,28,9],[38,20,9],[50,16,9],[62,20,9],[72,28,9],[24,40,8],[76,40,8],[25,52,7],[75,52,7]]),`<rect x="23" y="18" width="54" height="62" rx="24" ${H}/>`,``][a.hair];
 const front=[`<path d="M27 48C24 25 38 16 52 17S77 27 73 47C71 38 64 31 52 31C40 31 32 37 27 48z" ${H}/><path d="M44 19Q47 27 41 33" stroke="${hcD}" stroke-width="2" fill="none" stroke-linecap="round"/>`+sh,`<path d="M29 44C28 28 38 23 50 23S72 28 71 44C66 36 59 32 50 32S34 36 29 44z" ${H}/>`,`<path d="M27 47C24 25 38 15 52 15S76 26 73 46C71 37 64 28 52 28C40 28 33 34 27 47z" ${H}/><path d="M36 21C38 5 62 3 71 16C61 12 53 15 51 25z" ${H}/>`+sh,`<path d="M30 42C32 33 40 30 50 30S68 33 70 42C64 37 58 35 50 35S36 37 30 42z" ${H}/>`,circ([[31,38,7],[37,30,7.5],[44,25,8],[52,23,8],[60,25,8],[67,31,7.500],[70,39,6.500],[28,44,5.500]]),cap+`<circle cx="50" cy="11" r="8.500" ${H}/><rect x="44" y="18" width="12" height="5" rx="2" ${H}/>`+sh,bang+sh,bang+`<path d="M27 48L23 84Q30 88 34 75L34 52zM73 48L77 84Q70 88 66 75L66 52z" ${H}/>`+sh,circ([[34,36,7],[41,28,8],[50,25,8],[59,28,8],[66,36,7],[28,44,5]]),cap+`<rect x="22" y="46" width="9" height="6" rx="3" fill="#e6477a"/>`+sh,cap+sh,`<path d="M27 48C24 24 38 16 50 16S76 24 73 48C71 38 64 32 50 32S29 38 27 48z" ${H}/><circle cx="50" cy="11" r="11" ${H}/><rect x="40" y="20" width="20" height="5" rx="2.500" fill="#e6477a"/>`+sh,``,`<path d="M29 44C27 24 38 15 50 15S73 24 71 44C67 34 60 28 50 28S33 34 29 44z" ${H}/><path d="M28 52c-1-7 0-12 2-16l3 4v12zM72 52c1-7 0-12-2-16l-3 4v12z" ${D} opacity=".7"/>`+sh,cap+`<path d="M36 22Q42 19 48 22M53 19Q59 17 65 21" stroke="${hcL}" stroke-width="2" fill="none" opacity=".7"/>`,circ([[36,32,5],[42,28,5],[48,26,5],[54,26,5],[60,28,5],[66,32,5],[31,38,4.500]]),bang+sh,`<path d="M26 48C23 22 40 15 54 16S77 26 72 46C70 37 62 31 52 31C42 31 38 38 40 47C34 44 29 46 26 48z" ${H}/>`+sh][a.hair];
 const ears=![6,7,8,9,14,16].includes(a.hair);
 const FP=["M28.500 47C28.500 34 37 26.500 50 26.500S71.500 34 71.500 47C71.500 60 62 68 50 68S28.500 60 28.500 47z","M30 46C30 33 38 26 50 26S70 33 70 46C70 61 61 70 50 70S30 61 30 46z","M27.500 44C27.500 32 37 26.500 50 26.500S72.500 32 72.500 44V52C72.500 62 63 68 50 68S27.500 62 27.500 52z"][a.face||0];
 const torso=`<path d="M10 100C10 82 26 75 50 75S90 82 90 100z" fill="${tc}"/><path d="M64 77C80 80 90 88 90 100H72C74 90 70 82 64 77z" fill="#000" opacity=".15"/><path d="M18 90C22 83 30 79 38 77" stroke="#fff" stroke-opacity=".28" stroke-width="2" fill="none" stroke-linecap="round"/>`;
 const tops=[torso+`<path d="M39 75Q50 87 61 75z" fill="${sk}"/>`,torso+`<path d="M29 80Q50 97 71 80Q62 70 50 70Q38 70 29 80z" fill="${tcD}"/><path d="M40 77Q50 86 60 77z" fill="${sk}"/><path d="M45 85v8M55 85v8" stroke="#fff" stroke-width="1.500" stroke-linecap="round"/>`,torso+`<path d="M40 62h20v16Q50 83 40 78z" fill="${tcD}"/>`,torso+`<path d="M36 76L50 94 64 76 58 71H42z" fill="#f4f1fa"/><path d="M50 94l-3 7h6z" fill="#e6477a"/>`,torso+`<path d="M38 76L50 100 62 76z" fill="#f4f1fa"/><path d="M38 76L50 100M62 76L50 100" stroke="${tcD}" stroke-width="2"/><path d="M38 76l-7 4 9 7zM62 76l7 4-9 7z" fill="${tcD}"/>`,`<path d="M10 100C10 82 26 75 50 75S90 82 90 100z" fill="${sk}"/><path d="M16 100C17 90 28 85 40 85Q50 92 60 85C72 85 83 90 84 100z" fill="${tc}"/><path d="M36 85L40 76M64 85L60 76" stroke="${tc}" stroke-width="4" stroke-linecap="round"/>`,torso+`<path d="M38 75L44 85 50 78 56 85 62 75 50 70z" fill="#fff" opacity=".92"/><path d="M50 78v16" stroke="${tcD}" stroke-width="1.500"/><circle cx="50" cy="84" r="1.200" fill="#fff"/>`];
 const eye0=x=>a.eyes==1?`<path class="blink" d="M${x-4.500} 49Q${x} 43 ${x+4.500} 49" stroke="#2a1a14" stroke-width="2.600" fill="none" stroke-linecap="round"/>`:a.eyes==2?`<g class="blink"><ellipse cx="${x}" cy="48" rx="4.800" ry="5" fill="#fff"/><circle cx="${x}" cy="48.300" r="3.200" fill="${a.ec}"/><circle cx="${x}" cy="48.500" r="1.600" fill="#140a1e"/><circle cx="${x+1.200}" cy="47" r="1" fill="#fff"/></g>`:`<g class="blink"><ellipse cx="${x}" cy="48" rx="3.500" ry="4.500" fill="${ec}"/><ellipse cx="${x}" cy="48.600" rx="2" ry="2.800" fill="#140a1e" opacity=".7"/><circle cx="${x+1.200}" cy="46.300" r="1.400" fill="#fff"/><circle cx="${x-1.100}" cy="50" r=".6" fill="#fff"/></g>`;
 const eye=x=>a.eyes==1?eye0(x):`<g class="blink"><ellipse cx="${x}" cy="48" rx="2.800" ry="3.200" fill="#2a1a14"/><circle cx="${x+.9}" cy="47" r=".9" fill="#fff"/></g>`;
 const bw=[2.8,4,1.8][a.brow||0],brow=`<path d="${a.brow==2?"M35 41Q41 36.500 47 40.500M53 40.500Q59 36.500 65 41":"M35.500 41Q41 37.500 47 40.500M53 40.500Q59 37.500 64.500 41"}" stroke="${hcD}" stroke-width="${bw}" fill="none" stroke-linecap="round"/>`;
 const mouth=[`<path d="M43.500 60Q50 65.500 56.500 60" stroke="#8f2e45" stroke-width="2.400" fill="none" stroke-linecap="round"/>`,`<path d="M43.500 59.500Q50 66 56.500 59.500" stroke="#8f2e45" stroke-width="2.400" fill="none" stroke-linecap="round"/>`,`<ellipse cx="50" cy="62.500" rx="3.400" ry="4.200" fill="#8f2e45"/>`][a.mouth||0];
 const ftx=[``,`<g fill="${skS}">${[[36,55],[39,57],[34,58],[64,55],[61,57],[66,58]].map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="1"/>`).join("")}</g>`,`<ellipse cx="36" cy="58" rx="5" ry="3.200" fill="#ff5d83" opacity=".4"/><ellipse cx="64" cy="58" rx="5" ry="3.200" fill="#ff5d83" opacity=".4"/>`][a.ft||0];
 const fh=[``,`<path d="M28.500 50C28.500 67 38 73 50 73S71.500 67 71.500 50C68 59 60 58.500 50 58.500S32 59 28.500 50z" ${H}/>`,`<path d="M40 57Q45 52.500 50 55.500Q55 52.500 60 57Q55 60 50 58Q45 60 40 57z" ${H}/>`,`<path d="M44 66Q50 76 56 66Q50 70 44 66z" ${H}/><path d="M40 57Q45 52.500 50 55.500Q55 52.500 60 57Q55 60 50 58Q45 60 40 57z" ${H}/>`][a.fh||0];
 const acc=[``,`<g fill="#fff" fill-opacity=".14" stroke="#2f5fb0" stroke-width="2.800" stroke-linejoin="round"><rect x="31.500" y="41" width="19" height="15" rx="6"/><rect x="49.500" y="41" width="19" height="15" rx="6"/></g><path d="M50 47h0" stroke="#2f5fb0" stroke-width="3"/>`,`<g transform="translate(68 24)"><circle r="3" fill="#f3c64a"/>${[0,72,144,216,288].map(r=>`<ellipse cy="-6" rx="3.200" ry="4.600" fill="#efe2fb" stroke="#8560ab" stroke-width="1" transform="rotate(${r})"/>`).join("")}<circle r="3" fill="#f3c64a"/></g>`,`<path d="M26 50C23 12 77 12 74 50" fill="none" stroke="#2b2b35" stroke-width="4.500" stroke-linecap="round"/><rect x="21" y="44" width="9" height="15" rx="4.500" fill="#e6477a"/><rect x="70" y="44" width="9" height="15" rx="4.500" fill="#e6477a"/>`,`<path d="M27 36C27 14 73 14 73 36C60 29 40 29 27 36z" fill="#e6477a"/><path d="M58 33Q77 32 84 39Q70 42 58 38z" fill="#c4325f"/>`,`<ellipse cx="50" cy="28" rx="37" ry="8" fill="#e0b060"/><path d="M33 28C33 6 67 6 67 28z" fill="#e0b060"/><rect x="33" y="22" width="34" height="5" fill="#8560ab"/>`,`<g>${[[33,26,"#e6477a"],[41,21,"#f3c64a"],[50,19,"#fff"],[59,21,"#f3c64a"],[67,26,"#e6477a"]].map(f=>`<circle cx="${f[0]}" cy="${f[1]}" r="4.200" fill="${f[2]}" stroke="#a98be0" stroke-width="1"/><circle cx="${f[0]}" cy="${f[1]}" r="1.400" fill="#f3c64a"/>`).join("")}</g>`][a.acc];
 return `<svg viewBox="5 5 90 90" width="${z}" height="${z}" style="${sq?"":"border-radius:50%;"}display:block;margin:auto;overflow:hidden"><rect width="100" height="100" fill="${a.bg}"/><circle cx="50" cy="54" r="44" fill="#fff" opacity=".2"/><path class="tw" d="M15 17l1.700 4.600 4.600 1.700-4.600 1.700L15 29.600l-1.700-4.600L8.700 23.300l4.600-1.700z" fill="#fff"/><path class="tw tw2" d="M86 66l1.300 3.400 3.400 1.300-3.400 1.300L86 75.400l-1.300-3.400-3.400-1.300 3.400-1.300z" fill="#fff"/><g class="brth"><g class="hd">${back}<path d="M44 62v16q6 5 12 0V62z" fill="${mix(sk,.12,"k")}"/>${tops[a.top]}<path d="M44 66Q50 72 56 66v5Q50 77 44 71z" fill="#000" opacity=".14"/>${ears?`<ellipse cx="29.500" cy="50" rx="3.800" ry="5" fill="${sk}"/><ellipse cx="70.500" cy="50" rx="3.800" ry="5" fill="${sk}"/><ellipse cx="30" cy="50.500" rx="1.600" ry="2.600" fill="${skS}" opacity=".5"/><ellipse cx="70" cy="50.500" rx="1.600" ry="2.600" fill="${skS}" opacity=".5"/>`:""}<clipPath id="fc${n}"><path d="${FP}"/></clipPath><path d="${FP}" fill="${sk}"/><g clip-path="url(#fc${n})"><path d="M61 20h16v60H59C65 62 64 40 61 20z" fill="${skS}" opacity=".28"/><ellipse cx="50" cy="29" rx="24" ry="7" fill="${skS}" opacity=".4"/><ellipse cx="50" cy="72" rx="21" ry="7" fill="${skS}" opacity=".3"/></g><ellipse cx="35.500" cy="58" rx="4.200" ry="2.800" fill="#ff6f8a" opacity=".4"/><ellipse cx="64.500" cy="58" rx="4.200" ry="2.800" fill="#ff6f8a" opacity=".4"/>${ftx}${eye(41.5)}${eye(58.5)}${brow}<path d="M50 51.500q2 3 -.8 3.800" stroke="${skS}" stroke-width="1.700" fill="none" stroke-linecap="round"/>${fh}${mouth}${front}${acc}</g></g></svg>`}
async function resetDemo(){if(!confirm("Reiniciar a demonstração? Apaga contas, fotos e pontos DESTE aparelho para você ver o cadastro do zero."))return;
 try{const db=await claude.use("db"),us=await claude.use("user");if(db&&us){const id=await us.id();if(id)await db.doc("ranking/"+id).delete()}}catch(e){}
 try{localStorage.removeItem(LS)}catch(e){}DB={users:{},session:null};tmp={};tries=0;$("#modal").innerHTML="";toast("Demonstração reiniciada");go("splash")}
const av=(u,z)=>avSvg(getAv(u),z);
function setAv(k,v){const u=U();u.av=getAv(u);u.av[k]=v;save();pubRank();const y=scrollY;render();scrollTo(0,y)}
const PRE=[{hair:0,hc:"#3b2a20",skin:"#e8b48f",tc:"#5e3984",bg:"#cdb3e6",ec:"#3a8fd0"},{hair:1,hc:"#1c1410",skin:"#a06a42",tc:"#2f6f8f",bg:"#a8d5ba",ec:"#7a4a2c",top:1},{hair:2,hc:"#c9a14a",skin:"#f6d5bd",tc:"#e0a030",bg:"#b5d3f0",ec:"#2f9f6a",top:3},{hair:3,hc:"#1c1410",skin:"#7a4a2c",tc:"#222222",bg:"#f7e1a6",ec:"#4a4a55",acc:1},{hair:4,hc:"#c4452d",skin:"#f6d5bd",tc:"#3f8f5a",bg:"#cdb3e6",ec:"#2f9f6a",top:1},{hair:5,hc:"#7a4a2c",skin:"#c68a5e",tc:"#c4452d",bg:"#b5d3f0",ec:"#7a4a2c",fh:1,top:2},{hair:6,hc:"#1c1410",skin:"#f6d5bd",tc:"#c4452d",bg:"#f4c7c3",ec:"#3a8fd0",top:3},{hair:7,hc:"#7a4a2c",skin:"#e8b48f",tc:"#8560ab",bg:"#a8d5ba",ec:"#8560ab",acc:2},{hair:8,hc:"#3b2a20",skin:"#a06a42",tc:"#5e3984",bg:"#f7e1a6",ec:"#7a4a2c",top:2},{hair:9,hc:"#1c1410",skin:"#4e2e1b",tc:"#e0a030",bg:"#cdb3e6",ec:"#4a4a55"},{hair:10,hc:"#c9a14a",skin:"#e8b48f",tc:"#2f6f8f",bg:"#f4c7c3",ec:"#3a8fd0",acc:3},{hair:11,hc:"#b8b8c8",skin:"#c68a5e",tc:"#3f8f5a",bg:"#2a1d3a",ec:"#d08a2f"},{hair:12,hc:"#3b2a20",skin:"#7a4a2c",tc:"#2f6f8f",bg:"#a8d5ba",ec:"#4a4a55",fh:1,top:1},{hair:1,hc:"#7a4a2c",skin:"#f6d5bd",tc:"#c4452d",bg:"#b5d3f0",ec:"#2f9f6a",fh:3,acc:1},{hair:2,hc:"#1c1410",skin:"#e8b48f",tc:"#5e3984",bg:"#f7e1a6",ec:"#7a4a2c",fh:2,top:3},{hair:4,hc:"#b8b8c8",skin:"#4e2e1b",tc:"#e0a030",bg:"#cdb3e6",ec:"#8560ab",acc:1}];
PRE.push({hair:13,hc:"#1c1410",skin:"#7a4a2c",tc:"#2f6f8f",bg:"#a8d5ba",ec:"#4a4a55",top:4},{hair:14,hc:"#7a4a2c",skin:"#e8b48f",tc:"#e6477a",bg:"#f4c7c3",ec:"#2f9f6a",top:5},{hair:15,hc:"#1c1410",skin:"#a06a42",tc:"#3f8f5a",bg:"#f7e1a6",ec:"#7a4a2c",top:6,ft:1},{hair:16,hc:"#c4452d",skin:"#f6d5bd",tc:"#5e3984",bg:"#b5d3f0",ec:"#3a8fd0",acc:6,ft:1},{hair:17,hc:"#3b2a20",skin:"#c68a5e",tc:"#e0a030",bg:"#cdb3e6",ec:"#7a4a2c",acc:4,eyes:2},{hair:0,hc:"#1c1410",skin:"#e8b48f",tc:"#c4452d",bg:"#a8d5ba",ec:"#4a4a55",acc:5,face:1},{hair:3,hc:"#3b2a20",skin:"#4e2e1b",tc:"#2f6f8f",bg:"#f4c7c3",ec:"#4a4a55",fh:1,face:1,top:4},{hair:14,hc:"#e6477a",skin:"#f6d5bd",tc:"#8560ab",bg:"#a8d5ba",ec:"#8560ab",eyes:1,top:5});
function setPre(i){const u=U();u.av={...getAv({}),...PRE[i]};save();pubRank();const y=scrollY;render();scrollTo(0,y)}
function setTab(i){tmp.avt=i;const y=scrollY;render();scrollTo(0,y)}
function avEditor(u){const a=getAv(u),t=tmp.avt||0,sw=(k,n)=>`<label>${n}</label><div class="avs">${OPT[k].map(c=>`<button class="sw ${a[k]==c?"sel":""}" style="background:${c}" onclick="setAv('${k}','${c}')" aria-label="${n}"></button>`).join("")}</div>`,ch=(k,n)=>`<label>${n}</label><div class="opt">${LB[k].map((x,i)=>`<span class="chip ${a[k]==i?"sel":""}" onclick="setAv('${k}',${i})">${x}</span>`).join("")}</div>`;
 const T=["Prontos","Rosto","Cabelo","Roupa","Extras"],B=[`<div class="avs">${PRE.map((p,i)=>`<button class="pre" onclick="setPre(${i})" aria-label="Personagem ${i+1}">${avSvg({...getAv({}),...p},58)}</button>`).join("")}</div>`,
 sw("skin","Cor da pele")+ch("face","Formato do rosto")+ch("eyes","Olhos")+ch("brow","Sobrancelhas")+ch("mouth","Boca")+ch("ft","Detalhes"),ch("hair","Estilo")+sw("hc","Cor do cabelo")+ch("fh","Barba e bigode"),ch("top","Modelo")+sw("tc","Cor da roupa"),ch("acc","Acessório")+sw("bg","Cor do fundo")];
 return `<div class="tabs">${T.map((x,i)=>`<button class="${i==t?"on":""}" onclick="setTab(${i})">${x}</button>`).join("")}</div>${B[t]}`}
/* --- Administração --- */
async function dbh(){try{const db=await claude.use("db"),us=await claude.use("user");if(!db||!us)return null;return{db,us,id:await us.id()}}catch(e){return null}}
async function syncUser(){const h=await dbh(),u=U();if(!h||!u)return;try{const ref=h.db.doc("cadastros/"+h.id),sn=await ref.get(),cur=sn.exists?{...sn.data()}:{};
 if((cur.removidas||[]).includes(u.id)){delete DB.users[u.id];DB.session=null;save();toast("Esta conta foi removida pelo administrador.");go("splash");return}
 const rr=cur.regsRem||[];if(rr.length&&u.regs.some(r=>rr.includes(r.id))){u.regs=u.regs.filter(r=>!rr.includes(r.id));save()}
 cur.contas={...(cur.contas||{}),[u.id]:{nome:u.nome,cpf:u.cpf,email:u.email,tel:u.tel,nasc:u.nasc,char:u.char,geo:u.geo||null,local:u.end||u.plants[0]?.local||"",locConf:u.locNote||"",created:u.created,...admX(u),pts:saldo(u),nreg:u.regs.length,ts:Date.now()}};await ref.set(cur)}catch(e){}}
async function syncReg(r){const h=await dbh();if(!h)return;try{await h.db.doc("cadastros/"+h.id+"/regs/"+r.id).set({conta:U().id,ts:r.ts,obs:r.obs,amigo:r.amigo,plant:(U().plants.find(p=>p.id==r.plant)||{}).nome||"",geo:r.geo||null,qrCode:r.qrCode||"",th:tmp.th||""});syncUser()}catch(e){}}
function admX(u){return{resg:u.resg.length,plantas:u.plants.map(p=>p.nome).join(", "),dias:streaks(u).total,seq:streaks(u).best,ult:u.regs.length?Math.max(...u.regs.map(r=>r.ts)):null}}
const mp=g=>g&&isFinite(g.lat)?`<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${g.lat},${g.lng}">Ver no mapa${g.acc=="aprox"?" (aprox.)":""}</a>`:"Sem localização";
const BR=[[-51.6,4.4],[-50,1.8],[-48.5,-.2],[-44.5,-2.4],[-41,-2.9],[-38.5,-3.7],[-35,-5.2],[-34.8,-7.5],[-35.5,-9.5],[-37.2,-11.5],[-38.5,-13],[-39,-17.5],[-40,-20],[-41,-22],[-43,-23],[-45.5,-23.8],[-48,-25.5],[-48.7,-28],[-50,-30],[-52,-32],[-53.4,-33.7],[-53.2,-32],[-55.5,-30.5],[-57.6,-30.2],[-56,-28],[-54,-27],[-54.5,-25.5],[-54.6,-24],[-55.5,-22.5],[-57.8,-22],[-58,-20],[-57.5,-17.5],[-60,-16.2],[-60.5,-13.5],[-65.5,-10],[-68.5,-11],[-70.5,-11],[-73.5,-7.5],[-72.5,-5],[-70,-4.2],[-69.9,-1],[-67.5,2],[-65,3.5],[-64,4.2],[-60.5,5.2],[-60,2.8],[-58,1.8],[-55,2.2],[-53.5,3.2]];
function adminLogin(){$("#modal").innerHTML=`<div class="modal"><div><h2>Acesso do administrador</h2><label>Senha</label><input id="apw" type="password" autocomplete="current-password" onkeydown="if(event.key=='Enter')adminCheck()"><div class="err" id="ape"></div><button class="btn" onclick="adminCheck()">Entrar</button><button class="btn sec" onclick="$('#modal').innerHTML=''">Cancelar</button></div></div>`;setTimeout(()=>{const i=$("#apw");if(i)i.focus()},60)}
async function adminCheck(){const v=$("#apw").value;const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v.trim()));
 if([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")!=="ae2607205619199d218626aca2a7199561c706c11e26fe59d3e01fe5b6adb69c")return toast("Senha incorreta.");tmp.admok=true;$("#modal").innerHTML="";go("admin")}
function locRegs(id){const u=DB.users[id];$("#modal").innerHTML=`<div class="modal"><div><h2>Registros de ${esc(u.nome)}</h2>${[...u.regs].reverse().map(r=>`<div class="tli"><img src="${r.foto||QRIMG}" alt="Foto"><div>${fmt(r.ts)}<div>${esc(r.obs)}</div><div class="mu">${mp(r.geo)}</div></div></div>`).join("")||"<p class=mu>Sem registros.</p>"}<button class="btn sec" onclick="$('#modal').innerHTML=''">Fechar</button></div></div>`}
V.admin=()=>`${hdr("Administração",U()?"profile":"splash")}<div id="adm" class="card mu">Carregando...</div>`;
async function admLoad(){const h=await dbh();let L=[],mode="local";
 if(h&&h.us.canEdit()){try{const q=await h.db.collection("cadastros").get();q.docs.forEach(d=>{const cs=d.data().contas||{};Object.keys(cs).forEach(k=>L.push({...cs[k],cid:d.id,lid:k,src:"db"}))});mode="db"}catch(e){}}
 if(mode=="local")L=Object.values(DB.users).map(x=>({nome:x.nome,cpf:x.cpf,email:x.email,tel:x.tel,nasc:x.nasc,char:x.char,geo:x.geo||null,local:x.end||x.plants[0]?.local||"",locConf:x.locNote||"",created:x.created,...admX(x),pts:saldo(x),nreg:x.regs.length,lid:x.id,src:"local"}));
 tmp.adm=L;tmp.admMode=mode;return L}
const MCOL=["#e6194b","#3cb44b","#4363d8","#f58231","#911eb4","#008080","#f032e6","#9a6324","#800000","#808000","#000075","#e6b800"];
function mapPts(){const L=tmp.adm||[],G={};L.forEach((x,i)=>{const g=x.geo;if(!g||!isFinite(g.lat)||!isFinite(g.lng))return;const k=(+g.lat).toFixed(1)+","+(+g.lng).toFixed(1);(G[k]=G[k]||{lat:+g.lat,lng:+g.lng,ids:[]}).ids.push(i)});const P=[];Object.values(G).forEach(g=>g.ids.forEach((i,j)=>{const n=g.ids.length,a=j*2*Math.PI/n,r=n>1?1.7*Math.max(1,n/6):0;P.push({i,lat:g.lat+r*Math.sin(a),lng:g.lng+r*Math.cos(a),c:MCOL[i%MCOL.length]})}));return P}
function mapSvg(){const L=tmp.adm||[],P=mapPts();if(!P.length)return '<p class="mu">Nenhuma conta com coordenadas ainda.</p>';
 let a=-74,b=-34,c=-34,d=5.5;
 if(tmp.fit=="pts"){const A=P.map(p=>p.lng),B=P.map(p=>p.lat),s=Math.max(Math.max(...A)-Math.min(...A),Math.max(...B)-Math.min(...B),8)*.65,x1=(Math.min(...A)+Math.max(...A))/2,y1=(Math.min(...B)+Math.max(...B))/2;a=x1-s;b=x1+s;c=y1-s;d=y1+s}
 const mz=tmp.mz||1,cx=(a+b)/2,cy=(c+d)/2,w=(b-a)/mz,h=Math.max(d-c,(b-a)*.9)/mz,r=w/30,fs=w/38,x0=cx-w/2,y0=-cy-h/2;
 let gr="";for(let g=-80;g<=-30;g+=10)gr+=`<line x1="${g}" x2="${g}" y1="-40" y2="15"/>`;for(let g=-40;g<=10;g+=10)gr+=`<line x1="-85" x2="-25" y1="${-g}" y2="${-g}"/>`;
 const leg=P.map(p=>`<div style="display:flex;gap:8px;align-items:center;margin:4px 0"><i style="width:22px;height:22px;border-radius:50%;background:${p.c};flex:none;border:2px solid #fff"></i><span style="flex:1">${esc(L[p.i].nome)}</span><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((L[p.i].local||"")+", Brasil")}">Maps</a></div>`).join("");
 return `<svg viewBox="${x0} ${y0} ${w} ${h}" style="width:100%;height:420px;border-radius:14px;text-shadow:none;display:block"><rect x="${x0-60}" y="${y0-60}" width="${w+120}" height="${h+120}" fill="#cfe6f5"/><g stroke="#ffffffaa" stroke-width="${w/500}">${gr}</g><polygon points="${BR.map(q=>q[0]+","+-q[1]).join(" ")}" fill="#e8f3e1" stroke="#6f9b78" stroke-width="${w/280}" stroke-linejoin="round"/>${Object.entries(UFC).map(([k,v])=>`<text x="${v[1]}" y="${-v[0]}" font-size="${fs*.75}" fill="#5b7a60" text-anchor="middle" font-weight="600">${k}</text>`).join("")}${P.map(p=>`<g onclick="admGrp([${p.i}])" style="cursor:pointer"><circle cx="${p.lng}" cy="${-p.lat}" r="${r}" fill="${p.c}" stroke="#fff" stroke-width="${r/4}"/><text x="${p.lng}" y="${-p.lat+fs*.45}" font-size="${fs*1.3}" fill="#fff" font-weight="700" text-anchor="middle">${esc(String(L[p.i].nome||"?").charAt(0).toUpperCase())}</text><text x="${p.lng}" y="${-p.lat-r*1.35}" font-size="${fs}" fill="#222" stroke="#fff" stroke-width="${fs/4}" paint-order="stroke" font-weight="700" text-anchor="middle">${esc(String(L[p.i].nome||"").split(" ")[0])}</text></g>`).join("")}</svg><div style="margin-top:10px">${leg}</div>`}
function admZoom(f){tmp.mz=Math.max(.5,Math.min(12,(tmp.mz||1)*f));$("#mapbox").innerHTML=mapSvg()}
const admCard=(x,i)=>`<b>${esc(x.nome)}</b> (${esc(x.char)})<div class="mu">${esc(x.email)} · ${esc(x.tel)} · CPF ${esc(x.cpf)}</div><div class="mu">📍 ${esc(x.local||"")} · ${x.local?`<a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.local+", Brasil")}">Abrir endereço no Google Maps</a>`:mp(x.geo)}${x.locConf?` · confiança da IA: ${esc(x.locConf)}`:""}</div><div class="mu">Nasc.: ${x.nasc?esc(new Date(x.nasc+"T12:00").toLocaleDateString("pt-BR")):"-"} · Cadastro: ${x.created?fmt(x.created):"-"}</div><div class="mu">Plantas: ${esc(x.plantas||"-")}</div><div class="mu">${x.pts||0} pontos · ${x.nreg||0} registros · ${x.dias||0} dias · maior sequência ${x.seq||0}</div><div class="mu">Último registro: ${x.ult?fmt(x.ult):"nenhum"}</div><button class="btn sec sm" onclick="admRegs(${i})">Registros</button> <button class="btn dng sm" onclick="admDel(${i})">Excluir conta</button>`;
function admPt(i){$("#pinfo").innerHTML=admCard(tmp.adm[i],i)}
V2.admin=async()=>{const el=$("#adm");if(!el)return;const L=await admLoad();tmp.mz=1;
 el.innerHTML=(tmp.admMode=="db"?"":'<p class="mu">Mostrando só as contas deste aparelho. Para ver todas as pessoas, abra o app logado no claude.ai com uma conta Editora deste artefato.</p>')+`<div class="grid"><div class="stat"><b>${L.length}</b>contas</div><div class="stat"><b>${L.reduce((a,x)=>a+(x.nreg||0),0)}</b>registros</div><div class="stat"><b>${L.reduce((a,x)=>a+(x.pts||0),0)}</b>pontos</div><div class="stat"><b>${L.filter(x=>x.ult&&day(x.ult)==day(Date.now())).length}</b>ativos hoje</div></div><b>${L.length} contas</b> <button class="btn sec sm" onclick="admCsv()">Baixar CSV</button><h3>Mapa de localizações</h3><p class="mu">Pontos aproximados (local informado no cadastro). Toque em um ponto para ver os dados.</p><div class="row"><button class="btn sec sm" onclick="admZoom(1.6)">Aproximar +</button><button class="btn sec sm" onclick="admZoom(1/1.6)">Afastar -</button><button class="btn sec sm" onclick="admFit(false)">Ver pontos</button><button class="btn sec sm" onclick="admFit(true)">Brasil inteiro</button></div><div id="mapbox">${mapSvg()}</div><div id="pinfo" class="card mu">Toque em um ponto do mapa.</div><h3>Todas as contas</h3>`+L.map((x,i)=>`<div class="card">${admCard(x,i)}</div>`).join("");admPanels(L);admMap()};
async function admRegs(i){const x=tmp.adm[i];let rs=[];try{if(x.src=="db"){const h=await dbh();rs=(await h.db.collection("cadastros/"+x.cid+"/regs").get()).docs.map(d=>({id:d.id,...d.data()})).filter(r=>r.conta==x.lid)}else rs=(DB.users[x.lid]?.regs||[]).map(r=>({id:r.id,ts:r.ts,obs:r.obs,th:r.foto,geo:r.geo,plant:(DB.users[x.lid].plants.find(p=>p.id==r.plant)||{}).nome,amigo:r.amigo}))}catch(e){return toast("Não foi possível carregar.")}
 rs.sort((a,b)=>b.ts-a.ts);$("#modal").innerHTML=`<div class="modal"><div><h2>Registros de ${esc(x.nome)}</h2>${rs.map(r=>`<div class="tli"><img src="${esc(r.th)||QRIMG}" alt="Foto"><div><b>${esc(r.plant||r.amigo||"Planta")}</b> · ${fmt(r.ts)}<div>${esc(r.obs)||'<span class="mu">Sem observações</span>'}</div><div class="mu">${mp(r.geo)}</div><button class="btn dng sm" onclick="admDelReg(${i},'${esc(r.id)}')">Excluir registro</button></div></div>`).join("")||"<p class=mu>Sem registros.</p>"}<button class="btn sec" onclick="$('#modal').innerHTML=''">Fechar</button></div></div>`}
async function admDelReg(i,rid){if(!confirm("Excluir este registro?"))return;const x=tmp.adm[i];try{if(x.src=="db"){const h=await dbh(),ref=h.db.doc("cadastros/"+x.cid),cur={...((await ref.get()).data()||{})};cur.regsRem=[...(cur.regsRem||[]),rid];await ref.set(cur);await h.db.doc("cadastros/"+x.cid+"/regs/"+rid).delete()}
 const u=DB.users[x.lid];if(u){u.regs=u.regs.filter(r=>r.id!=rid);save()}$("#modal").innerHTML="";toast("Registro excluído");V2.admin()}catch(e){toast("Falha ao excluir.")}}
async function admDel(i){const x=tmp.adm[i];if(!confirm("Excluir a conta de "+x.nome+" e todos os registros?"))return;try{if(x.src=="db"){const h=await dbh(),ref=h.db.doc("cadastros/"+x.cid),cur={...((await ref.get()).data()||{})},cs={...(cur.contas||{})};delete cs[x.lid];cur.contas=cs;cur.removidas=[...(cur.removidas||[]),x.lid];await ref.set(cur);
  for(const d of (await h.db.collection("cadastros/"+x.cid+"/regs").get()).docs)if(d.data().conta==x.lid)await h.db.doc("cadastros/"+x.cid+"/regs/"+d.id).delete();try{await h.db.doc("ranking/"+x.cid+"_"+x.lid).delete()}catch(e){}}
 if(DB.users[x.lid]){delete DB.users[x.lid];if(DB.session==x.lid)DB.session=null;save()}toast("Conta excluída");V2.admin()}catch(e){toast("Falha ao excluir.")}}
async function admCsv(){const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"',rows=[["nome","usuario","email","telefone","cpf","nascimento","local","lat","lng","pontos","registros","plantas","dias","maior_sequencia","ultimo_registro","cadastro"],...(tmp.adm||[]).map(x=>[x.nome,x.char,x.email,x.tel,x.cpf,x.nasc,x.local,x.geo?.lat,x.geo?.lng,x.pts,x.nreg,x.plantas,x.dias,x.seq,x.ult?new Date(x.ult).toISOString():"",x.created?new Date(x.created).toISOString():""])];
 try{const d=await claude.use("downloads");await d.save({filename:"cadastros-janela-verde.csv",data:"\ufeff"+rows.map(r=>r.map(q).join(",")).join("\n")})}catch(e){toast("Download indisponível.")}}
V2.profile=async()=>{const h=await dbh();if(h&&h.us.canEdit()&&$("#admb"))$("#admb").style.display="block"};
/* --- Metas na tela inicial --- */
function stSvg(on){return `<svg width="26" height="26" viewBox="0 0 24 24"><path d="M12 2.500l2.900 6.200 6.600.8-4.900 4.600 1.300 6.600L12 17.400l-5.900 3.300 1.300-6.600L2.500 9.500l6.600-.8z" fill="${on?"#f3c64a":"none"}" stroke="${on?"#fff":"#ffffff88"}" stroke-width="1.500" stroke-linejoin="round"/></svg>`}
function goalHero(u){const d=day(Date.now()),done=u.regs.some(r=>day(r.ts)==d),set=new Set(days(u)),c=2*Math.PI*30,W=["D","S","T","Q","Q","S","S"];
 const wk=[6,5,4,3,2,1,0].map(i=>{const t=Date.now()-i*864e5;return `<div>${stSvg(set.has(day(t)))}${W[new Date(t).getDay()]}</div>`}).join("");
 return `<div class="card hero"><div class="row"><div style="flex:none"><svg width="84" height="84" viewBox="0 0 72 72"><circle cx="36" cy="36" r="30" stroke="#ffffff44" stroke-width="7" fill="none"/><circle cx="36" cy="36" r="30" stroke="#f3c64a" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="${done?c:0} ${c}" transform="rotate(-90 36 36)"/><text x="36" y="42" text-anchor="middle" fill="#fff" font-size="18" font-weight="700">${done?"1/1":"0/1"}</text></svg></div><div><h2>Meta de hoje</h2><p style="margin:0">${done?"Meta cumprida! Você está fazendo a diferença!":"Registre sua planta hoje e ganhe "+CFG.pontosPorDia+" pontos."}</p></div></div><div class="week">${wk}</div></div>`}
function ring(x){const p=x.a/x.b,r=26,c=2*Math.PI*r,d=x.a>=x.b;return `<div class="gl ${d?"done":""}"><svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="26" stroke="#ffffff22" stroke-width="6" fill="none"/><circle cx="32" cy="32" r="26" stroke="${d?"#f3c64a":"#d9c2f5"}" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="${c*p} ${c}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" fill="#fff" font-size="14">${d?"✔":x.a+"/"+x.b}</text></svg><div>${x.t}</div></div>`}
/* --- Ranking geral (compartilhado via db) --- */
async function pubRank(){try{const u=U();if(!u)return;const db=await claude.use("db"),us=await claude.use("user");if(!db||!us)return;const id=await us.id();if(!id)return;const s=streaks(u);await db.doc("ranking/"+id+"_"+DB.session).set({char:u.char,av:getAv(u),pts:u.pts.filter(p=>p.v>0).reduce((a,p)=>a+p.v,0),dias:s.total,cur:s.cur,best:s.best,ts:Date.now()});tmp.rkErr=false}catch(e){tmp.rkErr=true}}
async function loadRank(n,sel){let rows=null,me=null,note="";try{const db=await claude.use("db"),us=await claude.use("user");if(db){me=us?(await us.id())+"_"+DB.session:null;const q=await db.collection("ranking").orderBy("pts","desc").limit(n).get();rows=q.docs.map(d=>({id:d.id,...d.data()}))}}catch(e){}
 if(!rows){note='<p class="mu">Ranking geral indisponível aqui. Mostrando só este aparelho.</p>';rows=Object.values(DB.users).map(x=>({id:x.id,char:x.char,av:getAv(x),pts:x.pts.filter(p=>p.v>0).reduce((a,p)=>a+p.v,0),dias:streaks(x).total,cur:streaks(x).cur})).sort((a,b)=>b.pts-a.pts);me=DB.session}
 else if(tmp.rkErr)note='<p class="mu">Você vê o ranking, mas seu perfil só entra nele com permissão de colaborador neste artefato.</p>';
 const el=$(sel);if(!el)return;if(!rows.length){el.innerHTML="Ninguém no ranking ainda. Faça um registro!";return}
 const row=(r,i)=>`<div class="rk ${r.id==me?"me":""}"><b>${i+1}º</b>${avSvg(r.av,38)}<span class="n">${esc(r.char)}</span><span><b style='flex:none;text-align:right'>${r.pts||0} pts</b></span></div>`;
 const pod=n>5&&rows.length>=3?`<div class="pod">${[0,1,2].map(i=>`<div class="c${i+1}">${avSvg(rows[i].av,i?64:84)}<b>${i+1}º</b><br>${esc(rows[i].char)}<br>${rows[i].pts||0} pts</div>`).join("")}</div>`:"";
 el.innerHTML=note+pod+rows.map(row).join("")}
V.rank=()=>`<h2>🏆 Ranking de pontos</h2><p class="mu">Todas as pessoas que usam o app. Só aparecem o nome de personagem, o avatar e os dias.</p><div id="rk" class="card mu">Carregando…</div>`;
V2.rank=()=>{pubRank().then(()=>loadRank(50,"#rk"))};
V2.home=()=>{pubRank().then(()=>loadRank(5,"#hrk"))};
/* --- Estrelas de verdade --- */
0&&(function(){const c=$("#stars"),x=c.getContext("2d");let S=[];const D=Math.min(devicePixelRatio||1,2),SZ=[[24,38],[12,20],[5,9]];
 function star(cx,cy,R,rot){x.beginPath();for(let i=0;i<10;i++){const a=rot+i*Math.PI/5-Math.PI/2,r=i%2?R*.4:R;x[i?"lineTo":"moveTo"](cx+Math.cos(a)*r,cy+Math.sin(a)*r)}x.closePath()}
 function r(){c.width=Math.floor(innerWidth*D);c.height=Math.floor(innerHeight*D);x.setTransform(D,0,0,D,0,0);S=[];const N=Math.round(36+innerWidth*innerHeight/30000);for(let i=0;i<N;i++){const k=i<N*.2?0:i<N*.5?1:2,z=SZ[k];S.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,R:z[0]+Math.random()*(z[1]-z[0]),p:Math.random()*6,rot:(Math.random()-.5)*.6,k})}}
 r();addEventListener("resize",r);(function f(t){if(c.width!==Math.floor(innerWidth*D)||c.height!==Math.floor(innerHeight*D))r();if(f.n===c.width+"x"+c.height){requestAnimationFrame(f);return}f.n=c.width+"x"+c.height;x.clearRect(0,0,c.width,c.height);const B=S.filter(s=>s.k<2);x.strokeStyle="#ffffff55";x.lineWidth=1.2;x.beginPath();B.forEach((p,i)=>{const q=B[i+1];if(q&&Math.hypot(p.x-q.x,p.y-q.y)<280){x.moveTo(p.x,p.y);x.lineTo(q.x,q.y)}});x.stroke();
 S.forEach(s=>{x.globalAlpha=.88+.12*Math.sin(t/1200+s.p);x.shadowColor="#c9a7ff";x.shadowBlur=s.R*1.2;star(s.x,s.y,s.R,s.rot+Math.sin(t/3000+s.p)*.06);x.fillStyle="#fff";x.fill();x.shadowBlur=0;x.strokeStyle="#e4d4ff";x.lineWidth=s.k==2?.8:1.6;x.lineJoin="miter";x.stroke()});x.globalAlpha=1;requestAnimationFrame(f)})(0)})();
/* --- Estrelas longe dos textos: ficam no fundo da página (rolam junto) e só nascem em áreas livres --- */
(function(){const c=$("#stars"),x=c.getContext("2d"),D=Math.min(devicePixelRatio||1,2),SZ=[[24,38],[12,20],[5,9]],PAD=30;let S=[],RC=[],dirty=1,W=0,H=0,T1,T2;
 function star(cx,cy,R,rot){x.beginPath();for(let i=0;i<10;i++){const a=rot+i*Math.PI/5-Math.PI/2,r=i%2?R*.4:R;x[i?"lineTo":"moveTo"](cx+Math.cos(a)*r,cy+Math.sin(a)*r)}x.closePath()}
 function rects(){const sy=scrollY,sx=scrollX,o=[],app=$("#app");if(!app){RC=o;return}const add=b=>{if(b.width>=1&&b.height>=1)o.push([b.left+sx,b.top+sy,b.right+sx,b.bottom+sy])};
 const tw=document.createTreeWalker(app,NodeFilter.SHOW_TEXT),rg=document.createRange();let n;while(n=tw.nextNode()){if(!n.nodeValue.trim())continue;const p=n.parentElement;if(!p||!p.getClientRects().length)continue;rg.selectNodeContents(n);Array.from(rg.getClientRects()).forEach(add)}
 app.querySelectorAll("img,input,textarea,select,button,svg,video,canvas").forEach(e=>{if(e.getClientRects().length)add(e.getBoundingClientRect())});RC=o}
 function hit(px,py,m){for(const r of RC)if(px>r[0]-m&&px<r[2]+m&&py>r[1]-m&&py<r[3]+m)return 1;return 0}
 function place(s){for(let i=0;i<60;i++){const px=Math.random()*W,py=Math.random()*H;if(!hit(px,py,s.R+PAD)){s.x=px;s.y=py;s.h=0;return}}s.h=1}
 function layout(){W=innerWidth;H=Math.max(document.documentElement.scrollHeight,innerHeight);rects();const N=Math.min(260,Math.round(36+W*H/30000));
 while(S.length<N){const q=Math.random(),k=q<.2?0:q<.5?1:2,z=SZ[k];S.push({x:-999,y:-999,R:z[0]+Math.random()*(z[1]-z[0]),rot:(Math.random()-.5)*.6,k,h:1,n:1})}if(S.length>N)S.length=N;
 S.forEach(s=>{if(s.n||s.h||s.x>W||s.y>H||hit(s.x,s.y,s.R+PAD)){s.n=0;place(s)}})}
 function lineFree(a,b){for(let i=1;i<8;i++){const t=i/8;if(hit(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,8))return 0}return 1}
 function draw(){const w=Math.floor(innerWidth*D),h=Math.floor(innerHeight*D);if(c.width!==w||c.height!==h){c.width=w;c.height=h}x.setTransform(D,0,0,D,0,0);x.clearRect(0,0,innerWidth,innerHeight);const sy=scrollY,V=S.filter(s=>!s.h);
 const B=V.filter(s=>s.k<2);x.strokeStyle="#ffffff55";x.lineWidth=1.2;x.beginPath();B.forEach((p,i)=>{const q=B[i+1];if(q&&Math.hypot(p.x-q.x,p.y-q.y)<280&&lineFree(p,q)){x.moveTo(p.x,p.y-sy);x.lineTo(q.x,q.y-sy)}});x.stroke();
 V.forEach(s=>{const py=s.y-sy;if(py<-60||py>innerHeight+60)return;x.globalAlpha=.95;x.shadowColor="#c9a7ff";x.shadowBlur=s.R*1.2;star(s.x,py,s.R,s.rot);x.fillStyle="#fff";x.fill();x.shadowBlur=0;x.strokeStyle="#e4d4ff";x.lineWidth=s.k==2?.8:1.6;x.lineJoin="miter";x.stroke()});x.globalAlpha=1}
 function sched(){clearTimeout(T1);clearTimeout(T2);T1=setTimeout(()=>{layout();dirty=1},150);T2=setTimeout(()=>{layout();dirty=1},600)}
 addEventListener("resize",sched);addEventListener("scroll",()=>{dirty=1},{passive:true});addEventListener("load",sched);document.addEventListener("load",sched,true);
 const app=$("#app");if(app)new MutationObserver(sched).observe(app,{childList:true,subtree:true,characterData:true});
 layout();dirty=1;(function f(){if(dirty){dirty=0;draw()}requestAnimationFrame(f)})();sched()})();
/* --- Permissões: GPS + câmera (obrigatórias antes de usar) --- */
V.perm=()=>`<div class="center" style="padding-top:6vh"><div class="flower">📷</div><h2>Permissão necessária</h2><p class="mu">Para registrar sua planta, o app precisa de:</p>
<div class="card"><b>📷 Câmera</b><p class="mu">Para registrar, toque em “Tirar foto agora”: o app abre a câmera do seu celular.</p></div>
<div class="err" id="pe"></div><button class="btn" onclick="tmp.permDone=true;go('home')">Continuar</button></div>`;
async function askPerms(){const b=$("#pb"),e=$("#pe");if(!b)return;b.disabled=true;e.textContent="";let c=false,err=null;
 try{const st=await getCam();st.getTracks().forEach(t=>t.stop());c=true}catch(x){err=x}
 b.disabled=false;if(c){save();syncUser();tmp.permDone=true;go("home");return}
 e.textContent=camMsg(err)+" Você pode tocar em “Próximo” e registrar a planta pela opção “Tirar foto agora”."}
V2.perm=async()=>{try{const c=await navigator.permissions.query({name:"camera"});if(c.state=="granted")askPerms()}catch(e){}};

/* --- Administrador: configurações, recompensas, IA e fotos --- */
async function loadCfg(){try{const h=await dbh();if(!h)return;const sn=await h.db.doc("config/projeto").get();if(!sn.exists)return;const c=sn.data();tmp.cfgP=c;if(c.pontosPorDia>=0)CFG.pontosPorDia=+c.pontosPorDia;if(c.pontosPlantaNova>=0)CFG.pontosPlantaNova=+c.pontosPlantaNova;if(c.qrPrefixo)CFG.qrPrefixo=c.qrPrefixo;if(Array.isArray(c.recompensas))CFG.recompensas=c.recompensas}catch(e){}}
async function logFoto(ok,m,nm){try{const h=await dbh();if(!h)return;await h.db.doc("logs/"+Date.now()+"_"+h.id).set({ts:Date.now(),ok:!!ok,m:String(m||"").slice(0,200),plant:nm||"",conta:DB.session,char:(U()||{}).char||""})}catch(e){}}
async function cfgPut(c){const h=await dbh();if(!h||!h.us.canEdit()){toast("Só um Editor deste artefato pode salvar.");return false}try{await h.db.doc("config/projeto").set(c);tmp.cfgP=c;await loadCfg();return true}catch(e){toast("Falha ao salvar.");return false}}
async function admSaveCfg(){if(await cfgPut({...(tmp.cfgP||{}),recompensas:CFG.recompensas,pontosPorDia:+$("#cf_pd").value||0,pontosPlantaNova:+$("#cf_pn").value||0,qrPrefixo:$("#cf_qr").value.trim()||"janelaverde:",vaso:$("#cf_vaso").value.trim().slice(0,800),regras:$("#cf_reg").value.trim().slice(0,800)}))toast("Configurações salvas ✔")}
async function admRw(i){const r=[...CFG.recompensas];if(i==null){const n=$("#rw_n").value.trim(),k=+$("#rw_c").value;if(!n||!(k>0))return toast("Informe nome e custo.");r.push({id:"r"+Date.now(),nome:n,desc:$("#rw_d").value.trim(),custo:k,emoji:$("#rw_e").value.trim()||"🎁",estoque:$("#rw_s").value?+$("#rw_s").value:null})}else r.splice(i,1);if(await cfgPut({...(tmp.cfgP||{}),recompensas:r}))V2.admin()}
async function admPanels(L){const el=$("#adm");if(!el)return;const c=tmp.cfgP||{};let lg=[];try{const h=await dbh();if(h)lg=(await h.db.collection("logs").orderBy("ts","desc").limit(40).get()).docs.map(d=>d.data())}catch(e){}
 let ai="aberta (sem conta)";
 const okN=lg.filter(x=>x.ok).length,top=[...L].sort((a,b)=>(b.pts||0)-(a.pts||0)).slice(0,5),w7=L.filter(x=>x.ult&&Date.now()-x.ult<6048e5).length;
 const rw=CFG.recompensas.map((r,i)=>`<div class="row"><span>${esc(r.emoji||"🎁")} ${esc(r.nome)} · ${r.custo} pts · estoque ${r.estoque??"∞"}</span><button class="btn dng sm" style="flex:0" onclick="admRw(${i})">Remover</button></div>`).join("")||'<p class="mu">Nenhuma recompensa cadastrada.</p>';
 const H=`<div class="card gv"><h2>Resumo do projeto</h2><div class="grid"><div class="stat"><b>${L.length}</b>contas</div><div class="stat"><b>${L.reduce((a,x)=>a+(x.nreg||0),0)}</b>fotos/registros</div><div class="stat"><b>${w7}</b>ativos em 7 dias</div><div class="stat"><b>${L.reduce((a,x)=>a+(x.resg||0),0)}</b>resgates</div><div class="stat"><b>${okN}</b>fotos aprovadas (últ. ${lg.length})</div><div class="stat"><b>${lg.length-okN}</b>fotos recusadas</div></div><h3>Top 5 pontos</h3>${top.map((x,i)=>`<div class="rk"><b>${i+1}º</b><span class="n">${esc(x.char)} · ${esc(x.nome)}</span><b>${x.pts||0} pts</b></div>`).join("")||'<p class="mu">Sem dados.</p>'}</div>
<div class="card"><h2>Configurações do projeto</h2><div class="row"><div><label>Pontos por dia</label><input id="cf_pd" type="number" min="0" value="${CFG.pontosPorDia}"></div><div><label>Pontos planta nova</label><input id="cf_pn" type="number" min="0" value="${CFG.pontosPlantaNova}"></div></div><label>Prefixo do QR Code</label><input id="cf_qr" value="${esc(CFG.qrPrefixo)}"><label>Descrição do vaso inteligente (a IA usa isto para reconhecê-lo nas fotos)</label><textarea id="cf_vaso" rows="3" placeholder="Ex.: vaso branco com display, sensor de umidade, reservatório e painel solar">${esc(c.vaso||"")}</textarea><label>Regras extras para a IA validar fotos</label><textarea id="cf_reg" rows="2" placeholder="Ex.: aceitar também mudas de mangue">${esc(c.regras||"")}</textarea><button class="btn" onclick="admSaveCfg()">Salvar configurações</button></div>
<div class="card"><h2>Recompensas</h2>${rw}<label>Nova recompensa</label><input id="rw_n" placeholder="Nome"><input id="rw_d" placeholder="Descrição"><div class="row"><input id="rw_c" type="number" placeholder="Custo (pts)"><input id="rw_e" placeholder="Emoji"><input id="rw_s" type="number" placeholder="Estoque"></div><button class="btn" onclick="admRw()">Adicionar recompensa</button></div>
<div class="card"><h2>IA e fotos</h2><p class="mu">Autorização da IA neste aparelho: <b>${esc(ai)}</b>. Cada pessoa usa a própria cota ao autorizar, então o uso é distribuído entre todos e não depende de uma conta única. Em picos, o app espera e tenta de novo sozinho.</p>${lg.map(x=>`<div class="row"><span>${x.ok?"✅":"⛔"} ${esc(x.char||"")} · ${esc(x.plant||"")}<br><span class="mu">${fmt(x.ts)} · ${esc(x.m)}</span></span></div>`).join("")||'<p class="mu">Nenhuma foto analisada ainda.</p>'}</div>`;
 el.insertAdjacentHTML("afterbegin",H)}
/* Validação de endereço: 1) filtro local (lixo óbvio como "bla"), 2) IA confere cidade/estado e se a rua é plausível. Quem decide é o código; falha = recusa (não aprova por padrão). */
function addrLocal(rua){
 const raw=String(rua||"").trim(),s=raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 const nome=s.replace(/\d+/g," ").replace(/[^a-z\s]/g," ").replace(/\s+/g," ").trim(),L=nome.replace(/\s/g,"");
 const lixo=/^(bla+|blabla\w*|bl[ae]h*|asd\w*|qwe\w*|teste\w*|test|xxx+|abc\w*|aaa+|bbb+|nada|nao sei|sei la|foo|bar|zzz+|lorem|ipsum|fulano|casa|rua|avenida|av|endereco|aqui|la|ali|x+|a+|ok|oi|kkk+|haha+|hehe+)$/;
 /* ruas com número ou letra no nome são comuns no Brasil (Rua 7, Rua A, Quadra 12, Av. 3): não são lixo */
 const desig=/\b(rua|r|avenida|av|alameda|travessa|tv|estrada|via|quadra|qd|conjunto|cj|beco|viela)\.?\s+([a-z]|\d{1,3}|um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/.test(s);
 if(!desig&&(L.length<4||lixo.test(nome)||nome.split(" ").every(w=>lixo.test(w))||!/[aeiou]/.test(L)||/(.)\1{3,}/.test(L)||/^(.{1,3})\1{2,}$/.test(L)))return"Esse endereço não parece real. Informe o nome da rua e o número (ex.: Rua das Flores, 120).";
 if(!/\d/.test(s)&&!/\bs\s*\/?\s*n\b|sem numero/.test(s))return"Inclua o número (ou s/n se não tiver).";
 return""}
async function geoEnd(cid,uf,rua){
 const loc=addrLocal(rua);if(loc)return{ok:false,m:loc};
 const full=rua+", "+cid+" - "+uf+", Brasil",q=x=>String(x).replace(/"/g,"'"),mapa="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(full);
 try{const sm=await openSample();if(!sm)return{ok:false,m:"Não consegui confirmar o endereço agora (IA indisponível). Tente de novo em instantes.",link:mapa};
 const t=(await aiRetry(()=>sm("Você funciona como o Google Maps para o Brasil. Endereço digitado pela pessoa: \""+q(full)+"\".\n"+
 "Tarefa: separe o nome do logradouro (sem o número) e confira se ele EXISTE na cidade \""+q(cid)+"\" - "+uf+".\n"+
 "Regras: (a) rua_existe=true se você reconhece esse logradouro (ou condomínio, sítio, escola, prédio) nessa cidade, mesmo com abreviações (R., Av.), sem acento ou com erro pequeno de digitação. Ruas com número ou letra no nome (Rua 7, Rua A, Avenida 3) são válidas. (b) rua_existe=\"incerto\" se a cidade existe e o nome é um logradouro plausível, mas você não consegue confirmar (ruas pequenas de bairro ou cidade pequena). (c) rua_existe=false SOMENTE se claramente não existe: sem sentido, palavrão, piada, ou nome que sabidamente não existe nessa cidade. Nunca recuse um endereço real por não ter certeza: nesse caso use \"incerto\".\n"+
 "Se rua_existe for false, ou se o nome parecer digitado errado, preencha similares com até 4 logradouros REAIS dessa mesma cidade com nome parecido, no formato \"Rua Tal, Bairro\", somente os que você tem confiança que existem; se não souber nenhum, use [].\n"+
 "Responda APENAS JSON: {\"cidade_existe\":boolean,\"rua_existe\":true|\"incerto\"|false,\"nome_oficial\":\"logradouro corrigido, sem número\",\"similares\":[string],\"lat\":number,\"lng\":number,\"motivo\":\"frase curta em português\"}. lat/lng = melhor estimativa da rua, ou do centro da cidade se não souber a rua.",{cache:false,modelTier:"default"}))).text;
 const r=JSON.parse(t.match(/\{[\s\S]*\}/)[0]);
 const sug=(Array.isArray(r.similares)?r.similares:[]).map(x=>String(x).replace(/\s*,?\s*\d+\s*$/,"").trim()).filter(x=>x.length>3).slice(0,4);
 if(r.cidade_existe===false)return{ok:false,m:"Algo está errado: não encontrei a cidade \""+cid+"\" em "+uf+". Confira o nome da cidade e o estado.",link:mapa};
 if(r.rua_existe===false)return{ok:false,m:"Algo está errado: não encontrei a rua \""+(r.nome_oficial||rua)+"\" em "+cid+" - "+uf+(r.motivo?" ("+r.motivo+")":"")+"."+(sug.length?" Veja endereços parecidos abaixo ou confira o nome da rua.":" Confira o nome da rua."),sug,link:mapa};
 const la=+r.lat,ln=+r.lng;return{ok:true,geo:isFinite(la)&&isFinite(ln)?{lat:la,lng:ln,acc:"aprox"}:null,conf:r.rua_existe===true?"alta":"media"}}
 catch(e){if(e&&e.code=="not_granted")return{ok:false,m:"Não consegui usar a IA agora."};
  const forte=/\b(rua|r|avenida|av|alameda|travessa|praca|estrada|rodovia|sitio|chacara|condominio|escola)\b/.test(String(rua).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""));
  return{ok:true,geo:null,conf:"não verificado"};
  return{ok:false,m:"Não consegui confirmar o endereço agora ("+((e&&(e.code||e.message))||"erro")+"). Tente de novo em instantes.",link:mapa}}}
/* Sugestões de endereço abaixo do campo: ao tocar, preenche o campo mantendo o número digitado */
function showSug(r,rua){const b=$("#e_sug");if(!b)return;tmp.sug=r&&r.sug||[];tmp.sugN=(String(rua).match(/\d+(?:\s*[-\/]\s*\w+)?\s*$/)||[""])[0].trim();
 let h="";if(tmp.sug.length)h+='<div class="mu" style="margin-top:6px">Endereços parecidos:</div>'+tmp.sug.map((x,i)=>`<button type="button" class="btn sec sm" style="display:block;width:100%;text-align:left;margin:4px 0" onclick="usarSug(${i})">📍 ${esc(x)}</button>`).join("");
 if(r&&r.link)h+=`<div class="mu" style="margin-top:6px"><a target="_blank" rel="noopener" href="${esc(r.link)}">Conferir no Google Maps</a></div>`;b.innerHTML=h}
function usarSug(i){const x=tmp.sug&&tmp.sug[i];if(!x)return;const rua=x.split(",")[0].trim();$("#lloc").value=rua+(tmp.sugN?", "+tmp.sugN:"");$("#e_loc").textContent="";$("#e_sug").innerHTML="";toast("Endereço atualizado. Confira o número e toque em Cadastrar.")}
function admGrp(ids){const p=$("#pinfo");p.innerHTML=ids.map(i=>admCard(tmp.adm[i],i)).join("<hr>");p.scrollIntoView({behavior:"smooth",block:"center"})}
function admMap(){const box=$("#mapbox");if(!box)return;tmp.fit="br";tmp.mz=1;box.innerHTML=mapSvg();const L=tmp.adm||[],n=mapPts().length,sem=L.length-L.filter(x=>x.geo&&isFinite(x.geo.lat)&&isFinite(x.geo.lng)).length;$("#pinfo").innerHTML="No mapa: "+n+" de "+L.length+" contas"+(sem?" ("+sem+" sem coordenadas)":"")+". Contas no mesmo lugar são afastadas um pouco para não se sobreporem. Toque num ponto para ver a conta; o link Maps mostra o endereço exato."}
function admFit(all){tmp.fit=all?"br":"pts";tmp.mz=1;$("#mapbox").innerHTML=mapSvg()}
loadCfg();

render();
