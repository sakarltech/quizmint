import Brand from './brand';

export default function LegalLayout({kind,title,updated,children}:{kind:string,title:string,updated:string,children:React.ReactNode}){
 return <><header className="header legal-header"><Brand/><nav aria-label="Legal pages"><a href="/terms">Terms of Use</a><a href="/privacy">Privacy Policy</a></nav></header><main className="legal-shell"><div className="legal-hero"><span className="pill">{kind}</span><h1>{title}</h1><p>Clear information about using QuizMint and how we handle your information.</p><small>Last updated: {updated}</small></div><article className="legal-card">{children}</article></main><footer className="legal-footer"><span>© QuizMint · Sakarltech Limited</span><nav aria-label="Footer"><a href="/">Home</a><a href="/help">Help centre</a><a href="/terms">Terms of Use</a><a href="/privacy">Privacy Policy</a></nav></footer></>;
}
