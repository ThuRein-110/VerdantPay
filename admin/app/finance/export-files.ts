import ExcelJS from 'exceljs';
import {stringify} from 'csv-stringify/sync';

export type Sheet={name:string;columns:{label:string;money?:boolean}[];rows:(string|number|boolean|null)[][]};
function spreadsheetText(value: string) {
 // CSV spreadsheet applications can interpret externally supplied names and notes as formulas.
 return /^\s*[=+\-@]|^[\t\r\n]/.test(value) ? "'"+value : value;
}
export function csv(sheets:Sheet[]) {
 return sheets.map(sheet=>{
  const header=sheet.columns.map(column=>column.label+(column.money?' (THB)':''));
  const entries=sheet.rows.map(row=>row.map((cell,index)=>
   typeof cell==='string'?spreadsheetText(cell):typeof cell==='number'&&sheet.columns[index].money?(cell/100).toFixed(2):cell));
  return stringify([...(sheets.length>1?[[sheet.name]]:[]),header,...entries],{record_delimiter:'windows'});
 }).join('\r\n');
}
export async function excel(sheets:Sheet[]) {
 const book=new ExcelJS.Workbook();
 book.creator='3D Printing MFU By Memo';
 for(const sheet of sheets) {
  const page=book.addWorksheet(sheet.name.slice(0,31),{views:[{state:'frozen',ySplit:1}]});
  page.addRow(sheet.columns.map(column=>column.label));
  for(const row of sheet.rows) page.addRow(row.map((cell,index)=>typeof cell==='number'&&sheet.columns[index].money?cell/100:cell));
  const header=page.getRow(1);
  header.font={bold:true,color:{argb:'FFFFFFFF'}};
  header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF18364E'}};
  sheet.columns.forEach((column,index)=>{
   const target=page.getColumn(index+1);
   target.width=Math.min(48,Math.max(16,column.label.length+4,...sheet.rows.map(row=>String(row[index]??'').length+2)));
   if(column.money)target.numFmt='"฿"#,##0.00;-"฿"#,##0.00';
  });
  if(sheet.columns.length)page.autoFilter={from:{row:1,column:1},to:{row:1,column:sheet.columns.length}};
 }
 return new Uint8Array(await book.xlsx.writeBuffer());
}
