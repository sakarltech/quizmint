export const teachingRoles=['teacher','lecturer','tutor','trainer','parent','other'] as const;
export const learnerGroups=['early-years','primary','secondary','higher-education','adults','mixed'] as const;
export type CreatorProfile={name:string;teachingRole:string;organisation:string;subjects:string;learnerGroup:string;country:string;bio:string};
export const emptyProfile:CreatorProfile={name:'',teachingRole:'teacher',organisation:'',subjects:'',learnerGroup:'mixed',country:'',bio:''};
export function validateProfile(input:any):CreatorProfile{
 if(!input||typeof input!=='object')throw Error('Check your profile details.');
 const text=(key:string,max:number)=>{if(typeof input[key]!=='string'||input[key].length>max)throw Error(`Check ${key} (up to ${max} characters).`);return input[key].trim();};
 const profile={name:text('name',80),teachingRole:text('teachingRole',30),organisation:text('organisation',120),subjects:text('subjects',200),learnerGroup:text('learnerGroup',30),country:text('country',80),bio:text('bio',500)};
 if(!profile.name)throw Error('Add your display name.');if(!teachingRoles.includes(profile.teachingRole as any)||!learnerGroups.includes(profile.learnerGroup as any))throw Error('Choose a teaching role and learner group.');return profile;
}
