export type QuestionImageData={id:string;alt:string;caption?:string};
export default function QuestionImage({image,quizId,adminMode=false}:{image?:QuestionImageData;quizId?:string;adminMode?:boolean}){
 if(!image)return null;
 return <figure className="question-visual"><img src={'/api/question-images/'+image.id+(quizId?'?quiz='+encodeURIComponent(quizId):adminMode?'?admin=1':'')} alt={image.alt} loading="lazy" decoding="async"/>{image.caption&&<figcaption>{image.caption}</figcaption>}</figure>;
}
