export type QuestionImageData={id:string;alt:string;caption?:string};
export default function QuestionImage({image,quizId,arenaCode,adminMode=false}:{image?:QuestionImageData;quizId?:string;arenaCode?:string;adminMode?:boolean}){
 if(!image)return null;
 return <figure className="question-visual"><img src={'/api/question-images/'+image.id+(arenaCode?'?arena='+encodeURIComponent(arenaCode):quizId?'?quiz='+encodeURIComponent(quizId):adminMode?'?admin=1':'')} alt={image.alt} loading="lazy" decoding="async"/>{image.caption&&<figcaption>{image.caption}</figcaption>}</figure>;
}
