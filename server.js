"use strict";
const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const ROOT=__dirname,PUB=path.join(ROOT,"public"),CF=path.join(ROOT,"config.json"),DF=path.join(ROOT,"config.default.json");
try{for(const l of fs.readFileSync(path.join(ROOT,".env"),"utf8").split(/\r?\n/)){const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2].replace(/^["']|["']$/g,"")}}catch{}
const PW=process.env.ADMIN_PASSWORD||"",TOK=process.env.HEARTBEAT_TOKEN||"",PORT=+process.env.PORT||3000,STALE=(+process.env.HEARTBEAT_STALE_SECONDS||45)*1000;
if(PW.length<10)console.warn("Admin disabled: set ADMIN_PASSWORD (10+ chars) in .env");
if(TOK.length<16)console.warn("Heartbeat disabled: set HEARTBEAT_TOKEN (16+ chars) in .env");
const h=s=>crypto.createHash("sha256").update(String(s)).digest(),eq=(a,b)=>crypto.timingSafeEqual(h(a),h(b));
const sessions=new Map(),tries=new Map();let HB=null;
const send=(res,c,o,x={})=>{res.writeHead(c,{"Content-Type":"application/json","Cache-Control":"no-store",...x});res.end(JSON.stringify(o))};
const body=(req,max)=>new Promise((ok,no)=>{let n=0;const c=[];req.on("data",d=>{n+=d.length;if(n>max){no({error:"Request too large"});req.destroy()}else c.push(d)});req.on("end",()=>{try{ok(JSON.parse(Buffer.concat(c).toString()||"{}"))}catch{no({error:"Invalid JSON"})}});req.on("error",()=>no({error:"Read error"}))});
const cookies=r=>Object.fromEntries((r.headers.cookie||"").split(";").map(s=>s.trim().split("=")).filter(a=>a[0]));
const authed=r=>{const t=cookies(r).cs,e=t&&sessions.get(t);if(e&&e>Date.now())return true;if(t)sessions.delete(t);return false};
const load=f=>JSON.parse(fs.readFileSync(f,"utf8")),save=o=>{const t=CF+".tmp";fs.writeFileSync(t,JSON.stringify(o,null,2)+"\n");fs.renameSync(t,CF)};
const HEX=/^#[0-9a-f]{6}$/i,HOST=/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i,URLR=/^(https?:\/\/[^\s"'<>]{1,290})?$/i;
function validate(i){const e=[],o={};
 const s=(k,f)=>{if(i[k]===undefined)return;if(typeof i[k]!=="string"||!f.test(i[k].trim()))e.push(k+" is invalid");else o[k]=i[k].trim()};
 s("name",/^[^<>]{1,40}$/);s("javaIP",HOST);s("bedrockIP",HOST);s("discord",URLR);s("youtube",URLR);s("logo",/^\/images\/[\w.-]{1,80}\.(png|webp)$/i);
 for(const k of["javaPort","bedrockPort"])if(i[k]!==undefined){if(!Number.isInteger(i[k])||i[k]<1||i[k]>65535)e.push(k+" must be 1-65535");else o[k]=i[k]}
 if(i.statusRefresh!==undefined){if(!Number.isInteger(i.statusRefresh)||i.statusRefresh<5000||i.statusRefresh>300000)e.push("statusRefresh must be 5000-300000 (ms)");else o.statusRefresh=i.statusRefresh}
 if(i.colors!==undefined){if(!i.colors||typeof i.colors!=="object")e.push("colors is invalid");else{o.colors={};for(const k of["black","white","blue","green"])if(i.colors[k]!==undefined){if(!HEX.test(i.colors[k]))e.push(`colors.${k} must be like #168BFF`);else o.colors[k]=i.colors[k]}}}
 for(const k of["showPlayers","showStatus","animations","particles","sound","maintenance"])if(i[k]!==undefined){if(typeof i[k]!=="boolean")e.push(k+" must be true or false");else o[k]=i[k]}
 return{e,o}}
const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".png":"image/png",".webp":"image/webp",".svg":"image/svg+xml",".ico":"image/x-icon"};
const CSP="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://discord.com; frame-ancestors 'none'";
http.createServer(async(req,res)=>{
 res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Referrer-Policy","same-origin");res.setHeader("Content-Security-Policy",CSP);
 const p=new URL(req.url,"http://x").pathname,m=req.method,ip=req.socket.remoteAddress;
 try{
  if(p==="/api/status"&&m==="GET"){ // never contacts the Minecraft server: only reports the last heartbeat
   if(!HB)return send(res,200,{state:"unknown",reason:"No status received from the server yet."});
   const age=Date.now()-HB.at;if(age>STALE)return send(res,200,{state:"unknown",age:Math.round(age/1000),reason:"Status can't be verified right now."});
   const on=HB.state==="online";return send(res,200,{state:HB.state,players:on?HB.players:null,max:on?HB.max:null,version:on?HB.version:"",bedrock:HB.bedrock,age:Math.round(age/1000)})}
  if(p==="/api/heartbeat"&&m==="POST"){
   if(TOK.length<16)return send(res,503,{error:"Heartbeat disabled. Set HEARTBEAT_TOKEN in .env"});
   if(!eq((req.headers.authorization||"").replace(/^Bearer /,""),TOK))return send(res,401,{error:"Bad token"});
   const b=await body(req,2000);if(!["online","offline","starting","sleeping"].includes(b.state))return send(res,400,{error:"state must be online, offline, starting or sleeping"});
   const n=v=>Number.isInteger(v)&&v>=0&&v<=1e6?v:null;
   HB={state:b.state,players:n(b.players),max:n(b.max),version:typeof b.version==="string"?b.version.slice(0,40):"",bedrock:typeof b.bedrock==="boolean"?b.bedrock:null,at:Date.now()};return send(res,200,{ok:true})}
  if(p==="/api/login"&&m==="POST"){
   if(PW.length<10)return send(res,503,{error:"Admin disabled. Set ADMIN_PASSWORD in .env"});
   const t=tries.get(ip)||{n:0,r:0};if(Date.now()>t.r){t.n=0;t.r=Date.now()+6e4}if(t.n>=5)return send(res,429,{error:"Too many attempts. Wait a minute."});
   t.n++;tries.set(ip,t);const b=await body(req,500);
   if(typeof b.password!=="string"||!eq(b.password,PW))return send(res,401,{error:"Wrong password"});
   const tk=crypto.randomBytes(32).toString("hex");sessions.set(tk,Date.now()+8*36e5);
   return send(res,200,{ok:true},{"Set-Cookie":`cs=${tk}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${req.headers["x-forwarded-proto"]==="https"?"; Secure":""}`})}
  if(p.startsWith("/api/admin/")){
   if(!authed(req))return send(res,401,{error:"Not logged in"});
   if(m!=="GET"&&!/application\/json/.test(req.headers["content-type"]||""))return send(res,415,{error:"JSON only"});
   if(p==="/api/admin/config"&&m==="GET")return send(res,200,load(CF));
   if(p==="/api/admin/config"&&m==="PUT"){const{e,o}=validate(await body(req,5000));if(e.length)return send(res,400,{error:e.join("; ")});const c=load(CF),n={...c,...o,colors:{...c.colors,...o.colors}};save(n);return send(res,200,n)}
   if(p==="/api/admin/reset"&&m==="POST"){fs.copyFileSync(DF,CF);return send(res,200,load(CF))}
   if(p==="/api/admin/logo"&&m==="POST"){const b=await body(req,3e6);if(typeof b.data!=="string")return send(res,400,{error:"No image"});
    const buf=Buffer.from(b.data,"base64");if(buf.length<100||buf.length>2e6)return send(res,400,{error:"Image must be under 2 MB"});
    const png=buf.slice(0,4).equals(Buffer.from([0x89,0x50,0x4e,0x47])),webp=buf.slice(0,4).toString()==="RIFF"&&buf.slice(8,12).toString()==="WEBP";
    if(!png&&!webp)return send(res,400,{error:"Logo must be a PNG or WebP file"});
    const name=`logo-${Date.now()}.${png?"png":"webp"}`;fs.writeFileSync(path.join(PUB,"images",name),buf);const c=load(CF);c.logo="/images/"+name;save(c);return send(res,200,{logo:c.logo})}
   if(p==="/api/admin/logout"&&m==="POST"){sessions.delete(cookies(req).cs);return send(res,200,{ok:true},{"Set-Cookie":"cs=; Max-Age=0; Path=/"})}
   return send(res,404,{error:"Not found"})}
  if(m!=="GET"&&m!=="HEAD"){res.writeHead(405);return res.end()}
  if(p==="/config.json"){res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});return res.end(fs.readFileSync(CF))}
  const f=p==="/"?"/index.html":p==="/admin"?"/admin.html":decodeURIComponent(p),fp=path.resolve(PUB,"."+f);
  if(!fp.startsWith(PUB+path.sep)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404,{"Content-Type":"text/plain"});return res.end("404 Not found")}
  const x=path.extname(fp).toLowerCase();res.writeHead(200,{"Content-Type":MIME[x]||"application/octet-stream","Cache-Control":x===".html"?"no-cache":"public, max-age=3600",...(f==="/admin.html"?{"X-Frame-Options":"DENY"}:{})});fs.createReadStream(fp).pipe(res);
 }catch(e){if(!res.headersSent)send(res,e&&e.error?400:500,{error:e&&e.error||"Server error"})}
}).listen(PORT,()=>console.log("CosmosMC running on http://localhost:"+PORT));
