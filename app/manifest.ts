import type {MetadataRoute} from 'next';
export default function manifest():MetadataRoute.Manifest {
  return {name:'Tenge',short_name:'Tenge',lang:'ru',start_url:'/',display:'standalone',background_color:'#f2f5f0',theme_color:'#101d19',icons:[
    {src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
    {src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'}
  ]};
}
