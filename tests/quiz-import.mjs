import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
await build({entryPoints:['lib/quiz-import.ts'],outfile:'.sites-runtime/test-import.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
const {parseQuizText,parseQuizRows,csvRows,importQuizFile,answerIndex}=await import('../.sites-runtime/test-import.mjs');
const text=readFileSync('public/quizmint-question-template.txt','utf8');const parsed=parseQuizText(text,'quiz.txt');assert.equal(parsed.quiz.questions.length,2);assert.equal(parsed.quiz.questions[0].correct,1);assert.equal(parsed.warnings.length,0);
assert.equal(answerIndex('', ['','','','']),-1,'Missing answers never default to A');
assert.equal(parseQuizText(text.replaceAll('Answer: B',''),'quiz.txt').quiz.questions[0].correct,-1);
assert.equal(parseQuizText(text.replaceAll('Answer: B','')+'\nAnswer key\n1. B\n2. B','quiz.txt').quiz.questions[1].correct,1);
assert.throws(()=>parseQuizText('Just ordinary lesson notes','notes.txt'),/No questions/);
assert.throws(()=>parseQuizText(text.replace('D. 6','D. 6\nE. 7'),'quiz.txt'),/five options/);
const csv=readFileSync('public/quizmint-question-template.csv','utf8');assert.equal(parseQuizRows(csvRows(csv),'quiz.csv').quiz.title,'My quiz');assert.equal(csvRows('Question,Option A\n"Hello, world","Two\nlines"')[1][1],'Two\nlines');assert.throws(()=>csvRows('"unclosed'),/unclosed/);
const xmlEscape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const word=new JSZip();word.file('word/document.xml','<w:document xmlns:w="test"><w:body>'+text.trim().split('\n').map(s=>'<w:p><w:r><w:t>'+xmlEscape(s)+'</w:t></w:r></w:p>').join('')+'</w:body></w:document>');
const ppt=new JSZip();for(let i=1;i<=2;i++)ppt.file('ppt/slides/slide'+i+'.xml','<p:sld xmlns:a="test">'+text.trim().split('\n').filter(s=>i===1?true:false).map(s=>'<a:p><a:r><a:t>'+xmlEscape(s)+'</a:t></a:r></a:p>').join('')+'</p:sld>');
const excel=new JSZip();excel.file('xl/worksheets/sheet1.xml','<worksheet><sheetData>'+csvRows(csv).map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>'<c r="'+String.fromCharCode(65+j)+(i+1)+'" t="inlineStr"><is><t>'+xmlEscape(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>');
for(const [zip,name] of [[word,'test.docx'],[ppt,'test.pptx'],[excel,'test.xlsx']]){const result=await importQuizFile(new File([await zip.generateAsync({type:'uint8array'})],name));assert.equal(result.quiz.questions.length,2,name);assert.equal(result.quiz.questions[0].correct,1,name);assert.equal(result.warnings.length,0,name);}
// A real readable PDF fixture with one question, four options and an answer.
const lines=['Title: PDF quiz','1. What is 2 + 2?','A. 3','B. 4','C. 5','D. 6','Answer: B','Explanation: Adding two and two gives four.'];
const content=lines.map((s,i)=>'BT /F1 12 Tf 72 '+(750-i*24)+' Td ('+s+') Tj ET').join('\n');
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream'];let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n'});const xref=pdf.length;pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
const pdfResult=await importQuizFile(new File([pdf],'quiz.pdf'));assert.equal(pdfResult.quiz.questions.length,1);assert.equal(pdfResult.quiz.questions[0].correct,1);assert.equal(pdfResult.quiz.title,'PDF quiz');
assert.equal((await importQuizFile(new File([csv],'quiz.csv'))).quiz.questions.length,2);
await assert.rejects(()=>importQuizFile(new File(['invalid'],'quiz.pdf')),/valid PDF/);await assert.rejects(()=>importQuizFile(new File(['old'],'quiz.doc')),/modern/);await assert.rejects(()=>importQuizFile(new File([new Uint8Array(8*1024*1024+1)],'large.txt')),/8 MB/);
console.log('Passed: real DOCX/XLSX/PPTX/PDF/CSV imports, answer preservation, missing-answer flags, answer keys, CSV escaping, invalid/oversized/legacy files and template parsing.');
