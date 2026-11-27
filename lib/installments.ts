export function parseInstallments(text:string){
  const rows=text.trim().split(/\r?\n/).filter(line=>line.trim()).map(line=>{
    const match=line.trim().match(/^(\d{4}-\d{2}-\d{2}|\d{2}[./]\d{2}[./]\d{4})[\t; ,]+([\d \u00a0\u202f]+(?:[.,]\d{1,2})?)\s*(?:₸)?$/);
    if(!match)throw new Error('Укажите дату и сумму в каждой строке: ГГГГ-ММ-ДД 10000 или ДД.ММ.ГГГГ 10000.');
    const [,rawDate,value]=match;
    const date=rawDate.includes('-')?rawDate:rawDate.split(/[./]/).reverse().join('-');
    const parsed=new Date(date+'T00:00:00Z');
    const amount=Math.round(Number(value.replace(/\s/g,'').replace(',','.'))*100);
    if(!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==date||amount<=0||!Number.isSafeInteger(amount))throw new Error('Проверьте даты и суммы графика.');
    return {date,amount};
  }).sort((a,b)=>a.date.localeCompare(b.date));
  if(!rows.length||new Set(rows.map(row=>row.date)).size!==rows.length)throw new Error('Добавьте хотя бы одну строку и объедините платежи на одну дату.');
  return rows;
}
