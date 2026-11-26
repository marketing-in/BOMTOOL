// Package-specific 3D bodies, so a board reads like the real thing instead of a field of boxes.
// modelKind() is pure (tested); buildBody() makes the Three.js meshes. Sizes are scene units (s = mm
// to scene); every model returns its height so the caller can seat it on the board.

// A part can name its model outright (p.model: the app sets it from what the BoM line says the part is, with
// p.pins, p.pitch in mm and p.color); every other part's model is inferred from its package, value and type.
const MODELS=new Set(['electrolytic','smdcan','tantalum','can','passive','sot223','heatsink','transformer','ct','minifit','kk','boxheader','latchheader','pinheader','qfp','gull','hc49smd','powerind','fuse','to220v','dpak']);

export function modelKind(p){
 if(p.model&&MODELS.has(p.model))return p.model;
 const pkg=String(p.package||''),val=String(p.value||p.mpn||''),both=pkg+' '+val,type=p.type;
 const tht=p.leads==='tht'||(p.pads||[]).some(q=>q.hole>0);
 if(type==='capacitor'&&p.body)return p.body==='tantalum'?'tantalum':p.body==='film'?'film':p.body==='smd-electrolytic'?'smdcan':'electrolytic';
 if(/usb/i.test(both))return 'usb';
 if(type==='connector'&&/jack|barrel|\bdc\b|power.?in/i.test(both))return 'jack';
 if(type==='connector'||/header|pin.?header|pin.?socket|\b[12]x\d+\b/i.test(pkg))return 'header';
 if(/to-?220|to-?247|dpak|d2pak|to-?263/i.test(pkg))return 'to220';
 if(/to-?92/i.test(pkg)||(type==='transistor'&&tht))return 'to92';
 if(/sot-?223/i.test(pkg))return 'sot223';
 if(type==='capacitor'&&(tht||/radial|elec|\bcp[_ ]|polar|elko|\bE\d/i.test(pkg)))return 'electrolytic';
 if(type==='crystal')return tht||/hc-?49/i.test(pkg)?'can':'smdcrystal';
 if(type==='module')return 'module';
 if(type==='switch')return 'switch';
 if(type==='inductor')return 'inductor';
 if(type==='chip'&&/dip|pdip/i.test(pkg))return 'dip';
 if(type==='chip')return 'ic';
 if(type==='led')return 'led';
 if(type==='diode')return 'diode';
 if(type==='resistor'||type==='capacitor'||p.passive)return 'passive';
 if(type==='transistor')return 'sot';
 return 'box';
}

const textures=new Map();
// Laser-marked top face: part number, a short second line and a pin-1 dot.
function markingTexture(THREE,lines,aspect,bg){
 const key=lines.join('|')+'|'+aspect.toFixed(2)+'|'+bg;if(textures.has(key))return textures.get(key);
 if(typeof document==='undefined'||textures.size>160)return null;
 const W=256,H=Math.max(32,Math.min(512,Math.round(256/aspect)));const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
 x.fillStyle=bg;x.fillRect(0,0,W,H);x.fillStyle='#8f969c';x.textAlign='center';x.textBaseline='middle';
 const size=Math.max(10,Math.min(H*.32,W/(Math.max(...lines.map(l=>l.length),4)*.62)));x.font=`600 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
 lines.forEach((l,i)=>x.fillText(l.slice(0,18),W/2,H/2+(i-(lines.length-1)/2)*size*1.15));
 x.fillStyle='#5b6166';x.beginPath();x.arc(Math.min(W,H)*.14,Math.min(W,H)*.14,Math.min(W,H)*.05,0,Math.PI*2);x.fill();
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;textures.set(key,t);return t;
}

// Many small boxes ([w,h,d,x,y,z] each) as one geometry: a QFP's 144 leads are one mesh, not 432.
function boxes(THREE,list){
 const pos=[],nor=[],idx=[];
 for(const [bw,bh,bd,x,y,z] of list){const g=new THREE.BoxGeometry(bw,bh,bd),o=pos.length/3,P=g.attributes.position.array,N=g.attributes.normal.array;
  for(let i=0;i<P.length;i+=3){pos.push(P[i]+x,P[i+1]+y,P[i+2]+z);nor.push(N[i],N[i+1],N[i+2])}for(const i of g.index.array)idx.push(i+o);g.dispose()}
 const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));out.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));out.setIndex(idx);return out;
}
// A rounded rectangle a × b (corner radius r) as a Shape; and a Shape drawn in plan (x, z) stood up as a
// prism h tall, centred on height y.
function roundRect(THREE,a,b,r){const sh=new THREE.Shape(),x=a/2,y=b/2;sh.moveTo(-x+r,-y);sh.lineTo(x-r,-y);sh.absarc(x-r,-y+r,r,-Math.PI/2,0);sh.lineTo(x,y-r);sh.absarc(x-r,y-r,r,0,Math.PI/2);sh.lineTo(-x+r,y);sh.absarc(-x+r,y-r,r,Math.PI/2,Math.PI);sh.lineTo(-x,-y+r);sh.absarc(-x+r,-y+r,r,Math.PI,Math.PI*1.5);return sh}
// three r175 drops the end caps of an extrusion when bevels are off; a zero-size bevel keeps them.
const CAPPED={bevelEnabled:true,bevelThickness:0,bevelSize:0,bevelSegments:1,curveSegments:6};
function prism(THREE,shape,h,y=0){const g=new THREE.ExtrudeGeometry(shape,{depth:h,...CAPPED});g.rotateX(Math.PI/2);g.translate(0,y+h/2,0);return g}

export function buildBody(THREE,p,s,{mat,partPads}){
 const kind=modelKind(p),w=Math.max(.1,p.w*s),d=Math.max(.1,p.d*s);let h=Math.max(.04,p.h*s);
 const add=(parent,geo,material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m};
 const black=mat(0x1b1d20,.1,.72),metal=mat(0xc9cdd1,.85,.3),gold=mat(0xd2b25a,.8,.3);
 // For the models a part names: its pin count, its pitch in scene units, and its own body colour over the model's usual one.
 const n=Math.max(1,p.pins||2),pitch=(p.pitch||2.54)*s,tone=usual=>p.color?parseInt(String(p.color).replace('#',''),16):usual;
 let geo,material;
 const marked=(bg,lines)=>{const tex=markingTexture(THREE,lines,w/d,bg);if(!tex)return black;const top=new THREE.MeshStandardMaterial({map:tex,roughness:.7,metalness:.05});const side=mat(parseInt(bg.slice(1),16),.1,.72);return [side,side,top,side,side,side]};
 const label=[String(p.mpn||p.value||'').slice(0,16),String(p.ref)].filter(Boolean);
 switch(kind){
  case 'electrolytic':{const r=Math.min(w,d)/2;if(!p.body&&!p.model)h=Math.max(h,r*2*1.5);geo=new THREE.CylinderGeometry(r,r,h,32);material=mat(p.body==='snap-in'?0x18191b:0x26272a,.2,.45);break}
  case 'smdcan':{geo=new THREE.BoxGeometry(w*1.04,h*.1,d*1.04);geo.translate(0,-h*.45,0);material=black;break}
  case 'tantalum':{geo=new THREE.BoxGeometry(w*.86,h,d);material=mat(0xd2a03a,.05,.55);break}
  case 'film':{geo=new THREE.BoxGeometry(w,h,d);material=marked('#a3262c',[String(p.value||'').slice(0,12),String(p.ref)].filter(Boolean));break}
  case 'can':{h=Math.max(h,.35*s*10);geo=new THREE.CylinderGeometry(Math.min(w,d)/2,Math.min(w,d)/2,h,24);geo.scale(Math.max(w,d)/Math.min(w,d),1,1);if(d>w)geo.rotateY(Math.PI/2);material=metal;break}
  case 'smdcrystal':{geo=new THREE.BoxGeometry(w,h,d);material=metal;break}
  case 'usb':case 'jack':{geo=new THREE.BoxGeometry(w,h,d);material=kind==='usb'?metal:black;break}
  case 'header':{h=Math.min(h,2.5*s);geo=new THREE.BoxGeometry(w,h,d);material=black;break}
  case 'to220':{geo=new THREE.BoxGeometry(w,h,d);material=marked('#1b1d20',label);break}
  case 'module':{h=Math.max(h,.8*s);geo=new THREE.BoxGeometry(w,h*.25,d);material=mat(0x1f5c3e,.1,.6);break}
  case 'switch':{geo=new THREE.BoxGeometry(w,h,d);material=black;break}
  case 'inductor':{geo=new THREE.BoxGeometry(w,h,d);material=mat(0x3a3d40,.3,.6);break}
  case 'dip':case 'ic':case 'sot223':case 'sot':{geo=new THREE.BoxGeometry(w,h,d);material=w>.22&&d>.12?marked('#1b1d20',w/d>2.5||d/w>2.5?[label[0]||String(p.ref)]:label):black;break}
  case 'passive':{geo=new THREE.BoxGeometry(w*.72,h,d);material=p.type==='capacitor'?mat(0xb7a07a,.05,.7):p.type==='resistor'?mat(0x232526,.05,.7):mat(0x8f8576,.05,.7);break}
  case 'led':{geo=new THREE.BoxGeometry(w,h,d);material=mat(0xe8efe9,.05,.4);break}
  case 'diode':{geo=new THREE.BoxGeometry(w,h,d);material=mat(0x2a2c2e,.1,.6);break}
  case 'heatsink':{// Black anodised extrusion, seen from above as a comb: the flat a TO-220 bolts to in front, fins behind.
   // With power parts standing inside its own depth (p.channel) it is a channel instead: a thin web on the pin line
   // that the parts bolt to from either side, and fins at both ends clear of them.
   if(p.channel){const t=Math.min(2.4*s,d*.2),f=Math.max(1.6*s,w*.05),list=[[w,h,t,0,0,0]];for(const e of [-1,1])for(const k of [0,1])list.push([f,h,d,e*(w/2-f/2-k*2.6*f),0,0]);
    geo=boxes(THREE,list);material=mat(tone(0x17181a),.45,.5);break}
   const fins=Math.max(4,Math.round(p.w/5)),fw=w/(2*fins-1),t=d*.22,sh=new THREE.Shape();sh.moveTo(-w/2,-d/2);sh.lineTo(w/2,-d/2);
   for(let i=fins-1;i>=0;i--){const xl=-w/2+2*i*fw;sh.lineTo(xl+fw,d/2);sh.lineTo(xl,d/2);if(i){sh.lineTo(xl,-d/2+t);sh.lineTo(xl-fw,-d/2+t)}}
   geo=prism(THREE,sh,h);material=mat(tone(0x17181a),.45,.5);break}
  case 'transformer':{// Ferrite E-core pair: a frame round the winding, lifted on the bobbin's pin rails.
   const base=Math.min(3*s,h*.12),wh=h-base,cw=w*.94,cd=d-base*1.6,ix=cw*.35,iz=cd*.31,sh=new THREE.Shape(),win=new THREE.Path();
   sh.moveTo(-cw/2,-cd/2);sh.lineTo(cw/2,-cd/2);sh.lineTo(cw/2,cd/2);sh.lineTo(-cw/2,cd/2);sh.closePath();
   win.moveTo(-ix,-iz);win.lineTo(-ix,iz);win.lineTo(ix,iz);win.lineTo(ix,-iz);win.closePath();sh.holes.push(win);
   geo=prism(THREE,sh,wh*.42,-h/2+base+wh/2);material=mat(tone(0x2b2b2e),.25,.6);break}
  case 'ct':{geo=new THREE.BoxGeometry(w,h,d);material=marked(p.color||'#e6dcc3',label);break}
  case 'minifit':{geo=new THREE.BoxGeometry(w,h,d);material=mat(tone(0xe9e4d4),.02,.55);break}
  case 'kk':{const bh=Math.min(3.2*s,h*.4);geo=new THREE.BoxGeometry(w,bh,d);geo.translate(0,-h/2+bh/2,0);material=mat(tone(0xe9e4d4),.02,.55);break}
  case 'boxheader':case 'latchheader':{// The shroud: floor, end walls, back wall, and a front wall split by the polarising slot.
   const k=pitch/(2.54*s),L=kind==='latchheader'?Math.min(w,(Math.max(2,Math.round(n/2))-1)*pitch+10.16*s*k):w,hs=kind==='latchheader'?h*.6:h,t=d*.11,y=-h/2+hs/2,slot=Math.min(L*.3,4.5*s*k),half=(L-slot)/2;
   geo=boxes(THREE,[[L,hs*.25,d,0,-h/2+hs*.125,0],[L,hs,t,0,y,d/2-t/2],[half,hs,t,-(slot+half)/2,y,-d/2+t/2],[half,hs,t,(slot+half)/2,y,-d/2+t/2],[t,hs,d,-(L/2-t/2),y,0],[t,hs,d,L/2-t/2,y,0]]);
   material=mat(tone(0x1c1c1f),.05,.6);break}
  case 'pinheader':{const ph=Math.min(pitch*.98,h*.5);geo=new THREE.BoxGeometry(w,ph,d);geo.translate(0,-h/2+ph/2,0);material=mat(tone(0x1c1c1f),.05,.6);break}
  case 'qfp':case 'gull':{geo=new THREE.BoxGeometry(w,h*.9,d);geo.translate(0,h*.05,0);material=w>.22&&d>.12?marked('#1b1d20',w/d>2.5||d/w>2.5?[label[0]||String(p.ref)]:label):black;break}
  case 'hc49smd':{// The can of an HC-49/US crystal on its plastic base.
   const bh=h*.18;geo=prism(THREE,roundRect(THREE,w*.92,d*.8,d*.39),h-bh,-h/2+bh+(h-bh)/2);material=metal;break}
  case 'powerind':{geo=prism(THREE,roundRect(THREE,w,d,Math.min(w,d)*.12),h);material=mat(tone(0x3a3d40),.3,.62);break}
  case 'fuse':{geo=new THREE.BoxGeometry(w*.72,h,d);material=mat(tone(0xe9e6dc),.05,.6);break}
  case 'to220v':{// A standing power package: the moulded body in front, the metal tab behind and above it.
   const leg=Math.min(3.6*s,h*.2),bh=(h-leg)*.6;geo=new THREE.BoxGeometry(w,bh,d*.72);geo.translate(0,-h/2+leg+bh/2,-d*.14);material=mat(tone(0x1b1d20),.1,.72);break}
  case 'dpak':{geo=new THREE.BoxGeometry(w,h,d);material=w>.22&&d>.12?marked('#1b1d20',label):black;break}
  default:{geo=p.shape==='cyl'?new THREE.CylinderGeometry(w/2,w/2,h,24):new THREE.BoxGeometry(w,h,d);material=mat(0x5d6764,.15,.55)}
 }
 const mesh=new THREE.Mesh(geo,material);mesh.castShadow=mesh.receiveShadow=true;
 const top=kind==='module'?h*.125:h/2;
 // Gull-wing leads as one mesh: out of the body at height ym, down, and a foot on the pad.
 // Each row: [runs along x (else z), which side, how many, how far the body edge is].
 const gull=(rows,lp,reach,ym,lw=lp*.45)=>{const th=Math.min(.15*s,h*.16),y0=-h/2,list=[];
  for(const [alongX,sign,count,edge] of rows)for(let i=0;i<count;i++){const o=(i-(count-1)/2)*lp;
   for(const [len,hh,off,y] of [[reach*.4,th,reach*.2,ym],[th,ym-y0,reach*.4,(ym+y0)/2],[reach*.6,th,reach*.7,y0+th/2]]){const c=sign*(edge+off);list.push(alongX?[lw,hh,len,o,y,c]:[len,hh,lw,c,y,o])}}
  return add(mesh,boxes(THREE,list),metal)};
 // The moulded pin-1 dimple: bottom-left with the marking upright, where pin 1 of a real package is (+z is the
 // near side of a part at 0 degrees). Placements made from the silkscreen turn the body so this corner is on pin 1.
 const dimple=()=>{const m0=Math.min(w,d);add(mesh,new THREE.CylinderGeometry(m0*.05,m0*.05,.002,16),mat(0x3a3d41,.1,.5),-w/2+m0*.14,h/2+.001,d/2-m0*.14)};
 switch(kind){
  case 'smdcan':{// SMD (V-chip) electrolytic: aluminium can on a black plastic base, black polarity half-moon on top —
   // over the negative terminal, at -x: the terminals lie along x, and the "+" end is +x.
   const r=Math.min(w,d)/2,ch=h*.9;add(mesh,new THREE.CylinderGeometry(r,r,ch,32),metal,0,h*.05,0);add(mesh,new THREE.TorusGeometry(r*.97,r*.03,8,32),mat(0x9aa0a5,.8,.35),0,h/2-r*.25,0).rotation.x=Math.PI/2;
   const moon=add(mesh,new THREE.CylinderGeometry(r*.9,r*.9,.003,32,1,false,Math.PI*1.1,Math.PI*.8),black,0,h/2+.002,0);moon.receiveShadow=true;
   for(const k of [-1,1])add(mesh,new THREE.BoxGeometry(w*.12,.006,d*.22),metal,k*w*.5,-h/2+.003,0);break}
  case 'tantalum':{// Moulded tantalum: amber body, darker anode band (+ end), tin terminations.
   add(mesh,new THREE.BoxGeometry(w*.12,h*1.01,d*1.01),mat(0x7a4f1a,.05,.6),-w*.33,0,0);for(const k of [-1,1])add(mesh,new THREE.BoxGeometry(w*.08,h*.55,d*.7),metal,k*w*.46,-h*.22,0);break}
  case 'film':{for(const k of [-1,1])add(mesh,new THREE.CylinderGeometry(Math.min(w,d)*.05,Math.min(w,d)*.05,h*.04,10),metal,k*w*.4,-h/2-h*.02,0);break}
  case 'electrolytic':{const r=Math.min(w,d)/2;
   // Rubber seal at the foot, the crimp groove near the top, and a snap-in can's plastic top disc.
   add(mesh,new THREE.CylinderGeometry(r*1.004,r*1.004,h*.03,32),mat(0x2b2b2b,.05,.9),0,-h/2+h*.015,0);add(mesh,new THREE.TorusGeometry(r*1.0,r*.035,8,32),mat(0x121212,.2,.5),0,h/2-r*.22,0).rotation.x=Math.PI/2;
   if(p.body==='snap-in')add(mesh,new THREE.CylinderGeometry(r*.92,r*.92,.01,32),mat(0x3a3d40,.1,.6),0,h/2+.004,0);
   add(mesh,new THREE.CylinderGeometry(r*.96,r*.96,.004,28),mat(0xbfc4c8,.8,.3),0,h/2+.002,0);
   const k1=add(mesh,new THREE.BoxGeometry(r*1.3,.006,r*.08),mat(0x8b9196,.6,.4),0,h/2+.004,0);k1.rotation.y=Math.PI/4;const k2=add(mesh,new THREE.BoxGeometry(r*1.3,.006,r*.08),mat(0x8b9196,.6,.4),0,h/2+.004,0);k2.rotation.y=-Math.PI/4;
   const stripe=add(mesh,new THREE.CylinderGeometry(r*1.005,r*1.005,h*.98,28,1,true,-.35,.7),mat(0xd6d6d1,.1,.5));stripe.material.side=THREE.DoubleSide;break}
  case 'header':{for(const q of (p.pads||partPads(p)||[]).slice(0,80)){if(!(q.hole>0)&&p.leads!=='tht'&&!(p.pads||[]).length)continue;add(mesh,new THREE.BoxGeometry(.64*s,6*s,.64*s),gold,q.x*s,h/2+3*s-h/2+h/2,q.y*s)}break}
  case 'usb':{add(mesh,new THREE.BoxGeometry(w*.7,h*.45,.01),black,0,0,-d/2-.002);break}
  case 'jack':{const r=Math.min(w,h)*.3;const hole=add(mesh,new THREE.CylinderGeometry(r,r,.02,20),mat(0x0b0b0c,.2,.8),0,0,-d/2);hole.rotation.x=Math.PI/2;break}
  case 'to220':{const tab=add(mesh,new THREE.BoxGeometry(w,.03,d*.55),metal,0,h*.1,-d/2-d*.25);tab.rotation.x=0;const hole=add(mesh,new THREE.CylinderGeometry(Math.min(w,d)*.12,Math.min(w,d)*.12,.035,18),mat(0x0b0b0c,.2,.8),0,h*.1,-d/2-d*.3);break}
  case 'module':{add(mesh,new THREE.BoxGeometry(w*.9,h*.75,d*.62),metal,0,h*.125+h*.375,d*.15);const tex=markingTexture(THREE,label,w/(d*.62),'#c9cdd1');if(tex){const plate=add(mesh,new THREE.PlaneGeometry(w*.86,d*.58),new THREE.MeshStandardMaterial({map:tex,roughness:.5,metalness:.4}),0,h*.125+h*.75+.002,d*.15);plate.rotation.x=-Math.PI/2}
   add(mesh,new THREE.BoxGeometry(w*.85,.004,d*.22),gold,0,h*.125+.002,-d*.36);break}
  case 'switch':{add(mesh,new THREE.CylinderGeometry(Math.min(w,d)*.22,Math.min(w,d)*.22,h*.6,20),mat(0x2b2e31,.1,.7),0,h/2+h*.3,0);break}
  case 'dip':{const notch=add(mesh,new THREE.CylinderGeometry(Math.min(w,d)*.12,Math.min(w,d)*.12,.004,18,1,false,0,Math.PI),mat(0x0d0e10,.1,.8),0,h/2+.002,0);notch.position.x=w>d?-w/2:0;notch.position.z=w>d?0:-d/2;notch.rotation.y=w>d?-Math.PI/2:0;break}
  case 'heatsink':{// With no transistor placed against it (p.device), one is drawn bolted to the flat: body, tab, screw and legs.
   if(!p.device)break;const tw=Math.min(10.2*s,w*.6),leg=3.6*s,bh=9.2*s,th=Math.min(15.9*s,h-leg),z=-d/2,legs=[];
   add(mesh,new THREE.BoxGeometry(tw,th,1.3*s),metal,0,-h/2+leg+th/2,z-.65*s);add(mesh,new THREE.BoxGeometry(tw,bh,3.2*s),black,0,-h/2+leg+bh/2,z-2.9*s);
   const screw=add(mesh,new THREE.CylinderGeometry(2.8*s,2.8*s,1.6*s,16),mat(0x9aa0a5,.8,.35),0,-h/2+leg+bh+(th-bh)/2,z-2.1*s);screw.rotation.x=Math.PI/2;
   for(const k of [-1,0,1])legs.push([.8*s,leg,.5*s,k*2.54*s,-h/2+leg/2,z-2.4*s]);add(mesh,boxes(THREE,legs),metal);break}
  case 'transformer':{// The winding under yellow tape, the bobbin's flanges and pin rails, and the tape round the core halves.
   const base=Math.min(3*s,h*.12),wh=h-base,cw=w*.94,cd=d-base*1.6,y0=-h/2+base+wh/2,ww=cw*.68,wl=cd*.56,ft=wl*.05,e=cw*.008,tb=wh*.24,tape=mat(0xd9b62e,.05,.5);
   const coil=new THREE.ExtrudeGeometry(roundRect(THREE,ww,wh,Math.min(ww,wh)*.22),{depth:wl,...CAPPED});coil.translate(0,y0,-wl/2);add(mesh,coil,tape);
   add(mesh,boxes(THREE,[[ww*1.06,wh,ft,0,y0,-wl/2-ft/2],[ww*1.06,wh,ft,0,y0,wl/2+ft/2],[w,base*1.5,base*1.6,0,-h/2+base*.75,-(d/2-base*.8)],[w,base*1.5,base*1.6,0,-h/2+base*.75,d/2-base*.8]]),mat(0xe8e4d8,.05,.6));
   add(mesh,boxes(THREE,[[cw+2*e,tb,e,0,y0,-(cd/2+e/2)],[cw+2*e,tb,e,0,y0,cd/2+e/2],[e,tb,cd,-(cw/2+e/2),y0,0],[e,tb,cd,cw/2+e/2,y0,0]]),tape);break}
  case 'ct':{add(mesh,new THREE.BoxGeometry(w*1.01,h*.1,d*1.01),mat(0xcfc4a8,.05,.7),0,-h/2+h*.05,0);break}
  case 'minifit':{// 2 × N square cavities with a tin post in each, and the latch ramp on the front wall.
   const cols=Math.max(1,Math.round(n/2)),cav=[],post=[];
   for(let i=0;i<cols;i++)for(const k of [-1,1]){const x=(i-(cols-1)/2)*pitch,z=k*pitch/2;cav.push([pitch*.8,.004,pitch*.8,x,h/2+.002,z]);post.push([pitch*.25,.006,pitch*.25,x,h/2+.003,z])}
   add(mesh,boxes(THREE,cav),mat(0x3b382f,.05,.9));add(mesh,boxes(THREE,post),metal);
   add(mesh,new THREE.BoxGeometry(Math.min(w*.5,pitch*.9),h*.14,pitch*.2),mesh.material,0,h/2-h*.2,-d/2-pitch*.1);break}
  case 'kk':{// The locking wall behind a row of square posts.
   const wt=d*.18,wallH=h*.8,posts=[];for(let i=0;i<n;i++)posts.push([.64*s,h,.64*s,(i-(n-1)/2)*pitch,0,-d*.08]);
   add(mesh,new THREE.BoxGeometry(w,wallH,wt),mesh.material,0,-h/2+wallH/2,d/2-wt/2);add(mesh,boxes(THREE,posts),gold);break}
  case 'boxheader':case 'latchheader':{// Two rows of posts in the shroud; a latch header has an ejector lever at each end, hooked over the plug.
   const k=pitch/(2.54*s),cols=Math.max(2,Math.round(n/2)),L=kind==='latchheader'?Math.min(w,(cols-1)*pitch+10.16*s*k):w,hs=kind==='latchheader'?h*.6:h,posts=[];
   for(let i=0;i<cols;i++)for(const r of [-1,1])posts.push([.64*s*k,hs*.7,.64*s*k,(i-(cols-1)/2)*pitch,-h/2+hs*.6,r*pitch/2]);add(mesh,boxes(THREE,posts),gold);
   if(kind==='latchheader'){const ll=(w-L)/2;for(const e of [-1,1]){const lever=add(mesh,boxes(THREE,[[ll*.55,h*.92,d*.5,0,h*.02,0],[ll*.9,h*.1,d*.5,-e*ll*.2,h*.42,0]]),mesh.material,e*(L/2+ll*.6),0,0);lever.rotation.z=-e*.1}}break}
  case 'pinheader':{// Square posts on the pin grid, through the plastic strip.
   const k=pitch/(2.54*s),rows=Math.max(1,Math.round(p.d/(p.pitch||2.54))),cols=Math.max(1,Math.round(n/rows)),posts=[];
   for(let i=0;i<cols;i++)for(let r=0;r<rows;r++)posts.push([.64*s*k,h,.64*s*k,(i-(cols-1)/2)*pitch,0,(r-(rows-1)/2)*pitch]);add(mesh,boxes(THREE,posts),gold);break}
  case 'qfp':{// Leads on all four sides, shared out by the length of each side.
   const perX=Math.max(1,Math.round(n/2*w/(w+d))),perZ=Math.max(1,Math.round(n/2)-perX),lp=Math.min(pitch,w*.92/perX,d*.92/perZ);
   gull([[true,-1,perX,d/2],[true,1,perX,d/2],[false,-1,perZ,w/2],[false,1,perZ,w/2]],lp,s,h*.05);dimple();break}
  case 'gull':{const a=Math.ceil(n/2);gull([[true,-1,a,d/2],[true,1,n-a,d/2]],Math.min(pitch,w*.95/a),Math.min(1.05*s,d*.42),h*.05);dimple();break}
  case 'sot223':{// Three leads on one long side, the wide tab on the other.
   const along=w>=d,L=along?w:d,W=along?d:w,r=W*.5,th=Math.min(.25*s,h*.2),list=[];
   for(const [o,lw,sg] of [[-L*.354,L*.11,-1],[0,L*.11,-1],[L*.354,L*.11,-1],[0,L*.46,1]]){const c=sg*(W/2+r/2);list.push(along?[lw,th,r,o,-h/2+th/2,c]:[r,th,lw,c,-h/2+th/2,o])}
   add(mesh,boxes(THREE,list),metal);break}
  case 'hc49smd':{const bh=h*.18;add(mesh,new THREE.BoxGeometry(w,bh,d),black,0,-h/2+bh/2,0);add(mesh,boxes(THREE,[[w*.06,bh*.6,d*.42,-(w/2+w*.03),-h/2+bh*.3,0],[w*.06,bh*.6,d*.42,w/2+w*.03,-h/2+bh*.3,0]]),metal);break}
  case 'powerind':{// Tin terminals wrapped up each end, and the value code laser-marked on top ("2R2").
   add(mesh,boxes(THREE,[[w*.05,h*.4,d*.4,-w/2,-h/2+h*.2,0],[w*.05,h*.4,d*.4,w/2,-h/2+h*.2,0]]),metal);
   const code=(String(p.mpn||'').match(/[-_ ](\d?R\d+|\d{3})(?=[-_A-Z ]|$)/i)||[])[1],tex=code&&markingTexture(THREE,[code.toUpperCase()],w/d,'#3a3d40');
   if(tex){const plate=add(mesh,new THREE.PlaneGeometry(w*.8,d*.8),new THREE.MeshStandardMaterial({map:tex,roughness:.6,metalness:.2}),0,h/2+.002,0);plate.rotation.x=-Math.PI/2}break}
  case 'to220v':{// The tab with its mounting hole, and the legs down to the board.
   const leg=Math.min(3.6*s,h*.2),th=h-leg,bh=th*.6,cnt=Math.max(2,Math.min(7,n)),lp=Math.min(pitch,w*.8/(cnt-1)),legs=[];
   add(mesh,new THREE.BoxGeometry(w,th,d*.28),metal,0,-h/2+leg+th/2,d/2-d*.14);
   const hole=add(mesh,new THREE.CylinderGeometry(w*.17,w*.17,d*.3,18),mat(0x0b0b0c,.2,.8),0,h/2-(th-bh)/2,d/2-d*.14);hole.rotation.x=Math.PI/2;
   for(let i=0;i<cnt;i++)legs.push([Math.min(.8*s,lp*.4),leg,.5*s,(i-(cnt-1)/2)*lp,-h/2+leg/2,0]);add(mesh,boxes(THREE,legs),metal);break}
  case 'dpak':{// The heat tab out of the back; formed leads out of the front (a three-lead part's middle lead is the tab).
   const cnt=n>=5?n:2,lp=n>=5?Math.min(pitch,w*.8/(n-1)):Math.min(pitch,w*.36)*2;
   add(mesh,new THREE.BoxGeometry(w*.82,h*.25,d*.16),metal,0,-h/2+h*.125,d/2+d*.08);gull([[true,-1,cnt,d/2]],lp,d*.42,-h/2+h*.3,w*.12);break}
  case 'passive':case 'fuse':{// Chip resistor / capacitor / fuse: tin end terminations wrapping each end.
   const along=w>=d;for(const k of [-1,1])add(mesh,along?new THREE.BoxGeometry(w*.14,h*1.02,d*1.02):new THREE.BoxGeometry(w*1.02,h*1.02,d*.14),metal,along?k*w*.43:0,0,along?0:k*d*.43);
   if(!along){mesh.geometry.dispose();mesh.geometry=new THREE.BoxGeometry(w,h,d*.72)}break}
  case 'led':{add(mesh,new THREE.SphereGeometry(Math.min(w,d)*.3,14,10),new THREE.MeshStandardMaterial({color:0xe9fff0,emissive:0x6fd48f,emissiveIntensity:.35,roughness:.3}),0,h/2,0);break}
  case 'diode':{add(mesh,new THREE.BoxGeometry(w>d?Math.max(.02,w*.12):w*.92,.012,w>d?d*.92:Math.max(.02,d*.12)),mat(0xd9dedb,0,.8),w>d?-w*.36:0,h/2+.006,w>d?0:-d*.36);break}
 }
 return {mesh,h:kind==='module'?h*.25:h,kind,visualTop:top};
}
