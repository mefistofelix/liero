import catalog from '../browser/maps/catalog.json';
// Compatibility route: all maps are bundled, never fetched from third parties.
export async function mapAPI(request){
 if(request.method!=='GET')return new Response(null,{status:405});
 const level=catalog.find(level=>level.id===new URL(request.url).searchParams.get('id'));
 return level?new Response(null,{status:302,headers:{Location:level.asset}}):new Response('Unknown map',{status:404});
}
