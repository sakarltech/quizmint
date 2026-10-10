import ArenaRoom from '../../arena-room';
export default async function Page({params}:{params:Promise<{code:string}>}){const {code}=await params;return <ArenaRoom code={code.toUpperCase()} view="screen"/>;}
