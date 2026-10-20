import { ENEMIES, MERCENARIES } from './Content.ts';
import { mercPosition } from './Run.ts';
import type { DefenseRun } from './Run.ts';
import { project, projectedCircle, unproject } from './Projection.ts';
import type { Viewport } from './Projection.ts';

export interface Aim { slot: number; x: number; y: number; valid: boolean }
export class Battlefield {
  private context: CanvasRenderingContext2D;
  private background = document.createElement('canvas');
  private view: Viewport = { width: 480, height: 600 };
  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D unavailable');
    this.context = context;
  }
  point(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const view = { width: 480, height: rect.height / rect.width * 480 };
    return unproject((clientX - rect.left) / rect.width * view.width, (clientY - rect.top) / rect.height * view.height, view);
  }
  private paintBackground() {
    const { width: w, height: h } = this.view;
    this.background.width = w; this.background.height = Math.ceil(h);
    const c = this.background.getContext('2d')!;
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#9b9c7d'); sky.addColorStop(.17, '#6c7864'); sky.addColorStop(.45, '#48533f'); sky.addColorStop(1, '#303b2c');
    c.fillStyle = sky; c.fillRect(0,0,w,h);
    c.fillStyle = '#e9d7a680'; c.beginPath(); c.arc(315,h*.035,24,0,Math.PI*2); c.fill();
    for(let i=0;i<17;i++) {
      const x=i*34-10, height=12+(i*23)%31;
      c.fillStyle=i%2?'#586a58':'#61705b';c.fillRect(x,h*.12-height,26,height);
      c.fillStyle='#d7cf9a30';c.fillRect(x+5,h*.12-height+4,4,5);
    }
    const farL=project(0,65,this.view), farR=project(0,390,this.view);
    const nearL=project(750,65,this.view), nearR=project(750,390,this.view);
    c.fillStyle='#76786155';c.beginPath();c.moveTo(farL.x,farL.y);c.lineTo(farR.x,farR.y);c.lineTo(nearR.x,h);c.lineTo(nearL.x,h);c.fill();
    c.strokeStyle='#d2c19a28';c.lineWidth=1;
    for(const lateral of [65,120,225,330,390]) {
      const far=project(0,lateral,this.view),near=project(760,lateral,this.view);
      c.setLineDash(lateral===225?[9,12]:[]);
      c.beginPath();c.moveTo(far.x,far.y);c.lineTo(near.x,near.y);c.stroke();
    }
    c.setLineDash([]);
    for(let depth=100;depth<750;depth+=100) {
      const a=project(depth,65,this.view),b=project(depth,390,this.view);
      c.strokeStyle='#d0c89a10';c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
    }
    // Deterministic debris grows towards the camera along the same projection.
    for(let i=0;i<95;i++) {
      const p=project((i*79)%760,65+(i*127)%325,this.view);
      c.fillStyle=i%3?'#28362580':'#a29d7250';c.fillRect(p.x,p.y,2*p.scale,p.scale);
    }
    for(const side of [45,410]) {
      for(let depth=60;depth<=720;depth+=95) {
        const p=project(depth,side,this.view);
        c.strokeStyle='#263d2ccc';c.lineWidth=2*p.scale;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x,p.y-17*p.scale);c.stroke();
        const next=project(Math.min(760,depth+95),side,this.view);
        c.strokeStyle='#bcc39745';c.lineWidth=.7;c.beginPath();c.moveTo(p.x,p.y-12*p.scale);c.lineTo(next.x,next.y-12*next.scale);c.stroke();
      }
    }
    const car=project(365,86,this.view);
    c.save();c.translate(car.x,car.y);c.scale(car.scale,car.scale);c.rotate(-.18);
    c.fillStyle='#3b4934';c.fillRect(-13,-28,26,50);c.fillStyle='#25372c';c.fillRect(-10,-15,20,15);c.fillStyle='#5b6748';c.fillRect(-10,4,20,12);c.restore();
    c.fillStyle='#142d1b40';c.fillRect(0,h*.77,w,h*.23);
    c.font='8px monospace';c.fillStyle='#d9cfaa70';c.fillText('WEST APPROACH / SECTOR 003',15,h-14);
    c.textAlign='right';c.fillText('HOLD THE LINE',w-15,h-14);c.textAlign='left';
    // Far haze is static; the foreground remains clear.
    const fog=c.createLinearGradient(0,0,0,h*.3);fog.addColorStop(0,'#bfc7a238');fog.addColorStop(1,'#bfc7a200');c.fillStyle=fog;c.fillRect(0,0,w,h*.3);
  }
  private area(x:number,y:number,radius:number,fill:string,stroke:string) {
    const c=this.context,points=projectedCircle(x,y,radius,this.view);
    c.fillStyle=fill;c.strokeStyle=stroke;c.beginPath();
    points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fill();c.stroke();
  }
  draw(run: DefenseRun, aim: Aim | undefined) {
    const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
    const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
    if(w<=0||h<=0)return;
    const logicalHeight=rect.height/rect.width*480;
    if(this.canvas.width!==w||this.canvas.height!==h||Math.abs(this.view.height-logicalHeight)>.01){
      this.canvas.width=w;this.canvas.height=h;this.view={width:480,height:logicalHeight};this.paintBackground();
    }
    const c=this.context;c.setTransform(w/480,0,0,w/480,0,0);c.drawImage(this.background,0,0);
    for(const zone of run.zones){
      this.area(zone.x,zone.y,zone.radius,'#f397452d','#de9d6477');
      for(let i=0;i<9;i++){const a=i*2.4,r=Math.sqrt(i/9)*zone.radius,p=project(zone.x+Math.cos(a)*r,zone.y+Math.sin(a)*r,this.view);this.flame(p.x,p.y,7*p.scale+Math.sin(run.elapsed*8+i)*2);}
    }
    for(const enemy of [...run.enemies].sort((a,b)=>a.x-b.x)){
      const def=ENEMIES[enemy.kind],p=project(enemy.x,enemy.y,this.view);
      const size=def.size*p.scale*.85,bob=Math.sin(run.elapsed*6+enemy.id)*1.3*p.scale;
      c.save();c.translate(p.x,p.y+bob);c.scale(size,size);
      c.fillStyle='#10241470';c.beginPath();c.ellipse(0,5,12,5,0,0,Math.PI*2);c.fill();
      c.fillStyle='#36432a';c.fillRect(-7,-4,5,13);c.fillRect(3,-3,5,13);
      c.fillStyle=enemy.hitFlash>0?'#fff3ce':def.color;
      c.fillRect(-9,-24,18,22);c.fillRect(-7,-37,14,14);c.fillRect(-14,-23,5,19);c.fillRect(9,-22,5,18);
      c.fillStyle='#2c3828';c.fillRect(-4,-32,3,2);c.fillRect(3,-32,3,2);c.fillRect(-2,-26,5,2);
      if(enemy.kind==='armored'){c.fillStyle='#627b78';c.fillRect(-9,-24,18,14);c.fillRect(-9,-40,18,8);}
      if(enemy.kind==='elite'){c.fillStyle='#e3b577';c.fillRect(-9,-42,18,4);}
      if(enemy.hp<enemy.maxHp){c.fillStyle='#1c2b1c';c.fillRect(-12,-48,24,3);c.fillStyle='#d7d69c';c.fillRect(-12,-48,24*Math.max(0,enemy.hp/enemy.maxHp),3);}
      let sx=-10;
      for(const [active,color]of[[enemy.burnDuration>0,'#ffac68'],[enemy.corrosionPower>0,'#cae786'],[enemy.shockPower>0,'#9be9ef']]as const){
        if(active){c.fillStyle=color;c.fillRect(sx,-54,5,4);sx+=8;}
      }
      c.restore();
    }
    const wall=project(750,225,this.view),left=project(750,65,this.view),right=project(750,390,this.view);
    c.fillStyle='#172c1d80';c.fillRect(left.x,wall.y+5,right.x-left.x,8);
    c.strokeStyle='#928768';c.lineWidth=4;c.beginPath();c.moveTo(left.x,wall.y);c.lineTo(right.x,wall.y);c.stroke();
    for(let x=left.x+5;x<right.x;x+=26){
      c.strokeStyle=run.wallHealth/run.wallMaxHealth<.3?'#d58b66':'#c7b38b';c.lineWidth=5;
      c.beginPath();c.moveTo(x-9,wall.y-10);c.lineTo(x+9,wall.y+10);c.moveTo(x+9,wall.y-10);c.lineTo(x-9,wall.y+10);c.stroke();
      c.strokeStyle='#504d35';c.lineWidth=1.3;c.stroke();
    }
    for(let i=0;i<3;i++){
      const merc=run.mercenaries[i],origin=mercPosition(i),p=project(origin.x,origin.y,this.view);
      c.strokeStyle='#dece9a38';c.setLineDash([3,4]);c.beginPath();c.ellipse(p.x,p.y+6,19,9,0,0,Math.PI*2);c.stroke();c.setLineDash([]);
      if(!merc){c.fillStyle='#dbcea166';c.font='16px monospace';c.textAlign='center';c.fillText('+',p.x,p.y+5);c.textAlign='left';continue;}
      const def=MERCENARIES[merc.kind];c.save();c.translate(p.x,p.y);c.scale(1.1,1.1);
      c.fillStyle='#223621';c.fillRect(-7,-4,5,13);c.fillRect(3,-4,5,13);
      c.fillStyle='#819470';c.fillRect(-10,-25,20,21);c.fillRect(-14,-24,5,14);c.fillRect(9,-24,5,14);
      c.fillStyle='#b8a480';c.fillRect(-6,-33,12,10);c.fillStyle=def.color;c.fillRect(-10,-37,20,12);
      c.fillStyle='#364d33';c.fillRect(-8,-24,16,13);c.fillStyle='#1c3020';c.fillRect(5,-46,4,27);c.fillStyle=def.color;c.fillRect(9,-25,4,6);c.restore();
      c.fillStyle='#e0d9be99';c.font='8px monospace';c.textAlign='center';c.fillText(def.callSign,p.x,p.y+24);c.textAlign='left';
    }
    for(const event of run.events){
      c.globalAlpha=Math.max(0,event.life/event.maxLife);c.strokeStyle=event.color;c.fillStyle=event.color;
      const end=project(event.x,event.y,this.view);
      if(event.kind==='shot'||event.kind==='flame'||event.kind==='laser'){
        const start=project(event.fromX??824,event.fromY??130,this.view);
        c.lineWidth=event.kind==='laser'?6:event.kind==='flame'?3:1.2;c.beginPath();c.moveTo(start.x+7,start.y-40);c.lineTo(end.x,end.y-12*end.scale);c.stroke();
        if(event.kind==='laser'){c.strokeStyle='#ebfff7';c.lineWidth=1.5;c.stroke();}
      }else if(event.kind==='blast'){
        const progress=1-event.life/event.maxLife;this.area(event.x,event.y,event.radius*(.3+progress*.7),'#efb46b30',event.color);
      }else{
        c.lineWidth=1.5;const progress=1-event.life/event.maxLife;
        c.beginPath();c.arc(end.x,end.y,12*end.scale*(.2+progress),0,Math.PI*2);c.stroke();
      }
      c.globalAlpha=1;
    }
    if(aim){
      const merc=run.mercenaries[aim.slot];if(!merc)return;
      const def=MERCENARIES[merc.kind],color=aim.valid?'#f5d392':'#ef8c75';c.lineWidth=1.5;c.setLineDash([5,4]);
      if(merc.kind==='tesla'){
        const origin=mercPosition(aim.slot),dx=aim.x-origin.x,dy=aim.y-origin.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,r=def.radius*run.skillRange;
        const points=[project(origin.x-uy*r,origin.y+ux*r,this.view),project(origin.x+uy*r,origin.y-ux*r,this.view),project(origin.x+ux*1100+uy*r,origin.y+uy*1100-ux*r,this.view),project(origin.x+ux*1100-uy*r,origin.y+uy*1100+ux*r,this.view)];
        c.strokeStyle=color;c.fillStyle=aim.valid?'#f5d39220':'#ef8c7520';c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fill();c.stroke();
      }else this.area(aim.x,aim.y,def.radius*run.skillRange,aim.valid?'#f5d39225':'#ef8c7525',color);
      c.setLineDash([]);const p=project(aim.x,aim.y,this.view);c.strokeStyle=color;c.beginPath();c.moveTo(p.x-8,p.y);c.lineTo(p.x+8,p.y);c.moveTo(p.x,p.y-8);c.lineTo(p.x,p.y+8);c.stroke();
    }
  }
  private flame(x:number,y:number,size:number){
    const c=this.context;c.fillStyle='#f3954eaa';c.beginPath();c.moveTo(x-size/2,y);c.quadraticCurveTo(x-size/2,y-size,x,y-size*1.8);c.quadraticCurveTo(x+size,y-size/2,x+size/2,y);c.fill();
  }
}
