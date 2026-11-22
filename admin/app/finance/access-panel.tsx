'use client';

import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {updateMembership} from './access-actions';

export type MembershipList={
 memberships:{user_id:string;email:string;display_name:string|null;role:string;member_id:string|null}[];
 teams:{id:string;name:string}[];count:number;
};

function MembershipForm({item,teams,thai}:{item:MembershipList['memberships'][number];teams:MembershipList['teams'];thai:boolean}) {
 const l=(en:string,th:string)=>thai?th:en;
 const [role,setRole]=useState(['admin','team','revoked'].includes(item.role)?item.role:'');
 const [status,setStatus]=useState('');
 const [busy,start]=useTransition();
 const router=useRouter();
 return <form className="finance-form finance-access-item" onSubmit={event=>{
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  start(async()=>{
   try {
    const result=await updateMembership(form);
    setStatus(result);
    if(result==='saved')router.refresh();
   }catch{setStatus('error');}
  });
 }}>
  <strong>{item.display_name||item.email}</strong>
  {item.display_name&&<span className="finance-muted">{item.email}</span>}
  <input type="hidden" name="user" value={item.user_id}/>
  <div className="finance-fields">
   <label>{l('Access','สิทธิ์เข้าถึง')}<select name="role" required value={role} onChange={event=>setRole(event.target.value)}>
    <option value="" disabled>{l('Pending approval','รออนุมัติ')}</option>
    <option value="admin">{l('Finance admin','ผู้ดูแลการเงิน')}</option>
    <option value="team">{l('Team member','สมาชิกทีม')}</option>
    <option value="revoked">{l('Revoked','เพิกถอน')}</option>
   </select></label>
   {role==='team'?<label>{l('Linked profit-share member','สมาชิกที่ผูกส่วนแบ่ง')}<select name="member" required defaultValue={item.member_id??''}>
    <option value="">{l('Select a member','เลือกสมาชิก')}</option>
    {teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}
   </select></label>:<input name="member" type="hidden" value=""/>}
  </div>
  <div className="finance-submit"><button className="finance-button" disabled={busy}>{busy?l('Saving…','กำลังบันทึก…'):l('Save access','บันทึกสิทธิ์')}</button>
   {status&&<span role={status==='saved'?'status':'alert'}>{status==='saved'?l('Access saved.','บันทึกสิทธิ์แล้ว'):status==='conflict'?
    l('That profit-share member is already assigned.','สมาชิกนี้ถูกผูกกับบัญชีอื่นแล้ว'):l('Could not save access. Check the role and member.','บันทึกสิทธิ์ไม่ได้ ตรวจสอบบทบาทและสมาชิก')}</span>}</div>
 </form>;
}

export function MembershipPanel({data,thai,page}:{data:MembershipList;thai:boolean;page:number}) {
 const l=(en:string,th:string)=>thai?th:en;
 const base='/finance?section=settings&membersPage=';
 return <section className="finance-panel" id="memberships" aria-labelledby="membership-heading">
  <h2 id="membership-heading">{l('Account approvals','อนุมัติบัญชี')}</h2>
  <p className="finance-muted">{l('Finance admins can manage the ledger. Each team account sees only the profit-share member you link to it.','ผู้ดูแลการเงินจัดการบัญชีได้ สมาชิกทีมเห็นเฉพาะส่วนแบ่งของสมาชิกที่ผูกไว้')}</p>
  {data.memberships.length?data.memberships.map(item=><MembershipForm key={item.user_id+':'+item.role+':'+item.member_id} item={item} teams={data.teams} thai={thai}/>):
   <p className="finance-muted">{l('No requests or approved accounts to manage.','ไม่มีบัญชีที่ต้องจัดการ')}</p>}
  <nav className="finance-submit" aria-label={l('Approval pages','หน้าอนุมัติ')}>
   {page>1&&<Link className="finance-button" href={base+(page-1)+'#memberships'}>{l('Previous','ก่อนหน้า')}</Link>}
   {page*25<data.count&&<Link className="finance-button" href={base+(page+1)+'#memberships'}>{l('Next','ถัดไป')}</Link>}
  </nav>
 </section>;
}
