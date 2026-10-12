import {useId} from 'react';
import type {Diagram} from '../lib/diagrams';
const colours={mint:'#56ac86',blue:'#599dd8',coral:'#e58076',amber:'#e7b948'};
function Shape({shape,x,y,colour}:{shape:string;x:number;y:number;colour:string}){
 const common={fill:colour,stroke:'#173e35',strokeWidth:2};
 if(shape==='circle')return <circle cx={x} cy={y} r={18} {...common}/>;
 if(shape==='square')return <rect x={x-18} y={y-18} width={36} height={36} rx={3} {...common}/>;
 if(shape==='triangle')return <polygon points={`${x},${y-20} ${x+21},${y+18} ${x-21},${y+18}`} {...common}/>;
 return <polygon points={Array.from({length:10},(_,i)=>{const angle=-Math.PI/2+i*Math.PI/5,r=i%2?9:21;return `${x+Math.cos(angle)*r},${y+Math.sin(angle)*r}`;}).join(' ')} {...common}/>;
}
function Label({text,x,y}:{text:string;x:number;y:number}){const split=text.length>24?text.lastIndexOf(' ',24):-1;return <text x={x} y={y} textAnchor="middle" fontSize={16} fill="#173e35">{split>0?<><tspan x={x}>{text.slice(0,split)}</tspan><tspan x={x} dy={20}>{text.slice(split+1)}</tspan></>:text}</text>;}
export default function QuestionDiagram({diagram}:{diagram?:Diagram}){
 const id=useId();if(!diagram)return null;
 if(diagram.type==='illustration'){const paint={none:'none',white:'#ffffff',mint:'#9ee5c1',purple:'#c4b5fd',amber:'#fde68a',coral:'#fdba74',blue:'#93c5fd',ink:'#233340'};return <figure className="question-visual ai-diagram educational-illustration"><strong>{diagram.title}</strong><svg viewBox="0 0 600 400" role="img" aria-labelledby={id+'-title '+id+'-desc'}><title id={id+'-title'}>{diagram.title}</title><desc id={id+'-desc'}>{diagram.description}</desc><rect width={600} height={400} fill="#fff"/>{diagram.elements.map((e,i)=>{const style={fill:paint[e.fill],stroke:paint[e.stroke],strokeWidth:2.5,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};if(e.kind==='path')return <path key={i} d={e.d} {...style}/>;if(e.kind==='ellipse')return <ellipse key={i} cx={e.x+e.width/2} cy={e.y+e.height/2} rx={e.width/2} ry={e.height/2} {...style}/>;if(e.kind==='rect')return <rect key={i} x={e.x} y={e.y} width={e.width} height={e.height} rx={6} {...style}/>;if(e.kind==='line')return <line key={i} x1={e.x} y1={e.y} x2={e.x+e.width} y2={e.y+e.height} {...style}/>;return <text key={i} x={e.x} y={e.y} fontSize={18} fontWeight={600} fill={e.fill==='none'?paint.ink:paint[e.fill]}>{e.text}</text>;})}</svg></figure>;}
 const d=diagram;const height=d.type==='flow'?40+d.items.length*90:d.type==='counting'?40+d.items.length*115:d.type==='bars'?50+d.items.length*65:d.type==='shapes'?70+Math.ceil(d.items.length/2)*120:210;
 return <figure className="question-visual ai-diagram"><strong>{d.title}</strong><svg viewBox={`0 0 600 ${height}`} role="img" aria-labelledby={id+'-title '+id+'-desc'}><title id={id+'-title'}>{d.title}</title><desc id={id+'-desc'}>{d.description}</desc><rect width={600} height={height} rx={16} fill="#f5faf4"/>
 {d.type==='counting'&&d.items.map((item,i)=><g key={i}><Label text={item.label} x={300} y={30+i*115}/>{Array.from({length:item.value},(_,n)=><Shape key={n} shape={item.shape} x={300-(item.value-1)*27+n*54} y={75+i*115} colour={colours[item.colour]}/>)}</g>)}
 {d.type==='shapes'&&d.items.map((item,i)=><g key={i}><Shape shape={item.shape} x={150+(i%2)*300} y={50+Math.floor(i/2)*120} colour={colours[item.colour]}/><Label text={item.label} x={150+(i%2)*300} y={100+Math.floor(i/2)*120}/></g>)}
 {d.type==='fractions'&&<g>{Array.from({length:d.total},(_,i)=><rect key={i} x={20+i*560/d.total} y={40} width={560/d.total} height={100} fill={i<d.items[0].value?colours[d.items[0].colour]:'#fff'} stroke="#173e35" strokeWidth={2}/>)}<Label text={d.items[0].label} x={300} y={175}/></g>}
 {d.type==='bars'&&d.items.map((item,i)=><g key={i}><text x={15} y={40+i*65} fontSize={15} fill="#173e35">{item.label}</text><rect x={15} y={50+i*65} width={Math.max(0,item.value/Math.max(...d.items.map(v=>v.value))*500)} height={24} rx={4} fill={colours[item.colour]}/><text x={540} y={68+i*65} fontSize={17} fill="#173e35">{item.value}</text></g>)}
 {d.type==='flow'&&d.items.map((item,i)=><g key={i}>{i>0&&<><line x1={300} x2={300} y1={i*90-10} y2={i*90+15} stroke="#173e35" strokeWidth={3}/><path d={`M292 ${i*90+7} L300 ${i*90+17} L308 ${i*90+7}`} fill="none" stroke="#173e35" strokeWidth={3}/></>}<rect x={30} y={20+i*90} width={540} height={55} rx={12} fill={colours[item.colour]} opacity={0.3} stroke="#173e35"/><Label text={item.label} x={300} y={49+i*90}/></g>)}
 </svg></figure>;
}
