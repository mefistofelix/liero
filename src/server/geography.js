export function countryCode(value){return typeof value==='string'&&/^[A-Z]{2}$/.test(value)&&!['XX','T1'].includes(value)?value:'';}
export function requestCountry(request,fallback=''){return countryCode(request.cf?.country)||countryCode(request.headers.get('cf-ipcountry'))||countryCode(fallback);}
