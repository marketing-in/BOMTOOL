// Line-view models for the production line (scene units ≈ metres): machine housings built like the
// real equipment — base cabinet with doors, hood with a glass front, conveyor openings, operator
// screen, e-stop and signal tower — plus each machine's own visible internals that move while a
// board is inside, the link conveyors between machines and the OK / NG unloader at the end.
export function createLineModels(THREE){
 const owned=[];const keep=x=>{owned.push(x);return x};
 const mat=(color,metalness=.15,roughness=.6,extra={})=>keep(new THREE.MeshStandardMaterial({color,metalness,roughness,...extra}));
 const C={frame:mat(0xe2dfd7,.1,.62),panel:mat(0xd3cfc5,.1,.65),dark:mat(0x2b2d30,.3,.6),kick:mat(0x3a3c3f,.2,.7),steel:mat(0xb4b8bc,.75,.3),alu:mat(0xc9cdd0,.8,.28),copper:mat(0xd9824a,.35,.45),
  glass:mat(0xa9bcc6,.1,.05,{transparent:true,opacity:.22,depthWrite:false}),belt:mat(0x1c1d1f,.05,.9),screenBack:mat(0x1d1f22,.3,.5),yellow:mat(0xe3b82e,.1,.5),red:mat(0xc8312a,.15,.45),
  lead:mat(0x7d8185,.35,.55),mask:mat(0x1f6b45,.1,.55),reelA:mat(0xe9e8e3,.05,.5),reelB:mat(0x2c4f8a,.1,.5),hot:mat(0x301205,0,1,{emissive:0xff6a2a,emissiveIntensity:.9})};
 const add=(m,x,y,z,parent)=>{m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m};
 const box=(w,h,d,material,x,y,z,parent)=>add(new THREE.Mesh(keep(new THREE.BoxGeometry(w,h,d)),material),x,y,z,parent);
 const cyl=(r,h,material,x,y,z,parent,axis='y',seg=20)=>{const g=keep(new THREE.CylinderGeometry(r,r,h,seg));if(axis==='x')g.rotateZ(Math.PI/2);if(axis==='z')g.rotateX(Math.PI/2);return add(new THREE.Mesh(g,material),x,y,z,parent)};
 const canvasTex=(w,h,draw)=>{if(typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=keep(new THREE.CanvasTexture(c));t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return {t,c}};

 // Signal tower: base, pole, green / amber / red segments and a white cap.
 function tower(parent,x,y,z){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);cyl(.035,.04,C.dark,0,.02,0,g);cyl(.012,.22,C.steel,0,.15,0,g);
  const lamps=[0x3fa66b,0xd8a531,0xd2453b].map((c,i)=>cyl(.042,.07,mat(0x55575a,.1,.4,{emissive:c,emissiveIntensity:0,transparent:true,opacity:.95}),0,.3+i*.075,0,g));cyl(.044,.02,mat(0xf2f1ec,.1,.4),0,.53,0,g);return lamps}
 // Operator screen on an arm: a canvas the line view redraws with the machine's live details.
 function screen(parent,x,y,z){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);cyl(.012,.3,C.steel,0,-.15,0,g);box(.34,.22,.03,C.screenBack,0,.06,0,g);
  const tex=canvasTex(512,330,()=>{});const face=new THREE.Mesh(keep(new THREE.PlaneGeometry(.31,.2)),tex?mat(0xffffff,0,.4,{map:tex.t,emissive:0xffffff,emissiveMap:tex.t,emissiveIntensity:.55}):C.dark);face.position.set(0,.06,.016);g.add(face);
  box(.3,.015,.12,C.dark,0,-.12,.08,g);
  const draw=info=>{if(!tex)return;const x=tex.c.getContext('2d'),W=512,H=330;x.fillStyle='#16191b';x.fillRect(0,0,W,H);const col=info.state==='Running'?'#3fa66b':info.state==='Check failed'?'#d2453b':'#d8a531';
   x.fillStyle=col;x.fillRect(0,0,W,14);x.fillStyle='#ecebe5';x.font='600 46px "IBM Plex Sans", system-ui, sans-serif';x.textBaseline='top';x.fillText(info.name,24,34);
   x.fillStyle=col;x.font='600 34px "IBM Plex Sans", system-ui, sans-serif';x.fillText(info.state,24,98);
   x.font='500 30px "IBM Plex Mono", ui-monospace, monospace';x.fillStyle='#b9b7b0';[['Board',info.board],['Cycle',info.cycle],['Done',info.done]].forEach(([k,v],i)=>{x.fillText(k,24,160+i*52);x.fillStyle='#ecebe5';x.fillText(String(v),200,160+i*52);x.fillStyle='#b9b7b0'});tex.t.needsUpdate=true};
  return {draw}}
 function estop(parent,x,y,z){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);box(.09,.09,.04,C.yellow,0,0,0,g);cyl(.03,.03,C.red,0,0,.035,g,'z');return g}
 // Base cabinet with two doors, handles, kick plate and levelling feet; conveyor slots at pass height.
 function cabinet(g,w,d,top,cy){box(w,top-.1,d,C.frame,0,(top-.1)/2+.1,0,g);box(w-.06,.08,d-.06,C.kick,0,.05,0,g);
  for(const sx of [-1,1])for(const sz of [-1,1])cyl(.03,.06,C.steel,sx*(w/2-.1),.03,sz*(d/2-.1),g);
  const doors=Math.max(1,Math.round(w/.9));for(let i=1;i<doors;i++)box(.008,top-.2,.004,C.kick,-w/2+i*w/doors,(top-.1)/2+.1,d/2+.001,g);
  for(let i=0;i<doors;i++)box(.012,.14,.02,C.steel,-w/2+(i+.85)*w/doors,top*.55,d/2+.012,g);
  for(const sx of [-1,1])box(.012,.12,.95,C.dark,sx*(w/2+.002),cy,0,g)}
 // Hood: solid back, sides and roof with a glass front so the internals show.
 function hood(g,w,d,y0,h){box(w,.04,d,C.panel,0,y0+h,0,g);box(w,h,.04,C.panel,0,y0+h/2,-d/2+.02,g);for(const sx of [-1,1])box(.04,h,d,C.panel,sx*(w/2-.02),y0+h/2,0,g);
  const glass=box(w-.1,h-.08,.012,C.glass,0,y0+h/2,d/2-.02,g);glass.castShadow=false;box(w,.05,.03,C.dark,0,y0+.025,d/2-.015,g);box(w,.05,.03,C.copper,0,y0+h-.03,d/2-.01,g);return glass}

 function machine(id,{x,w,d,h,cy}){
  const g=new THREE.Group();g.position.set(x,0,0);const hit=[],moving=[];const top=cy-.06;
  if(id==='loader'){
   cabinet(g,w,d,top,cy);
   // Open frame on top with the magazine on its elevator.
   for(const sx of [-1,1])for(const sz of [-1,1])box(.05,1,.05,C.alu,sx*(w/2-.12),top+.5,sz*(d/2-.15),g);box(w-.2,.04,d-.25,C.alu,0,top+1,0,g);
   const mag=new THREE.Group();g.add(mag);const mw=.9,md=.95,mh=.62;
   for(const sx of [-1,1])box(.02,mh,md,C.lead,sx*mw/2,0,0,mag);box(mw,.02,md,C.lead,0,-mh/2,0,mag);box(mw,.02,md,C.lead,0,mh/2,0,mag);
   const rails=[];for(let i=0;i<14;i++){for(const sx of [-1,1])box(.012,.006,md*.96,C.steel,sx*(mw/2-.015),-mh/2+.04+i*.04,0,mag)}void rails;
   const boards=[];for(let i=0;i<14;i++)boards.push(box(mw-.06,.012,md*.88,C.mask,0,-mh/2+.04+i*.04,0,mag));
   cyl(.025,1,C.steel,-mw/2-.12,top+.5,0,g);box(.12,.08,.5,C.dark,mw/2+.08,cy,0,g);
   mag.position.set(-.1,cy+.2,0);
   g.userData.setRemaining=n=>boards.forEach((b,i)=>{b.visible=i<n});
   hit.push(...g.children.filter(c=>c.isMesh));
   moving.push((t,busy)=>{mag.position.y=cy+.2+(busy?-.04*((t*.5)%1):0)});
  }else if(id==='reflow'){
   cabinet(g,w,d,top,cy);const hh=.5;box(w,hh,d,C.frame,0,top+hh/2,0,g);box(w,.03,d+.01,C.copper,0,top+hh-.04,0,g);
   for(let i=1;i<11;i++)box(.006,hh+.002,d+.004,C.kick,-w/2+i*w/11,top+hh/2,0,g);
   for(let i=0;i<11;i++){box(w/11*.55,.02,d*.5,C.dark,-w/2+(i+.5)*w/11,top+hh+.01,0,g)}
   for(const sx of [-.32,.18])cyl(.07,.55,C.steel,sx*w,top+hh+.28,-d*.2,g);
   for(const sx of [-1,1]){box(.02,.07,.95,C.dark,sx*(w/2+.006),cy+.01,0,g);box(.012,.05,.9,C.hot,sx*(w/2+.008),cy+.01,0,g)}
   for(let i=0;i<4;i++)cyl(.06,.01,C.dark,w/2-.3-i*.2,top*.6,d/2+.006,g,'z');
   box(.36,.26,.04,C.screenBack,-w/2+.35,top+.18,d/2+.03,g);
   hit.push(...g.children.filter(c=>c.isMesh));
  }else if(id==='xray'){
   const xr=mat(0x9a9d9f,.25,.55);box(w,top+.75,d,xr,0,(top+.75)/2,0,g);box(w-.06,.08,d-.06,C.kick,0,.05,0,g);
   for(const sx of [-1,1])for(const sz of [-1,1])cyl(.03,.06,C.steel,sx*(w/2-.1),.03,sz*(d/2-.1),g);
   box(w*.55,top*.9,.006,C.kick,-w*.12,top*.62,d/2+.003,g);box(w*.5,top*.82,.004,xr,-w*.12,top*.62,d/2+.006,g);
   const win=box(w*.32,.18,.012,mat(0x4e3a12,.2,.1,{transparent:true,opacity:.6}),-w*.12,top+.35,d/2+.008,g);win.castShadow=false;
   const sign=canvasTex(256,224,(x,W,H)=>{x.fillStyle='#e3b82e';x.beginPath();x.moveTo(W/2,8);x.lineTo(W-8,H-8);x.lineTo(8,H-8);x.closePath();x.fill();x.strokeStyle='#1c1b18';x.lineWidth=10;x.stroke();
    x.fillStyle='#1c1b18';const cx=W/2,cy2=H*.62,R=48;x.beginPath();x.arc(cx,cy2,10,0,Math.PI*2);x.fill();for(let k=0;k<3;k++){const a=-Math.PI/2+k*2*Math.PI/3;x.beginPath();x.moveTo(cx,cy2);x.arc(cx,cy2,R,a-.5,a+.5);x.closePath();x.fill()}x.fillStyle='#e3b82e';x.beginPath();x.arc(cx,cy2,18,0,Math.PI*2);x.fill();x.fillStyle='#1c1b18';x.beginPath();x.arc(cx,cy2,10,0,Math.PI*2);x.fill()});
   if(sign){const s=new THREE.Mesh(keep(new THREE.PlaneGeometry(.22,.19)),mat(0xffffff,0,.6,{map:sign.t,transparent:true}));s.position.set(w*.3,top+.42,d/2+.004);g.add(s)}
   box(.04,.04,.02,C.yellow,w*.3,top*.5,d/2+.01,g);for(const sx of [-1,1])box(.012,.12,.95,C.dark,sx*(w/2+.002),cy,0,g);
   hit.push(...g.children.filter(c=>c.isMesh));
  }else{
   const hh=id==='pnp'?.62:.52;cabinet(g,w,d,top,cy);const glass=hood(g,w,d,top,hh);hit.push(...g.children.filter(c=>c.isMesh));
   // Internals behind the glass: Y rails and an X gantry beam with its head, per machine type.
   const yRail=[-1,1].map(sx=>box(.05,.04,d-.2,C.alu,sx*(w/2-.14),top+hh-.12,0,g));void yRail;
   const beam=new THREE.Group();g.add(beam);box(w-.3,.07,.08,C.dark,0,top+hh-.12,0,beam);
   const head=new THREE.Group();beam.add(head);
   if(id==='printer'){box(.6,.06,.7,C.alu,0,cy+.08,0,g);box(.5,.01,.6,mat(0xc4c8cb,.85,.25),0,cy+.11,0,g);box(.55,.08,.05,C.steel,0,top+hh-.22,0,head);box(.5,.12,.01,C.steel,0,top+hh-.3,.02,head)}
   else if(id==='pnp'){for(let k=0;k<4;k++)cyl(.012,.16,C.steel,-.09+k*.06,top+hh-.24,0,head);box(.32,.14,.12,C.copper,0,top+hh-.14,0,head);
    // Feeder trolley across the front with tape reels.
    const n=Math.max(8,Math.round((w-.4)/.09));box(w-.3,.36,.34,C.dark,0,top-.05,d/2+.17,g);for(let i=0;i<n;i++){const fx=-(w-.4)/2+(i+.5)*(w-.4)/n;box(.05,.03,.32,C.lead,fx,top+.14,d/2+.12,g);cyl(.13,.025,i%3===2?C.reelB:C.reelA,fx,top+.18,d/2+.3,g,'x')}
    const beam2=new THREE.Group();g.add(beam2);box(w-.3,.07,.08,C.dark,0,top+hh-.12,0,beam2);const head2=new THREE.Group();beam2.add(head2);box(.26,.12,.1,C.copper,0,top+hh-.14,0,head2);for(let k=0;k<4;k++)cyl(.012,.14,C.steel,-.07+k*.045,top+hh-.24,0,head2);
    moving.push((t,busy)=>{const a=busy?t*2.4:0;beam2.position.z=busy?-.25+.12*Math.sin(a*1.3+1):-.25;head2.position.x=busy?.4*Math.sin(a*1.7+2):.3})}
   else{const cam=box(.14,.16,.14,C.dark,0,top+hh-.22,0,head);const ring=new THREE.Mesh(keep(new THREE.TorusGeometry(.07,.012,8,24)),mat(0xffffff,0,.4,{emissive:id==='aoi'?0x9fd0ff:0xb7ffcf,emissiveIntensity:0}));ring.rotation.x=Math.PI/2;ring.position.set(0,top+hh-.31,0);head.add(ring);
    moving.push((t,busy)=>{ring.material.emissiveIntensity=busy?1.2:0})}
   const speed=id==='printer'?1.2:id==='pnp'?2.4:1.6;
   moving.push((t,busy)=>{const a=busy?t*speed:0;if(id==='printer'){beam.position.z=busy?.28*Math.sin(a):-.3;head.position.x=0}else{beam.position.z=busy?.3*Math.sin(a*.7):-.3;head.position.x=busy?(w/2-.4)*Math.sin(a*(id==='pnp'?1.9:1.1)):0}});
   glass.userData.glass=true;
  }
  // Shared details: operator screen, e-stop, signal tower.
  const scr=screen(g,w/2-.3,top+.45,d/2+.12);if(id!=='loader')estop(g,-w/2+.12,top-.12,d/2+.02);else estop(g,w/2-.15,top-.12,d/2+.02);
  const lamps=tower(g,w/2-.12,id==='reflow'?top+.5:id==='xray'?top+.75:id==='loader'?top+1.02:top+(id==='pnp'?.62:.52),-d/2+.15);
  return {group:g,hit,lamps,screen:scr,update:(t,busy)=>moving.forEach(f=>f(t,busy)),setRemaining:g.userData.setRemaining||(()=>{})};
 }

 // Link conveyor between two machines: legs, aluminium side frames, belts and a drive motor.
 function link(x0,x1,cy){const g=new THREE.Group(),L=x1-x0,mx=(x0+x1)/2;
  for(const sz of [-1,1]){box(L,.07,.04,C.alu,mx,cy-.035,sz*.47,g);box(L,.012,.05,C.belt,mx,cy-.004,sz*.43,g);for(const lx of [x0+.12,x1-.12])box(.04,cy-.07,.04,C.steel,lx,(cy-.07)/2,sz*.42,g)}
  box(L-.1,.03,.85,C.steel,mx,cy*.25,0,g);cyl(.04,.12,C.dark,x1-.2,cy-.1,.55,g,'z');return g}
 // Unloader: two magazines at the end of the line, OK and NG.
 function unloader(x,cy){const g=new THREE.Group();g.position.set(x,0,0);box(1.1,cy-.06,2,C.frame,0,(cy-.06)/2,0,g);
  const slots={};for(const [k,z,m] of [['ok',-.5,mat(0x2d7a4c,.1,.6)],['ng',.5,mat(0xb3261e,.1,.6)]]){for(const sx of [-1,1])box(.02,.6,.9,C.lead,sx*.45,cy+.3,z,g);box(.92,.02,.9,m,0,cy+.01,z,g);slots[k]=z}
  return {group:g,slots}}

 // The shop floor around the line (x0..x1 along the line): epoxy floor with tile seams, yellow safety
 // lanes and a green walkway, the back wall with high windows and steel columns, high-bay lamps, an
 // ESD-area sign, reel racks, a reel cart and a rework bench.
 function environment(x0,x1){const g=new THREE.Group(),L=x1-x0+16,mx=(x0+x1)/2,wallZ=-5.6;
  const floorTex=canvasTex(1024,1024,(x,W,H)=>{x.fillStyle='#c4c7c2';x.fillRect(0,0,W,H);for(let i=0;i<500;i++){x.fillStyle=`rgba(0,0,0,${.015+((i*37)%7)*.004})`;x.fillRect((i*131)%W,(i*197)%H,2,2)}x.strokeStyle='rgba(40,42,40,.22)';x.lineWidth=3;for(let k=0;k<=8;k++){x.beginPath();x.moveTo(k*W/8,0);x.lineTo(k*W/8,H);x.stroke();x.beginPath();x.moveTo(0,k*H/8);x.lineTo(W,k*H/8);x.stroke()}});
  if(floorTex){floorTex.t.wrapS=floorTex.t.wrapT=THREE.RepeatWrapping;floorTex.t.repeat.set(L/8,26/8)}
  const floor=new THREE.Mesh(keep(new THREE.PlaneGeometry(L,26)),mat(0xffffff,.05,.55,floorTex?{map:floorTex.t}:{}));floor.rotation.x=-Math.PI/2;floor.position.set(mx,0,1.4);floor.receiveShadow=true;g.add(floor);
  const strip=(w,d,material,x,z)=>{const m=new THREE.Mesh(keep(new THREE.PlaneGeometry(w,d)),material);m.rotation.x=-Math.PI/2;m.position.set(x,.003,z);m.receiveShadow=true;g.add(m);return m};
  const yellow=mat(0xe3b82e,.05,.6),walk=mat(0x3c7d5a,.05,.7),white=mat(0xf2f1ec,.05,.6);
  for(const z of [-1.55,1.55])strip(x1-x0+3,.08,yellow,mx,z);for(const x of [x0-1.5,x1+1.5])strip(.08,3.18,yellow,x,0);
  strip(x1-x0+6,1.2,walk,mx,3.1);for(const z of [2.5,3.7])strip(x1-x0+6,.05,white,mx,z);
  for(let x=x0;x<x1;x+=3){const ar=new THREE.Mesh(keep(new THREE.ConeGeometry(.16,.4,3)),white);ar.rotation.set(-Math.PI/2,0,-Math.PI/2);ar.scale.set(1,1,.02);ar.position.set(x,.006,3.1);g.add(ar)}
  // Back wall: painted dado band, copper stripe, high windows, steel columns.
  box(L,7,.2,mat(0xe9e7e1,.05,.85),mx,3.5,wallZ,g);box(L,1.3,.02,mat(0x5f6e78,.1,.7),mx,.65,wallZ+.11,g);box(L,.08,.02,C.copper,mx,1.34,wallZ+.12,g);
  for(let x=x0-6;x<x1+6;x+=3.2){box(2.4,1.1,.04,mat(0xdfe9ef,.1,.2,{emissive:0xe8f1f6,emissiveIntensity:.55}),x,5.3,wallZ+.12,g);box(.06,1.1,.06,C.steel,x,5.3,wallZ+.15,g)}
  for(let x=x0-4;x<x1+6;x+=6.4){box(.3,7,.3,mat(0x4b5560,.5,.45),x,3.5,wallZ+.3,g);box(.5,.12,.5,mat(0x4b5560,.5,.45),x,.06,wallZ+.3,g)}
  // High-bay lamps along the wall side.
  for(let x=x0-2;x<x1+4;x+=4.8){cyl(.01,1.2,C.steel,x,6.3,-3.6,g);const shade=new THREE.Mesh(keep(new THREE.ConeGeometry(.42,.32,24,1,true)),mat(0x8d9399,.6,.4,{side:THREE.DoubleSide}));shade.position.set(x,5.55,-3.6);g.add(shade);cyl(.36,.02,mat(0xffffff,0,.3,{emissive:0xfff6e5,emissiveIntensity:1.6}),x,5.4,-3.6,g)}
  // ESD protected area sign on the wall.
  const sign=canvasTex(512,256,(x,W,H)=>{x.fillStyle='#e3b82e';x.fillRect(0,0,W,H);x.strokeStyle='#1c1b18';x.lineWidth=14;x.strokeRect(7,7,W-14,H-14);x.fillStyle='#1c1b18';
   x.beginPath();x.moveTo(110,40);x.lineTo(190,190);x.lineTo(30,190);x.closePath();x.lineWidth=10;x.stroke();x.beginPath();x.moveTo(80,165);x.quadraticCurveTo(110,70,140,165);x.stroke();
   x.font='700 54px "IBM Plex Sans", system-ui, sans-serif';x.fillText('ESD',230,110);x.font='600 34px "IBM Plex Sans", system-ui, sans-serif';x.fillText('protected area',230,165)});
  if(sign){const p=new THREE.Mesh(keep(new THREE.PlaneGeometry(1.6,.8)),mat(0xffffff,0,.6,{map:sign.t}));p.position.set(x0+1,2.4,wallZ+.12);g.add(p)}
  // Reel racks against the wall.
  const reelCols=[0xe9e8e3,0x2c4f8a,0x2d7a4c,0xb3261e,0x1c1d1f].map(c=>mat(c,.1,.5));
  for(const rx of [x0+4,x0+6.4,x1-3]){const r=new THREE.Group();r.position.set(rx,0,wallZ+.75);g.add(r);for(const sx of [-1,1])for(const sz of [-1,1])box(.04,2.1,.04,C.steel,sx*1.05,1.05,sz*.3,r);
   for(let k=0;k<4;k++){box(2.14,.03,.64,C.steel,0,.3+k*.55,0,r);for(let i=0;i<12;i++)cyl(.17,.03,reelCols[(i+k*3)%5],-.95+i*.17,.5+k*.55,0,r,'x')}}
  // Reel cart near the placement machine and a rework bench at the end of the line.
  const cart=new THREE.Group();cart.position.set(mx-1.5,0,-2.6);g.add(cart);box(1,.04,.6,C.steel,0,.3,0,cart);box(1,.04,.6,C.steel,0,.85,0,cart);for(const sx of [-1,1])for(const sz of [-1,1]){box(.03,.85,.03,C.steel,sx*.48,.45,sz*.28,cart);cyl(.04,.03,C.dark,sx*.44,.04,sz*.26,cart,'z')}
  for(let i=0;i<6;i++)cyl(.17,.03,reelCols[i%5],-.4+i*.16,1.04,0,cart,'x');
  const bench=new THREE.Group();bench.position.set(x1+3.2,0,-2.4);g.add(bench);box(1.8,.05,.8,mat(0x5f6e78,.2,.6),0,.9,0,bench);for(const sx of [-1,1])for(const sz of [-1,1])box(.05,.9,.05,C.steel,sx*.85,.45,sz*.35,bench);
  box(.5,.32,.03,C.screenBack,.3,1.25,-.25,bench);cyl(.012,.4,C.steel,-.5,1.12,-.2,bench);cyl(.12,.05,mat(0xf2f1ec,.1,.4,{emissive:0xffffff,emissiveIntensity:.4}),-.5,1.35,-.05,bench);
  return g}

 const dispose=()=>owned.forEach(x=>x.dispose?.());
 return {machine,link,unloader,environment,dispose,materials:C};
}
