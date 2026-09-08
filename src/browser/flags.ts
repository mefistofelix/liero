import countries from './flags/countries.json';
const names=new Intl.DisplayNames(['en'],{type:'region'});
export function countryFlag(country=''){
 if(countries.includes(country.toLowerCase())){const image=document.createElement('img');image.className='country-flag';image.src='/flags/'+country.toLowerCase()+'.svg';image.alt=country;image.title=names.of(country)||country;image.width=20;image.height=15;return image;}
 const unknown=document.createElement('span');unknown.className='country-unknown';unknown.textContent='🌐';unknown.title='Country unavailable';return unknown;
}
let detected:Promise<string>|undefined;
export function localCountry(){return detected??=fetch('/api/region').then(r=>r.json()).then(async data=>{
 if(/^[A-Z]{2}$/.test(data.country||''))return data.country;
 // Sites may omit request.cf; Cloudflare's same-origin trace retains browser geography.
 const response=await fetch('/cdn-cgi/trace',{signal:AbortSignal.timeout(5000)});
 return (await response.text()).match(/^loc=([A-Z]{2})$/m)?.[1]||'';
 }).catch(()=>'');}
