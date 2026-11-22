'use client';

import {useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {saveGoal} from './goal-actions';
import {baht} from './model';
import type {Row} from './data';

export function GoalForm({thai,goal}:{thai:boolean;goal?:Row}) {
 const router=useRouter();
 const nextId=useRef<string|null>(null);
 const [result,setResult]=useState<string|null>(null);
 const [pending,start]=useTransition();
 const l=(en:string,th:string)=>thai?th:en;
 const feedback:Record<string,string>={
  auth:l('Sign in again to save changes.','กรุณาเข้าสู่ระบบใหม่เพื่อบันทึก'),
  invalid:l('Enter a name, a positive target and a valid saved amount.','ระบุชื่อ เป้าหมายที่มากกว่าศูนย์ และยอดสะสมที่ถูกต้อง'),
  conflict:l('This goal changed. Refresh before editing it again.','เป้าหมายมีการเปลี่ยนแปลง กรุณารีเฟรชก่อนแก้ไข'),
  error:l('Could not save the goal. Please try again.','บันทึกเป้าหมายไม่ได้ กรุณาลองอีกครั้ง'),
  saved:l('Goal saved','บันทึกเป้าหมายแล้ว'),
 };
 return <details className="finance-entry finance-goal-form">
  <summary>{goal?l('Edit goal','แก้ไขเป้าหมาย'):l('Add goal','เพิ่มเป้าหมาย')}</summary>
  <form className="finance-form" onSubmit={event=>{
   event.preventDefault();
   if(pending)return;
   const element=event.currentTarget;
   const form=new FormData(element);
   if(!goal)nextId.current??=crypto.randomUUID();
   form.set('id',String(goal?.id??nextId.current));
   form.set('version',String(goal?.version??0));
   setResult(null);
   start(async()=>{
    try {
     const response=await saveGoal(form);
     setResult(response);
     if(response==='saved'){
      nextId.current=null;
      if(!goal)element.reset();
      router.refresh();
     }
    } catch {setResult('error');}
   });
  }}>
   <div className="finance-fields">
    <label className="finance-wide">{l('Goal name','ชื่อเป้าหมาย')}<input name="title" required maxLength={100} defaultValue={String(goal?.title??'')}/></label>
    <label>{l('Target (THB)','เป้าหมาย (บาท)')}<input name="target" required type="number" inputMode="decimal" min=".01" max="999999999.99" step=".01" defaultValue={baht(goal?.target_satang)}/></label>
    <label>{l('Saved (THB)','ยอดสะสม (บาท)')}<input name="saved" required type="number" inputMode="decimal" min="0" max="999999999.99" step=".01" defaultValue={goal?baht(goal.saved_satang):'0'}/></label>
    <label>{l('Target date (optional)','วันที่เป้าหมาย (ไม่บังคับ)')}<input name="deadline" type="date" min="2000-01-01" max="2199-12-31" defaultValue={String(goal?.deadline??'')}/></label>
   </div>
   <div className="finance-submit"><button disabled={pending} className="finance-button primary">{pending?l('Saving…','กำลังบันทึก…'):l('Save goal','บันทึกเป้าหมาย')}</button>
    {result&&<span role={result==='saved'?'status':'alert'} className={result==='saved'?undefined:'finance-error'}>{feedback[result]}</span>}</div>
  </form>
 </details>;
}
