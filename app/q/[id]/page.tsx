import Student from './student';
export default async function Page({params}:{params:Promise<{id:string}>}){return <Student id={(await params).id}/>}
