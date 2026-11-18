"use client";
// circuitflow's board studio (src/Board.jsx), cut down for this app: the assembled board in 3D (package models,
// copper tracks with vias, pads, leads and solder, silkscreen), its 2D drawing, hover and select, camera presets,
// flip to the bottom, full screen and the layer split. Stripped: GLB boards and part models, the cobot gripper and
// SMT-rig playback, the part summary card (the app renders its own via renderTip) and the Gerber re-parse — layer
// pictures come from the app (board.layerImages). Chrome restyled to the app's tokens; no blue.
import React,{useEffect,useMemo,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {Maximize,Minimize,RotateCcw,ZoomIn,ZoomOut,Layers3,FlipVertical2,Eye,EyeOff} from 'lucide-react';
import {partDetail,synthTraces} from './boardDetail.js';
import {buildBody} from '../partModels.js';
import {partPads,displayName,LIMITS} from '../blueprint.js';

export const TYPE_COLORS={chip:0x242a2b,module:0x2b3436,transistor:0x2a2f30,diode:0x3b3432,led:0xd9e8e2,capacitor:0xb9a17b,resistor:0x34393d,inductor:0x55595b,connector:0xc7ccca,crystal:0xb5bbb7,switch:0x8f9699,fuse:0xd2cfb4,other:0x5d6764};
const hex=n=>'#'+n.toString(16).padStart(6,'0');
const HIGHLIGHT=0xf7c61b,SELECT_GLOW=0x2c1748,LINE_GLOW=0x1e1030,HOVER_GLOW=0x2a2a2a;
// What the board is made of; the app passes its own mask, finish and silk colours in board.look.
const LOOK={mask:'#137a36',edge:'#0d4f24',trace:'#2f9468',traceBottom:'#2a8a5f',pad:'#c9b578',silk:'#f4f4ee',core:'#c9b27a'};
const LAYER_NAMES={'parts-top':'Components · top','silk-top':'Silkscreen · top','mask-top':'Solder mask · top','copper-top':'Copper · top','core':'Core · FR-4','copper-bottom':'Copper · bottom','mask-bottom':'Solder mask · bottom','silk-bottom':'Silkscreen · bottom','parts-bottom':'Components · bottom'};
const viewMemory=new Map();
// Camera presets, close enough that the board fills the stage (far() steps back on narrow screens).
const CAMERAS={overview:[7.4,9.6,8.8],top:[0,14,.45],side:[11,3.4,5.2]};
const VIEW_LABEL={overview:'Overview',top:'Top',side:'Side'};
const THICK=.18;
const appFont=()=>{try{return getComputedStyle(document.body).fontFamily||'system-ui, sans-serif'}catch{return 'system-ui, sans-serif'}};
const isCanvas=v=>typeof HTMLCanvasElement!=='undefined'&&v instanceof HTMLCanvasElement;
// A picture source is a URL or a canvas the app already drew.
function texFrom(src,onLoad){
 if(isCanvas(src)){const t=new THREE.CanvasTexture(src);onLoad?.();return t}
 return new THREE.TextureLoader().load(src,()=>onLoad?.());
}

// Builds every mesh of a board into `group`. Returns the pickable component meshes.
function buildBoard(group,board,parts,s,invalidate){
 const clickable=[];const mat=(color,metalness=.1,roughness=.6)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
 const look={...LOOK,...board.look};
 const W=board.width*s,H=board.height*s;
 const shapeOf=()=>{
  if(board.outline&&board.outline.length>2){const sh=new THREE.Shape(board.outline.map(([x,y])=>new THREE.Vector2(x*s,-y*s)));for(const hole of board.holes||[])if(hole.length>2)sh.holes.push(new THREE.Path(hole.map(([x,y])=>new THREE.Vector2(x*s,-y*s))));return sh}
  return new THREE.Shape([new THREE.Vector2(-W/2,-H/2),new THREE.Vector2(W/2,-H/2),new THREE.Vector2(W/2,H/2),new THREE.Vector2(-W/2,H/2)]);
 };
 const slabGeometry=depth=>{
  if(board.outline&&board.outline.length>2){const geo=new THREE.ExtrudeGeometry(shapeOf(),{depth,bevelEnabled:false});geo.rotateX(-Math.PI/2);geo.translate(0,-depth/2,0);return geo}
  return new THREE.BoxGeometry(W,depth,H);
 };
 let slab;
 if(board.surface?.top){
  // Gerber boards: the board face the app drew from the customer's layers (mask, copper, finish, legend, holes).
  slab=new THREE.Mesh(slabGeometry(THICK),[mat(look.edge,.05,.7),mat(look.core,.05,.8)]);
  for(const [side,src] of [['top',board.surface.top],['bottom',board.surface.bottom]]){if(!src)continue;
   const tex=texFrom(src,invalidate);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;tex.repeat.set(1/W,1/H);tex.offset.set(.5,.5);
   const m=new THREE.MeshStandardMaterial({map:tex,roughness:.5,metalness:.08,side:side==='top'?THREE.FrontSide:THREE.BackSide});m.color.setScalar(.85);
   const face=new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(),16).rotateX(-Math.PI/2),m);face.position.y=(side==='top'?1:-1)*(THICK/2+.002);face.receiveShadow=true;face.userData.layer='surface-'+side;group.add(face)}
 }else slab=new THREE.Mesh(slabGeometry(THICK),mat(look.mask,.1,.55));
 slab.castShadow=slab.receiveShadow=true;slab.userData.layer='core';slab.userData.isCore=true;group.add(slab);
 if(!board.surface){const mask=new THREE.Mesh(slabGeometry(.04),mat(look.mask,.1,.55));mask.position.y=-THICK/2+.01;mask.userData.layer='mask-bottom';group.add(mask)}
 {const edges=new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry,20),new THREE.LineBasicMaterial({color:look.edge,transparent:true,opacity:.6}));edges.userData.layer='core';group.add(edges)}
 const font=appFont();
 function label(text,x,z,size,y=THICK/2+.012){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const c=canvas.getContext('2d');c.font=`600 30px ${font}`;c.fillStyle=look.silk;c.textAlign='center';c.fillText(String(text).slice(0,14),128,40);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.userData.own=true;const plane=new THREE.Mesh(new THREE.PlaneGeometry(size*3,size*.75),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));plane.rotation.x=-Math.PI/2;plane.position.set(x,y,z);plane.userData.layer='silk-top';group.add(plane)}
 // Pads: the app's footprint pads, or synthetic leads from the package. Merged per side.
 const padGeos={top:[],bottom:[]},holeGeos=[];let padCount=0;
 for(const p of parts){
  if(board.surface)break;const pads=partPads(p);const synthetic=!p.pads;const ph=synthetic?.07:.025;const a=p.rot*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a);
  for(const pad of pads){
   if(padCount++>LIMITS.pads)break;
   const pw=Math.max(.02,pad.w*s),pd=Math.max(.02,pad.h*s),round=pad.shape==='circle'||pad.shape==='oval';
   const g=round?new THREE.CylinderGeometry(Math.max(pw,pd)/2,Math.max(pw,pd)/2,ph,14):new THREE.BoxGeometry(pw,ph,pd);
   if(round&&pw!==pd)g.scale(pw/Math.max(pw,pd),1,pd/Math.max(pw,pd));
   g.rotateY(((pad.rot||0)+p.rot)*Math.PI/180);
   const lx=pad.x*s,ly=pad.y*s;const bx=p.x*s+lx*cos+ly*sin,bz=p.y*s-lx*sin+ly*cos;
   g.translate(bx,(p.side==='bottom'?-1:1)*(THICK/2+ph/2-.004),bz);padGeos[p.side==='bottom'?'bottom':'top'].push(g);
   if(pad.hole>0&&holeGeos.length<800){const hg=new THREE.CylinderGeometry(pad.hole*s/2,pad.hole*s/2,THICK+.08,10);hg.translate(bx,0,bz);holeGeos.push(hg)}
  }
 }
 for(const side in padGeos)if(padGeos[side].length){const merged=mergeGeometries(padGeos[side],false);if(merged){const m=new THREE.Mesh(merged,mat(look.pad,.7,.35));m.castShadow=true;m.userData.layer='copper-'+side;group.add(m)}padGeos[side].forEach(g=>g.dispose())}
 if(holeGeos.length){const merged=mergeGeometries(holeGeos,false);if(merged){const hm=new THREE.Mesh(merged,mat(0x1c1f1e,.2,.8));hm.userData.layer='core';group.add(hm)}holeGeos.forEach(g=>g.dispose())}
 // Component bodies: package-specific models (partModels.js), seated on the board face. Always solid.
 // A part that is not fitted (DNP) is only a dashed footprint on the board, with an unseen box to click.
 for(const p of parts){
  const sign=p.side==='bottom'?-1:1,layer='parts-'+(p.side==='bottom'?'bottom':'top');
  if(p.dnp){
   const w=Math.max(.04,p.w*s),d=Math.max(.04,p.d*s);
   const pts=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2],[-w/2,-d/2]].map(([x,z])=>new THREE.Vector3(x,0,z));
   const dash=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineDashedMaterial({color:look.silk,dashSize:.035,gapSize:.025}));dash.computeLineDistances();
   dash.position.set(p.x*s,sign*(THICK/2+.008),p.y*s);dash.rotation.y=p.rot*Math.PI/180;dash.userData.layer=layer;group.add(dash);
   const geo=new THREE.BoxGeometry(w,.05,d);const hit=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({visible:false}));
   hit.position.set(p.x*s,sign*(THICK/2+.025),p.y*s);hit.rotation.y=p.rot*Math.PI/180;hit.userData={part:p,kind:'dnp',h:.05,lift:0,hitOnly:true,layer};
   const outline=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:HIGHLIGHT}));outline.visible=false;outline.scale.set(1.12,1.12,1.12);hit.add(outline);hit.userData.outline=outline;
   group.add(hit);clickable.push(hit);continue;
  }
  const body=buildBody(THREE,p,s,{mat,partPads});const mesh=body.mesh,h=body.h;
  const lift=p.pads?.02:.06;
  mesh.position.set(p.x*s,sign*(THICK/2+lift+h/2),p.y*s);mesh.rotation.y=p.rot*Math.PI/180;
  if(p.side==='bottom')mesh.rotation.x=Math.PI;
  mesh.userData={part:p,kind:body.kind,h,lift,layer};
  group.add(mesh);clickable.push(mesh);
  const outline=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:HIGHLIGHT}));outline.visible=false;outline.scale.set(1.12,1.12,1.12);mesh.add(outline);mesh.userData.outline=outline;
 }
 // Copper tracks as flat ribbons under the mask, both sides. Without routing data the tracks and vias are
 // illustrative (synthTraces), so the board reads like a real one front and back.
 const realTraces=(board.traces?.top?.length||0)+(board.traces?.bottom?.length||0)>0;
 const routing=board.surface?null:realTraces?{top:board.traces.top||[],bottom:board.traces.bottom||[],vias:[]}:synthTraces(parts.filter(p=>!p.dnp),board);
 if(routing){
  const tw=Math.max(.0035,.32*s),th=.006;
  for(const side of ['top','bottom']){
   const segs=(routing[side]||[]).slice(0,LIMITS.traces);if(!segs.length)continue;const geos=[];const y=(side==='top'?1:-1)*(THICK/2+th/2+.0015);
   for(const [x1,y1,x2,y2] of segs){const dx=(x2-x1)*s,dz=(y2-y1)*s,L=Math.hypot(dx,dz);if(L<1e-5)continue;const g=new THREE.BoxGeometry(L+tw,th,tw);g.rotateY(Math.atan2(-dz,dx));g.translate((x1+x2)/2*s,y,(y1+y2)/2*s);geos.push(g)}
   if(geos.length){const merged=mergeGeometries(geos,false);if(merged){const m=new THREE.Mesh(merged,mat(side==='top'?look.trace:look.traceBottom,.25,.45));m.receiveShadow=true;m.userData.layer='copper-'+side;group.add(m)}geos.forEach(g=>g.dispose())}
  }
  if(routing.vias.length){const ring=[],hole=[];for(const [x,y] of routing.vias.slice(0,800)){const r=new THREE.CylinderGeometry(.42*s,.42*s,THICK+.012,14);r.translate(x*s,0,y*s);ring.push(r);const h=new THREE.CylinderGeometry(.16*s,.16*s,THICK+.02,10);h.translate(x*s,0,y*s);hole.push(h)}
   const mr=mergeGeometries(ring,false),mh=mergeGeometries(hole,false);if(mr){const vm=new THREE.Mesh(mr,mat(look.pad,.75,.3));vm.userData.layer='core';group.add(vm)}if(mh){const hv=new THREE.Mesh(mh,new THREE.MeshBasicMaterial({color:0x07090a}));hv.userData.layer='core';group.add(hv)}[...ring,...hole].forEach(g=>g.dispose())}
 }
 // Leads, end caps, through-hole pins and solder: planned per part in millimetres, merged per material.
 const det={};const push=(k,side,g)=>{(det[k+'|'+side]||=[]).push(g)};let pieces=0;
 for(const p of parts){
  if(pieces>LIMITS.pads*2)break;if(p.dnp)continue;
  const d=partDetail(p),a=p.rot*Math.PI/180,sign=p.side==='bottom'?-1:1,lift=p.pads?.02:.06,h=Math.max(.04,p.h*s);
  const surf=sign*(THICK/2),bodyBottom=sign*(THICK/2+lift);
  const place=(g,lx,ly,yy)=>{g.translate(lx*s,yy,ly*s);g.rotateY(a);g.translate(p.x*s,0,p.y*s);return g};
  const lt=Math.max(.004,.15*s),sd=p.side==='bottom'?'bottom':'top';
  for(const l of d.leads){
   // Gull wing: shoulder out of the body side, a bend down, and a foot on the pad.
   const along=l.len*s,w=l.width*s,shoulder=along*.38,foot=along*.5,hy=bodyBottom+sign*h*.3,fy=surf+sign*(lt/2+.002);
   const box=(len,ht)=>l.axis==='x'?new THREE.BoxGeometry(len,ht,w):new THREE.BoxGeometry(w,ht,len);
   const at=f=>{const off=(l.axis==='x'?Math.abs(l.x):Math.abs(l.y))-l.len/2+f/s;return l.axis==='x'?[l.dir*off,l.y]:[l.x,l.dir*off]};
   const [sx,sy]=at(shoulder/2);push('lead',sd,place(box(shoulder,lt),sx,sy,hy));
   const [bx,by]=at(shoulder+lt/2);push('lead',sd,place(box(lt*1.6,Math.abs(hy-fy)+lt),bx,by,(hy+fy)/2));
   const [fx,fy2]=at(along-foot/2);push('lead',sd,place(box(foot,lt),fx,fy2,fy));pieces+=3;
  }
  for(const c of d.caps){push('cap',sd,place(new THREE.BoxGeometry(c.w*s+.004,h+.006,c.d*s+.004),c.x,c.y,bodyBottom+sign*h/2));pieces++}
  for(const q of d.pins){const len=THICK+lift+.11;push('pin',sd,place(new THREE.CylinderGeometry(q.r*s,q.r*s,len,10),q.x,q.y,sign*(THICK/2+lift)-sign*len/2));pieces++}
  for(const q of d.solder){const ss=q.side==='bottom'?-1:1,r=q.r*s;
   if(q.joint){const g=new THREE.CylinderGeometry(r*.35,r,Math.max(.012,.55*s),16);if(ss<0)g.rotateX(Math.PI);push('solder',ss<0?'bottom':'top',place(g,q.x,q.y,ss*(THICK/2+Math.max(.006,.275*s))))}
   else if(!d.caps.length||!board.surface){const g=new THREE.SphereGeometry(r,12,6,0,Math.PI*2,0,Math.PI/2);g.scale(1,.32,1);if(ss<0)g.rotateX(Math.PI);push('solder',ss<0?'bottom':'top',place(g,q.x,q.y,ss*(THICK/2+.003)))}
   pieces++}
 }
 const metal={lead:mat(0xc7cbcf,.85,.3),cap:mat(0xd4d6d8,.8,.35),pin:mat(0xbfc4c8,.85,.28),solder:mat(0xb7bcc1,.9,.22)};
 for(const key in det)if(det[key].length){const [k,side]=key.split('|');const merged=mergeGeometries(det[key],false);if(merged){const m=new THREE.Mesh(merged,metal[k]);m.userData.layer='parts-'+side;m.userData.detail=true;m.castShadow=k!=='solder';group.add(m)}det[key].forEach(g=>g.dispose())}
 const labelled=parts.length<=160?parts:parts.filter(p=>['chip','module','connector','transistor','diode','crystal','switch'].includes(p.type)).slice(0,160);
 for(const p of board.surface?[]:labelled){if(p.side==='bottom')continue;const size=Math.max(.2,Math.min(.42,Math.max(p.w,p.d)*s*.5));label(p.ref,p.x*s,p.y*s+p.d*s/2+size*.55,size)}
 return clickable;
}

const toolBtn=on=>'grid size-9 place-items-center rounded-md outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring '+(on?'bg-foreground text-background':'text-muted-foreground hover:bg-muted hover:text-foreground');
const segBtn=on=>'inline-flex h-9 items-center justify-center rounded-[5px] px-3 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring '+(on?'bg-background font-medium text-foreground ring-1 ring-border':'text-muted-foreground hover:text-foreground');

/**
 * Props: board {id,name,width,height,outline?,holes?,surface?{top,bottom},layerImages?():Record<layer,canvas|url>,look?},
 * parts (circuitflow parts; `dnp` = not fitted), mode '3D'|'2D', selected ref, related refs (same BoM line),
 * tint {ref: colour} (risk overlay), focus refs (process step) or null, bottom (show the solder side),
 * onSelect(part|null), renderTip(part) for the hover card, onToggleFull/full to full-screen the host page's stage.
 */
export default function Board({board,parts,mode='3D',selected=null,related=null,tint=null,focus=null,bottom=false,onSelect,onHover,renderTip,onToggleFull,full:fullProp}){
 const host=useRef(),wrap=useRef(),tip=useRef(),sceneRef=useRef(),cb=useRef({});cb.current={onSelect,onHover};
 const partsRef=useRef(parts);partsRef.current=parts;
 // The 3D scene is rebuilt only when geometry changes; selection, tint and focus restyle the meshes in place.
 const geomKey=useMemo(()=>board.id+'|'+parts.map(p=>[p.ref,p.x,p.y,p.rot,p.w,p.d,p.h,p.side,p.type,p.package,p.mpn,p.value,p.leads,p.dnp?1:0,(p.pads||[]).length].join(',')).join(';'),[board.id,parts]);
 const [ownFull,setOwnFull]=useState(false);const full=fullProp??ownFull;
 useEffect(()=>{const fn=()=>setOwnFull(document.fullscreenElement===wrap.current);document.addEventListener('fullscreenchange',fn);return()=>document.removeEventListener('fullscreenchange',fn)},[]);
 const toggleFull=()=>{if(onToggleFull)return onToggleFull();if(document.fullscreenElement)document.exitFullscreen?.();else wrap.current?.requestFullscreen?.().catch(()=>{})};
 const [exploded,setExploded]=useState(false),[layerList,setLayerList]=useState([]),[hiddenLayers,setHiddenLayers]=useState([]);
 const [failed,setFailed]=useState(false),[hover,setHover]=useState(null),[flipped,setFlipped]=useState(!!bottom),[view,setView]=useState('overview');
 useEffect(()=>{setFlipped(!!bottom);if(bottom)setExploded(false)},[bottom]);
 const scale=Math.min(10/board.width,6.7/board.height);
 const setHovered=p=>{setHover(p);cb.current.onHover?.(p)};
 const moveTip=(x,y)=>{const el=tip.current,h=wrap.current;if(!el||!h)return;const r=h.getBoundingClientRect();let left=x-r.left+16,top=y-r.top+18;if(left+el.offsetWidth>r.width-8)left=x-r.left-el.offsetWidth-16;if(top+el.offsetHeight>r.height-8)top=y-r.top-el.offsetHeight-14;el.style.transform=`translate(${Math.max(4,left)}px,${Math.max(4,top)}px)`};
 useEffect(()=>{setHover(null)},[board.id,mode]);
 // How each part is drawn right now (read by the scene on hover and on every restyle).
 const style=useRef({});style.current={selected,related:new Set(related||[]),tint:tint||{},focus:focus?new Set(focus):null};
 useEffect(()=>{
  if(mode==='2D')return;
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})}catch{setFailed(true);return}
  const reduce=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el=host.current;el.appendChild(renderer.domElement);renderer.domElement.style.display='block';
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  let dirty=true;const invalidate=()=>{dirty=true};
  const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(36,1,.1,100);camera.position.set(...CAMERAS.overview);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=!reduce;controls.minDistance=2.5;controls.maxDistance=34;controls.maxPolarAngle=Math.PI*.48;
  controls.addEventListener('change',invalidate);
  scene.add(new THREE.AmbientLight(0xffffff,2));
  const light=new THREE.DirectionalLight(0xffffff,4);light.position.set(3,12,8);light.castShadow=true;light.shadow.mapSize.set(1024,1024);scene.add(light);
  const rim=new THREE.DirectionalLight(0xf1efe9,2);rim.position.set(-8,6,-5);scene.add(rim);
  const under=new THREE.DirectionalLight(0xecebe6,1.2);under.position.set(2,-9,-4);scene.add(under);
  const group=new THREE.Group();scene.add(group);
  const clickable=buildBoard(group,board,partsRef.current,scale,invalidate);
  const memory=viewMemory.get(board.id);if(memory){camera.position.copy(memory.pos)}
  // Narrow canvases (phones, beside side panels): the camera presets step back so the whole board still fits.
  const fitK=()=>Math.max(1,1.15/Math.max(.35,camera.aspect));const far=pos=>new THREE.Vector3(...pos).multiplyScalar(fitK());
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.09}));ground.rotation.x=-Math.PI/2;ground.position.y=-.3;ground.receiveShadow=true;scene.add(ground);
  // Each body's own colours, so tint, focus and highlight can be laid on and taken off again.
  for(const m of clickable){const list=[];m.traverse(o=>{if(o===m.userData.outline||!o.material||o.isLineSegments)return;for(const x of [].concat(o.material))if(x.color&&!list.some(e=>e.m===x))list.push({m:x,c:x.color.clone(),e:x.emissive?.clone(),own:o===m})});m.userData.mats=list}
  let hovered=null;
  const restyle=m=>{const st=style.current,p=m.userData.part,ref=p.ref;
   const on=ref===st.selected,line=st.related.has(ref),inFocus=st.focus?.has(ref),dim=!!st.focus&&!inFocus&&!on,t=st.tint[ref];
   for(const e of m.userData.mats||[]){e.m.color.copy(t&&e.own?new THREE.Color(t):e.c);if(dim)e.m.color.multiplyScalar(.45);const glow=m===hovered?HOVER_GLOW:on?SELECT_GLOW:line?LINE_GLOW:null;if(e.m.emissive){if(glow===null)e.m.emissive.copy(e.e);else e.m.emissive.setHex(glow)}}
   const o=m.userData.outline;if(o){o.visible=on||!!inFocus||(line&&!!st.selected);o.material.color.setHex(on||inFocus?HIGHLIGHT:0x9a6fd0)}};
  const restyleAll=()=>{for(const m of clickable)restyle(m);invalidate()};restyleAll();
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let start=null,dragging=false,raf=0,lastEvent=null,desired=null;
  const cast=e=>{const b=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-((e.clientY-b.top)/b.height)*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(clickable,false).find(h=>h.object.visible);return hit?hit.object:null};
  const setHover3=m=>{const prev=hovered;hovered=m;if(prev)restyle(prev);if(m)restyle(m);invalidate()};
  const clearHover=()=>{if(hovered){setHover3(null);setHovered(null)}renderer.domElement.style.cursor='grab'};
  const move=e=>{if(dragging)return;lastEvent=e;if(raf)return;raf=requestAnimationFrame(()=>{raf=0;const m=cast(lastEvent);if(m!==hovered){setHover3(m);renderer.domElement.style.cursor=m?'pointer':'grab';setHovered(m?m.userData.part:null)}if(m)moveTip(lastEvent.clientX,lastEvent.clientY)})};
  let travelled=0;const track=e=>{if(dragging&&start)travelled=Math.max(travelled,Math.hypot(e.clientX-start[0],e.clientY-start[1]))};
  const down=e=>{start=[e.clientX,e.clientY];dragging=true;travelled=0};
  const up=e=>{dragging=false;if(!start||travelled>5||Math.hypot(e.clientX-start[0],e.clientY-start[1])>5)return;const m=cast(e);clearHover();cb.current.onSelect?.(m?m.userData.part:null)};
  const dom=renderer.domElement;dom.style.cursor='grab';dom.addEventListener('pointermove',track);dom.addEventListener('pointerdown',down);dom.addEventListener('pointerup',up);dom.addEventListener('pointermove',move);dom.addEventListener('pointerleave',clearHover);dom.addEventListener('pointercancel',clearHover);
  let sized=false;const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();controls.maxDistance=34*fitK();if(!sized&&!memory)camera.position.set(...CAMERAS.overview).multiplyScalar(fitK());sized=true;invalidate()};const ro=new ResizeObserver(resize);ro.observe(el);resize();
  // Layer split: every tagged object rides to its layer's height, labels name each layer, and the core turns
  // laminate-coloured once the mask has lifted off it. Gerber boards swap their face for the app's layer pictures.
  const OFF={'parts-top':3.4,'silk-top':2.65,'mask-top':1.95,'surface-top':1.95,'copper-top':1.2,'core':0,'copper-bottom':-1.2,'mask-bottom':-1.95,'surface-bottom':-1.95,'silk-bottom':-2.65,'parts-bottom':-3.4};
  const ex={k:0,target:0,hidden:new Set(),gerber:false};
  const boardShape=(()=>{if(board.outline&&board.outline.length>2){const sh=new THREE.Shape(board.outline.map(([x,y])=>new THREE.Vector2(x*scale,-y*scale)));for(const hole of board.holes||[])if(hole.length>2)sh.holes.push(new THREE.Path(hole.map(([x,y])=>new THREE.Vector2(x*scale,-y*scale))));return sh}
   const w=board.width*scale/2,h=board.height*scale/2;return new THREE.Shape([new THREE.Vector2(-w,-h),new THREE.Vector2(w,-h),new THREE.Vector2(w,h),new THREE.Vector2(-w,h)])})();
  const look={...LOOK,...board.look};
  if(!board.surface){
   // Without mask data the slab is mask and core in one, so a mask sheet lifts off it when split.
   for(const side of ['top','bottom']){const mp=new THREE.Mesh(new THREE.ShapeGeometry(boardShape,12).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:look.mask,transparent:true,opacity:.6,roughness:.4,side:THREE.DoubleSide,depthWrite:false}));
    mp.position.y=(side==='top'?1:-1)*(THICK/2+.004);mp.userData={layer:'mask-'+side,explodeOnly:true};mp.visible=false;group.add(mp)}
  }
  const core=group.children.find(c=>c.userData.isCore),coreMats=core?[].concat(core.material):[],coreColors=coreMats.map(m=>m.color.clone()),laminate=new THREE.Color(look.core);
  for(const c of group.children)if(c.userData.layer)c.userData.baseY=c.position.y;
  const labelSprites=new Map();const font=appFont();
  const labelFor=key=>{if(labelSprites.has(key))return labelSprites.get(key);const cv=document.createElement('canvas');cv.width=512;cv.height=96;const x=cv.getContext('2d');
   x.fillStyle='rgba(26,26,24,.9)';x.beginPath();x.roundRect?x.roundRect(2,12,508,72,10):x.rect(2,12,508,72);x.fill();x.fillStyle='#f7c61b';x.fillRect(2,12,6,72);x.fillStyle='#f6f6f4';x.font=`500 32px ${font}`;x.textAlign='center';x.textBaseline='middle';x.fillText(LAYER_NAMES[key],256,50);
   const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false}));sp.renderOrder=10;sp.scale.set(2.9,.54,1);sp.visible=false;scene.add(sp);labelSprites.set(key,sp);return sp};
  const present=()=>{const set=new Set();for(const c of group.children){const L=c.userData.layer;if(!L)continue;if(L.startsWith('surface')&&ex.gerber)continue;set.add(L.replace('surface','mask'))}return Object.keys(LAYER_NAMES).filter(k=>set.has(k))};
  const applyExplode=()=>{
   const k=ex.k,on=k>.02;
   for(const c of group.children){const L=c.userData.layer;if(!L)continue;c.position.y=c.userData.baseY+(OFF[L]||0)*k;
    const groupKey=L.replace('surface','mask');c.visible=!ex.hidden.has(groupKey)&&(!c.userData.explodeOnly||on)&&!(c.userData.gerberLayer&&!on)&&!(L.startsWith('surface')&&on&&ex.gerber)}
   coreMats.forEach((m,i)=>m.color.copy(coreColors[i]).lerp(laminate,Math.min(1,k*1.4)));
   const right=(board.width*scale)/2+1.9,list=present();for(const key of list){const sp=labelFor(key);sp.visible=on&&!ex.hidden.has(key);sp.position.set(right,(OFF[key]||0)*k+.05,0);sp.material.opacity=Math.min(1,k*1.2)}
   for(const [key,sp] of labelSprites)if(!list.includes(key))sp.visible=false;invalidate()};
  const setExplode=(on,{instant=false}={})=>{const want=on?1:0,changed=ex.target!==want;ex.target=want;
   if(instant||reduce){ex.k=want;applyExplode();if(!instant&&changed){camera.position.copy(far(on?[12,6.2,14]:CAMERAS.overview));controls.target.set(0,0,0);invalidate()}return}if(!changed)return;desired=far(on?[12,6.2,14]:CAMERAS.overview);controls.target.set(0,0,0)};
  const setHidden=keys=>{ex.hidden=new Set(keys);applyExplode()};
  const addGerberLayers=images=>{
   for(const [key,src] of Object.entries(images)){if(!src||!LAYER_NAMES[key])continue;const side=key.endsWith('top')?1:-1,kind=key.split('-')[0];
    const tex=texFrom(src,invalidate);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;tex.repeat.set(1/(board.width*scale),1/(board.height*scale));tex.offset.set(.5,.5);
    const m=new THREE.MeshStandardMaterial({map:tex,transparent:true,alphaTest:.04,roughness:kind==='copper'?.35:.55,metalness:kind==='copper'?.6:.05,side:THREE.DoubleSide,opacity:kind==='mask'?.9:1});m.color.setScalar(kind==='silk'?.95:.85);
    const plane=new THREE.Mesh(new THREE.ShapeGeometry(boardShape,16).rotateX(-Math.PI/2),m);plane.position.y=side*(THICK/2+.003+(kind==='silk'?.002:kind==='mask'?.001:0));
    plane.userData={layer:key,gerberLayer:true,baseY:plane.position.y};plane.visible=false;group.add(plane)}
   ex.gerber=true;applyExplode();return present()};
  setLayerList(present());
  const goTo=pos=>{controls.target.set(0,0,0);if(reduce){camera.position.copy(far(pos));invalidate()}else desired=far(pos)};
  sceneRef.current={fresh:true,camera,controls,clickable,group,setExplode,setHidden,addGerberLayers,restyleAll,invalidate,goTo,zoom:f=>{camera.position.multiplyScalar(f);invalidate()},layersFor:null};
  // Draws only when something moved: a still board costs nothing on a tablet.
  let frame;const animate=()=>{frame=requestAnimationFrame(animate);
   if(Math.abs(ex.k-ex.target)>.002){ex.k+=(ex.target-ex.k)*.12;if(Math.abs(ex.k-ex.target)<.003)ex.k=ex.target;applyExplode()}
   if(desired){camera.position.lerp(desired,.14);dirty=true;if(camera.position.distanceTo(desired)<.02)desired=null}
   if(controls.update())dirty=true;if(dirty){dirty=false;renderer.render(scene,camera)}};animate();
  return()=>{viewMemory.set(board.id,{pos:camera.position.clone()});cancelAnimationFrame(frame);if(raf)cancelAnimationFrame(raf);ro.disconnect();controls.dispose();dom.removeEventListener('pointermove',track);dom.removeEventListener('pointerdown',down);dom.removeEventListener('pointerup',up);dom.removeEventListener('pointermove',move);dom.removeEventListener('pointerleave',clearHover);dom.removeEventListener('pointercancel',clearHover);scene.traverse(o=>{o.geometry?.dispose();if(o.isSprite)o.material.map?.dispose();if(o.material){for(const m of [].concat(o.material)){if(m.map&&(!m.map.isCanvasTexture||m.map.userData.own))m.map.dispose();m.dispose()}}});renderer.dispose();dom.remove();sceneRef.current=null};
 },[mode,board,geomKey,scale]);
 // New part data with unchanged geometry: update the meshes in place, then restyle.
 useEffect(()=>{const sc=sceneRef.current;if(!sc?.clickable)return;const byRef=new Map(parts.map(p=>[p.ref,p]));for(const m of sc.clickable){const p=byRef.get(m.userData.part?.ref);if(p)m.userData.part=p}},[parts]);
 const styleKey=[selected,(related||[]).join(','),JSON.stringify(tint||{}),(focus||[]).join(',')].join('|');
 useEffect(()=>{sceneRef.current?.restyleAll?.()},[styleKey,mode,geomKey]);
 useEffect(()=>{const sc=sceneRef.current;if(sc){sc.group.rotation.x=flipped?Math.PI:0;sc.invalidate()}},[flipped,mode,geomKey]);
 useEffect(()=>{setExploded(false);setHiddenLayers([])},[board.id]);
 useEffect(()=>{const sc=sceneRef.current;if(!sc?.setExplode)return;if(exploded&&flipped)setFlipped(false);sc.setExplode(exploded,{instant:sc.fresh});sc.fresh=false;sc.setHidden(hiddenLayers)},[exploded,mode,board,geomKey]);
 useEffect(()=>{sceneRef.current?.setHidden?.(hiddenLayers)},[hiddenLayers]);
 useEffect(()=>{
  // Gerber boards: the app's own layer pictures, added the first time the layers are split.
  const sc=sceneRef.current;if(!exploded||!board.layerImages||mode==='2D'||!sc||sc.group.userData.layersAdded)return;
  sc.group.userData.layersAdded=true;try{const images=board.layerImages();if(images&&Object.keys(images).length)setLayerList(sc.addGerberLayers(images))}catch{}
 },[exploded,board,mode,geomKey]);
 const goTo=name=>{setView(name);sceneRef.current?.goTo(CAMERAS[name])};
 const reset=()=>{setFlipped(false);setExploded(false);goTo('overview')};
 // 2D drawing (millimetres, Y down).
 const look={...LOOK,...board.look};
 const svg=useMemo(()=>{
  if(mode!=='2D'&&!failed)return null;
  const m=Math.max(board.width,board.height)*.06;const viewBox=`${-board.width/2-m} ${-board.height/2-m} ${board.width+2*m} ${board.height+2*m}`;
  const ring=pts=>'M'+pts.map(([x,y])=>`${x} ${y}`).join('L')+'Z';
  const outline=board.outline?ring(board.outline)+(board.holes||[]).map(ring).join(''):`M${-board.width/2} ${-board.height/2}h${board.width}v${board.height}h${-board.width}Z`;
  const realTraces=(board.traces?.top?.length||0)+(board.traces?.bottom?.length||0)>0;
  const routing=board.surface?null:realTraces?{top:board.traces.top||[],bottom:board.traces.bottom||[],vias:[]}:synthTraces(parts.filter(p=>!p.dnp),board);
  const traces={top:'',bottom:''};if(routing)for(const side of ['top','bottom'])traces[side]=(routing[side]||[]).map(([a,b,c,d])=>`M${a} ${b}L${c} ${d}`).join('');
  const vias=routing?.vias||[];
  const pads={top:'',bottom:'',tht:''};let count=0;
  for(const p of parts){if(board.surface)break;const a=p.rot*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a);for(const pad of partPads(p)){if(count++>LIMITS.pads)break;const bx=p.x+pad.x*cos+pad.y*sin,by=p.y-pad.x*sin+pad.y*cos;const rot=-((pad.rot||0)+p.rot);const w=pad.w,h=pad.h;const r=pad.shape==='circle'||pad.shape==='oval';
   pads[pad.hole>0?'tht':p.side==='bottom'?'bottom':'top']+=r?`M${bx-w/2} ${by}a${w/2} ${h/2} 0 1 0 ${w} 0a${w/2} ${h/2} 0 1 0 ${-w} 0`:rot%180===0?`M${bx-w/2} ${by-h/2}h${w}v${h}h${-w}Z`:rot%180===90||rot%180===-90?`M${bx-h/2} ${by-w/2}h${h}v${w}h${-h}Z`:(()=>{const c=Math.cos(rot*Math.PI/180),s2=Math.sin(rot*Math.PI/180);const pt=(x,y)=>`${bx+x*c-y*s2} ${by+x*s2+y*c}`;return `M${pt(-w/2,-h/2)}L${pt(w/2,-h/2)}L${pt(w/2,h/2)}L${pt(-w/2,h/2)}Z`})()}}
  const fs=Math.max(board.width,board.height)/58,sw=Math.max(board.width,board.height)/900;
  let surfaceUrl=null;const src=board.surface?.top;if(src)surfaceUrl=isCanvas(src)?src.toDataURL('image/jpeg',.9):src;
  return {viewBox,outline,traces,vias,pads,fs,sw,surfaceUrl};
 },[board,parts,mode,failed]);
 const st=style.current;
 const show2D=mode==='2D'||failed;
 const clipId='cf-clip-'+String(board.id||'b').replace(/[^\w-]/g,'');
 return <div ref={wrap} className={'relative h-full w-full overflow-hidden '+(ownFull?'bg-background':'')}>
  {show2D&&svg?<svg className="block h-full w-full px-14 pt-14 pb-6 max-sm:px-3" viewBox={svg.viewBox} role="img" aria-label={`2D layout of ${board.name}`} onPointerLeave={()=>setHovered(null)} onClick={e=>{if(e.target===e.currentTarget)cb.current.onSelect?.(null)}}>
   {svg.surfaceUrl?<><defs><clipPath id={clipId}><path d={svg.outline} clipRule="evenodd"/></clipPath></defs><image href={svg.surfaceUrl} x={-board.width/2} y={-board.height/2} width={board.width} height={board.height} preserveAspectRatio="none" clipPath={`url(#${clipId})`}/><path d={svg.outline} fill="none" stroke={look.edge} strokeWidth={svg.sw*2} fillRule="evenodd"/></>:<path d={svg.outline} fill={look.mask} stroke={look.edge} strokeWidth={svg.sw*2} fillRule="evenodd"/>}
   {svg.traces.bottom&&<path d={svg.traces.bottom} fill="none" stroke={look.traceBottom} strokeWidth={svg.sw*2.5} strokeOpacity=".5"/>}
   {svg.traces.top&&<path d={svg.traces.top} fill="none" stroke={look.trace} strokeWidth={svg.sw*2.5}/>}
   {svg.vias.map(([x,y],i)=><circle key={i} cx={x} cy={y} r=".42" fill={look.pad} stroke="#07090a" strokeWidth=".18"/>)}
   {svg.pads.bottom&&<path d={svg.pads.bottom} fill={look.pad} fillOpacity=".45"/>}
   {svg.pads.top&&<path d={svg.pads.top} fill={look.pad}/>}
   {parts.map(p=>{const bottomSide=p.side==='bottom';const active=st.selected===p.ref,line=st.related.has(p.ref),inFocus=st.focus?.has(p.ref),dim=!!st.focus&&!inFocus&&!active;const fill=st.tint[p.ref]||hex(TYPE_COLORS[p.type]||TYPE_COLORS.other);const showLabel=parts.length<=70||Math.max(p.w,p.d)>=svg.fs*1.6;
    const stroke=active||inFocus?'#f7c61b':line?'#9a6fd0':'#c7c8b2',width=active?svg.sw*5:inFocus||line?svg.sw*3.5:svg.sw*1.5;
    return <g key={p.ref} className="cursor-pointer outline-none [&:focus-visible>g]:brightness-150 [&:hover>g]:brightness-125" style={bottomSide?{opacity:.55}:undefined} transform={`translate(${p.x} ${p.y})`} tabIndex={0} role="button" aria-label={`${p.ref} ${displayName(p)}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();cb.current.onSelect?.(p)}}} onClick={()=>{setHovered(null);cb.current.onSelect?.(p)}} onPointerEnter={e=>{setHovered(p);moveTip(e.clientX,e.clientY)}} onPointerMove={e=>moveTip(e.clientX,e.clientY)} onPointerLeave={()=>setHovered(null)}>
     <g transform={`rotate(${-p.rot})`} style={dim?{filter:'brightness(.5)'}:undefined}>{p.dnp?<rect x={-p.w/2} y={-p.d/2} width={p.w} height={p.d} fill="transparent" stroke={active?'#f7c61b':look.silk} strokeWidth={active?svg.sw*4:svg.sw*2} strokeDasharray={`${svg.sw*5} ${svg.sw*4}`}/>:p.shape==='cyl'?<circle r={p.w/2} fill={fill} stroke={stroke} strokeWidth={width}/>:<rect x={-p.w/2} y={-p.d/2} width={p.w} height={p.d} rx={Math.min(p.w,p.d)*.08} fill={fill} fillOpacity={board.surface?.6:1} stroke={stroke} strokeWidth={width} strokeDasharray={bottomSide?`${svg.sw*4} ${svg.sw*3}`:undefined}/>}
      {!p.dnp&&p.type==='diode'&&<rect x={-p.w*.42} y={-p.d/2} width={p.w*.12} height={p.d} fill="#d9dedb"/>}
      {!p.dnp&&(p.type==='chip'||p.type==='module')&&p.w>2&&<circle cx={-p.w/2+p.w*.15} cy={-p.d/2+p.d*.15} r={Math.min(p.w,p.d)*.06} fill="#9aa3a1"/>}
      {!p.dnp&&p.type==='led'&&<circle r={Math.min(p.w,p.d)*.3} fill="#f4fbf6"/>}</g>
     {showLabel&&<text y={(p.rot%180===0?p.d/2:p.rot%180===90?p.w/2:Math.hypot(p.w,p.d)/2)+svg.fs*.95} textAnchor="middle" fontSize={svg.fs} fill={look.silk} style={{fontFamily:'inherit'}}>{p.ref}</text>}
    </g>})}
   {svg.pads.tht&&<path d={svg.pads.tht} fill={look.pad} stroke="#1c1f1e" strokeWidth={svg.sw*2} pointerEvents="none"/>}
  </svg>:<div ref={host} className="h-full w-full touch-none" aria-label="3D board. Drag to turn, click a part to select it."/>}
  <div ref={tip} className={'pointer-events-none absolute top-0 left-0 z-10 transition-opacity duration-100 motion-reduce:transition-none [@media(hover:none)]:hidden '+(hover?'opacity-100':'opacity-0')} role="status" aria-live="polite">
   {hover?(renderTip?renderTip(hover):<div className="rounded-lg border bg-card px-2.5 py-1.5 text-xs"><b>{hover.ref}</b> · {displayName(hover)}</div>):null}
  </div>
  <div role="toolbar" aria-label="View tools" aria-orientation="vertical" className="absolute top-1/2 right-3 z-10 flex -translate-y-1/2 flex-col gap-0.5 rounded-lg border bg-card/95 p-1 backdrop-blur">
   <button type="button" className={toolBtn(full)} aria-label={full?'Leave full screen':'Full screen'} title={full?'Leave full screen':'Full screen'} aria-pressed={full} onClick={toggleFull}>{full?<Minimize className="size-4" aria-hidden/>:<Maximize className="size-4" aria-hidden/>}</button>
   {!show2D&&<>
    <button type="button" className={toolBtn(false)} aria-label="Zoom in" title="Zoom in" onClick={()=>sceneRef.current?.zoom(.85)}><ZoomIn className="size-4" aria-hidden/></button>
    <button type="button" className={toolBtn(false)} aria-label="Zoom out" title="Zoom out" onClick={()=>sceneRef.current?.zoom(1.15)}><ZoomOut className="size-4" aria-hidden/></button>
    <button type="button" className={toolBtn(false)} aria-label="Reset view" title="Reset view" onClick={reset}><RotateCcw className="size-4" aria-hidden/></button>
    <button type="button" className={toolBtn(exploded)} aria-label={exploded?'Join the layers':'Split the layers'} title={exploded?'Join the layers':'Split the layers'} aria-pressed={exploded} onClick={()=>setExploded(v=>!v)}><Layers3 className="size-4" aria-hidden/></button>
    <button type="button" className={toolBtn(flipped)} aria-label={flipped?'Show top side':'Show bottom side'} title={flipped?'Show top side':'Show bottom side'} aria-pressed={flipped} onClick={()=>{setExploded(false);setFlipped(!flipped)}}><FlipVertical2 className="size-4" aria-hidden/></button>
   </>}
  </div>
  {exploded&&!show2D&&<div role="group" aria-label="Board layers" className="absolute top-16 left-3 z-10 flex max-h-[calc(100%-8rem)] max-w-56 flex-col gap-px overflow-auto rounded-lg border bg-card/95 p-1.5 text-xs backdrop-blur max-sm:top-auto max-sm:right-16 max-sm:bottom-14 max-sm:max-h-[40%] max-sm:max-w-none max-sm:flex-row max-sm:flex-wrap">
   {layerList.map(key=>{const off=hiddenLayers.includes(key);return <button key={key} type="button" aria-pressed={!off} onClick={()=>setHiddenLayers(h=>off?h.filter(x=>x!==key):[...h,key])} className={'flex min-h-8 items-center gap-2 rounded-md px-2 text-left max-sm:min-h-7 max-sm:gap-1.5 max-sm:px-1.5 max-sm:text-[11px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring '+(off?'text-muted-foreground':'text-foreground')}>{off?<EyeOff className="size-3.5 shrink-0" aria-hidden/>:<Eye className="size-3.5 shrink-0" aria-hidden/>}{LAYER_NAMES[key]||key}</button>})}
   <div className="flex flex-wrap gap-1 px-1 pt-1">
    <button type="button" className="h-7 rounded-md border px-2 text-muted-foreground hover:text-foreground" onClick={()=>setHiddenLayers(layerList.filter(k=>!/^copper|^core/.test(k)))}>Copper</button>
    <button type="button" className="h-7 rounded-md border px-2 text-muted-foreground hover:text-foreground" onClick={()=>setHiddenLayers(layerList.filter(k=>!/^parts/.test(k)&&k!=='core'))}>Parts</button>
    <button type="button" className="h-7 rounded-md border px-2 text-muted-foreground hover:text-foreground" onClick={()=>setHiddenLayers([])}>All</button>
   </div>
  </div>}
  <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-end justify-between gap-2">
   <p className="hidden min-w-0 truncate pb-2 text-xs text-muted-foreground sm:block">{show2D?'Click a part':'Drag to turn · click a part'}</p>
   {!show2D&&<div role="radiogroup" aria-label="Camera" className="pointer-events-auto ml-auto inline-flex shrink-0 rounded-md border bg-card/95 p-0.5 backdrop-blur">
    {['overview','top','side'].map(v=><button key={v} type="button" role="radio" aria-checked={view===v&&!flipped} className={segBtn(view===v&&!flipped&&!exploded)} onClick={()=>{setExploded(false);setFlipped(false);goTo(v)}}>{VIEW_LABEL[v]}</button>)}
   </div>}
  </div>
 </div>
}
