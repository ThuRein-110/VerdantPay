export function recentFinanceAuthentication(amr:unknown,now=Math.floor(Date.now()/1000)) {
 return Array.isArray(amr)&&amr.some(entry=>entry&&typeof entry==='object'&&
  ['password','totp'].includes(entry.method)&&typeof entry.timestamp==='number'&&
  entry.timestamp>=now-300&&entry.timestamp<=now);
}
