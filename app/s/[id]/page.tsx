import SurveyRespondent from './respondent';
export default async function Page({params}:{params:Promise<{id:string}>}){return <SurveyRespondent id={(await params).id}/>;}
