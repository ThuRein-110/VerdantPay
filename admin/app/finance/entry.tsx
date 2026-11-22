'use client';

import {useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {submitFinance} from './actions';
import {calculate,costInput,thb,type CostInput} from './model';
import type {Field,Form} from './forms';

function Input({field,value,change,prefix='',large=false}:{field:Field;value?:string;change?:(value:string)=>void;prefix?:string;large?:boolean}) {
 const name=prefix+field.key;
 const props={name,required:!field.optional,value:change?(value??field.value??''):undefined,defaultValue:change?undefined:(value??field.value??''),onChange:change?(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>change(e.target.value):undefined};
 return <label className={large?'finance-amount finance-wide':field.type==='memo'?'finance-wide':undefined}>{field.label}
  {field.type==='select'?<select {...props}><option value="">—</option>{field.list?.map(choice=><option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>
   :field.type==='memo'?<textarea {...props} maxLength={1000} rows={2}/>
   :<input {...props} type={field.type??'text'} inputMode={field.type==='number'?(field.step==='1'?'numeric':'decimal'):undefined} maxLength={field.type?undefined:160} step={field.step} min={field.min} max={field.max} placeholder={large?'0.00':undefined}/>}
 </label>;
}

const blank:CostInput={printer:'Creality K2',material:'PETG',color:'White',grams:'0',ratePerGram:'0',hours:'0',watts:'0',
 electricityRate:'0',laborHours:'0',laborRate:'0',wear:'0',packaging:'0',delivery:'0',failed:'0',margin:'30',selling:'0'};
const costFields: [keyof CostInput,string,string,string?][]=[
 ['printer','Printer model','รุ่นเครื่องพิมพ์'],['material','Material','วัสดุ'],['color','Color','สี'],
 ['grams','Filament (g)','เส้นพิมพ์ (กรัม)','0.001'],['ratePerGram','THB per gram','บาทต่อกรัม','0.001'],
 ['hours','Print time (h)','เวลาพิมพ์ (ชม.)','0.001'],['watts','Average power (W)','กำลังไฟเฉลี่ย (วัตต์)','0.001'],
 ['electricityRate','Electricity (THB/kWh)','ค่าไฟ (บาท/หน่วย)','0.001'],['margin','Target margin (%)','อัตรากำไรเป้าหมาย (%)','0.01'],
 ['selling','Selling price (THB)','ราคาขาย (บาท)','0.01'],['laborHours','Labor hours','ชั่วโมงแรงงาน','0.001'],
 ['laborRate','Labor (THB/h)','ค่าแรง (บาท/ชม.)','0.01'],['wear','Machine allowance (THB)','ค่าเผื่อเครื่อง (บาท)','0.01'],
 ['packaging','Packaging (THB)','ค่าบรรจุ (บาท)','0.01'],['delivery','Delivery (THB)','ค่าจัดส่ง (บาท)','0.01'],
 ['failed','Failed print allowance (THB)','ค่าเผื่องานเสีย (บาท)','0.01'],
];
const costRows=[['filament','Filament','เส้นพิมพ์'],['electricity','Electricity','ค่าไฟ'],['labor','Labor','ค่าแรง'],
 ['wear','Machine allowance','ค่าเผื่อเครื่อง'],['packaging','Packaging','ค่าบรรจุ'],['delivery','Delivery','ค่าจัดส่ง'],
 ['total','Production cost','ต้นทุนผลิต'],['recommended','Recommended price','ราคาแนะนำ'],
 ['expected','Expected profit','กำไรที่คาด'],['actual','Profit at entered price','กำไรตามราคาที่ระบุ']] as const;
function Costs({thai,mode,initial}:{thai:boolean;mode?:Form['cost'];initial?:Partial<CostInput>}) {
 const [values,setValues]=useState({...blank,...initial});
 const [detailed,setDetailed]=useState(mode==='actual');
 const safe=costInput.safeParse(mode==='actual'?{...values,grams:'0',ratePerGram:'0',margin:'0',failed:'0'}:values);
 const result=safe.success?calculate(safe.data):null;
 const l=(a:string,b:string)=>thai?b:a;
 return <div className="finance-cost finance-wide">
   <div className="finance-cost-head"><h3>{mode==='actual'?l('Actual job inputs','ข้อมูลจริงของงาน'):l('Cost inputs','ข้อมูลต้นทุน')}</h3>
    <button type="button" className="finance-button transparent" aria-expanded={detailed} onClick={()=>setDetailed(!detailed)}>{detailed?l('Quick mode','โหมดด่วน'):l('Detailed mode','โหมดละเอียด')}</button></div>
   <p className="finance-muted">{mode==='actual'?l('Stock movements determine actual filament cost. Record other actual costs below.','ต้นทุนเส้นพิมพ์จริงมาจากการเคลื่อนไหวคลัง บันทึกต้นทุนอื่นด้านล่าง'):
    l('Enter measured power or your own estimate. A zero assumes no cost for that input.','ระบุกำลังไฟที่วัดได้หรือค่าประมาณของคุณ ค่า 0 หมายถึงไม่คิดต้นทุนส่วนนั้น')}</p>
   <div className="finance-fields">
    {costFields.map(([key,en,th,step],index)=>{
     const fixed=mode==='actual'&&['grams','ratePerGram','margin','failed'].includes(key);
     if(fixed||(index>=10&&!detailed))return <input key={key} type="hidden" name={'cost.'+key} value={fixed?'0':values[key]}/>;
     return <Input key={key} prefix="cost." field={{key,label:l(en,th),type:step?'number':undefined,step,min:step?'0':undefined,max:key==='margin'?'99.99':undefined}} value={values[key]} change={value=>setValues(old=>({...old,[key]:value}))}/>;
    })}
   </div>
   {result&&<dl className="finance-cost-results" aria-live="polite">{costRows.filter(([key])=>mode!=='actual'||['electricity','labor','wear','packaging','delivery','total'].includes(key)).map(([key,en,th])=>
    <div key={key}><dt>{key==='total'&&mode==='actual'?l('Nonfilament cost','ต้นทุนอื่นนอกเหนือจากเส้นพิมพ์'):l(en,th)}</dt><dd>{thb(result[key],thai?'th':'en')}</dd></div>)}</dl>}
  </div>;
}

export function QuickCalculator({thai}:{thai:boolean}) {return <div className="finance-panel"><Costs thai={thai}/></div>;}

export function Entry({form,thai,target,initial,defaults,summary=true,quick=false,onSaved}:{form:Form;thai:boolean;target?:string;initial?:Record<string,string>;defaults?:Partial<CostInput>;summary?:boolean;quick?:boolean;onSaved?:()=>void}) {
 const [pending,start]=useTransition();
 const [message,setMessage]=useState<{text:string;error:boolean}|null>(null);
 const sequence=useRef(form.repeat?.initial?.length??form.repeat?.minimum??0);
 const requestKey=useRef<string|null>(null);
 const [repeats,setRepeats]=useState<{id:number;values:Record<string,string>}[]>(()=>(form.repeat?.initial??Array.from({length:form.repeat?.minimum??0},()=>({}))).map((values,id)=>({id,values})));
 const router=useRouter();
 const l=(a:string,b:string)=>thai?b:a;
 const extras=quick?form.fields.filter(field=>field.key==='eligible'||(field.optional&&field.key!=='account'&&!(form.action==='payment'&&field.key==='notes'))):[];
 const fields=quick?[...form.fields.filter(field=>field.key==='amount'),...form.fields.filter(field=>field.key!=='amount'&&!extras.includes(field))]:form.fields;
 const formContent=<form className="finance-form" onSubmit={event=>{
  event.preventDefault();
  if(pending) return;
  if(form.confirm&&!window.confirm(form.confirm)) return;
  const data=new FormData(event.currentTarget);
  const payload:Record<string,unknown>={...(target?{target}:{})};
  const read=(key:string)=>String(data.get(key)??'').trim()||undefined;
  for(const field of form.fields) payload[field.key]=read(field.key);
  if(form.repeat) {
   const repeat=form.repeat;
   payload[repeat.key]=repeats.map(({id})=>Object.fromEntries(repeat.fields.map(field=>[field.key,read(id+'.'+field.key)])));
  }
  if(form.cost) payload[form.cost]=Object.fromEntries(costFields.map(([key])=>[key,read('cost.'+key)]));
  requestKey.current??=crypto.randomUUID();
  const key=requestKey.current;
  const element=event.currentTarget;
  setMessage(null);
  start(async()=>{
   try {
    const result=await submitFinance(form.action,key,payload);
    if(result.error){setMessage({text:result.error,error:true});return;}
    requestKey.current=null;
    element.reset();
    if(form.repeat) setRepeats(Array.from({length:form.repeat.minimum??0},()=>({id:sequence.current++,values:{}})));
    setMessage({text:l('Saved','บันทึกแล้ว'),error:false});
    onSaved?.();
    router.refresh();
   } catch {setMessage({text:l('Connection interrupted. Retry with the same values.','การเชื่อมต่อขัดข้อง ลองใหม่ด้วยค่าเดิม'),error:true});}
  });
 }}>
  <div className="finance-fields">{fields.map(field=>
   <Input key={field.key} field={quick&&form.action==='payment'&&field.key==='notes'?{...field,label:l('Description / notes','รายละเอียด / หมายเหตุ')}:field}
    value={initial?.[field.key]} large={quick&&field.key==='amount'}/>)}</div>
  {extras.length>0&&<details className="finance-quick-extras"><summary>{l('More details','รายละเอียดเพิ่มเติม')}</summary>
   <div className="finance-fields">{extras.map(field=><Input key={field.key} field={field} value={initial?.[field.key]}/>)}</div>
  </details>}
  {form.cost&&<Costs thai={thai} mode={form.cost} initial={defaults}/>}
  {form.repeat&&<div className="finance-repeat">
   {repeats.map(({id,values},index)=><fieldset key={id}><legend>{l('Line','รายการ')} {index+1}</legend><div className="finance-fields">{form.repeat?.fields.map(field=>
    <Input key={field.key} prefix={id+'.'} field={field} value={values[field.key]} change={field.key==='category'||field.key==='unit'?(value)=>setRepeats(rows=>rows.map(row=>{
     if(row.id!==id)return row;
     const price=field.key==='category'?field.list?.find(option=>option.value===value)?.price:undefined;
     return {...row,values:{...row.values,[field.key]:value,...(price!==undefined?{unit:price}:{})}};
    })):undefined}/>)}</div>
    {repeats.length>(form.repeat?.minimum??0)&&<button type="button" className="finance-button transparent" onClick={()=>setRepeats(rows=>rows.filter(row=>row.id!==id))}>{l('Remove line','ลบรายการ')}</button>}
   </fieldset>)}
   {repeats.length<form.repeat.maximum&&<button type="button" className="finance-button transparent" onClick={()=>{const id=sequence.current++;setRepeats(rows=>[...rows,{id,values:{}}]);}}>{l('Add line','เพิ่มรายการ')}</button>}
  </div>}
  <div className="finance-submit"><button className="finance-button primary" disabled={pending}>{pending?l('Saving…','กำลังบันทึก…'):l('Save','บันทึก')}</button>
   {message&&<span role={message.error?'alert':'status'} className={message.error?'finance-error':undefined}>{message.text}</span>}</div>
 </form>;
 return summary?<details className="finance-entry"><summary>{form.title}</summary>{formContent}</details>:formContent;
}
